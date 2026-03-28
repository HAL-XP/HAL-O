@echo off
cd /d "%~dp0\.."
setlocal EnableDelayedExpansion

REM ── Read instance.json if exists (clone mode) ──
set "INSTANCE_NAME=HAL-O"
set "TG_TOKEN_KEY=TELEGRAM_BOT_TOKEN"
if exist "instance.json" (
    for /f "tokens=1,* delims=:" %%a in ('findstr /R "\"name\"" instance.json') do (
        set "_raw=%%b"
        set "_raw=!_raw:"=!"
        set "_raw=!_raw:,=!"
        for /f "tokens=* delims= " %%x in ("!_raw!") do set "INSTANCE_NAME=%%x"
    )
    REM Clones use TELEGRAM_MAIN_BOT_TOKEN (separate bot)
    set "TG_TOKEN_KEY=TELEGRAM_MAIN_BOT_TOKEN"
)
title * !INSTANCE_NAME! (Claude New Session)

REM ── Load credentials from ~/.claude_credentials ──
if exist "%USERPROFILE%\.claude_credentials" (
    for /f "usebackq eol=# tokens=1* delims==" %%a in ("%USERPROFILE%\.claude_credentials") do (
        set "_KEY=%%a"
        set "_VAL=%%b"
        if "!_KEY:~0,7!"=="export " set "_KEY=!_KEY:~7!"
        if defined _VAL set "!_KEY!=!_VAL!"
    )
)

REM ── For clones: override TELEGRAM_BOT_TOKEN with the clone's token ──
if not "!TG_TOKEN_KEY!"=="TELEGRAM_BOT_TOKEN" (
    if defined !TG_TOKEN_KEY! (
        for %%v in ("!TG_TOKEN_KEY!") do set "TELEGRAM_BOT_TOKEN=!%%~v!"
    )
)

REM ── Write token to shared plugin .env so plugin picks up the right bot ──
if defined TELEGRAM_BOT_TOKEN (
    echo TELEGRAM_BOT_TOKEN=!TELEGRAM_BOT_TOKEN!> "%USERPROFILE%\.claude\channels\telegram\.env"
)

REM ── Enable Telegram channel (ALWAYS — this is a hard rule) ──
set "TG_ARG=--channels plugin:telegram@claude-plugins-official"

echo [!INSTANCE_NAME!] Starting new session...
claude -n "!INSTANCE_NAME!" !TG_ARG!
