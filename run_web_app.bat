@echo off
title Sandhata Timesheet App Launcher
echo ===================================================
echo   SANDHATA INTERNSHIP TIMESHEET APP LAUNCHER
echo ===================================================
echo.

:: Check Python installation
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not added to your PATH.
    echo Please install Python and try again.
    pause
    exit /b
)

:: Check Flask dependency
python -c "import flask" >nul 2>nul
if %errorlevel% neq 0 (
    echo [INFO] Installing Flask web server dependency...
    pip install flask
) else (
    echo [INFO] Flask dependency is already installed.
)

:: Check openpyxl dependency
python -c "import openpyxl" >nul 2>nul
if %errorlevel% neq 0 (
    echo [INFO] Installing openpyxl dependency...
    pip install openpyxl
) else (
    echo [INFO] openpyxl dependency is already installed.
)

echo.
echo [INFO] Starting Flask Server...
:: Starts app.py in a minimized or separate window
start "Sandhata Timesheet Server" python app.py

echo [INFO] Waiting 2 seconds for server to boot...
timeout /t 2 /nobreak >nul

echo [INFO] Opening Web Browser to timesheet interface...
start http://127.0.0.1:5000/

echo.
echo ===================================================
echo   App is running! Keep this window open.
echo   Press any key to stop the server and close.
echo ===================================================
pause >nul

:: Clean up Flask on exit
taskkill /FI "WINDOWTITLE eq Sandhata Timesheet Server*" /T /F >nul 2>nul
echo Done.
