import os
import json
from werkzeug.security import generate_password_hash, check_password_hash

USERS_FILE = "users.json"

def load_users():
    if not os.path.exists(USERS_FILE):
        # Initialize default admin
        users = {
            "admin": {
                "username": "admin",
                "password_hash": generate_password_hash("AdminPassword123!"),
                "full_name": "Team Leader",
                "role": "admin"
            }
        }
        save_users(users)
        return users

    try:
        with open(USERS_FILE, 'r') as f:
            return json.load(f)
    except Exception:
        # Fallback in case of corruption
        return {}

def save_users(users):
    try:
        with open(USERS_FILE, 'w') as f:
            json.dump(users, f, indent=4)
        return True
    except Exception:
        return False

def authenticate_user(username, password):
    users = load_users()
    username_lower = username.strip().lower()
    if username_lower in users:
        user = users[username_lower]
        if check_password_hash(user["password_hash"], password):
            return user
    return None

def create_user(username, full_name, password, role="student"):
    users = load_users()
    username_clean = "".join(c for c in username if c.isalnum() or c in ('_', '-')).strip().lower()
    
    if not username_clean:
        raise ValueError("Invalid username. Only alphanumeric characters, underscores, and hyphens are allowed.")
        
    if username_clean in users:
        raise ValueError(f"User '{username_clean}' already exists.")
        
    users[username_clean] = {
        "username": username_clean,
        "password_hash": generate_password_hash(password),
        "full_name": full_name.strip(),
        "role": role
    }
    
    save_users(users)
    return users[username_clean]

def delete_user(username):
    users = load_users()
    username_clean = username.strip().lower()
    if username_clean == "admin":
        raise ValueError("Cannot delete the primary admin account.")
    if username_clean in users:
        del users[username_clean]
        save_users(users)
        return True
    return False

def list_students():
    users = load_users()
    students = []
    for username, info in users.items():
        if info.get("role") == "student":
            students.append({
                "username": info["username"],
                "full_name": info["full_name"],
                "role": info["role"]
            })
    return students
