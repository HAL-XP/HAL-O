@echo off
title * Claudeborn Wizard
cd /d "%~dp0"

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Install it from https://nodejs.org
    echo         Claude Code CLI requires Node.js 18+, so you likely already have it.
    pause
    exit /b 1
)

:: Auto-install dependencies on first run
if not exist "node_modules\" (
    echo [Claudeborn] First run detected — installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed. Check your Node.js installation.
        pause
        exit /b 1
    )
    echo.
)

:: Launch
echo [Claudeborn] Starting wizard...
npm run dev
