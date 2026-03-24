@echo off
:: Safety net — if ANYTHING crashes, this keeps the window open
if "%~1"=="" (
    cmd /k "%~f0" run
    exit /b
)
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion

:: ============================================================================
::  START_HERE.bat — First-time HAL-O setup for Windows
::  Double-click this file. It handles everything.
:: ============================================================================

title HAL-O Setup

:: Enable ANSI color codes on Windows 10+
for /f "tokens=4-5 delims=. " %%i in ('ver') do set VERSION=%%i.%%j
reg add HKCU\Console /v VirtualTerminalLevel /t REG_DWORD /d 1 /f >nul 2>&1

:: ANSI escape character — use PowerShell to generate it reliably
for /f "delims=" %%e in ('powershell -noprofile -command "[char]27"') do set "ESC=%%e"
:: Set color codes (if ESC is empty, these will just be empty strings — graceful fallback)
set "GREEN=!ESC![92m"
set "YELLOW=!ESC![93m"
set "RED=!ESC![91m"
set "CYAN=!ESC![96m"
set "BOLD=!ESC![1m"
set "DIM=!ESC![2m"
set "RESET=!ESC![0m"

:: Track which steps completed
set "STEP_NODE=0"
set "STEP_NPM=0"
set "STEP_VSBT=0"
set "STEP_INSTALL=0"
set "STEP_PATCHES=0"
set "STEP_BUILD=0"
set "TOTAL_STEPS=7"
set "FAIL=0"

:: Change to script directory (the repo root)
cd /d "%~dp0"
set "REPO=%~dp0"
set "REPO=%REPO:~0,-1%"
set "LOG=%REPO%\_setup.log"

:: Start fresh log
echo ============================================ > "%LOG%"
echo  HAL-O Setup Log >> "%LOG%"
echo  Started: %DATE% %TIME% >> "%LOG%"
echo  Directory: %REPO% >> "%LOG%"
echo ============================================ >> "%LOG%"
echo. >> "%LOG%"

:: ============================================================================
::  ASCII Art Header
:: ============================================================================
echo.
echo %CYAN%    ██╗  ██╗ █████╗ ██╗       ██████╗%RESET%
echo %CYAN%    ██║  ██║██╔══██╗██║      ██╔═══██╗%RESET%
echo %CYAN%    ███████║███████║██║  ██╗  ██║   ██║%RESET%
echo %CYAN%    ██╔══██║██╔══██║██║  ██║  ██║   ██║%RESET%
echo %CYAN%    ██║  ██║██║  ██║███████║  ╚██████╔╝%RESET%
echo %CYAN%    ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝   ╚═════╝%RESET%
echo.
echo %BOLD%    Your Personal Jarvis for Code%RESET%
echo %DIM%    First-time setup — this will take about 5 minutes%RESET%
echo.
echo %DIM%    Log file: %LOG%%RESET%
echo.

:: ============================================================================
::  Pre-flight: detect if running inside HAL-O terminal
:: ============================================================================
if defined HALO_TERMINAL (
    echo %YELLOW%  WARNING: You are running this inside a HAL-O terminal.%RESET%
    echo %YELLOW%  Please close HAL-O and run this from a regular terminal%RESET%
    echo %YELLOW%  ^(Command Prompt, PowerShell, or Windows Terminal^).%RESET%
    echo.
    pause
    exit /b 1
)

:: Check for Electron env vars (set when running inside an Electron app)
if defined ELECTRON_RUN_AS_NODE (
    echo %YELLOW%  WARNING: This appears to be running inside an Electron app.%RESET%
    echo %YELLOW%  Please run START_HERE.bat from a regular terminal instead.%RESET%
    echo.
    pause
    exit /b 1
)
if defined ELECTRON_NO_ASAR (
    echo %YELLOW%  WARNING: This appears to be running inside an Electron app.%RESET%
    echo %YELLOW%  Please run START_HERE.bat from a regular terminal instead.%RESET%
    echo.
    pause
    exit /b 1
)

