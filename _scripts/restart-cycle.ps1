# HAL-O Restart Cycle — Orchestrates: externalize → rebuild → restart → absorb
# This script runs OUTSIDE of Claude, so it survives app death.
# Triggered by dropping .hal-o-restart signal file.

param(
    [string]$HalODir = "D:\GitHub\hal-o"
)

$ErrorActionPreference = "Continue"

Write-Host "[Restart] Starting HAL-O restart cycle..." -ForegroundColor Cyan

# Step 1: Launch Claude in an external terminal with --continue
Write-Host "[Restart] Step 1: Launching Claude externally with --continue..." -ForegroundColor Yellow
# Use cmd /k with proper quoting — avoid wt argument parsing issues
$extProcess = Start-Process "cmd.exe" -ArgumentList "/k", "cd /d `"$HalODir`" && claude --continue --channels plugin:telegram@claude-plugins-official --permission-mode bypassPermissions" -PassThru
Write-Host "[Restart] External terminal launched (PID: $($extProcess.Id))"

# Step 2: Wait for Claude CLI process to appear
Write-Host "[Restart] Step 2: Waiting for Claude CLI to start..." -ForegroundColor Yellow
$maxWait = 15
$waited = 0
$found = $false
while ($waited -lt $maxWait) {
    Start-Sleep -Seconds 1
    $waited++
    $claude = Get-Process -Name "claude" -ErrorAction SilentlyContinue
    if ($claude) {
        Write-Host "[Restart] Claude CLI detected (PID: $($claude[0].Id)) after ${waited}s" -ForegroundColor Green
        $found = $true
        break
    }
    Write-Host "[Restart] Waiting... (${waited}s)"
}

if (-not $found) {
    Write-Host "[Restart] WARNING: Claude CLI not detected after ${maxWait}s. Continuing anyway..." -ForegroundColor Red
}

# Step 3: Wait a bit more for Claude to fully initialize
Start-Sleep -Seconds 3

# Step 4: Kill the Electron app
Write-Host "[Restart] Step 3: Killing Electron app..." -ForegroundColor Yellow
Get-Process -Name "electron" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2
Write-Host "[Restart] Electron killed."

# Step 5: Relaunch the Electron app
Write-Host "[Restart] Step 4: Relaunching HAL-O app..." -ForegroundColor Yellow
Start-Process "cmd.exe" -ArgumentList "/c", "cd /d `"$HalODir`" && npx electron out/main/index.js"
Write-Host "[Restart] HAL-O app relaunched." -ForegroundColor Green

# Step 6: Wait for the HTTP API to come online
Write-Host "[Restart] Step 5: Waiting for HTTP API..." -ForegroundColor Yellow
$apiWait = 0
$apiUp = $false
while ($apiWait -lt 30) {
    Start-Sleep -Seconds 2
    $apiWait += 2
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:19400/health" -TimeoutSec 2 -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            Write-Host "[Restart] API is up after ${apiWait}s!" -ForegroundColor Green
            $apiUp = $true
            break
        }
    } catch { }
    Write-Host "[Restart] API not ready... (${apiWait}s)"
}

if ($apiUp) {
    Write-Host ""
    Write-Host "=== RESTART CYCLE COMPLETE ===" -ForegroundColor Green
    Write-Host "Claude is running externally with --continue (same conversation)."
    Write-Host "HAL-O app is running and should detect the external session."
    Write-Host "The app will show 'EXTERNAL SESSION' on the sphere."
    Write-Host ""
} else {
    Write-Host "[Restart] WARNING: API did not come online within 30s" -ForegroundColor Red
}
