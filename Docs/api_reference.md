# LogiSync_ API Reference

This document provides a comprehensive list of all RESTful API endpoints exposed by the LogiSync_ Flask backend (`app.py`), along with their expected inputs, outputs, and purposes.

---

## 1. Authentication APIs

### `POST /api/login`
- **Purpose**: Authenticates a user and establishes a session.
- **Payload**: JSON with `username` and `password`.
- **Response**: Success status and user profile data (username, full_name, role).

### `POST /api/register`
- **Purpose**: Registers a new student account.
- **Payload**: JSON with `full_name`, `username`, `email`, `password`, and `confirm_password`.
- **Response**: Success status and basic user details.

### `POST /api/check-username`
- **Purpose**: Validates if a chosen username is available during registration.
- **Payload**: JSON with `username`.
- **Response**: Boolean `available` flag and a reason string.

---

## 2. User & Configuration APIs

### `GET /api/user/profile`
- **Purpose**: Retrieves the currently authenticated user's profile details.
- **Auth**: Requires Login.
- **Response**: JSON with `username`, `full_name`, and `role`.

### `GET /api/config` / `POST /api/config`
- **Purpose**: Retrieves or updates the global application configuration (like cohort `start_date`).
- **Auth**: Requires Login (GET) / Admin (POST logic handled in separate endpoints below).
- **Payload (POST)**: JSON with fields to update (e.g., `start_date`, `default_username`).
- **Response**: The current/updated configuration object.

---

## 3. Timesheet & Daily Logging APIs

### `POST /api/load-timesheet`
- **Purpose**: Fetches the timesheet slots for a given date. Generates empty slots if none exist.
- **Auth**: Requires Login.
- **Payload**: JSON with `date_val` (YYYY-MM-DD) and optionally `arrival_time`.
- **Response**: JSON array of time slots (`start`, `end`, `type`, `activity`, `duration`, `row`).

### `POST /api/save-slot`
- **Purpose**: Autosaves the text entered into a specific time slot on the timesheet.
- **Auth**: Requires Login.
- **Payload**: JSON with `date_val`, `row` (index of the slot), and `text` (the activity description).
- **Response**: Success status.

### `GET /api/download-timesheet`
- **Purpose**: Generates and downloads the user's entire timesheet history as a styled Excel (`.xlsx`) file.
- **Auth**: Requires Login.
- **Response**: A binary file download (Attachment).

---

## 4. AI & Communication APIs

### `POST /api/generate-summary`
- **Purpose**: Analyzes the current day's logged activities and uses Google Gemini to generate a cohesive paragraph summary.
- **Auth**: Requires Login.
- **Payload**: JSON with `date_val`.
- **Response**: JSON containing the AI-generated `summary_text`.

### `POST /api/send-summary`
- **Purpose**: Emails the daily summary to the student's assigned mentor.
- **Auth**: Requires Login.
- **Payload**: JSON with `date_val` and optionally `summary_text` (if the user manually edited the AI output).
- **Response**: Success status.

---

## 5. Student Dashboard APIs

### `GET /api/student/activities`
- **Purpose**: Retrieves an audit log of recent actions taken by the student (e.g., updating timesheets, sending emails).
- **Auth**: Requires Login.
- **Response**: JSON array of activity objects.

### `GET /api/student/checklist-status`
- **Purpose**: Checks the daily progress to update the dashboard checklist indicators (timesheet complete, tasks complete, summary sent).
- **Auth**: Requires Login.
- **Query Params**: `?date=YYYY-MM-DD`
- **Response**: JSON with boolean flags for `timesheet`, `tasks`, and `summary`.

### `GET /api/student-files/<username>`
- **Purpose**: Retrieves a directory listing of the files stored in the backend for a specific student.
- **Auth**: Requires Login (Students can only see their own, Admins/Mentors can see assigned).
- **Query Params**: `?path=subfolder`
- **Response**: JSON array of file metadata (name, size, is_dir, modified).

### `GET /api/student-files/<username>/download`
- **Purpose**: Downloads a specific file from the student's backend storage.
- **Auth**: Requires Login.
- **Query Params**: `?path=filename.ext`
- **Response**: File attachment.

---

## 6. Admin APIs

### `GET /api/admin/config` / `POST /api/admin/config`
- **Purpose**: Dedicated endpoints for admins to manage global application settings.
- **Auth**: Requires Admin.
- **Response**: JSON config object.

### `GET /api/admin/students`
- **Purpose**: Retrieves a list of all registered students, including their assigned mentors and file folder status.
- **Auth**: Requires Admin.
- **Response**: JSON array of student details.

### `POST /api/admin/students`
- **Purpose**: Allows an admin to manually create a new student account.
- **Auth**: Requires Admin.
- **Payload**: JSON with student details (`username`, `full_name`, `password`, `mentor_email`).
- **Response**: Success status or validation error.
