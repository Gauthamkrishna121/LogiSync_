import os
import json
import uuid
import re
import datetime
from functools import wraps
from flask import Flask, request, jsonify, render_template, session, redirect, url_for
from apscheduler.schedulers.background import BackgroundScheduler
import atexit

import user_manager
import excel_manager
import ai_service
import mail_service

# Track who has sent summary today: { "username_YYYY-MM-DD": True }
sent_summaries = {}

app = Flask(__name__, template_folder='templates', static_folder='static')

CONFIG_FILE = "tracker_config.json"
DEFAULT_USERS_DIR = "users"


def get_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r') as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def save_config(config_dict):
    current_config = get_config()
    current_config.update(config_dict)
    try:
        with open(CONFIG_FILE, 'w') as f:
            json.dump(current_config, f, indent=4)
        return True
    except Exception:
        return False


# Initialize Flask session secret key from config (or fallback)
config = get_config()
app.secret_key = config.get("secret_key")
if not app.secret_key:
    app.secret_key = str(uuid.uuid4())
    save_config({"secret_key": app.secret_key})

# Session security
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'


def get_user_filepath(username):
    username_clean = "".join(c for c in username if c.isalnum() or c in (' ', '_', '-')).strip()
    if not username_clean:
        username_clean = "Default_User"

    base_dir = DEFAULT_USERS_DIR
    if not os.path.isabs(base_dir):
        base_dir = os.path.abspath(base_dir)

    user_folder = os.path.join(base_dir, username_clean)
    os.makedirs(user_folder, exist_ok=True)

    return os.path.join(user_folder, "Sandhata_Internship_Log.xlsx")


# Jinja2 context processor — injects session user into all templates
@app.context_processor
def inject_user():
    return {
        'session_user': {
            'username': session.get('username', ''),
            'full_name': session.get('full_name', ''),
            'role': session.get('role', '')
        }
    }


# Auth Decorators
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'username' not in session:
            if request.is_json or request.path.startswith('/api/'):
                return jsonify({"error": "Authentication required."}), 401
            return redirect(url_for('login_page'))
        return f(*args, **kwargs)
    return decorated_function


def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'username' not in session or session.get('role') != 'admin':
            if request.is_json or request.path.startswith('/api/'):
                return jsonify({"error": "Admin access required."}), 403
            return redirect(url_for('login_page'))
        return f(*args, **kwargs)
    return decorated_function


def mentor_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'username' not in session or session.get('role') != 'mentor':
            if request.is_json or request.path.startswith('/api/'):
                return jsonify({"error": "Mentor access required."}), 403
            return redirect(url_for('login_page'))
        return f(*args, **kwargs)
    return decorated_function


# ───────────────────────── Views ─────────────────────────

@app.route('/')
@login_required
def index():
    if session.get('role') == 'admin':
        return redirect(url_for('admin_page'))
    if session.get('role') == 'mentor':
        return redirect(url_for('mentor_page'))
    return render_template('index.html')


@app.route('/login')
def login_page():
    if 'username' in session:
        if session.get('role') == 'admin':
            return redirect(url_for('admin_page'))
        if session.get('role') == 'mentor':
            return redirect(url_for('mentor_page'))
        return redirect(url_for('index'))
    return render_template('login.html')


@app.route('/register')
def register_page():
    if 'username' in session:
        if session.get('role') == 'admin':
            return redirect(url_for('admin_page'))
        if session.get('role') == 'mentor':
            return redirect(url_for('mentor_page'))
        return redirect(url_for('index'))
    return render_template('register.html')


@app.route('/admin')
@admin_required
def admin_page():
    return render_template('admin.html')


@app.route('/mentor')
@mentor_required
def mentor_page():
    return render_template('mentor.html')


@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login_page'))


# ───────────────────────── Auth APIs ─────────────────────────

@app.route('/api/login', methods=['POST'])
def api_login():
    import user_manager
    data = request.json or {}
    username = data.get('username', '').strip()
    password = data.get('password', '')

    if not username or not password:
        return jsonify({"error": "Username and password are required."}), 400

    user = user_manager.authenticate_user(username, password)
    if user:
        session['username'] = user['username']
        session['full_name'] = user['full_name']
        session['role'] = user['role']
        return jsonify({
            "status": "success",
            "user": {
                "username": user['username'],
                "full_name": user['full_name'],
                "role": user['role']
            }
        })
    return jsonify({"error": "Invalid username or password."}), 401


