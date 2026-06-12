@echo off
title Push The Button - Medieval Edition
color 06

echo.
echo  =============================================
echo   ^  PUSH THE BUTTON - Medieval Edition  ^
echo  =============================================
echo.

cd /d "%~dp0"

:: Check Node.js
where node >nul 2>&1
if errorlevel 1 (
  color 04
  echo  [ERROR] Node.js not found.
  echo  Download it at: https://nodejs.org
  echo.
  pause
  exit /b 1
)

:: Install dotenv if node_modules missing
if not exist "node_modules" (
  echo  Installing dependencies...
  call npm install --silent
  echo  Done.
  echo.
)

:: Get local IP
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /C:"IPv4"') do (
  set IP=%%A
  goto :gotip
)
:gotip
set IP=%IP: =%

echo  Starting server...
echo.
echo  -----------------------------------------------
echo   Host screen  ^>  http://localhost:3000/host
echo   Players join ^>  http://%IP%:3000
echo  -----------------------------------------------
echo.
echo  Open the host screen on your TV or shared display.
echo  Players scan the QR code or visit the LAN URL.
echo.
echo  Press Ctrl+C to stop the server.
echo.

:: Open host screen in default browser after short delay
start "" cmd /c "timeout /t 2 >nul && start http://localhost:3000/host"

node server.js

pause
