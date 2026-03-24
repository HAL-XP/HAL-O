@echo off
title * HAL-O (NOPROMPT)
cd /d "%~dp0\.."
claude -n "HAL-O" --dangerously-skip-permissions --channels plugin:telegram@claude-plugins-official
