# Mentis.ai 🔄 — How It Works Guide

Welcome to Mentis.ai! This guide explains the core features, daily workflows, and technical magic that makes Mentis.ai tick.

---

## 📅 The Daily Student Workflow

Every day of your internship follows a simple, automated logging cycle:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  1. Initialize  │ ──> │   2. Log Time   │ ──> │  3. Auto-Check  │
│  Arrival & Date │     │   Work Blocks   │     │  Daily Progress │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                                 │
┌─────────────────┐     ┌─────────────────┐                      │
│ 6. Submit Tasks │ <── │  5. Email Mentor│ <── ┌────────────────┴┐
│  & Upload Files │     │  AI Log Summary │     │   4. Generate   │
└─────────────────┘     └─────────────────┘     │    AI Summary   │
                                                └─────────────────┘
```

### 1. Initialize Workspace
*   Navigate to **Configuration** in the sidebar.
*   Select the **Log Date** and input your **Arrival Time** (defaults to 09:00 AM).
*   Click **Load Timesheet**. Behind the scenes, Mentis.ai checks the database for existing records or generates a default 8-hour schedule split into 2-hour work blocks, automatically inserting a lunch break slot.

### 2. Log Work Blocks
*   On the **Dashboard**, you will see your day represented as an **Interactive Timeline** at the top, and as detailed text cards below.
*   Type what you accomplished into each active work card. You can write quick notes or click the **Suggestion Chips** (Dev, Meeting, Docs, QA) to insert clean templates.
*   Changes save automatically when you click out of a card (triggering the `blur` event).

### 3. Track Daily Checklist & Activities
*   Click the **Activity** tab in the sidebar.
*   Check your **Daily Progress Checklist** which automatically ticks off tasks:
    *   **Log Timesheet Blocks** ticks when all scheduled work slots are filled.
    *   **Complete Mentor Tasks** ticks when all pending tasks assigned to you are marked complete.
    *   **Send AI Daily Summary** ticks when the daily email has been sent.
*   Below the checklist, you will see a chronological **Recent Activity Feed** detailing exactly when you loaded logs, completed tasks, or managed files.

### 4. Generate & Email AI Summary
*   When your day is complete, navigate to the **AI Summary** tab (or click the green sync banner on your dashboard).
*   Click **Generate AI Summary**. Mentis.ai gathers all your work block descriptions and sends them to the Google Gemini API, which rewrites them into a refined, professional, and well-structured report.
*   Review the generated text in the editor, make any manual tweaks, and click **Send Final Summary**. This triggers the SMTP email service to send the log directly to your mentor's inbox.

### 5. Task & Document Management
*   **Mentor Tasks:** If your mentor assigns you a task, it appears in the **Mentor Tasks** tab. Check the checkbox, type a response, attach any deliverables, and submit to mark it complete.
*   **Internship Files:** Use the **Internship Files** tab as your secure folder vault. Drag-and-drop or select files to upload project reports, credentials, or reference files.

---

## 👥 The Mentor Workflow

Mentors have a dedicated read-only dashboard designed for oversight and feedback:
1.  **Student Roster:** Mentors log in to see a list of their assigned students.
2.  **Inspect Logs:** They select a student and loaded date to view exactly what the student worked on hour-by-hour.
3.  **Task Assignment:** Mentors can assign new deliverables, monitor completion statuses, and download files submitted by students.
4.  **Files Viewer:** Mentors can browse the student's secure upload directory to inspect project logs.

---

## ⚙️ How the Magic Works (Subsystems)

### 📊 1. The Excel Engine (`modules/excel_manager.py`)
Whenever you request to download your timesheet, the backend queries your logs from the SQLite database. It compiles these records and uses the `openpyxl` library to format them into a highly professional Excel sheet (`Sandhata_Internship_Log.xlsx`), styling rows, merging date columns, and applying gridline configurations.

### 🤖 2. The AI service (`modules/ai_service.py`)
This module interfaces with Google Gemini. It takes raw, bulleted student input (e.g., "fixed bugs, sync meeting, wrote code") and prompts the language model to structure it into formal, chronological progress bullet points suitable for corporate reporting.

### 📧 3. The Mail Worker (`modules/mail_service.py`)
A background service built using python's built-in `smtplib` and `email` packages. It connects to the configured SMTP server (like Gmail) and translates the AI daily summaries into multipart MIME emails delivered directly to the mentor.

### 💾 4. Database Persistence (`users.db`)
An SQLite database handles all state tracking:
*   Authentication logins and password hashing.
*   Assigned task logs, deliverables, and file paths.
*   Chronological user activities (Timesheet loaded, saved, uploads).
*   Dynamic real-time progress calculations.