@app.route('/api/register', methods=['POST'])
def api_register():
    import user_manager
    data = request.json or {}
    full_name = data.get('full_name', '').strip()
    username = data.get('username', '').strip()
    email = data.get('email', '').strip()
    password = data.get('password', '')
    confirm_password = data.get('confirm_password', '')

    # Validation
    if not full_name or not username or not password:
        return jsonify({"error": "Full name, username, and password are required."}), 400

    if len(full_name) < 2:
        return jsonify({"error": "Full name must be at least 2 characters."}), 400

    if len(username) < 3:
        return jsonify({"error": "Username must be at least 3 characters."}), 400

    if not re.match(r'^[a-zA-Z0-9_-]+$', username):
        return jsonify({"error": "Username can only contain letters, numbers, underscores, and hyphens."}), 400

    if email and not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', email):
        return jsonify({"error": "Please enter a valid email address."}), 400

    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters."}), 400

    if password != confirm_password:
        return jsonify({"error": "Passwords do not match."}), 400

    try:
        user = user_manager.create_user(username, full_name, password, role="student", email=email)
        return jsonify({
            "status": "success",
            "user": {
                "username": user['username'],
                "full_name": user['full_name']
            }
        })
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"Registration failed: {e}"}), 500


@app.route('/api/check-username', methods=['POST'])
def api_check_username():
    import user_manager
    data = request.json or {}
    username = data.get('username', '').strip().lower()
    if not username or len(username) < 3:
        return jsonify({"available": False, "reason": "Username must be at least 3 characters."})
    if not re.match(r'^[a-zA-Z0-9_-]+$', username):
        return jsonify({"available": False, "reason": "Only letters, numbers, underscores, hyphens."})
    exists = user_manager.username_exists(username)
    return jsonify({"available": not exists, "reason": "Username is taken." if exists else "Available"})


# ───────────────────────── User Profile & Stats APIs ─────────────────────────

@app.route('/api/user/profile', methods=['GET'])
@login_required
def api_user_profile():
    return jsonify({
        "username": session.get('username'),
        "full_name": session.get('full_name'),
        "role": session.get('role')
    })


@app.route('/api/config', methods=['GET'])
@login_required
def api_get_config():
    cfg = get_config()
    return jsonify({
        "start_date": cfg.get("start_date", "2026-06-01"),
        "default_username": session.get('username', '')
    })


@app.route('/api/config', methods=['POST'])
def api_save_config():
    data = request.json or {}
    update_fields = {}

    if data.get('start_date'):
        update_fields['start_date'] = data['start_date']
    if data.get('default_username'):
        update_fields['default_username'] = data['default_username']

    if update_fields:
        save_config(update_fields)

    return jsonify(get_config())


# ───────────────────────── Timesheet APIs ─────────────────────────

