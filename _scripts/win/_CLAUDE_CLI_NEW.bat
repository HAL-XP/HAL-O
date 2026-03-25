@echo off
title * HAL-O
setlocal EnableDelayedExpansion

REM Check if Telegram is configured in environment or ~/.claude_credentials
set "TG_ARG="
if defined TELEGRAM_BOT_TOKEN (
    set "TG_ARG=--channels plugin:telegram@claude-plugins-official"
) else (
    REM Try to source ~/.claude_credentials (if it exists)
    if exist "%USERPROFILE%\.claude_credentials" (
        for /f "usebackq tokens=1* delims==" %%a in ("%USERPROFILE%\.claude_credentials") do (
            if "%%a"=="TELEGRAM_BOT_TOKEN" (
                set "TG_ARG=--channels plugin:telegram@claude-plugins-official"
            )
        )
    )
)

claude -n "HAL-O" --dangerously-skip-permissions !TG_ARG!
