@echo off
setlocal
cd /d "%~dp0"

echo ================================================
echo       ICT DEPARTMENT QUIZ SYSTEM
echo ================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or is not on PATH.
  echo Install the Node.js LTS version, then reopen this file.
  echo https://nodejs.org/en/download
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo First-time setup: installing required packages...
  call npm install
  if errorlevel 1 (
    echo.
    echo Package installation failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

echo Starting the quiz system...
start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:3000"
call npm start

echo.
echo The quiz system has stopped.
pause
