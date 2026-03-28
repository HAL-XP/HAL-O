@echo off
cd /d "%~dp0"
setlocal EnableDelayedExpansion

REM ── Read instance name from instance.json if it exists (clone mode) ──
set "INSTANCE_NAME=HAL-O"
if exist "instance.json" (
    for /f "tokens=1,* delims=:" %%a in ('findstr /R "\"name\"" instance.json') do (
        set "_raw=%%b"
        set "_raw=!_raw:"=!"
        set "_raw=!_raw:,=!"
        for /f "tokens=* delims= " %%x in ("!_raw!") do set "INSTANCE_NAME=%%x"
    )
)
title !INSTANCE_NAME!

REM ── Load credentials for Telegram ──
set "TG_TOKEN_KEY=TELEGRAM_BOT_TOKEN"
if exist "instance.json" set "TG_TOKEN_KEY=TELEGRAM_MAIN_BOT_TOKEN"

if exist "%USERPROFILE%\.claude_credentials" (
    for /f "usebackq eol=# tokens=1* delims==" %%a in ("%USERPROFILE%\.claude_credentials") do (
        set "_KEY=%%a"
        set "_VAL=%%b"
        if "!_KEY:~0,7!"=="export " set "_KEY=!_KEY:~7!"
        if defined _VAL set "!_KEY!=!_VAL!"
    )
)
if not "!TG_TOKEN_KEY!"=="TELEGRAM_BOT_TOKEN" (
    if defined !TG_TOKEN_KEY! (
        for %%v in ("!TG_TOKEN_KEY!") do set "TELEGRAM_BOT_TOKEN=!%%~v!"
    )
)

REM ── Check if node_modules exists ──
if not exist "node_modules" (
    echo [!INSTANCE_NAME!] First run — installing dependencies...
    npm install
    echo [!INSTANCE_NAME!] Building...
    npm run build
)

REM ── Launch: Electron app if built, otherwise CLI mode ──
if exist "out\main\index.js" (
    echo [!INSTANCE_NAME!] Starting app...
    npx electron-vite dev
) else (
    echo [!INSTANCE_NAME!] No build found — starting CLI mode...
    set "TG_ARG="
    if defined TELEGRAM_BOT_TOKEN set "TG_ARG=--channels plugin:telegram@claude-plugins-official"
    claude -n "!INSTANCE_NAME!" !TG_ARG!
)
