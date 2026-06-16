import google.generativeai as genai
import os
from dotenv import load_dotenv

load_dotenv()

def generate_daily_summary(student_name, date_str, activities):
    load_dotenv(override=True)
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("GEMINI_API_KEY not found in environment.")
        activities_list = "\n".join([f"- {act}" for act in activities])
        return f"Daily summary for {student_name} on {date_str}:\n\n{activities_list}"
        
    genai.configure(api_key=api_key)
    
    if not activities:
        return f"{student_name} did not log any activities on {date_str}."
        
    activities_list = "\n".join([f"- {act}" for act in activities])
    
    prompt = f"""Summarize these internship activities for {student_name} on {date_str} in a brief, professional paragraph:
{activities_list}"""
    
    try:
        model = genai.GenerativeModel('gemini-flash-latest')
        response = model.generate_content(prompt)
        return response.text.strip()
    except Exception as e:
        print(f"Error generating AI summary: {e}")
        return f"Daily summary for {student_name} on {date_str}:\n\n{activities_list}"

