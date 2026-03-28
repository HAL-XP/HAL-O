# HAL-O Restart Cycle v2 — HTTP-based graceful shutdown
# Flow: POST /shutdown (externalize + quit) → wait for exit → verify Claude → relaunch → health check
#
# This script runs OUTSIDE of Claude, so it survives app death.
# Triggered by dropping .hal-o-restart signal file or called directly.

param(
    [string]$HalODir = "D:\GitHub\hal-o",
    [int]$Port = 19400
)

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "=== HAL-O RESTART CYCLE v2 ===" -ForegroundColor Cyan
Write-Host "[Restart] Using HTTP-based graceful shutdown" -ForegroundColor Cyan
Write-Host ""

# ── Step 0: Load API token for authenticated requests ──
$tokenPath = Join-Path $env:USERPROFILE ".hal-o\api-token.txt"
$token = $null
if (Test-Path $tokenPath) {
    $token = (Get-Content $tokenPath -Raw).Trim()
    Write-Host "[Restart] API token loaded from $tokenPath" -ForegroundColor Gray
} else {
    Write-Host "[Restart] WARNING: No API token found at $tokenPath — requests may fail" -ForegroundColor Yellow
}

$headers = @{}
if ($token) {
    $headers["Authorization"] = "Bearer $token"
}

# ── Step 1: Check if app is running (health check) ──
Write-Host "[Restart] Step 1: Checking if HAL-O is running..." -ForegroundColor Yellow
$appRunning = $false
try {
    $healthResponse = Invoke-WebRequest -Uri "http://127.0.0.1:${Port}/health" -TimeoutSec 3 -ErrorAction Stop
    if ($healthResponse.StatusCode -eq 200) {
        $appRunning = $true
        Write-Host "[Restart] HAL-O is running on port $Port" -ForegroundColor Green
    }
} catch {
    Write-Host "[Restart] HAL-O is NOT running (health check failed)" -ForegroundColor Yellow
}

# ── Step 2: POST /shutdown with externalize ──
$electronPid = $null
if ($appRunning) {
    Write-Host "[Restart] Step 2: Requesting graceful shutdown with externalize..." -ForegroundColor Yellow

    # Grab the Electron PID before we tell it to die
    $electronProcs = Get-Process -Name "electron" -ErrorAction SilentlyContinue
    if ($electronProcs) {
        $electronPid = $electronProcs[0].Id
        Write-Host "[Restart] Electron PID: $electronPid" -ForegroundColor Gray
    }

    try {
        $shutdownResponse = Invoke-WebRequest `
            -Uri "http://127.0.0.1:${Port}/shutdown?reason=restart&wait-external=true" `
            -Method POST `
            -Headers $headers `
            -TimeoutSec 5 `
            -ErrorAction Stop

        $body = $shutdownResponse.Content | ConvertFrom-Json
        Write-Host "[Restart] Shutdown accepted: $($body.message)" -ForegroundColor Green
    } catch {
        Write-Host "[Restart] Shutdown request failed: $_" -ForegroundColor Red
        Write-Host "[Restart] Falling back to manual externalize + kill" -ForegroundColor Yellow

        # Fallback: launch Claude externally then kill Electron
        $extProcess = Start-Process "cmd.exe" -ArgumentList "/k", "cd /d `"$HalODir`" && claude --dangerously-skip-permissions --continue -n HAL-O --channels plugin:telegram@claude-plugins-official --permission-mode bypassPermissions" -PassThru
        Write-Host "[Restart] External Claude launched (cmd PID: $($extProcess.Id))"
        Start-Sleep -Seconds 5

        if ($electronPid) {
            Write-Host "[Restart] Killing Electron PID $electronPid" -ForegroundColor Yellow
            Stop-Process -Id $electronPid -Force -ErrorAction SilentlyContinue
        }
    }
} else {
    Write-Host "[Restart] Step 2: Skipping shutdown (app not running)" -ForegroundColor Yellow
}

# ── Step 3: Wait for Electron to exit ──
Write-Host "[Restart] Step 3: Waiting for Electron to exit..." -ForegroundColor Yellow
$exitWait = 0
$exitMaxWait = 30
$exited = $false

