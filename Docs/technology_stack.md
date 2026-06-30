# LogiSync 🔄 — Technology Stack Documentation

This document outlines the complete technology stack, core dependencies, and architectural integration of **LogiSync**, a secure web application for tracking student internships and mentor collaborations.

---

## 🛠️ Technology Stack Overview

| Layer | Component / Technology | Primary Purpose |
| :--- | :--- | :--- |
| **Frontend UI/UX** | HTML5, CSS3, JavaScript (ES6) | Responsive, dark-themed user interface, interactive widgets, timeline, and AJAX dashboard operations. |
| **Backend Service** | Python 3.8+, Flask | Core backend logic, routing engine, session management, file upload pipelines, and server controllers. |
| **Database Storage**| SQLite3 (`users.db`) | Relational database storage for student profiles, mentor associations, task states, timesheets, and activity logs. |
| **AI Integration** | Google Gemini 1.5 Flash | Automatically analyzes granular hourly timesheet descriptions to synthesize professional work summaries. |
| **Email Delivery** | SMTP Service | Sends daily log updates and summaries from students directly to mentors' email boxes. |

---

## 🏛️ Component Specifications

### 1. Backend Stack & Dependencies
LogiSync's server architecture is built entirely in **Python** using the **Flask** micro-framework. Flask handles incoming web routing and manages secure user sessions using encrypted cookies.

- **Flask (v2.x/v3.x)**: Handles HTTP endpoints, view templates rendering, and files upload validation.
- **SQLite3**: Standard embedded relational database. Stored locally in [users.db](file:///c:/Users/gauth/OneDrive/Desktop/LogiSync_/users.db).
- **Werkzeug Security**: Handles secure password encryption using the `scrypt` hashing algorithm with custom salt.
- **openpyxl**: Programmatically formats and exports data into styled Microsoft Excel worksheets (`.xlsx`) matching the custom corporate layout requirements.
- **APScheduler**: Manages background cron tasks (such as reminder mailings or summary sweeps).
- **Google GenAI / Gemini API**: Leveraged via HTTP fetch/libraries to perform text completions on timesheet slots.

### 2. Frontend Stack & Libraries
LogiSync implements a zero-framework (Vanilla) client interface, ensuring ultra-fast load times, complete flexibility, and compatibility.

- **HTML5 & Semantic Markup**: Structure templates like [index.html](file:///c:/Users/gauth/OneDrive/Desktop/LogiSync_/templates/index.html) (student dashboard), [mentor.html](file:///c:/Users/gauth/OneDrive/Desktop/LogiSync_/templates/mentor.html), and [admin.html](file:///c:/Users/gauth/OneDrive/Desktop/LogiSync_/templates/admin.html).
- **CSS3 with Glassmorphism Variables**: Custom stylesheet ([style.css](file:///c:/Users/gauth/OneDrive/Desktop/LogiSync_/static/style.css)) featuring customized CSS custom properties (`--bg-primary`, `--bg-card`, etc.), responsive flexbox/grid grids, smooth micro-animations, toast notices, and custom scrollbars.
- **Vanilla JavaScript (ES6+)**: Executes AJAX REST payloads to API endpoints without jQuery or thick client frameworks.
- **FontAwesome (v6.x)**: Renders vectorized UI icons.
- **Google Fonts**: Uses modern sans-serif typography (`Outfit` for headers, `Inter` for body text).

---

## 📁 Source File Technology Mapping

- **Server Core & Routing Engine**: [app.py](file:///c:/Users/gauth/OneDrive/Desktop/LogiSync_/app.py)
- **User Accounts & Authentication**: [modules/user_manager.py](file:///c:/Users/gauth/OneDrive/Desktop/LogiSync_/modules/user_manager.py)
- **Timesheet SQLite Interface**: [modules/db_timesheet_manager.py](file:///c:/Users/gauth/OneDrive/Desktop/LogiSync_/modules/db_timesheet_manager.py)
- **Excel Spreadsheet Formatting**: [modules/excel_manager.py](file:///c:/Users/gauth/OneDrive/Desktop/LogiSync_/modules/excel_manager.py)
- **AI Summary Dispatch**: [modules/ai_service.py](file:///c:/Users/gauth/OneDrive/Desktop/LogiSync_/modules/ai_service.py)
- **SMTP Mailing Pipeline**: [modules/mail_service.py](file:///c:/Users/gauth/OneDrive/Desktop/LogiSync_/modules/mail_service.py)
