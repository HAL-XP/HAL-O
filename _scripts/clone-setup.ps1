# HAL-O Clone Setup — Run this after cloning the repo for a new instance
# Usage: powershell -ExecutionPolicy Bypass -File _scripts/clone-setup.ps1
#
# This script:
# 1. Copies .gitignore.clone to .gitignore
# 2. Creates instance.json from instance.example.json (if not exists)
# 3. Runs npm install
# 4. Rebuilds node-pty patches
# 5. Builds the app

param(
    [string]$InstanceId,
    [string]$InstanceName,
    [int]$Port = 19410
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

Write-Host "=== HAL-O Clone Setup ===" -ForegroundColor Cyan
Write-Host "Project: $ProjectRoot"

# Step 1: .gitignore
$cloneIgnore = Join-Path $ProjectRoot ".gitignore.clone"
$gitignore = Join-Path $ProjectRoot ".gitignore"
if (Test-Path $cloneIgnore) {
    Copy-Item $cloneIgnore $gitignore -Force
    Write-Host "[OK] .gitignore.clone -> .gitignore" -ForegroundColor Green
} else {
    Write-Host "[SKIP] .gitignore.clone not found" -ForegroundColor Yellow
}

# Step 2: instance.json
$instanceJson = Join-Path $ProjectRoot "instance.json"
if (-not (Test-Path $instanceJson)) {
    if (-not $InstanceId) {
        $InstanceId = Split-Path -Leaf $ProjectRoot
        $InstanceId = $InstanceId.ToLower() -replace '[^a-z0-9-]', '-'
    }
    if (-not $InstanceName) {
        $InstanceName = (Get-Culture).TextInfo.ToTitleCase($InstanceId -replace '-', ' ')
    }
    $config = @{
        id = $InstanceId
        name = $InstanceName
        port = $Port
        httpsPort = $Port + 1
        description = "HAL-O clone: $InstanceName"
    } | ConvertTo-Json
    $config | Out-File -Encoding utf8 $instanceJson
    Write-Host "[OK] Created instance.json (id=$InstanceId, port=$Port)" -ForegroundColor Green
} else {
    Write-Host "[SKIP] instance.json already exists" -ForegroundColor Yellow
}

# Step 3: npm install
Write-Host ""
Write-Host "Installing dependencies..." -ForegroundColor Yellow
Push-Location $ProjectRoot
npm install
Write-Host "[OK] npm install complete" -ForegroundColor Green

# Step 4: node-pty rebuild
Write-Host ""
Write-Host "Rebuilding node-pty..." -ForegroundColor Yellow
$rebuildScript = Join-Path $ProjectRoot "_scripts\_rebuild.ps1"
if (Test-Path $rebuildScript) {
    & $rebuildScript -ProjectRoot $ProjectRoot
    Write-Host "[OK] node-pty rebuilt" -ForegroundColor Green
} else {
    Write-Host "[WARN] _rebuild.ps1 not found — node-pty may not work" -ForegroundColor Red
}

# Step 5: Build
Write-Host ""
Write-Host "Building app..." -ForegroundColor Yellow
npm run build
Write-Host "[OK] Build complete" -ForegroundColor Green

Pop-Location

Write-Host ""
Write-Host "=== Setup Complete ===" -ForegroundColor Green
Write-Host "Launch with: _scripts\_claude_cli_new.bat"
Write-Host "Or launch app: npm start"
