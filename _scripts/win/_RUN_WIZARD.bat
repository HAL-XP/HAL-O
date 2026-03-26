@echo off
:: Legacy entry point — redirects to START_HERE.bat
echo [HAL-O] Redirecting to START_HERE.bat...
cd /d "%~dp0..\.."
call START_HERE.bat %*
