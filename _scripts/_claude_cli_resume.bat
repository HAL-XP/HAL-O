@echo off
title * HAL-O (Claude Resume)
cd /d "%~dp0\.."
claude -n "HAL-O" --resume --channels plugin:telegram@claude-plugins-official
REM For skip-permissions mode, use _claude_cli_resume_NOPROMPT.bat
