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


# ───────────────────────── Views ─────────────────────────

@app.route('/')
@login_required
def index():
    if session.get('role') == 'admin':
        return redirect(url_for('admin_page'))
    return render_template('index.html')


@app.route('/login')
def login_page():
    if 'username' in session:
        if session.get('role') == 'admin':
            return redirect(url_for('admin_page'))
        return redirect(url_for('index'))
    return render_template('login.html')


@app.route('/register')
def register_page():
    if 'username' in session:
        return redirect(url_for('index'))
    return render_template('register.html')


@app.route('/admin')
@admin_required
def admin_page():
    return render_template('admin.html')


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
    name = data.get('name', '').strip()
    email = data.get('email', '').strip()

    if not name or not email:
        return jsonify({"error": "Mentor name and email are required."}), 400

    try:
        user_manager.create_mentor(name, email)
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
        if user_manager.delete_mentor(mentor_id):
            return jsonify({"status": "success"})
        return jsonify({"error": "Mentor not found."}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


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
