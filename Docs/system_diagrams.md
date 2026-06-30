# LogiSync_ System Diagrams

This document contains visual representations of the LogiSync_ architecture, database schema, and key workflows using Mermaid.js.

## 1. System Architecture

The following diagram illustrates the high-level architecture of LogiSync_, showing how the client interacts with the Flask backend and how the backend integrates with various services and the database.

```mermaid
graph TD
    Client[Web Browser] -->|HTTP/REST| FlaskApp[Flask Backend app.py]
    
    subgraph LogiSync_ Backend
        FlaskApp --> UM[user_manager.py]
        FlaskApp --> TM[db_timesheet_manager.py]
        FlaskApp --> MS[mail_service.py]
        FlaskApp --> AS[ai_service.py]
    end
    
    UM --> SQLite[(SQLite users.db)]
    TM --> SQLite
    TM -.-> Excel[Excel Generator openpyxl]
    
    AS -->|API Call| Gemini[Google Gemini API]
    MS -->|SMTP| EmailServer[SMTP Email Server]
```

## 2. Database Entity Relationship Diagram (ERD)

This ERD displays the core tables in `users.db` and their relationships. The system relies heavily on the `users` table to link tasks, timesheets, and activities to specific students and mentors.

```mermaid
erDiagram
    USERS ||--o{ STUDENT_TASKS : "assigned to (student)"
    USERS ||--o{ STUDENT_TASKS : "created by (mentor)"
    USERS ||--o{ TIMESHEET_SLOTS : logs
    USERS ||--o{ STUDENT_ACTIVITIES : performs
    
    USERS {
        int id PK
        string username UK
        string full_name
        string email
        string mentor_email
        string password_hash
        string role
        datetime created_at
    }
    
    STUDENT_TASKS {
        int id PK
        string student_username FK
        string mentor_username FK
        string task_description
        string status
        string response_message
        date assigned_date
    }
    
    TIMESHEET_SLOTS {
        int id PK
        string username FK
        string date_val
        string start_time
        string end_time
        string duration_hrs
        string category
        string activity_text
        int row_index
    }
    
    STUDENT_ACTIVITIES {
        int id PK
        string username FK
        string activity_type
        string action_text
        string detail_text
        datetime timestamp
    }
```

## 3. Sequence Diagram: AI Summary Generation & Delivery

This sequence diagram outlines the workflow when a student generates an AI summary of their day's activities and emails it to their mentor.

```mermaid
sequenceDiagram
    actor Student
    participant UI as Web Interface
    participant App as app.py (API)
    participant TM as db_timesheet_manager
    participant AI as ai_service
    participant Mail as mail_service
    actor Mentor
    
    Student->>UI: Clicks "Generate Summary"
    UI->>App: POST /api/generate-summary (date)
    App->>TM: get_day_activities(username, date)
    TM-->>App: List of activities
    App->>AI: generate_daily_summary(name, date, activities)
    AI->>GoogleGemini: Prompt with activities
    GoogleGemini-->>AI: Generated paragraph
    AI-->>App: Summary Text
    App-->>UI: Displays Summary
    
    Student->>UI: Clicks "Send to Mentor"
    UI->>App: POST /api/send-summary (summary_text)
    App->>Mail: send_summary_email(mentor_email, summary_text)
    Mail->>Mentor: Delivers Email
    App-->>UI: Success Response
```

## 4. Activity Diagram: Student Daily Workflow

This activity diagram (flowchart) illustrates the typical daily process a student follows when interacting with LogiSync_.

```mermaid
flowchart TD
    Start((Start)) --> Login[Student Logs In]
    Login --> IsAuth{Authenticated?}
    IsAuth -- No --> Login
    IsAuth -- Yes --> Dashboard[View Dashboard]
    
    Dashboard --> Action{Choose Action}
    
    Action --> |Manage Tasks| Tasks[View Assigned Tasks]
    Tasks --> CompleteTask[Mark Task as Completed]
    CompleteTask --> Action
    
    Action --> |Fill Timesheet| Timesheet[Open Daily Timesheet]
    Timesheet --> LogSlot[Log Activity for Time Slot]
    LogSlot --> MoreSlots{More slots?}
    MoreSlots -- Yes --> LogSlot
    MoreSlots -- No --> GenerateAI[Generate AI Daily Summary]
    
    GenerateAI --> Review[Review Generated Summary]
    Review --> Edit{Needs edits?}
    Edit -- Yes --> Modify[Modify Summary Text]
    Modify --> Send[Send Summary to Mentor]
    Edit -- No --> Send
    
    Send --> Logout[Log Out]
    Logout --> End((End))
```
