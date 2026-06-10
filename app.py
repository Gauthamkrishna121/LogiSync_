import os
import json
from flask import Flask, request, jsonify, render_template

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

def get_user_filepath(username):
    config = get_config()
    username_clean = "".join(c for c in username if c.isalnum() or c in (' ', '_', '-')).strip()
    if not username_clean:
        username_clean = "Default_User"
        
    base_dir = config.get("teams_sync_dir", DEFAULT_USERS_DIR)
    
    # If the user put a relative path, make it relative to this project
    if not os.path.isabs(base_dir):
        base_dir = os.path.abspath(base_dir)
        
    user_folder = os.path.join(base_dir, username_clean)
    os.makedirs(user_folder, exist_ok=True)
    
    return os.path.join(user_folder, "Sandhata_Internship_Log.xlsx")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/config', methods=['GET'])
def api_get_config():
    config = get_config()
    return jsonify({
        "start_date": config.get("start_date", "2026-06-01"),
        "default_username": config.get("default_username", "")
    })

@app.route('/api/load-timesheet', methods=['POST'])
def api_load_timesheet():
    import excel_manager
    data = request.json
    username = data.get('username')
    week_num = int(data.get('week_num', 1))
    day_num = int(data.get('day_num', 1))
    date_val = data.get('date_val')
    arrival_time = data.get('arrival_time', '09:00')
    
    if not username:
        return jsonify({"error": "Username is required"}), 400
        
    filepath = get_user_filepath(username)
    
    # Format date from YYYY-MM-DD to DD/MM/YYYY for the Excel sheet representation
    # (or keep YYYY-MM-DD if desired, let's convert to DD/MM/YYYY to make it look professional)
    try:
        parts = date_val.split('-')
        excel_date_str = f"{parts[2]}/{parts[1]}/{parts[0]}"
    except Exception:
        excel_date_str = date_val
        
    try:
        # Get or create today's slots
        slots = excel_manager.get_or_create_day_slots(filepath, week_num, day_num, excel_date_str, arrival_time)
        return jsonify({
            "filepath": filepath,
            "slots": slots
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/save-slot', methods=['POST'])
def api_save_slot():
    import excel_manager
    data = request.json
    username = data.get('username')
    row = int(data.get('row'))
    text = data.get('text', '')
    
    if not username or not row:
        return jsonify({"error": "Missing parameters"}), 400
        
    filepath = get_user_filepath(username)
    
    try:
        excel_manager.save_timesheet_slot_activity(filepath, row, text)
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/sync-day', methods=['POST'])
def api_sync_day():
    import excel_manager
    data = request.json
    username = data.get('username')
    week_num = int(data.get('week_num'))
    day_num = int(data.get('day_num'))
    
    if not username or not week_num or not day_num:
        return jsonify({"error": "Missing parameters"}), 400
        
    filepath = get_user_filepath(username)
    
    try:
        excel_manager.sync_timesheet_to_daily_log(filepath, week_num, day_num)
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Run locally on port 5000
    app.run(host='127.0.0.1', port=5000, debug=True)