:: ============================================================================
::  Step 1/7: Check Node.js
:: ============================================================================
echo %BOLD%  [1/%TOTAL_STEPS%] Checking Node.js...%RESET%
echo %DIM%    (JavaScript runtime — powers HAL-O's backend)%RESET%
echo [Step 1] Checking Node.js >> "%LOG%"

call node --version >nul 2>&1
if errorlevel 1 (
    echo %RED%    ✗ Node.js is not installed%RESET%
    echo [Step 1] FAIL: Node.js not found >> "%LOG%"
    echo.
    echo %YELLOW%    Node.js is required to run HAL-O.%RESET%
    echo.
    echo     Choose an option:
    echo       1. Install automatically via winget ^(recommended^)
    echo       2. Open the Node.js download page in your browser
    echo       3. Skip ^(I'll install it myself^)
    echo.
    set /p "NODE_CHOICE=    Enter 1, 2, or 3: "
    if "!NODE_CHOICE!"=="1" (
        echo.
        echo %CYAN%    Installing Node.js LTS via winget...%RESET%
        echo [Step 1] Attempting winget install >> "%LOG%"
        winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements >> "%LOG%" 2>&1
        if errorlevel 1 (
            echo %RED%    ✗ winget install failed. Try option 2 instead.%RESET%
            echo [Step 1] winget install failed >> "%LOG%"
            echo.
            echo %YELLOW%    You may need to restart this terminal after installing Node.js%RESET%
            echo %YELLOW%    so the PATH update takes effect.%RESET%
            echo.
            pause
            exit /b 1
        )
        echo %GREEN%    ✓ Node.js installed! Refreshing PATH...%RESET%
        echo [Step 1] winget install succeeded >> "%LOG%"
        REM Refresh PATH to pick up newly installed node
        for /f "tokens=2*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYSPATH=%%b"
        for /f "tokens=2*" %%a in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USRPATH=%%b"
        set "PATH=!SYSPATH!;!USRPATH!"
        REM Verify it works now
        node --version >nul 2>&1
        if errorlevel 1 (
            echo %YELLOW%    Node.js was installed but this terminal can't see it yet.%RESET%
            echo %YELLOW%    Please close this window and double-click START_HERE.bat again.%RESET%
            echo.
            pause
            exit /b 1
        )
    ) else if "!NODE_CHOICE!"=="2" (
        echo %CYAN%    Opening https://nodejs.org ...%RESET%
        start "" "https://nodejs.org/en/download/"
        echo.
        echo %YELLOW%    Install Node.js LTS, then close this window and%RESET%
        echo %YELLOW%    double-click START_HERE.bat again.%RESET%
        echo.
        pause
        exit /b 1
    ) else (
        echo %YELLOW%    Skipping. Install Node.js 18+ and run this again.%RESET%
        echo.
        pause
        exit /b 1
    )
)

:: We have Node — check version
for /f "tokens=1 delims=v" %%v in ('node --version') do set "DUMMY=%%v"
for /f "tokens=* delims=v" %%v in ('node --version') do set "NODE_VER=%%v"
for /f "tokens=1 delims=." %%m in ("%NODE_VER%") do set "NODE_MAJOR=%%m"

echo [Step 1] Found Node.js v%NODE_VER% (major=%NODE_MAJOR%) >> "%LOG%"

if %NODE_MAJOR% LSS 18 (
    echo %YELLOW%    ⚠ Node.js v%NODE_VER% found — minimum required is v18.0.0%RESET%
    echo.
    echo     Choose an option:
    echo       1. Upgrade via winget
    echo       2. Open download page
    echo       3. Continue anyway ^(may not work^)
    echo.
    set /p "UPGRADE_CHOICE=    Enter 1, 2, or 3: "
    if "!UPGRADE_CHOICE!"=="1" (
        echo %CYAN%    Upgrading Node.js via winget...%RESET%
        winget upgrade OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements >> "%LOG%" 2>&1
        echo %YELLOW%    Please close this window and run START_HERE.bat again.%RESET%
        pause
        exit /b 1
    ) else if "!UPGRADE_CHOICE!"=="2" (
        start "" "https://nodejs.org/en/download/"
        echo %YELLOW%    Install the latest LTS, then run START_HERE.bat again.%RESET%
        pause
        exit /b 1
    )
    echo %YELLOW%    Continuing with v%NODE_VER% — things may break.%RESET%
)

echo %GREEN%    ✓ Node.js v%NODE_VER%%RESET%
set "STEP_NODE=1"

:: ============================================================================
::  Step 2/7: Check npm
:: ============================================================================
echo %BOLD%  [2/%TOTAL_STEPS%] Checking npm...%RESET%
echo %DIM%    (Package manager — installs HAL-O's dependencies)%RESET%
echo [Step 2] Checking npm >> "%LOG%"

echo [Step 2] Running npm --version >> "%LOG%"
call npm --version >nul 2>&1
if errorlevel 1 (
    echo %RED%    ✗ npm not found%RESET%
    echo [Step 2] FAIL: npm not found >> "%LOG%"
    echo.
    echo %YELLOW%    npm should come with Node.js. Something went wrong.%RESET%
    echo %YELLOW%    Try reinstalling Node.js from https://nodejs.org%RESET%
    echo.
    pause
    exit /b 1
)

for /f "delims=" %%v in ('call npm --version 2^>nul') do set "NPM_VER=%%v"
echo %GREEN%    ✓ npm v%NPM_VER%%RESET%
echo [Step 2] Found npm v%NPM_VER% >> "%LOG%"
set "STEP_NPM=1"

:: ============================================================================
::  Step 3/7: Check Visual Studio Build Tools
:: ============================================================================
echo %BOLD%  [3/%TOTAL_STEPS%] Checking C++ build tools...%RESET%
echo %DIM%    (Needed once to compile the embedded terminal engine)%RESET%
echo [Step 3] Checking Visual Studio Build Tools >> "%LOG%"

set "HAS_VSBT=0"
set "VSBT_PATH="

:: Check common VS 2022 locations (individual checks — for-loop with quoted paths breaks on some locales)
set "VS_BASE=C:\Program Files\Microsoft Visual Studio\2022"
if "!HAS_VSBT!"=="0" if exist "!VS_BASE!\Community\Common7\Tools\VsDevCmd.bat" (
    set "HAS_VSBT=1"
    set "VSBT_PATH=!VS_BASE!\Community\Common7\Tools\VsDevCmd.bat"
)
if "!HAS_VSBT!"=="0" if exist "!VS_BASE!\BuildTools\Common7\Tools\VsDevCmd.bat" (
    set "HAS_VSBT=1"
    set "VSBT_PATH=!VS_BASE!\BuildTools\Common7\Tools\VsDevCmd.bat"
)
if "!HAS_VSBT!"=="0" if exist "!VS_BASE!\Professional\Common7\Tools\VsDevCmd.bat" (
    set "HAS_VSBT=1"
    set "VSBT_PATH=!VS_BASE!\Professional\Common7\Tools\VsDevCmd.bat"
)
if "!HAS_VSBT!"=="0" if exist "!VS_BASE!\Enterprise\Common7\Tools\VsDevCmd.bat" (
    set "HAS_VSBT=1"
    set "VSBT_PATH=!VS_BASE!\Enterprise\Common7\Tools\VsDevCmd.bat"
)

:: Check x86 paths separately (parentheses in "Program Files (x86)" break for-loop syntax)
set "VS_X86=!ProgramFiles(x86)!\Microsoft Visual Studio\2022"
if "!HAS_VSBT!"=="0" if exist "!VS_X86!\Community\Common7\Tools\VsDevCmd.bat" (
    set "HAS_VSBT=1"
    set "VSBT_PATH=!VS_X86!\Community\Common7\Tools\VsDevCmd.bat"
)
if "!HAS_VSBT!"=="0" if exist "!VS_X86!\BuildTools\Common7\Tools\VsDevCmd.bat" (
    set "HAS_VSBT=1"
    set "VSBT_PATH=!VS_X86!\BuildTools\Common7\Tools\VsDevCmd.bat"
)

:: Also check via vswhere (the official way)
set "VSWHERE=!ProgramFiles(x86)!\Microsoft Visual Studio\Installer\vswhere.exe"
if "!HAS_VSBT!"=="0" if exist "!VSWHERE!" (
    for /f "usebackq tokens=*" %%i in (`"!VSWHERE!" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2^>nul`) do (
        if exist "%%i\Common7\Tools\VsDevCmd.bat" (
            set "HAS_VSBT=1"
            set "VSBT_PATH=%%i\Common7\Tools\VsDevCmd.bat"
        )
    )
)

if "%HAS_VSBT%"=="1" (
    echo %GREEN%    ✓ Visual Studio Build Tools found%RESET%
    echo %DIM%      %VSBT_PATH%%RESET%
    echo [Step 3] Found VSBT at %VSBT_PATH% >> "%LOG%"
    set "STEP_VSBT=1"
) else (
    echo %YELLOW%    ⚠ Visual Studio C++ Build Tools not found%RESET%
    echo [Step 3] VSBT not found >> "%LOG%"
    echo.
    echo %YELLOW%    These are needed to compile node-pty ^(the terminal engine^).%RESET%
    echo %YELLOW%    Without them, HAL-O's embedded terminal won't work.%RESET%
    echo.
    echo     Choose an option:
    echo       1. Install via winget ^(recommended, ~2 GB download^)
    echo       2. Open Visual Studio download page
    echo       3. Skip ^(HAL-O will run but without embedded terminal^)
    echo.
    set /p "VSBT_CHOICE=    Enter 1, 2, or 3: "
    if "!VSBT_CHOICE!"=="1" (
        echo.
        REM Check admin rights
        net session >nul 2>&1
        if errorlevel 1 (
            echo %YELLOW%    Installing build tools requires administrator rights.%RESET%
            echo %YELLOW%    Re-launching as administrator...%RESET%
            echo [Step 3] Elevating to admin for VSBT install >> "%LOG%"
            echo.
            REM Create a temp script for elevated install
            echo @echo off > "%TEMP%\halo_install_vsbt.bat"
            echo title Installing Visual Studio Build Tools for HAL-O >> "%TEMP%\halo_install_vsbt.bat"
            echo echo Installing Visual Studio 2022 Build Tools... >> "%TEMP%\halo_install_vsbt.bat"
            echo echo This will take a few minutes. Please wait. >> "%TEMP%\halo_install_vsbt.bat"
            echo winget install Microsoft.VisualStudio.2022.BuildTools --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended" --accept-source-agreements --accept-package-agreements >> "%TEMP%\halo_install_vsbt.bat"
            echo if errorlevel 1 ^( >> "%TEMP%\halo_install_vsbt.bat"
            echo   echo. >> "%TEMP%\halo_install_vsbt.bat"
            echo   echo Installation may have failed. Check the output above. >> "%TEMP%\halo_install_vsbt.bat"
            echo ^) else ^( >> "%TEMP%\halo_install_vsbt.bat"
            echo   echo. >> "%TEMP%\halo_install_vsbt.bat"
            echo   echo Build Tools installed successfully! >> "%TEMP%\halo_install_vsbt.bat"
            echo ^) >> "%TEMP%\halo_install_vsbt.bat"
            echo echo. >> "%TEMP%\halo_install_vsbt.bat"
            echo echo Close this window and run START_HERE.bat again. >> "%TEMP%\halo_install_vsbt.bat"
            echo pause >> "%TEMP%\halo_install_vsbt.bat"
            powershell -Command "Start-Process cmd -ArgumentList '/c \"%TEMP%\halo_install_vsbt.bat\"' -Verb RunAs" 2>nul
            echo.
            echo %YELLOW%    An admin window should have opened to install build tools.%RESET%
            echo %YELLOW%    Wait for it to finish, then run START_HERE.bat again.%RESET%
            echo.
            pause
            exit /b 1
        ) else (
            echo %CYAN%    Installing Visual Studio 2022 Build Tools...%RESET%
            echo %DIM%    This downloads about 2 GB. Please be patient.%RESET%
            echo.
            winget install Microsoft.VisualStudio.2022.BuildTools --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended" --accept-source-agreements --accept-package-agreements >> "%LOG%" 2>&1
            if errorlevel 1 (
                echo %RED%    ✗ Installation failed. Check the log or try option 2.%RESET%
                echo [Step 3] winget VSBT install failed >> "%LOG%"
                echo.
                pause
                exit /b 1
            )
            echo %GREEN%    ✓ Build Tools installed!%RESET%
            echo [Step 3] VSBT installed via winget >> "%LOG%"
            set "STEP_VSBT=1"
        )
    ) else if "!VSBT_CHOICE!"=="2" (
        start "" "https://visualstudio.microsoft.com/visual-cpp-build-tools/"
        echo.
        echo %YELLOW%    Download and install "Build Tools for Visual Studio 2022".%RESET%
        echo %YELLOW%    During install, select "Desktop development with C++".%RESET%
        echo %YELLOW%    Then run START_HERE.bat again.%RESET%
        echo.
        pause
        exit /b 1
    ) else (
        echo %YELLOW%    Skipping build tools. Will install with --ignore-scripts.%RESET%
        echo %YELLOW%    The embedded terminal will not work without native modules.%RESET%
        echo [Step 3] User skipped VSBT >> "%LOG%"
        set "STEP_VSBT=0"
    )
)

:: ============================================================================
::  Step 4/7: npm install
:: ============================================================================
echo %BOLD%  [4/%TOTAL_STEPS%] Installing dependencies...%RESET%
echo %DIM%    (Downloads all libraries HAL-O needs — first run takes a few minutes)%RESET%
echo [Step 4] Running npm install >> "%LOG%"

:: Check if node_modules exists and has expected packages
set "NEED_INSTALL=1"
if exist "%REPO%\node_modules\electron\package.json" (
    if exist "%REPO%\node_modules\three\package.json" (
        if exist "%REPO%\node_modules\@xterm\xterm\package.json" (
            echo %DIM%    Existing node_modules found. Checking for updates...%RESET%
            set "NEED_INSTALL=1"
        )
    )
)

if "%STEP_VSBT%"=="0" (
    echo %YELLOW%    Installing without native modules ^(no build tools^)...%RESET%
    echo [Step 4] npm install --ignore-scripts >> "%LOG%"
    call npm install --ignore-scripts >> "%LOG%" 2>&1
) else (
    call npm install >> "%LOG%" 2>&1
)

if errorlevel 1 (
    echo %RED%    ✗ npm install failed%RESET%
    echo [Step 4] FAIL: npm install failed >> "%LOG%"
    echo.
    REM Check for common failures
    findstr /i "node-pty" "%LOG%" >nul 2>&1
    if not errorlevel 1 (
        echo %YELLOW%    The failure appears related to node-pty ^(the terminal engine^).%RESET%
        echo %YELLOW%    This usually means Visual Studio Build Tools are missing or%RESET%
        echo %YELLOW%    not properly configured.%RESET%
        echo.
        echo     Options:
        echo       1. Retry with --ignore-scripts ^(skip native builds^)
        echo       2. Quit and install build tools first
        echo.
        set /p "RETRY_CHOICE=    Enter 1 or 2: "
        if "!RETRY_CHOICE!"=="1" (
            echo %CYAN%    Retrying without native module compilation...%RESET%
            call npm install --ignore-scripts >> "%LOG%" 2>&1
            if errorlevel 1 (
                echo %RED%    ✗ npm install still failed. Check _setup.log for details.%RESET%
                echo.
                pause
                exit /b 1
            )
            echo %GREEN%    ✓ Dependencies installed ^(without native modules^)%RESET%
            set "STEP_VSBT=0"
            set "STEP_INSTALL=1"
        ) else (
            echo.
            echo %YELLOW%    Install Visual Studio Build Tools and run START_HERE.bat again.%RESET%
            echo %YELLOW%    See _FIRST_TIME_SETUP.md for detailed instructions.%RESET%
            echo.
            pause
            exit /b 1
        )
    ) else (
        echo %YELLOW%    Check _setup.log for details.%RESET%
        echo.
        echo %YELLOW%    Common fixes:%RESET%
        echo       - Delete the node_modules folder and try again
        echo       - Make sure you have a stable internet connection
        echo       - Run: npm cache clean --force
        echo.
        pause
        exit /b 1
    )
) else (
    echo %GREEN%    ✓ Dependencies installed%RESET%
    echo [Step 4] npm install succeeded >> "%LOG%"
    set "STEP_INSTALL=1"
)

:: ============================================================================
::  Step 5/7: Apply node-pty patches and rebuild
:: ============================================================================
if "%STEP_VSBT%"=="0" (
    echo %BOLD%  [5/%TOTAL_STEPS%] Skipping native module patches ^(no build tools^)%RESET%
    echo %YELLOW%    ⚠ Embedded terminal will not work%RESET%
    echo [Step 5] Skipped — no VSBT >> "%LOG%"
    goto :step6
)

echo %BOLD%  [5/%TOTAL_STEPS%] Patching and rebuilding terminal engine...%RESET%
echo %DIM%    (Fixes compatibility issues with the embedded terminal)%RESET%
echo [Step 5] Applying node-pty patches >> "%LOG%"

set "PTY_DIR=%REPO%\node_modules\node-pty"
set "PATCH_NEEDED=0"
set "PATCHES_APPLIED=0"

if not exist "%PTY_DIR%" (
    echo %YELLOW%    ⚠ node-pty not found in node_modules. Skipping patches.%RESET%
    echo [Step 5] node-pty not found, skipping >> "%LOG%"
    goto :step6
)

:: --- Patch 1: GetCommitHash.bat ---
set "GCH=%PTY_DIR%\deps\winpty\src\shared\GetCommitHash.bat"
if exist "%GCH%" (
    findstr /c:"echo none" "%GCH%" >nul 2>&1
    if errorlevel 1 (
        echo %DIM%    Patching GetCommitHash.bat...%RESET%
        (
            echo @echo off
            echo echo none
            echo exit /b 0
        ) > "%GCH%"
        set /a PATCHES_APPLIED+=1
        echo [Step 5] Patched GetCommitHash.bat >> "%LOG%"
    ) else (
        echo %DIM%    GetCommitHash.bat already patched%RESET%
    )
)

:: --- Patch 2: winpty.gyp — WINPTY_COMMIT_HASH ---
set "WGYP=%PTY_DIR%\deps\winpty\src\winpty.gyp"
if exist "%WGYP%" (
    findstr /c:"'WINPTY_COMMIT_HASH%%': 'none'" "%WGYP%" >nul 2>&1
    if errorlevel 1 (
        echo %DIM%    Patching winpty.gyp COMMIT_HASH...%RESET%
        powershell -Command "(Get-Content '%WGYP%') -replace \"'WINPTY_COMMIT_HASH%%':.*\", \"'WINPTY_COMMIT_HASH%%': 'none',\" | Set-Content '%WGYP%'" >> "%LOG%" 2>&1
        set /a PATCHES_APPLIED+=1
        echo [Step 5] Patched winpty.gyp COMMIT_HASH >> "%LOG%"
    ) else (
        echo %DIM%    winpty.gyp COMMIT_HASH already patched%RESET%
    )
)

:: --- Patch 3: winpty.gyp — include_dirs 'gen' ---
if exist "%WGYP%" (
    findstr /c:"'gen'" "%WGYP%" >nul 2>&1
    if not errorlevel 1 (
        echo %DIM%    winpty.gyp include dir already set%RESET%
    ) else (
        echo %DIM%    Note: include_dirs 'gen' may need manual check%RESET%
        echo [Step 5] gen include_dirs — check manually >> "%LOG%"
    )
)

:: --- Patch 4: GenVersion.h ---
set "GENDIR=%PTY_DIR%\deps\winpty\src\gen"
set "GENFILE=%GENDIR%\GenVersion.h"
if not exist "%GENDIR%" (
    mkdir "%GENDIR%" 2>nul
    echo [Step 5] Created gen directory >> "%LOG%"
)
if not exist "%GENFILE%" (
    echo %DIM%    Creating GenVersion.h...%RESET%
    (
        echo #define VERSION_MAJOR 0
        echo #define VERSION_MINOR 4
        echo #define VERSION_REVISION 3
        echo #define VERSION_BUILD 1
        echo #define GenVersion_Version "0.4.3"
        echo #define GenVersion_Commit "none"
    ) > "%GENFILE%"
    set /a PATCHES_APPLIED+=1
    echo [Step 5] Created GenVersion.h >> "%LOG%"
) else (
    echo %DIM%    GenVersion.h already exists%RESET%
)

:: --- Patch 5: SpectreMitigation in binding.gyp ---
set "BGYP=%PTY_DIR%\binding.gyp"
if exist "%BGYP%" (
    findstr /c:"SpectreMitigation" "%BGYP%" >nul 2>&1
    if not errorlevel 1 (
        echo %DIM%    SpectreMitigation already present in binding.gyp%RESET%
    ) else (
        echo %DIM%    Patching SpectreMitigation into binding.gyp...%RESET%
        powershell -Command "(Get-Content '%BGYP%') -replace \"'msvs_settings':\", \"'msvs_configuration_attributes': { 'SpectreMitigation': 'false' },`n            'msvs_settings':\" | Set-Content '%BGYP%'" >> "%LOG%" 2>&1
        set /a PATCHES_APPLIED+=1
        echo [Step 5] Patched binding.gyp SpectreMitigation >> "%LOG%"
    )
)

:: --- Patch 6: SpectreMitigation in winpty.gyp ---
if exist "%WGYP%" (
    findstr /c:"SpectreMitigation" "%WGYP%" >nul 2>&1
    if not errorlevel 1 (
        echo %DIM%    SpectreMitigation already present in winpty.gyp%RESET%
    ) else (
        echo %DIM%    Patching SpectreMitigation into winpty.gyp...%RESET%
        powershell -Command "(Get-Content '%WGYP%') -replace \"'msvs_settings':\", \"'msvs_configuration_attributes': { 'SpectreMitigation': 'false' },`n            'msvs_settings':\" | Set-Content '%WGYP%'" >> "%LOG%" 2>&1
        set /a PATCHES_APPLIED+=1
        echo [Step 5] Patched winpty.gyp SpectreMitigation >> "%LOG%"
    )
)

echo %DIM%    !PATCHES_APPLIED! patch(es) applied%RESET%

:: --- Rebuild node-pty ---
echo %DIM%    Rebuilding node-pty with Electron headers...%RESET%
echo [Step 5] Running _rebuild.ps1 >> "%LOG%"

if exist "%REPO%\_scripts\_rebuild.ps1" (
    REM Call the rebuild script — it auto-detects VS edition and vswhere
    powershell -ExecutionPolicy Bypass -File "%REPO%\_scripts\_rebuild.ps1" -ProjectRoot "%REPO%" >> "%LOG%" 2>&1
    if errorlevel 1 (
        echo %YELLOW%    ⚠ node-pty rebuild had issues ^(check log^)%RESET%
        echo [Step 5] Rebuild had issues >> "%LOG%"
        echo.
        echo %YELLOW%    The embedded terminal might not work correctly.%RESET%
        echo %YELLOW%    HAL-O will still launch — the 3D dashboard works fine.%RESET%
        echo %YELLOW%    See _FIRST_TIME_SETUP.md to fix this later.%RESET%
        echo.
    ) else (
        echo %GREEN%    ✓ node-pty rebuilt successfully%RESET%
        echo [Step 5] Rebuild succeeded >> "%LOG%"
        set "STEP_PATCHES=1"
    )
) else (
    echo %YELLOW%    ⚠ _scripts/_rebuild.ps1 not found — running @electron/rebuild instead%RESET%
    echo [Step 5] Fallback: npx electron-rebuild >> "%LOG%"
    call npx electron-rebuild -f -w node-pty >> "%LOG%" 2>&1
    if errorlevel 1 (
        echo %YELLOW%    ⚠ electron-rebuild had issues%RESET%
        echo [Step 5] electron-rebuild had issues >> "%LOG%"
    ) else (
        echo %GREEN%    ✓ node-pty rebuilt via electron-rebuild%RESET%
        echo [Step 5] electron-rebuild succeeded >> "%LOG%"
        set "STEP_PATCHES=1"
    )
)

:step6
:: ============================================================================
::  Step 6/7: Build the app
:: ============================================================================
echo %BOLD%  [6/%TOTAL_STEPS%] Building HAL-O...%RESET%
echo %DIM%    (Compiling the app for your system — about 10 seconds)%RESET%
echo [Step 6] Running electron-vite build >> "%LOG%"

call npx electron-vite build >> "%LOG%" 2>&1
if errorlevel 1 (
    echo %YELLOW%    ⚠ Build had warnings or errors%RESET%
    echo [Step 6] Build had issues >> "%LOG%"
    echo.
    REM Check if out/ directory was created - build may succeed with warnings
    if exist "%REPO%\out\main\index.js" (
        echo %GREEN%    ✓ Build output exists — continuing%RESET%
        echo [Step 6] Build output exists despite warnings >> "%LOG%"
        set "STEP_BUILD=1"
    ) else (
        echo %RED%    ✗ Build failed — no output produced%RESET%
        echo [Step 6] FAIL: no build output >> "%LOG%"
        echo.
        echo %YELLOW%    Possible fixes:%RESET%
        echo       - Delete node_modules and run START_HERE.bat again
        echo       - Check _setup.log for the actual error
        echo       - Run: npx electron-vite build  ^(to see the error^)
        echo.
        echo %YELLOW%    Trying to launch in dev mode anyway...%RESET%
    )
) else (
    echo %GREEN%    ✓ Build complete%RESET%
    echo [Step 6] Build succeeded >> "%LOG%"
    set "STEP_BUILD=1"
)

:: ============================================================================
::  Step 7/7: Summary and Launch
:: ============================================================================
echo.
echo %BOLD%  ══════════════════════════════════════════════%RESET%
echo %BOLD%  Setup Complete!%RESET%
echo %BOLD%  ══════════════════════════════════════════════%RESET%
echo.

:: Show summary
echo   Results:
if "!STEP_NODE!"=="1" ( echo %GREEN%    ✓ Node.js%RESET% ) else ( echo %RED%    ✗ Node.js%RESET% )
if "!STEP_NPM!"=="1" ( echo %GREEN%    ✓ npm%RESET% ) else ( echo %RED%    ✗ npm%RESET% )
if "!STEP_VSBT!"=="1" ( echo %GREEN%    ✓ C++ Build Tools%RESET% ) else ( echo %YELLOW%    ⚠ C++ Build Tools ^(terminal may not work^)%RESET% )
if "!STEP_INSTALL!"=="1" ( echo %GREEN%    ✓ Dependencies installed%RESET% ) else ( echo %RED%    ✗ Dependencies%RESET% )
if "!STEP_PATCHES!"=="1" ( echo %GREEN%    ✓ Native modules built%RESET% ) else if "!STEP_VSBT!"=="0" ( echo %YELLOW%    ⚠ Native modules skipped%RESET% ) else ( echo %YELLOW%    ⚠ Native modules ^(check log^)%RESET% )
if "!STEP_BUILD!"=="1" ( echo %GREEN%    ✓ App built%RESET% ) else ( echo %YELLOW%    ⚠ App build ^(will try dev mode^)%RESET% )

echo.
echo %DIM%    Log saved to: %LOG%%RESET%
echo %DIM%    Troubleshooting: see _FIRST_TIME_SETUP.md%RESET%
echo.

echo [Summary] Node=!STEP_NODE! npm=!STEP_NPM! VSBT=!STEP_VSBT! Install=!STEP_INSTALL! Patches=!STEP_PATCHES! Build=!STEP_BUILD! >> "%LOG%"
echo [Finished] %DATE% %TIME% >> "%LOG%"

:: ============================================================================
::  Launch
:: ============================================================================
echo %BOLD%%CYAN%  HAL-O is ready!%RESET%
echo.
echo     Press any key to launch HAL-O, or close this window to skip.
echo.
pause >nul

:: CI mode: exit cleanly after build (don't launch Electron)
if defined CI (
    echo %GREEN%  CI mode detected - skipping launch.%RESET%
    exit /b 0
)

echo.
echo %CYAN%  Launching HAL-O...%RESET%
echo.

:: Use dev mode (faster, supports hot reload)
call npm run dev

:: If it exits, keep window open
echo.
echo %DIM%  HAL-O has closed. You can close this window.%RESET%
echo %DIM%  To launch again: double-click _LAUNCH_APP.bat%RESET%
echo.
pause