@app.route('/api/load-timesheet', methods=['POST'])
@login_required
def api_load_timesheet():
    import excel_manager
    data = request.json or {}
    username = session['username']
    date_val = data.get('date_val')
    arrival_time = data.get('arrival_time', '09:00')

    if not date_val:
        return jsonify({"error": "Date value is required"}), 400

    filepath = get_user_filepath(username)

    try:
        parts = date_val.split('-')
        excel_date_str = f"{parts[2]}/{parts[1]}/{parts[0]}"
    except Exception:
        excel_date_str = date_val

    try:
        slots = excel_manager.get_or_create_day_slots(filepath, excel_date_str, arrival_time)
        return jsonify({
            "filepath": filepath,
            "slots": slots
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/save-slot', methods=['POST'])
@login_required
def api_save_slot():
    import excel_manager
    data = request.json or {}
    username = session['username']
    try:
        row = int(data.get('row'))
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid row value"}), 400
    text = data.get('text', '')

    if not username or not row:
        return jsonify({"error": "Missing parameters"}), 400

    filepath = get_user_filepath(username)

    try:
        excel_manager.save_timesheet_slot_activity(filepath, row, text)
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/generate-summary', methods=['POST'])
@login_required
def api_generate_summary():
    data = request.json or {}
    username = session['username']
    date_val = data.get('date_val')
    
    if not date_val:
        return jsonify({"error": "Date value is required"}), 400
        
    user = user_manager.get_user_by_username(username)
    filepath = get_user_filepath(username)
    
    try:
        parts = date_val.split('-')
        excel_date_str = f"{parts[2]}/{parts[1]}/{parts[0]}"
    except Exception:
        excel_date_str = date_val
        
    try:
        slots = excel_manager.get_or_create_day_slots(filepath, excel_date_str, "09:00")
        activities = [s['activity'] for s in slots if s['type'] == 'Work' and s.get('activity')]
        
        summary_text = ai_service.generate_daily_summary(user['full_name'], date_val, activities)
        return jsonify({"summary_text": summary_text})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/send-summary', methods=['POST'])
@login_required
def api_send_summary():
    data = request.json or {}
    username = session['username']
    date_val = data.get('date_val')
    custom_summary = data.get('summary_text')
    
    if not date_val:
        return jsonify({"error": "Date value is required"}), 400
        
    user = user_manager.get_user_by_username(username)
    mentor_email = user.get('mentor_email')
    
    if not mentor_email:
        return jsonify({"error": "Mentor email is not configured. Please ask your admin to set it up."}), 400
        
    filepath = get_user_filepath(username)
    
    try:
        parts = date_val.split('-')
        excel_date_str = f"{parts[2]}/{parts[1]}/{parts[0]}"
    except Exception:
        excel_date_str = date_val
        
    try:
        if custom_summary:
            summary_text = custom_summary
        else:
            slots = excel_manager.get_or_create_day_slots(filepath, excel_date_str, "09:00")
            activities = [s['activity'] for s in slots if s['type'] == 'Work' and s.get('activity')]
            summary_text = ai_service.generate_daily_summary(user['full_name'], date_val, activities)
            
        if mail_service.send_summary_email(mentor_email, user['full_name'], date_val, summary_text):
            track_key = f"{username}_{date_val}"
            global sent_summaries
            sent_summaries[track_key] = True
            return jsonify({"status": "success"})
        else:
            return jsonify({"error": "Failed to send email. Check server logs."}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ───────────────────────── Admin APIs ─────────────────────────

@app.route('/api/admin/config', methods=['GET'])
@admin_required
def api_admin_get_config():
    cfg = get_config()
    return jsonify({
        "start_date": cfg.get("start_date", "2026-06-01")
    })


@app.route('/api/admin/config', methods=['POST'])
@admin_required
def api_admin_save_config():
    data = request.json or {}
    start_date = data.get("start_date")

    if not start_date:
        return jsonify({"error": "start_date is required."}), 400

    cfg = get_config()
    cfg["start_date"] = start_date

    if save_config(cfg):
        return jsonify({"status": "success", "config": cfg})
    return jsonify({"error": "Failed to save configuration."}), 500


@app.route('/api/admin/students', methods=['GET'])
@admin_required
def api_admin_students():
    import user_manager
    students = user_manager.list_students()
    base_dir = DEFAULT_USERS_DIR
    if not os.path.isabs(base_dir):
        base_dir = os.path.abspath(base_dir)

    for s in students:
        user_dir = os.path.join(base_dir, s['username'])
        s['folder_exists'] = os.path.isdir(user_dir)
        excel_path = os.path.join(user_dir, "Sandhata_Internship_Log.xlsx")
        s['excel_exists'] = os.path.isfile(excel_path)

    return jsonify(students)


@app.route('/api/admin/students', methods=['POST'])
@admin_required
def api_admin_create_student():
    import user_manager
    data = request.json or {}
    username = data.get('username')
    full_name = data.get('full_name')
    password = data.get('password')
    mentor_email = data.get('mentor_email', '')
    auto_create_folder = data.get('auto_create_folder', False)

    if not username or not full_name or not password:
        return jsonify({"error": "Username, full name, and password are required."}), 400

    try:
        student = user_manager.create_user(username, full_name, password, role="student", email="", mentor_email=mentor_email)

        if auto_create_folder:
            base_dir = DEFAULT_USERS_DIR
            if not os.path.isabs(base_dir):
                base_dir = os.path.abspath(base_dir)
            user_dir = os.path.join(base_dir, student['username'])
            os.makedirs(user_dir, exist_ok=True)

            excel_path = os.path.join(user_dir, "Sandhata_Internship_Log.xlsx")
            if not os.path.exists(excel_path):
                import excel_manager
                wb, ws = excel_manager.get_timesheet_sheet(excel_path)
                wb.save(excel_path)
                wb.close()

        return jsonify({
            "status": "success",
            "student": {
                "username": student['username'],
                "full_name": student['full_name']
            }
        })
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"Internal server error: {e}"}), 500


@app.route('/api/admin/students/<username>', methods=['DELETE'])
@admin_required
def api_admin_delete_student(username):
    import user_manager
    try:
        if user_manager.delete_user(username):
            return jsonify({"status": "success"})
        return jsonify({"error": f"Student '{username}' not found."}), 404
    except ValueError as e:
        return jsonify({"error": str(e)}), 400


@app.route('/api/admin/students/edit', methods=['POST'])
@admin_required
def api_admin_edit_student():
    import user_manager
    data = request.json or {}
    username = data.get('username')
    full_name = data.get('full_name')
    password = data.get('password')
    mentor_email = data.get('mentor_email', '')

    if not username or not full_name:
        return jsonify({"error": "Username and full name are required."}), 400

    try:
        user_manager.update_student(username, full_name, password, mentor_email)
        return jsonify({"status": "success"})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"Internal server error: {e}"}), 500


