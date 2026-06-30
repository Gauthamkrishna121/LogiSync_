# LogiSync_ Project Documentation

## Overview
LogiSync_ is a comprehensive web-based platform designed to manage and track internship activities. It provides a structured way for students (interns) to log their daily tasks, mentors to assign and track tasks, and administrators to oversee the entire process. The system uses a Flask backend, a SQLite database, and integrates with Google's Gemini AI to generate automated daily summaries.

## System Architecture
The application follows a modular architecture using Flask. 

### Key Components
- **`app.py`**: The main Flask application entry point. It handles routing, session management, role-based access control (RBAC), and provides RESTful APIs for the frontend.
- **`modules/user_manager.py`**: Manages the SQLite database operations (`users.db`). It handles user authentication, profile updates, and role management (Admin, Mentor, Student). It also manages student tasks and activity logs.
- **`modules/db_timesheet_manager.py`**: Responsible for managing the daily timesheets of students. It generates time slots, handles activity logging per slot, and provides functionality to export timesheets to Excel format using `openpyxl`.
- **`modules/ai_service.py`**: Integrates with Google Generative AI (Gemini Flash) to process daily activities and generate a professional, brief daily summary for students.
- **`modules/mail_service.py`**: Handles sending emails. Primarily used to send the AI-generated daily summaries from the student to their assigned mentor.
- **`modules/excel_manager.py`**: (Secondary) Handles interactions with legacy or template Excel files within the `excel_templates` directory.

## Features

### Role-Based Access
1.  **Admin**:
    - Manage configuration (e.g., cohort start dates).
    - View and manage all students and mentors.
    - Oversee the entire system.
2.  **Mentor**:
    - View assigned students' daily logs and progress.
    - Assign tasks to students and track their completion status.
    - Receive daily AI-generated summary emails.
3.  **Student (Intern)**:
    - Log daily activities in a structured timesheet (broken down by time slots).
    - Manage and complete tasks assigned by mentors.
    - Generate and send AI-powered daily summaries to mentors.
    - Download their own timesheet as an Excel file.

### Database Schema (SQLite)
The application relies on a single SQLite database (`users.db`) with the following core tables:
- `users`: Stores user credentials, roles, and mentor assignments.
- `student_tasks`: Tracks tasks assigned by mentors to students.
- `timesheet_slots`: Stores daily timesheet entries, categorized by time blocks (e.g., "Work", "Lunch Break") and associated activities.
- `student_activities`: An audit log of actions performed by students.

### Third-Party Integrations
- **Google Generative AI (Gemini)**: Used for summarizing daily logs into coherent paragraphs. Requires a `GEMINI_API_KEY` in the environment variables.
- **openpyxl**: Used for dynamically generating styled Excel timesheet reports.

## Setup & Execution

### Prerequisites
- Python 3.x
- Virtual environment (recommended)
- Required Python packages (Flask, google-generativeai, openpyxl, python-dotenv, werkzeug, etc.)

### Running the Application
1.  Ensure all dependencies are installed.
2.  Create a `.env` file in the root directory and add the necessary environment variables:
    ```env
    GEMINI_API_KEY=your_google_gemini_api_key
    ```
3.  Run the application using the provided batch script or standard Python command:
    ```bash
    python app.py
    ```
    *(Alternatively, use `run_web_app.bat` on Windows)*

### Default Credentials
Upon the first initialization, the database seeds a default administrator account:
- **Username**: `admin`
- **Password**: `AdminPassword123!`

## Directory Structure
```
LogiSync_/
│
├── app.py                     # Main application script
├── run_web_app.bat            # Windows startup script
├── tracker_config.json        # Global configuration file
├── users.db                   # SQLite Database (generated)
│
├── modules/                   # Backend modules
│   ├── ai_service.py          # Gemini AI integration
│   ├── db_timesheet_manager.py# Timesheet DB operations & Excel export
│   ├── excel_manager.py       # Legacy Excel template manager
│   ├── mail_service.py        # Email notification service
│   └── user_manager.py        # User & Task DB operations
│
├── static/                    # CSS, JS, and image assets
├── templates/                 # HTML Jinja2 templates (index, login, etc.)
├── Docs/                      # Project documentation
│   ├── project_documentation.md
│   ├── system_diagrams.md     # Architecture & ERD Diagrams
│   ├── data_flow.md           # Guide on data fetching & storage
│   └── api_reference.md       # Comprehensive API endpoint list
└── excel_templates/           # Templates for Excel exports/legacy data
```
