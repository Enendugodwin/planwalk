@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install it from https://nodejs.org/ and run this again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing Planwalk dependencies...
  call npm install
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

echo Starting Planwalk at http://localhost:5180 ...
call npm start
pause
