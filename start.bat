@echo off
rem Starts the backend (port 4000) and the web UI (port 3000).
rem   start.bat           normal: opens the two windows and the browser
rem   start.bat --quiet   used at Windows login: minimized windows, no browser
rem Close the two Event Debugger windows to stop everything.

cd /d "%~dp0"

set "WSTYLE="
set "OPEN=1"
if /i "%~1"=="--quiet" (
  set "WSTYLE=/min"
  set "OPEN=0"
)

if not exist node_modules (
  echo Installing dependencies first, this only happens once...
  call npm install
)

rem BROWSER=none stops Create React App from opening its own browser tab
start "Event Debugger API" %WSTYLE% cmd /k "node server/index.js"
start "Event Debugger UI" %WSTYLE% cmd /k "set BROWSER=none&& npm start"

if "%OPEN%"=="1" (
  echo Waiting for the UI to start...
  timeout /t 20 /nobreak >nul
  start "" http://localhost:3000
)
