# Use VS dev command prompt and rebuild node-pty with electron headers
$projectRoot = Split-Path -Parent $PSScriptRoot
$vsDevCmd = "C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\Tools\VsDevCmd.bat"
$env:PATH = "$env:PATH;C:\Program Files\Git\cmd"

$electronVersion = (Get-Content "$projectRoot\node_modules\electron\package.json" | ConvertFrom-Json).version
Write-Host "Electron version: $electronVersion"
Write-Host "Project root: $projectRoot"

cmd /c "`"$vsDevCmd`" -arch=amd64 >nul 2>&1 && cd /d `"$projectRoot\node_modules\node-pty`" && npx node-gyp rebuild --runtime=electron --target=$electronVersion --arch=x64 --dist-url=https://electronjs.org/headers 2>&1"
