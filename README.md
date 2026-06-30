# Mentis.ai 🔄

Mentis.ai is a secure, modern web application designed for tracking student internships, daily task logs, and mentor-student collaborations. It automates logsheet maintenance in formatted Excel spreadsheets, generates daily work summaries using AI, tracks mentor-assigned tasks with file uploads, and provides secure workspace folder navigation for mentors and administrators.

---

## 📁 Repository Directory Structure

```text
Mentis.ai/
│
├── excel_templates/                # User-specific workspaces & document vaults
│   └── <username>/                 # Folder matching the cleaned student username
│       ├── Sandhata_Internship_Log.xlsx  # Student's Excel log timesheet
│       └── documents/              # File uploads vault managed by the student
│
├── modules/                        # Backend Python helper service modules
│   ├── ai_service.py               # Google Gemini integration engine
│   ├── excel_manager.py            # Student log spreadsheet editor (openpyxl)
│   ├── mail_service.py             # SMTP automated email worker
│   ├── user_manager.py             # Database connector and query layer
│   └── db_timesheet_manager.py     # Administrative db reporting helper
│
├── static/                         # Static web assets
│   ├── css/                        
│   │   └── style.css               # Global glassmorphic styling system
│   ├── js/                         
│   │   ├── admin.js                # Administrator client controller
│   │   ├── mentor.js               # Mentor task & logs coordinator
│   │   └── app.js                  # Student workspace client script
│   ├── images/                     
│   │   └── logo*.png               # Light, dark, and monochrome brand assets
│   └── uploads/                    
│       └── tasks/                  # Task attachments organized by task ID
│
├── templates/                      # Flask HTML5 template viewports
│   ├── admin.html                  
│   ├── mentor.html                 
│   ├── index.html                  
│   ├── login.html                  
│   └── register.html               
│
├── app.py                          # Core Flask bootstrapper and routing gateway
├── users.db                        # Active SQLite database file
├── tracker_config.json             # Global application configuration variables
├── run_web_app.bat                 # Direct windows launcher batch script
└── .gitignore                      # Workspace rules (ignores db, caches, and logs)
```

---

## 🛠️ Component Breakdown

### 🖥️ Application Engine
* **`app.py`**: Coordinates the entire application. It contains all API routes for authentication, timesheet updates, task completions, and the folder explorer boundaries.
* **`modules/user_manager.py`**: Handles DB operations for `users.db` via SQL queries. Manages registration, hashing passwords securely, and assigning students to mentors.
* **`modules/excel_manager.py`**: Manages the automated compilation of student hours using `openpyxl`. Writes tasks directly into a templated spreadsheet (`Sandhata_Internship_Log.xlsx`).
* **`modules/ai_service.py`**: Leverages AI to process bulleted student daily activities and structure them into professional progress logs.
* **`modules/mail_service.py`**: Automates emailing summaries directly to assigned mentors at the close of every working day.
* **`modules/db_timesheet_manager.py`**: Auxiliary service for generating reports and database views of sheets.

### 🎨 Frontend Systems
* **`static/css/style.css`**: Defines the premium dark-mode dashboard aesthetics, utilizing glassmorphism, responsive grid systems, status badges, and animated toast alerts.
* **`static/js/app.js`**: Drives the student's interactable timesheet. Renders hourly grids, syncs spreadsheet updates, and launches task completion dialogs.
* **`static/js/mentor.js`**: Allows mentors to view logsheets, assign new tasks, track completion files, and browse assigned students' workspace folders.
* **`static/js/admin.js`**: Grants full administration control: registers new students and mentors, manages mappings, configures start-dates, and inspects files in any student directory.

---

## 💾 Database Schema (`users.db`)

The database consists of two primary tables:

1. **`users`**:
   * `username` (Primary Key, unique, lowercased alphanumeric)
   * `full_name` (Display name)
   * `email` (Optional registered email address)
   * `mentor_email` (Foreign mapping referencing a mentor's registered email)
   * `password_hash` (Securely hashed credentials)
   * `role` (`student`, `mentor`, or `admin`)
   * `created_at` (Timestamp of registration)

2. **`student_tasks`**:
   * `id` (Auto-incrementing Key)
   * `student_username` (Target student)
   * `mentor_username` (Assigning mentor)
   * `task_description` (Requirements)
   * `assigned_date` (Creation date)
   * `status` (`pending` or `completed`)
   * `response_message` (Optional submission text text)
   * `attachment_filename` (Optional uploaded filename)
   * `attachment_path` (Path to saved task file inside `static/uploads/`)

---

## 🚀 Getting Started

### 📋 Prerequisites
* Python 3.8+
* Install required dependencies:
  ```bash
  pip install flask openpyxl apscheduler werkzeug sqlite3
  ```

### 💻 Running the Application
Simply double-click the **`run_web_app.bat`** script in the project root, or execute the following command in your terminal:
```bash
python app.py
```
The server will boot on [http://127.0.0.1:5000](http://127.0.0.1:5000).

#### Default Credentials:
* **Admin Access**: `username: admin` | `password: AdminPassword123!`
