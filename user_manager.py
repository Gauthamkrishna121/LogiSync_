import os
import sqlite3
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash

DB_FILE = "users.db"


def get_db():
    """Get a database connection with row factory."""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    """Initialize the database schema."""
    conn = get_db()
    
    # Drop legacy mentors table if exists to clean up schema
    conn.execute("DROP TABLE IF EXISTS mentors")
    
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            full_name TEXT NOT NULL,
            email TEXT DEFAULT '',
            mentor_email TEXT DEFAULT '',
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'student',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS student_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_username TEXT NOT NULL,
            mentor_username TEXT NOT NULL,
            task_description TEXT NOT NULL,
            assigned_date TEXT NOT NULL DEFAULT (date('now')),
            status TEXT NOT NULL DEFAULT 'pending',
            response_message TEXT,
            attachment_filename TEXT,
            attachment_path TEXT,
            FOREIGN KEY (student_username) REFERENCES users(username) ON DELETE CASCADE,
            FOREIGN KEY (mentor_username) REFERENCES users(username) ON DELETE CASCADE
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS timesheet_slots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            date_val TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            duration_hrs TEXT NOT NULL,
            category TEXT NOT NULL,
            activity_text TEXT NOT NULL DEFAULT '',
            row_index INTEGER NOT NULL,
            FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
        )
    """)
    for col in ["response_message", "attachment_filename", "attachment_path"]:
        try:
            conn.execute(f"ALTER TABLE student_tasks ADD COLUMN {col} TEXT")
        except sqlite3.OperationalError:
            pass
    conn.commit()

    # Check if we need to seed the default admin
    cursor = conn.execute("SELECT COUNT(*) FROM users")
    count = cursor.fetchone()[0]

    if count == 0:
        # Seed default admin account
        conn.execute(
            "INSERT INTO users (username, full_name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)",
            ("admin", "Team Leader", "", generate_password_hash("AdminPassword123!"), "admin")
        )
        conn.commit()

    conn.close()


def _row_to_dict(row):
    """Convert a sqlite3.Row to a plain dict."""
    if row is None:
        return None
    return dict(row)


def authenticate_user(username, password):
    """Authenticate a user by username and password."""
    conn = get_db()
    cursor = conn.execute("SELECT * FROM users WHERE username = ?", (username.strip().lower(),))
    row = cursor.fetchone()
    conn.close()

    if row and check_password_hash(row["password_hash"], password):
        return _row_to_dict(row)
    return None


def create_user(username, full_name, password, role="student", email="", mentor_email=""):
    """Create a new user account."""
    username_clean = "".join(c for c in username if c.isalnum() or c in ('_', '-')).strip().lower()

    if not username_clean:
        raise ValueError("Invalid username. Only alphanumeric characters, underscores, and hyphens are allowed.")

    if len(username_clean) < 3:
        raise ValueError("Username must be at least 3 characters long.")

    if len(password) < 6:
        raise ValueError("Password must be at least 6 characters long.")

    conn = get_db()

    # Check if username exists
    cursor = conn.execute("SELECT id FROM users WHERE username = ?", (username_clean,))
    if cursor.fetchone():
        conn.close()
        raise ValueError(f"User '{username_clean}' already exists.")

    # Check if email exists (if provided)
    if email and email.strip():
        cursor = conn.execute("SELECT id FROM users WHERE email = ? AND email != ''", (email.strip().lower(),))
        if cursor.fetchone():
            conn.close()
            raise ValueError(f"Email '{email}' is already registered.")

    conn.execute(
        "INSERT INTO users (username, full_name, email, mentor_email, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)",
        (username_clean, full_name.strip(), email.strip().lower() if email else "", mentor_email.strip().lower() if mentor_email else "", generate_password_hash(password), role)
    )
    conn.commit()

    cursor = conn.execute("SELECT * FROM users WHERE username = ?", (username_clean,))
    user = _row_to_dict(cursor.fetchone())
    conn.close()
    return user


def delete_user(username):
    """Delete a user by username."""
    username_clean = username.strip().lower()
    if username_clean == "admin":
        raise ValueError("Cannot delete the primary admin account.")

    conn = get_db()
    
    # Get user email first so we can clear assigned students if it is a mentor
    cursor = conn.execute("SELECT email FROM users WHERE username = ?", (username_clean,))
    row = cursor.fetchone()
    if row and row["email"]:
        conn.execute("UPDATE users SET mentor_email = '' WHERE mentor_email = ?", (row["email"],))

    cursor = conn.execute("DELETE FROM users WHERE username = ?", (username_clean,))
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    return deleted


def list_students():
    """List all users with role 'student'."""
    conn = get_db()
    cursor = conn.execute("""
        SELECT u.username, u.full_name, u.email, u.mentor_email, m.full_name AS mentor_name, u.role, u.created_at 
        FROM users u
        LEFT JOIN users m ON u.mentor_email = m.email AND m.role = 'mentor'
        WHERE u.role = 'student' 
        ORDER BY u.created_at DESC
    """)
    students = [_row_to_dict(row) for row in cursor.fetchall()]
    conn.close()
    return students


def list_mentors():
    """List all mentors."""
    conn = get_db()
    cursor = conn.execute("SELECT id, username, full_name, email, created_at FROM users WHERE role = 'mentor' ORDER BY full_name ASC")
    mentors = [_row_to_dict(row) for row in cursor.fetchall()]
    conn.close()
    return mentors


def create_mentor(username, name, password, email):
    """Create a new mentor account."""
    return create_user(username, name, password, role="mentor", email=email)


def delete_mentor_by_username(username):
    """Delete a mentor user by username."""
    return delete_user(username)


def assign_student_to_mentor(username, mentor_email):
    """Assign a student to a mentor by updating their mentor_email."""
    conn = get_db()
    # Check if student exists
    cursor = conn.execute("SELECT id FROM users WHERE username = ? AND role = 'student'", (username.strip().lower(),))
    if not cursor.fetchone():
        conn.close()
        raise ValueError(f"Student '{username}' not found.")
        
    # Clear or update
    email_val = mentor_email.strip().lower() if mentor_email else ""
    
    # Update student record
    conn.execute("UPDATE users SET mentor_email = ? WHERE username = ?", (email_val, username.strip().lower()))
    conn.commit()
    conn.close()


# ───────────────────────── Student Tasks ─────────────────────────

def create_task(student_username, mentor_username, description):
    """Assign a task to a student from a mentor."""
    if not description.strip():
        raise ValueError("Task description is required.")
        
    conn = get_db()
    # Verify student exists
    cursor = conn.execute("SELECT id FROM users WHERE username = ? AND role = 'student'", (student_username.strip().lower(),))
    if not cursor.fetchone():
        conn.close()
        raise ValueError(f"Student '{student_username}' not found.")
        
    conn.execute(
        "INSERT INTO student_tasks (student_username, mentor_username, task_description) VALUES (?, ?, ?)",
        (student_username.strip().lower(), mentor_username.strip().lower(), description.strip())
    )
    conn.commit()
    conn.close()


def list_tasks_by_mentor(mentor_username):
    """List all tasks created by a specific mentor."""
    conn = get_db()
    cursor = conn.execute("""
        SELECT t.id, t.student_username, u.full_name AS student_name, t.mentor_username, t.task_description, t.assigned_date, t.status, t.response_message, t.attachment_filename, t.attachment_path
        FROM student_tasks t
        JOIN users u ON t.student_username = u.username
        WHERE t.mentor_username = ?
        ORDER BY t.id DESC
    """, (mentor_username.strip().lower(),))
    tasks = [_row_to_dict(row) for row in cursor.fetchall()]
    conn.close()
    return tasks


def list_tasks_by_student(student_username):
    """List all tasks assigned to a specific student."""
    conn = get_db()
    cursor = conn.execute("""
        SELECT t.id, t.student_username, t.mentor_username, m.full_name AS mentor_name, t.task_description, t.assigned_date, t.status, t.response_message, t.attachment_filename, t.attachment_path
        FROM student_tasks t
        JOIN users m ON t.mentor_username = m.username
        WHERE t.student_username = ?
        ORDER BY t.id DESC
    """, (student_username.strip().lower(),))
    tasks = [_row_to_dict(row) for row in cursor.fetchall()]
    conn.close()
    return tasks


def complete_task(task_id, student_username, response_message=None, attachment_filename=None, attachment_path=None):
    """Mark a student task as completed with response details."""
    conn = get_db()
    cursor = conn.execute(
        "UPDATE student_tasks SET status = 'completed', response_message = ?, attachment_filename = ?, attachment_path = ? WHERE id = ? AND student_username = ?",
        (response_message, attachment_filename, attachment_path, task_id, student_username.strip().lower())
    )
    conn.commit()
    updated = cursor.rowcount > 0
    conn.close()
    return updated


def delete_task(task_id, mentor_username):
    """Delete a task (mentor operation)."""
    conn = get_db()
    cursor = conn.execute("DELETE FROM student_tasks WHERE id = ? AND mentor_username = ?", (task_id, mentor_username.strip().lower()))
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    return deleted


def get_user_by_username(username):
    """Get a single user by username."""
    conn = get_db()
    cursor = conn.execute("SELECT * FROM users WHERE username = ?", (username.strip().lower(),))
    user = _row_to_dict(cursor.fetchone())
    conn.close()
    return user


def username_exists(username):
    """Check if a username is already taken."""
    conn = get_db()
    cursor = conn.execute("SELECT id FROM users WHERE username = ?", (username.strip().lower(),))
    exists = cursor.fetchone() is not None
    conn.close()
    return exists


def email_exists(email):
    """Check if an email is already registered."""
    if not email or not email.strip():
        return False
    conn = get_db()
    cursor = conn.execute("SELECT id FROM users WHERE email = ? AND email != ''", (email.strip().lower(),))
    exists = cursor.fetchone() is not None
    conn.close()
    return exists


def update_student(username, full_name, password=None, mentor_email=None):
    """Update a student's profile."""
    conn = get_db()
    # Verify user exists and is a student
    cursor = conn.execute("SELECT id FROM users WHERE username = ? AND role = 'student'", (username.strip().lower(),))
    if not cursor.fetchone():
        conn.close()
        raise ValueError(f"Student '{username}' not found.")

    # We can update full_name, mentor_email, and password if provided
    if password and password.strip():
        if len(password) < 6:
            conn.close()
            raise ValueError("Password must be at least 6 characters long.")
        pwd_hash = generate_password_hash(password)
        conn.execute(
            "UPDATE users SET full_name = ?, mentor_email = ?, password_hash = ? WHERE username = ? AND role = 'student'",
            (full_name.strip(), mentor_email.strip().lower() if mentor_email else "", pwd_hash, username.strip().lower())
        )
    else:
        conn.execute(
            "UPDATE users SET full_name = ?, mentor_email = ? WHERE username = ? AND role = 'student'",
            (full_name.strip(), mentor_email.strip().lower() if mentor_email else "", username.strip().lower())
        )
    conn.commit()
    conn.close()


