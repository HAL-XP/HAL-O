@echo off
title * HAL-O (NOPROMPT)
cd /d "%~dp0\.."
setlocal EnableDelayedExpansion

REM Load credentials from ~/.claude_credentials into environment
REM Handles: KEY=value, export KEY=value, skips # comments and blank lines
if exist "%USERPROFILE%\.claude_credentials" (
    for /f "usebackq eol=# tokens=1* delims==" %%a in ("%USERPROFILE%\.claude_credentials") do (
        set "_KEY=%%a"
        set "_VAL=%%b"
        REM Strip leading "export " if present
        if "!_KEY:~0,7!"=="export " (
            set "_KEY=!_KEY:~7!"
        )
        if defined _VAL set "!_KEY!=!_VAL!"
    )
)

REM Enable Telegram channel if bot token is available
set "TG_ARG="
if defined TELEGRAM_BOT_TOKEN (
    set "TG_ARG=--channels plugin:telegram@claude-plugins-official"
)

claude -n "HAL-O" --dangerously-skip-permissions !TG_ARG!
