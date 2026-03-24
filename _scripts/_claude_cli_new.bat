@echo off
title * HAL-O (Claude New Session)
cd /d "%~dp0\.."
claude -n "HAL-O" --channels plugin:telegram@claude-plugins-official