def update_mentor(username, full_name, email, password=None):
    """Update a mentor's profile, cascading email changes to assigned students."""
    conn = get_db()
    # Verify mentor exists
    cursor = conn.execute("SELECT email FROM users WHERE username = ? AND role = 'mentor'", (username.strip().lower(),))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise ValueError(f"Mentor '{username}' not found.")
    
    old_email = row["email"]
    new_email = email.strip().lower()

    # If email changes, check if the new email is already registered by another user
    if new_email and new_email != old_email:
        cursor2 = conn.execute("SELECT id FROM users WHERE email = ? AND email != '' AND username != ?", (new_email, username.strip().lower()))
        if cursor2.fetchone():
            conn.close()
            raise ValueError(f"Email '{new_email}' is already registered by another user.")

    # Update mentor details
    if password and password.strip():
        if len(password) < 6:
            conn.close()
            raise ValueError("Password must be at least 6 characters long.")
        pwd_hash = generate_password_hash(password)
        conn.execute(
            "UPDATE users SET full_name = ?, email = ?, password_hash = ? WHERE username = ? AND role = 'mentor'",
            (full_name.strip(), new_email, pwd_hash, username.strip().lower())
        )
    else:
        conn.execute(
            "UPDATE users SET full_name = ?, email = ? WHERE username = ? AND role = 'mentor'",
            (full_name.strip(), new_email, username.strip().lower())
        )

    # If email changed, cascade update to assigned students
    if new_email != old_email and old_email:
        conn.execute(
            "UPDATE users SET mentor_email = ? WHERE mentor_email = ? AND role = 'student'",
            (new_email, old_email)
        )

    conn.commit()
    conn.close()


# Initialize database on module import
def load_users():
    """Legacy compatibility wrapper — initializes the SQLite DB."""
    init_db()

