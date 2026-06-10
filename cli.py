import os
import sys
import json
import re
from datetime import datetime, date, timedelta
from excel_manager import (
    DEFAULT_FILENAME,
    get_workbook,
    find_next_empty_slot,
    save_log,
    get_existing_log,
    get_or_create_day_slots,
    recreate_day_slots,
    save_timesheet_slot_activity,
    sync_timesheet_to_daily_log
)

CONFIG_FILENAME = "tracker_config.json"

def load_start_date():
    if os.path.exists(CONFIG_FILENAME):
        try:
            with open(CONFIG_FILENAME, 'r') as f:
                data = json.load(f)
                return datetime.strptime(data["start_date"], "%Y-%m-%d").date()
        except:
            pass
    return None

def save_start_date(start_date):
    try:
        with open(CONFIG_FILENAME, 'w') as f:
            json.dump({"start_date": start_date.strftime("%Y-%m-%d")}, f)
    except Exception as e:
        print(f"Warning: Could not save config: {e}")

def get_default_start_date():
    # Monday of the current week
    today = date.today()
    return today - timedelta(days=today.weekday())

def get_current_slot(start_date):
    today = date.today()
    days_diff = (today - start_date).days
    
    # Calculate week number (7 days per week)
    week_num = (days_diff // 7) + 1
    # Day number (Monday=1, Tuesday=2, ..., Sunday=7)
    day_num = today.weekday() + 1
    
    # If weekend, default to Day 5 (Friday) of the same week
    if day_num > 5:
        day_num = 5
        
    return week_num, day_num

def get_multi_line_input():
    print("Enter your updates for today:")
    print(" (Type your notes. Press Enter on a blank line when you are finished)")
    print("-" * 60)
    lines = []
    while True:
        try:
            line = input()
            if line.strip() == "":
                break
            lines.append(line)
        except (KeyboardInterrupt, EOFError):
            print("\nInput cancelled.")
            sys.exit(0)
    return "\n".join(lines)

def main():
    print("=" * 60)
    print("        SANDHATA INTERNSHIP LOG AUTOMATION")
    print("=" * 60)
    
    filepath = DEFAULT_FILENAME
    
    # Check start date config
    start_date = load_start_date()
    if not start_date:
        start_date = get_default_start_date()
        save_start_date(start_date)
        print(f"[Info] Internship start date initialized to Monday, {start_date.strftime('%B %d, %Y')} (based on system clock).")
        
    # Calculate today's slot
    today_w, today_d = get_current_slot(start_date)
    weekday_name = date.today().strftime("%A")
    today_str = date.today().strftime("%B %d, %Y")
    
    print(f"\n[Status] Today is {weekday_name}, {today_str}")
    print(f"Calculated slot: WEEK {today_w}, DAY {today_d}")
    
    # 2. Confirm or select week/day
    choice = input(f"Use this slot? (Y/n): ").strip().lower()
    if choice in ("", "y", "yes"):
        w = today_w
        d = today_d
    else:
        # User wants to manually specify slot
        while True:
            try:
                w_in = input("Enter Week Number (e.g. 1): ").strip()
                w = int(w_in)
                if w <= 0:
                    raise ValueError
                break
            except ValueError:
                print("Invalid week number. Please enter a positive integer.")
                
        while True:
            try:
                d_in = input("Enter Day Number (1-5): ").strip()
                d = int(d_in)
                if d < 1 or d > 5:
                    raise ValueError
                break
            except ValueError:
                print("Invalid day number. Please enter a number between 1 and 5.")
                
    # Calculate slot date
    slot_date = start_date + timedelta(weeks=w-1, days=d-1)
    date_str = slot_date.strftime("%Y-%m-%d")
    
    run_timesheet_flow(filepath, w, d, date_str)
        
    # 5. Open Excel sheet option
    open_choice = input("\nWould you like to open the Excel sheet? (y/N): ").strip().lower()
    if open_choice in ("y", "yes"):
        try:
            print(f"Opening {filepath}...")
            if hasattr(os, 'startfile'):
                os.startfile(filepath)
            else:
                import subprocess
                subprocess.call(['open', filepath])
        except Exception as e:
            print(f"Could not open spreadsheet: {e}")
            
    print("\nThank you for updating your log! Have a great day.")

def run_daily_summary_flow(filepath, w, d):
    # Check if there is an existing log for this day
    try:
        existing_log = get_existing_log(filepath, w, d)
    except Exception:
        existing_log = None
        
    append_choice = True
    if existing_log:
        print(f"\n[Notice] Existing log found for WEEK {w}, DAY {d}:")
        print(f"  \"{existing_log}\"")
        while True:
            action = input("Choose action: (a) Append new notes, (o) Overwrite today's notes, (c) Cancel [Default: a]: ").strip().lower()
            if not action or action == 'a':
                append_choice = True
                break
            elif action == 'o':
                append_choice = False
                break
            elif action == 'c':
                print("Cancelled. Exiting without saving.")
                return
            else:
                print("Invalid choice. Please select 'a', 'o', or 'c'.")

    # Get log content
    raw_text = get_multi_line_input()
    if not raw_text.strip():
        print("No content entered. Exiting without saving.")
        return
        
    # Save and format with retry loop for open files
    while True:
        try:
            formatted_text = save_log(filepath, w, d, raw_text, append=append_choice)
            print("-" * 60)
            print(f"[SUCCESS] Log saved to WEEK {w}, DAY {d}.")
            print(f"Formatted log text:\n  {formatted_text}")
            print("-" * 60)
            break
        except PermissionError:
            print(f"\n[ERROR] Permission denied: Cannot write to '{filepath}'.")
            print("This usually happens because the Excel file is open in Microsoft Excel.")
            input("--> Please CLOSE the Excel file and press Enter to try saving again...")
        except Exception as e:
            print(f"Error saving log to Excel: {e}")
            return

def run_timesheet_flow(filepath, w, d, date_str):
    # 1. Determine if slots already exist
    from excel_manager import get_timesheet_sheet, find_day_row_range
    try:
        wb, ws = get_timesheet_sheet(filepath)
        start_row, end_row = find_day_row_range(ws, w, d)
        wb.close()
    except Exception as e:
        start_row = None
        print(f"[Info] Initializing new Excel workbook/sheet: {e}")
    
    arrival_time = "09:00"
    if start_row is not None:
        wb, ws = get_timesheet_sheet(filepath)
        arrival_time = ws.cell(row=start_row, column=4).value
        wb.close()
        print(f"\n[Info] Loaded existing timesheet for today (Arrival Time: {arrival_time}).")
        
        change_arr = input("Would you like to change your Arrival Time? (y/N): ").strip().lower()
        if change_arr in ("y", "yes"):
            new_arr = input("Enter new Arrival Time (HH:MM, e.g. 09:30): ").strip()
            if re.match(r'^\d{1,2}:\d{2}$', new_arr):
                parts = new_arr.split(":")
                h, m = int(parts[0]), int(parts[1])
                if 0 <= h < 24 and 0 <= m < 60:
                    new_arrival = f"{h:02d}:{m:02d}"
                    confirm = input("This will RESET today's timesheet slots. Any logged work will be LOST. Proceed? (y/N): ").strip().lower()
                    if confirm in ("y", "yes"):
                        try:
                            recreate_day_slots(filepath, w, d, date_str, new_arrival)
                            arrival_time = new_arrival
                            print(f"[Success] Today's timesheet reset with arrival time: {arrival_time}.")
                        except PermissionError:
                            print("[ERROR] Permission denied: Close the Excel file and try again.")
                            return
                        except Exception as e:
                            print(f"Error resetting slots: {e}")
                            return
            else:
                print("Invalid time format (use HH:MM). Keeping existing arrival time.")
    else:
        print("\nNo timesheet found for today yet.")
        arr_input = input("Enter your Arrival Time today (HH:MM, e.g. 09:00) [Default: 09:00]: ").strip()
        if arr_input:
            if re.match(r'^\d{1,2}:\d{2}$', arr_input):
                parts = arr_input.split(":")
                h, m = int(parts[0]), int(parts[1])
                if 0 <= h < 24 and 0 <= m < 60:
                    arrival_time = f"{h:02d}:{m:02d}"
                else:
                    print("[Warning] Invalid time range. Using default 09:00.")
            else:
                print("[Warning] Invalid format. Using default 09:00.")
        else:
            arrival_time = "09:00"
            
    try:
        slots = get_or_create_day_slots(filepath, w, d, date_str, arrival_time)
    except PermissionError:
        print(f"\n[ERROR] Permission denied: Cannot write to '{filepath}'.")
        print("Please CLOSE the Excel file and try again.")
        return
    except Exception as e:
        print(f"Error loading timesheet slots: {e}")
        return

    print("\n" + "=" * 60)
    print(f"             TIMESHEET LOGGING - WEEK {w}, DAY {d}")
    print("=" * 60)
    print("Enter what you did in each slot. Press Enter to skip/keep current.")
    print("-" * 60)
    
    for idx, s in enumerate(slots, 1):
        if s["type"] == "Lunch Break":
            print(f"  {s['start']} - {s['end']} (Lunch Break) : [Auto-filled]")
            continue
            
        current_act = s["activity"] if s["activity"] else "None"
        print(f"\nSlot {s['start']} - {s['end']}:")
        act_val = input(f"  What did you do? [Current: {current_act}]: ").strip()
        
        if act_val:
            try:
                save_timesheet_slot_activity(filepath, s["row"], act_val)
            except PermissionError:
                print("[ERROR] Permission denied: Close the Excel file and try again.")
                return
            except Exception as e:
                print(f"Error saving: {e}")
                return
                
    try:
        sync_timesheet_to_daily_log(filepath, w, d)
    except Exception as e:
        print(f"Warning: Daily log sync failed: {e}")
        
    try:
        slots = get_or_create_day_slots(filepath, w, d, date_str, arrival_time)
    except Exception:
        pass
        
    exit_time = "18:00"
    for s in reversed(slots):
        if s["type"] == "Work":
            exit_time = s["end"]
            break
            
    print("\n" + "=" * 60)
    print(f"[SUCCESS] Timesheet updated for WEEK {w}, DAY {d}.")
    print(f"  Arrival Time:   {arrival_time}")
    print(f"  Est. Exit Time: {exit_time}")
    print("=" * 60)


if __name__ == "__main__":
    main()