@app.route('/api/admin/create-folder', methods=['POST'])
@admin_required
def api_admin_create_folder():
    data = request.json or {}
    username = data.get('username')
    if not username:
        return jsonify({"error": "Username is required."}), 400

    base_dir = DEFAULT_USERS_DIR
    if not os.path.isabs(base_dir):
        base_dir = os.path.abspath(base_dir)
    user_dir = os.path.join(base_dir, username)
    os.makedirs(user_dir, exist_ok=True)

    excel_path = os.path.join(user_dir, "Sandhata_Internship_Log.xlsx")
    if not os.path.exists(excel_path):
        import excel_manager
        try:
            wb, ws = excel_manager.get_timesheet_sheet(excel_path)
            wb.save(excel_path)
            wb.close()
        except Exception as e:
            return jsonify({"error": f"Failed to initialize Excel file: {e}"}), 500

    return jsonify({"status": "success", "user_dir": user_dir})


@app.route('/api/admin/mentors', methods=['GET'])
@admin_required
def api_admin_mentors():
    import user_manager
    try:
        mentors = user_manager.list_mentors()
        return jsonify(mentors)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/admin/mentors', methods=['POST'])
@admin_required
def api_admin_create_mentor():
    import user_manager
    data = request.json or {}
    username = data.get('username', '').strip().lower()
    name = data.get('name', '').strip()
    email = data.get('email', '').strip()
    password = data.get('password', '')

    if not username or not name or not email or not password:
        return jsonify({"error": "Username, name, email, and password are required."}), 400

    try:
        user_manager.create_mentor(username, name, password, email)
        return jsonify({"status": "success"})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"Internal server error: {e}"}), 500


@app.route('/api/admin/mentors/<int:mentor_id>', methods=['DELETE'])
@admin_required
def api_admin_delete_mentor(mentor_id):
    import user_manager
    try:
        conn = user_manager.get_db()
        cursor = conn.execute("SELECT username FROM users WHERE id = ? AND role = 'mentor'", (mentor_id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            return jsonify({"error": "Mentor not found."}), 404
        username = row["username"]
        conn.close()
        
        if user_manager.delete_mentor_by_username(username):
            return jsonify({"status": "success"})
        return jsonify({"error": "Failed to delete mentor user."}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/admin/mentors/edit', methods=['POST'])
@admin_required
def api_admin_edit_mentor():
    import user_manager
    data = request.json or {}
    username = data.get('username')
    full_name = data.get('full_name')
    email = data.get('email')
    password = data.get('password')

    if not username or not full_name or not email:
        return jsonify({"error": "Username, full name, and email are required."}), 400

    try:
        user_manager.update_mentor(username, full_name, email, password)
        return jsonify({"status": "success"})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"Internal server error: {e}"}), 500


@app.route('/api/admin/assign-mentor', methods=['POST'])
@admin_required
def api_admin_assign_mentor():
    import user_manager
    data = request.json or {}
    username = data.get('username')
    mentor_email = data.get('mentor_email', '')

    if not username:
        return jsonify({"error": "Username is required."}), 400

    try:
        user_manager.assign_student_to_mentor(username, mentor_email)
        return jsonify({"status": "success"})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"Internal server error: {e}"}), 500


