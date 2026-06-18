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
        CREATE TABLE IF NOT EXISTS mentors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
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
    cursor = conn.execute("DELETE FROM users WHERE username = ?", (username_clean,))
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    return deleted


def list_students():
    """List all users with role 'student'."""
    conn = get_db()
    cursor = conn.execute("""
        SELECT u.username, u.full_name, u.email, u.mentor_email, m.name AS mentor_name, u.role, u.created_at 
        FROM users u
        LEFT JOIN mentors m ON u.mentor_email = m.email
        WHERE u.role = 'student' 
        ORDER BY u.created_at DESC
    """)
    students = [_row_to_dict(row) for row in cursor.fetchall()]
    conn.close()
    return students


def list_mentors():
    """List all mentors."""
    conn = get_db()
    cursor = conn.execute("SELECT id, name, email, created_at FROM mentors ORDER BY name ASC")
    mentors = [_row_to_dict(row) for row in cursor.fetchall()]
    conn.close()
    return mentors


def create_mentor(name, email):
    """Create a new mentor."""
    email_clean = email.strip().lower()
    if not name.strip():
        raise ValueError("Mentor name is required.")
    if not email_clean:
        raise ValueError("Mentor email is required.")
    
    conn = get_db()
    # Check if email is already taken
    cursor = conn.execute("SELECT id FROM mentors WHERE email = ?", (email_clean,))
    if cursor.fetchone():
        conn.close()
        raise ValueError(f"Mentor with email '{email_clean}' already exists.")
        
    conn.execute(
        "INSERT INTO mentors (name, email) VALUES (?, ?)",
        (name.strip(), email_clean)
    )
    conn.commit()
    conn.close()


def delete_mentor(mentor_id):
    """Delete a mentor by id."""
    conn = get_db()
    
    # Get mentor email first so we can clear it from assigned students
    cursor = conn.execute("SELECT email FROM mentors WHERE id = ?", (mentor_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return False
        
    mentor_email = row["email"]
    
    # Clear mentor_email for students assigned to this mentor
    conn.execute("UPDATE users SET mentor_email = '' WHERE mentor_email = ?", (mentor_email,))
    
    # Delete mentor
    conn.execute("DELETE FROM mentors WHERE id = ?", (mentor_id,))
    
    conn.commit()
    conn.close()
    return True


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


# Initialize database on module import
def load_users():
    """Legacy compatibility wrapper — initializes the SQLite DB."""
    init_db()
