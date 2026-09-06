@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo FinScan Corporate Decision Intelligence launcher
echo ======================
echo Project folder: %CD%
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Install Node.js 22.12 LTS or newer from https://nodejs.org, then run this file again.
  goto error
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Reinstall Node.js 22.12 LTS or newer, then run this file again.
  goto error
)

echo Node version:
node -v
echo npm version:
call npm -v
echo.

set "APP_PORT=3000"
for %%P in (3000 3001 3002 3003 3004) do (
  netstat -ano | findstr /R /C:":%%P .*LISTENING" >nul 2>nul
  if errorlevel 1 (
    set "APP_PORT=%%P"
    goto found_port
  )
)

:found_port
echo Using port %APP_PORT%.
echo.

echo Installing dependencies...
call npm ci
if errorlevel 1 goto error

echo.
echo Building the application...
call npm run build
if errorlevel 1 goto error

echo.
echo Starting FinScan Corporate Decision Intelligence...
echo Open this URL if the browser does not open automatically:
echo http://localhost:%APP_PORT%
echo.
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 4; Start-Process 'http://localhost:%APP_PORT%'"
set "PORT=%APP_PORT%"
call npm start
if errorlevel 1 goto error
goto end

:error
echo.
echo FinScan could not start.
echo Most common fixes:
echo 1. Make sure you are inside the FinScan Corporate Decision Intelligence folder.
echo 2. Install Node.js 22.12 LTS or newer.
echo 3. Close other terminals already running FinScan, then try again.
echo.
pause

:end
endlocal