# ───────────────────────── Mentor & Task APIs ─────────────────────────

@app.route('/api/mentor/students', methods=['GET'])
@mentor_required
def api_mentor_students():
    import user_manager
    mentor = user_manager.get_user_by_username(session['username'])
    mentor_email = mentor.get('email', '')
    if not mentor_email:
        return jsonify([])
        
    conn = user_manager.get_db()
    cursor = conn.execute("""
        SELECT username, full_name, email, mentor_email, role, created_at 
        FROM users 
        WHERE role = 'student' AND mentor_email = ?
        ORDER BY created_at DESC
    """, (mentor_email.strip().lower(),))
    students = [user_manager._row_to_dict(row) for row in cursor.fetchall()]
    conn.close()
    
    base_dir = DEFAULT_USERS_DIR
    if not os.path.isabs(base_dir):
        base_dir = os.path.abspath(base_dir)
        
    for s in students:
        user_dir = os.path.join(base_dir, s['username'])
        s['folder_exists'] = os.path.isdir(user_dir)
        excel_path = os.path.join(user_dir, "Sandhata_Internship_Log.xlsx")
        s['excel_exists'] = os.path.isfile(excel_path)
        
    return jsonify(students)


@app.route('/api/mentor/student-logs/<username>', methods=['GET'])
@mentor_required
def api_mentor_student_logs(username):
    import user_manager
    import excel_manager
    
    mentor = user_manager.get_user_by_username(session['username'])
    student = user_manager.get_user_by_username(username)
    
    if not student or student.get('role') != 'student' or student.get('mentor_email') != mentor.get('email'):
        return jsonify({"error": "Unauthorized to view this student's logs."}), 403
        
    date_val = request.args.get('date')
    if not date_val:
        return jsonify({"error": "Date parameter is required."}), 400
        
    filepath = get_user_filepath(username)
    
    try:
        parts = date_val.split('-')
        excel_date_str = f"{parts[2]}/{parts[1]}/{parts[0]}"
    except Exception:
        excel_date_str = date_val
        
    try:
        slots = excel_manager.get_or_create_day_slots(filepath, excel_date_str, "09:00")
        return jsonify({
            "filepath": filepath,
            "slots": slots
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/mentor/tasks', methods=['GET'])
@mentor_required
def api_mentor_get_tasks():
    import user_manager
    tasks = user_manager.list_tasks_by_mentor(session['username'])
    return jsonify(tasks)


@app.route('/api/mentor/tasks', methods=['POST'])
@mentor_required
def api_mentor_create_task():
    import user_manager
    data = request.json or {}
    student_username = data.get('student_username')
    description = data.get('description', '').strip()
    
    if not student_username or not description:
        return jsonify({"error": "Student username and task description are required."}), 400
        
    try:
        user_manager.create_task(student_username, session['username'], description)
        return jsonify({"status": "success"})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/mentor/tasks/<int:task_id>', methods=['DELETE'])
@mentor_required
def api_mentor_delete_task(task_id):
    import user_manager
    if user_manager.delete_task(task_id, session['username']):
        return jsonify({"status": "success"})
    return jsonify({"error": "Task not found or unauthorized."}), 404


@app.route('/api/student/tasks', methods=['GET'])
@login_required
def api_student_get_tasks():
    import user_manager
    tasks = user_manager.list_tasks_by_student(session['username'])
    return jsonify(tasks)


@app.route('/api/student/tasks/<int:task_id>/complete', methods=['POST'])
@login_required
def api_student_complete_task(task_id):
    import user_manager
    
    # Read text response
    response_message = request.form.get('response_message', '').strip() or None
    
    # Read attachment file
    file = request.files.get('file')
    attachment_filename = None
    attachment_path = None
    
    if file and file.filename:
        from werkzeug.utils import secure_filename
        filename = secure_filename(file.filename)
        # Create uploads directory under static
        upload_folder = os.path.join(app.static_folder, 'uploads', 'tasks', str(task_id))
        os.makedirs(upload_folder, exist_ok=True)
        
        dest_path = os.path.join(upload_folder, filename)
        file.save(dest_path)
        
        attachment_filename = file.filename
        attachment_path = f"/static/uploads/tasks/{task_id}/{filename}"
        
    if user_manager.complete_task(
        task_id, 
        session['username'], 
        response_message=response_message, 
        attachment_filename=attachment_filename, 
        attachment_path=attachment_path
    ):
        return jsonify({"status": "success"})
    return jsonify({"error": "Task not found or unauthorized."}), 404


def get_user_documents_dir(username):
    base_dir = DEFAULT_USERS_DIR
    if not os.path.isabs(base_dir):
        base_dir = os.path.abspath(base_dir)
    username_clean = "".join(c for c in username if c.isalnum() or c in (' ', '_', '-')).strip()
    if not username_clean:
        username_clean = "Default_User"
    user_docs_dir = os.path.join(base_dir, username_clean, "documents")
    os.makedirs(user_docs_dir, exist_ok=True)
    return user_docs_dir


def sanitize_subpath(user_docs_dir, subpath):
    if not subpath:
        return user_docs_dir
    subpath_clean = subpath.replace('\\', '/').strip('/')
    parts = []
    for part in subpath_clean.split('/'):
        if part in ('.', '..', ''):
            continue
        parts.append(part)
    safe_path = os.path.abspath(os.path.join(user_docs_dir, *parts))
    if not safe_path.startswith(user_docs_dir):
        return user_docs_dir
    return safe_path


# ───────────────────────── Student Files & Documents APIs ─────────────────────────

@app.route('/api/student/files', methods=['GET'])
@login_required
def api_list_files():
    username = session['username']
    subpath = request.args.get('path', '')
    
    user_docs_dir = get_user_documents_dir(username)
    target_dir = sanitize_subpath(user_docs_dir, subpath)
    
    if not os.path.exists(target_dir):
        return jsonify({"error": "Directory does not exist."}), 404
        
    items = []
    try:
        for entry in os.scandir(target_dir):
            stat = entry.stat()
            is_dir = entry.is_dir()
            item_count = 0
            if is_dir:
                try:
                    item_count = len([n for n in os.listdir(entry.path)])
                except Exception:
                    pass
            
            items.append({
                "name": entry.name,
                "is_dir": is_dir,
                "size": stat.st_size if not is_dir else 0,
                "modified": datetime.datetime.fromtimestamp(stat.st_mtime).strftime('%Y-%m-%d %H:%M:%S'),
                "item_count": item_count
            })
        
        items.sort(key=lambda x: (not x['is_dir'], x['name'].lower()))
        
        relative_path = os.path.relpath(target_dir, user_docs_dir).replace('\\', '/')
        if relative_path == '.':
            relative_path = ''
            
        return jsonify({
            "current_path": relative_path,
            "items": items
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/student/files/create-folder', methods=['POST'])
@login_required
def api_create_folder():
    username = session['username']
    data = request.json or {}
    subpath = data.get('path', '')
    folder_name = data.get('folder_name', '').strip()
    
    if not folder_name:
        return jsonify({"error": "Folder name is required."}), 400
        
    folder_name = "".join(c for c in folder_name if c.isalnum() or c in (' ', '_', '-')).strip()
    if not folder_name:
        return jsonify({"error": "Invalid folder name."}), 400
        
    user_docs_dir = get_user_documents_dir(username)
    target_dir = sanitize_subpath(user_docs_dir, subpath)
    new_folder_path = os.path.join(target_dir, folder_name)
    
    if not os.path.abspath(new_folder_path).startswith(user_docs_dir):
        return jsonify({"error": "Unauthorized action."}), 403
        
    if os.path.exists(new_folder_path):
        return jsonify({"error": "A file or folder with that name already exists."}), 400
        
    try:
        os.makedirs(new_folder_path, exist_ok=True)
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/student/files/upload', methods=['POST'])
@login_required
def api_upload_file():
    username = session['username']
    subpath = request.form.get('path', '')
    
    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded."}), 400
        
    file = request.files['file']
    if not file or not file.filename:
        return jsonify({"error": "Empty filename."}), 400
        
    from werkzeug.utils import secure_filename
    filename = secure_filename(file.filename)
    if not filename:
        return jsonify({"error": "Invalid filename."}), 400
        
    user_docs_dir = get_user_documents_dir(username)
    target_dir = sanitize_subpath(user_docs_dir, subpath)
    dest_path = os.path.join(target_dir, filename)
    
    if not os.path.abspath(dest_path).startswith(user_docs_dir):
        return jsonify({"error": "Unauthorized action."}), 403
        
    try:
        file.save(dest_path)
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/student/files/delete', methods=['DELETE'])
@login_required
def api_delete_file():
    username = session['username']
    data = request.json or {}
    subpath = data.get('path', '')
    name = data.get('name', '').strip()
    
    if not name:
        return jsonify({"error": "Item name is required."}), 400
        
    user_docs_dir = get_user_documents_dir(username)
    target_dir = sanitize_subpath(user_docs_dir, subpath)
    target_item = os.path.join(target_dir, name)
    
    if not os.path.abspath(target_item).startswith(user_docs_dir) or os.path.abspath(target_item) == user_docs_dir:
        return jsonify({"error": "Unauthorized action."}), 403
        
    if not os.path.exists(target_item):
        return jsonify({"error": "Item not found."}), 404
        
    try:
        import shutil
        if os.path.isdir(target_item):
            shutil.rmtree(target_item)
        else:
            os.remove(target_item)
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/student/files/download', methods=['GET'])
@login_required
def api_download_file():
    username = session['username']
    subpath = request.args.get('path', '')
    name = request.args.get('name', '').strip()
    
    if not name:
        return jsonify({"error": "Filename is required."}), 400
        
    user_docs_dir = get_user_documents_dir(username)
    target_dir = sanitize_subpath(user_docs_dir, subpath)
    target_file = os.path.join(target_dir, name)
    
    if not os.path.abspath(target_file).startswith(user_docs_dir) or not os.path.isfile(target_file):
        return jsonify({"error": "Unauthorized action."}), 403
        
    from flask import send_file
    try:
        return send_file(target_file, as_attachment=True, download_name=name)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    import user_manager
    user_manager.load_users()

    def send_daily_summaries():
        print("Running automated daily summary job...")
        today_str = datetime.datetime.now().strftime('%Y-%m-%d')
        students = user_manager.list_students()
        for student in students:
            username = student['username']
            mentor_email = student.get('mentor_email')
            
            track_key = f"{username}_{today_str}"
            if sent_summaries.get(track_key):
                continue
                
            if not mentor_email:
                continue
                
            filepath = get_user_filepath(username)
            if not os.path.exists(filepath):
                continue
                
            try:
                excel_date_str = f"{today_str[8:10]}/{today_str[5:7]}/{today_str[0:4]}"
                slots = excel_manager.get_or_create_day_slots(filepath, excel_date_str, "09:00")
                activities = [s['activity'] for s in slots if s['type'] == 'Work' and s.get('activity')]
                
                summary_text = ai_service.generate_daily_summary(student['full_name'], today_str, activities)
                
                if mail_service.send_summary_email(mentor_email, student['full_name'], today_str, summary_text):
                    sent_summaries[track_key] = True
                    print(f"Automated summary sent for {username}")
            except Exception as e:
                print(f"Failed to auto-send for {username}: {e}")

    scheduler = BackgroundScheduler()
    scheduler.add_job(func=send_daily_summaries, trigger="cron", hour=18, minute=30)
    scheduler.start()
    atexit.register(lambda: scheduler.shutdown())

    app.run(host='127.0.0.1', port=5000, debug=True)
