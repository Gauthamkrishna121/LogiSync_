import os
import json
import uuid
from functools import wraps
from flask import Flask, request, jsonify, render_template, session, redirect, url_for

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

def save_config(config):
    try:
        with open(CONFIG_FILE, 'w') as f:
            json.dump(config, f, indent=4)
        return True
    except Exception:
        return False

# Initialize config and persistent secret key
config = get_config()
if not config:
    config = {
        "start_date": "2026-06-01",
        "teams_sync_dir": DEFAULT_USERS_DIR
    }
if "secret_key" not in config:
    config["secret_key"] = str(uuid.uuid4())
    save_config(config)

app.secret_key = config["secret_key"]

def get_user_filepath(username):
    cfg = get_config()
    username_clean = "".join(c for c in username if c.isalnum() or c in (' ', '_', '-')).strip()
    if not username_clean:
        username_clean = "Default_User"
        
    base_dir = cfg.get("teams_sync_dir", DEFAULT_USERS_DIR)
    
    if not os.path.isabs(base_dir):
        base_dir = os.path.abspath(base_dir)
        
    user_folder = os.path.join(base_dir, username_clean)
    os.makedirs(user_folder, exist_ok=True)
    
    return os.path.join(user_folder, "Sandhata_Internship_Log.xlsx")

# Auth Decorators
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'username' not in session:
            return redirect(url_for('login_page'))
        return f(*args, **kwargs)
    return decorated_function

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'username' not in session or session.get('role') != 'admin':
            return redirect(url_for('login_page'))
        return f(*args, **kwargs)
    return decorated_function

# Views
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

@app.route('/admin')
@admin_required
def admin_page():
    return render_template('admin.html')

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login_page'))

# Auth APIs
@app.route('/api/login', methods=['POST'])
def api_login():
    import user_manager
    data = request.json or {}
    username = data.get('username')
    password = data.get('password')
    
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

@app.route('/api/config', methods=['GET'])
@login_required
def api_get_config():
    cfg = get_config()
    return jsonify({
        "start_date": cfg.get("start_date", "2026-06-01"),
        "default_username": session.get("username", "")
    })

# Timesheet APIs (Locked to logged-in session user)
@app.route('/api/load-timesheet', methods=['POST'])
@login_required
def api_load_timesheet():
    import excel_manager
    data = request.json or {}
    username = session['username']  # Session-locked!
    week_num = int(data.get('week_num', 1))
    day_num = int(data.get('day_num', 1))
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
        slots = excel_manager.get_or_create_day_slots(filepath, week_num, day_num, excel_date_str, arrival_time)
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
    username = session['username']  # Session-locked!
    try:
        row = int(data.get('row'))
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid row value"}), 400
    text = data.get('text', '')
    
    filepath = get_user_filepath(username)
    
    try:
        excel_manager.save_timesheet_slot_activity(filepath, row, text)
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/sync-day', methods=['POST'])
@login_required
def api_sync_day():
    import excel_manager
    data = request.json or {}
    username = session['username']  # Session-locked!
    try:
        week_num = int(data.get('week_num'))
        day_num = int(data.get('day_num'))
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid week or day number"}), 400
        
    filepath = get_user_filepath(username)
    
    try:
        excel_manager.sync_timesheet_to_daily_log(filepath, week_num, day_num)
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Admin Management APIs
@app.route('/api/admin/config', methods=['GET'])
@admin_required
def api_admin_get_config():
    cfg = get_config()
    return jsonify({
        "start_date": cfg.get("start_date", "2026-06-01"),
        "teams_sync_dir": cfg.get("teams_sync_dir", DEFAULT_USERS_DIR)
    })

@app.route('/api/admin/config', methods=['POST'])
@admin_required
def api_admin_save_config():
    data = request.json or {}
    start_date = data.get("start_date")
    teams_sync_dir = data.get("teams_sync_dir")
    
    if not start_date or not teams_sync_dir:
        return jsonify({"error": "start_date and teams_sync_dir are required."}), 400
        
    cfg = get_config()
    cfg["start_date"] = start_date
    cfg["teams_sync_dir"] = teams_sync_dir
    
    if save_config(cfg):
        return jsonify({"status": "success", "config": cfg})
    return jsonify({"error": "Failed to save configuration."}), 500

@app.route('/api/admin/students', methods=['GET'])
@admin_required
def api_admin_students():
    import user_manager
    students = user_manager.list_students()
    cfg = get_config()
    base_dir = cfg.get("teams_sync_dir", DEFAULT_USERS_DIR)
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
    auto_create_folder = data.get('auto_create_folder', False)
    
    if not username or not full_name or not password:
        return jsonify({"error": "Username, full name, and password are required."}), 400
        
    try:
        student = user_manager.create_user(username, full_name, password, role="student")
        
        if auto_create_folder:
            cfg = get_config()
            base_dir = cfg.get("teams_sync_dir", DEFAULT_USERS_DIR)
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
        
    cfg = get_config()
    base_dir = cfg.get("teams_sync_dir", DEFAULT_USERS_DIR)
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

if __name__ == '__main__':
    # Make sure database is initialized on startup
    import user_manager
    user_manager.load_users()
    
    app.run(host='127.0.0.1', port=5000, debug=True)
