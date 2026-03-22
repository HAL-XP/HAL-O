@echo off
title * Claudeborn - Fresh User Test
echo ============================================
echo  Claudeborn Fresh User Simulation
echo ============================================
echo.
echo This will:
echo  1. Clone the repo to a temp folder
echo  2. Install dependencies
echo  3. Launch with no API key (credentials hidden)
echo.
echo Your real setup is NOT affected.
echo.
pause

set "TEST_DIR=%TEMP%\claudeborn-fresh-test"

:: Clean previous test
if exist "%TEST_DIR%" (
    echo [*] Cleaning previous test dir...
    rmdir /s /q "%TEST_DIR%"
)

:: Clone
echo [*] Cloning repo to %TEST_DIR%...
git clone https://github.com/HAL-XP/Claudeborn.git "%TEST_DIR%"
if %errorlevel% neq 0 (
    echo [ERROR] Clone failed
    pause
    exit /b 1
)

cd /d "%TEST_DIR%"

:: Install deps
echo [*] Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] npm install failed
    pause
    exit /b 1
)

:: Clear API key so the app thinks it's missing
:: (don't touch HOME/USERPROFILE — Electron needs them)
set "ANTHROPIC_API_KEY=__test_invalid__"

:: Temporarily hide credentials file by setting a flag the app can check
:: We rename it and restore after
set "CRED_FILE=%USERPROFILE%\.claude_credentials"
set "CRED_BACKUP=%USERPROFILE%\.claude_credentials._test_backup"
if exist "%CRED_FILE%" (
    echo [*] Temporarily hiding ~/.claude_credentials...
    rename "%CRED_FILE%" .claude_credentials._test_backup
    set "CREDS_HIDDEN=1"
) else (
    set "CREDS_HIDDEN=0"
)

echo.
echo [*] Environment:
echo     ANTHROPIC_API_KEY = (set to invalid)
echo     ~/.claude_credentials = (hidden)
echo     gh CLI = still uses system keyring
echo.

:: Launch
echo [*] Starting Claudeborn...
call npm run dev

:: Restore credentials
if "%CREDS_HIDDEN%"=="1" (
    echo [*] Restoring ~/.claude_credentials...
    rename "%USERPROFILE%\.claude_credentials._test_backup" .claude_credentials
)

echo.
echo [*] Test complete.
pause