while ($exitWait -lt $exitMaxWait) {
    Start-Sleep -Seconds 1
    $exitWait++

    $stillRunning = $false
    if ($electronPid) {
        # Check specific PID — safe, no bulk kill
        try {
            $proc = Get-Process -Id $electronPid -ErrorAction Stop
            $stillRunning = $true
        } catch {
            $stillRunning = $false
        }
    } else {
        # No known PID — check by health endpoint
        try {
            $null = Invoke-WebRequest -Uri "http://127.0.0.1:${Port}/health" -TimeoutSec 1 -ErrorAction Stop
            $stillRunning = $true
        } catch {
            $stillRunning = $false
        }
    }

    if (-not $stillRunning) {
        Write-Host "[Restart] Electron exited after ${exitWait}s" -ForegroundColor Green
        $exited = $true
        break
    }

    if ($exitWait % 5 -eq 0) {
        Write-Host "[Restart] Still waiting for exit... (${exitWait}s)"
    }
}

if (-not $exited) {
    Write-Host "[Restart] WARNING: Electron did not exit within ${exitMaxWait}s" -ForegroundColor Red
    if ($electronPid) {
        Write-Host "[Restart] Force-killing Electron PID $electronPid" -ForegroundColor Red
        Stop-Process -Id $electronPid -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }
}

# ── Step 4: Verify Claude survived ──
Write-Host "[Restart] Step 4: Verifying Claude survived the restart..." -ForegroundColor Yellow
$claudeAlive = $false
$claudeWait = 0
$claudeMaxWait = 10

while ($claudeWait -lt $claudeMaxWait) {
    Start-Sleep -Seconds 1
    $claudeWait++

    $claude = Get-Process -Name "claude" -ErrorAction SilentlyContinue
    if ($claude) {
        Write-Host "[Restart] Claude CLI is alive (PID: $($claude[0].Id)) - session survived!" -ForegroundColor Green
        $claudeAlive = $true
        break
    }
}

if (-not $claudeAlive) {
    Write-Host "[Restart] WARNING: Claude CLI not detected after ${claudeMaxWait}s" -ForegroundColor Red
    Write-Host "[Restart] The session may have been lost. App will start fresh." -ForegroundColor Red
}

# ── Step 5: Relaunch the Electron app ──
Write-Host "[Restart] Step 5: Relaunching HAL-O app..." -ForegroundColor Yellow
Start-Process "cmd.exe" -ArgumentList "/c", "cd /d `"$HalODir`" && npx electron out/main/index.js"
Write-Host "[Restart] HAL-O app launch initiated" -ForegroundColor Green

# ── Step 6: Wait for HTTP API to come online ──
Write-Host "[Restart] Step 6: Waiting for HTTP API..." -ForegroundColor Yellow
$apiWait = 0
$apiUp = $false
while ($apiWait -lt 45) {
    Start-Sleep -Seconds 2
    $apiWait += 2
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:${Port}/health" -TimeoutSec 2 -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            Write-Host "[Restart] API is up after ${apiWait}s!" -ForegroundColor Green
            $apiUp = $true
            break
        }
    } catch { }
    if ($apiWait % 10 -eq 0) {
        Write-Host "[Restart] API not ready... (${apiWait}s)"
    }
}

# ── Done ──
Write-Host ""
if ($apiUp -and $claudeAlive) {
    Write-Host "=== RESTART CYCLE COMPLETE ===" -ForegroundColor Green
    Write-Host "Claude session survived the restart (externalized + re-absorbed)."
    Write-Host "HAL-O app is running and should have detected the external session."
} elseif ($apiUp) {
    Write-Host "=== RESTART CYCLE COMPLETE (with warnings) ===" -ForegroundColor Yellow
    Write-Host "HAL-O app is running but Claude session status is uncertain."
    Write-Host "The app will start a fresh session if the external one was lost."
} else {
    Write-Host "=== RESTART CYCLE FAILED ===" -ForegroundColor Red
    Write-Host "API did not come online within 45s. Check for errors."
}
Write-Host ""
