# LogiSync_ Data Flow & Operations Guide

This document explains how LogiSync_ operates under the hood, specifically focusing on how data is fetched from the frontend, processed by the backend, and stored in the database.

## 1. Data Storage Mechanisms

LogiSync_ primarily relies on two methods for storing and managing data: a relational database and file-based exports.

### SQLite Database (`users.db`)
The core source of truth for the application is a local SQLite database named `users.db`. 
- **Initialization**: The database schema is initialized by the `init_db()` function in `modules/user_manager.py` the first time the app runs.
- **Connection**: It uses Python's built-in `sqlite3` library. The `get_db()` function establishes connections with `row_factory = sqlite3.Row` to easily convert database rows into Python dictionaries. It also uses Write-Ahead Logging (`PRAGMA journal_mode=WAL`) for better concurrency.

**Key Tables**:
1.  **`users`**: Stores authentication details (passwords are hashed using `werkzeug.security`), role identifiers (`student`, `mentor`, `admin`), and relationships (e.g., `mentor_email`).
2.  **`student_tasks`**: Stores tasks assigned by mentors. Foreign keys link back to the `users` table for both the assigner and assignee.
3.  **`timesheet_slots`**: The most frequently updated table. It stores daily schedules broken into time blocks (e.g., 09:00 to 11:00). It stores the category of work and the specific `activity_text` logged by the student.
4.  **`student_activities`**: An audit trail storing metadata about actions taken by students (e.g., "Loaded timesheet", "Updated slot").

### File System / Excel Exports
- **User Folders**: The system creates a dedicated folder for each user in the `excel_templates` directory based on their username.
- **Excel Generation**: Instead of maintaining live Excel sheets, the application dynamically generates `.xlsx` files from the SQLite `timesheet_slots` table using the `openpyxl` library when a user requests a download (`modules/db_timesheet_manager.py -> generate_excel_download()`).

---

## 2. Data Fetching (Client-Server Interaction)

The frontend communicates with the Flask backend almost entirely via **RESTful APIs** returning JSON. 

### Authentication & Session State
- **Sessions**: Flask's secure, server-side signed cookie mechanism (`flask.session`) is used to store authentication state.
- Once a user logs in via `POST /api/login`, their `username` and `role` are stored in the session.
- **Decorators**: Routes in `app.py` are protected by custom decorators (`@login_required`, `@admin_required`, `@mentor_required`). These check the Flask session cookie sent automatically by the browser before processing the request.

### API Architecture
Data is fetched asynchronously from the frontend using JavaScript `fetch()` calls.
- **GET Requests**: Used to retrieve lists. For example, `GET /api/student/activities` or `GET /api/admin/students`. The backend queries SQLite and returns a JSON array.
- **POST/JSON Requests**: Used for mutations. The frontend sends `Content-Type: application/json`. The Flask backend uses `request.json` to extract the payload.

---

## 3. Key Data Workflows

Here is exactly how specific operations are processed end-to-end:

### A. Logging Timesheet Activities
1. **Fetch (Frontend)**: The student opens their timesheet for a specific date. The UI sends a `POST /api/load-timesheet` request.
2. **Process (Backend)**: 
   - `db_timesheet_manager.py` checks if slots already exist in the database for this user and date.
   - If *yes*, it fetches them. If *no*, it calculates a new daily schedule (accounting for lunch breaks) and inserts empty slots into the `timesheet_slots` table.
   - It returns the slots as JSON.
3. **Update (Frontend)**: The student types an activity into a text box and it triggers an auto-save.
4. **Store (Backend)**: A `POST /api/save-slot` request is sent with the row index and text. The backend runs an SQL `UPDATE` to modify the `activity_text` column in `timesheet_slots`.

### B. AI Summary Generation
1. **Trigger (Frontend)**: The student clicks "Generate Summary".
2. **Fetch Data (Backend)**: The `POST /api/generate-summary` route calls `get_day_activities()`, which runs a `SELECT` query to grab all non-lunch `activity_text` for that date.
3. **External API Call**: The text array is passed to `ai_service.py`. It constructs a prompt and sends an HTTP request to the Google Gemini API using the `google.generativeai` SDK.
4. **Return**: Gemini responds with a formatted paragraph, which Flask forwards back to the frontend to display in a text area.

### C. Sending the Summary
1. **Trigger (Frontend)**: The student approves the AI text and clicks "Send to Mentor".
2. **Process (Backend)**: `POST /api/send-summary` is hit. The backend fetches the student's `mentor_email` from the `users` table.
3. **Action**: `mail_service.py` formats an SMTP message and connects to the email server (typically using `smtplib`) to dispatch the message.
4. **Log**: The action is recorded in a global memory dictionary `sent_summaries` to update the daily checklist UI, and logged into the `student_activities` DB table.

## Summary
In short, LogiSync_ uses a modern API-driven architecture. The frontend acts purely as a presentation layer, making asynchronous calls to Flask. Flask handles all business logic, reading and writing to a lightweight SQLite database, and acts as a middleman for external services like Google Gemini and SMTP email servers.
