# Use VS dev command prompt and rebuild node-pty with electron headers
# Accepts optional -ProjectRoot parameter (defaults to parent of _scripts/)
param([string]$ProjectRoot)
if (-not $ProjectRoot) { $ProjectRoot = Split-Path -Parent $PSScriptRoot }

# Search for VsDevCmd.bat across all VS 2022 editions
$vsDevCmd = $null
$paths = @(
    'C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\Tools\VsDevCmd.bat',
    'C:\Program Files\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat',
    'C:\Program Files\Microsoft Visual Studio\2022\Professional\Common7\Tools\VsDevCmd.bat',
    'C:\Program Files\Microsoft Visual Studio\2022\Enterprise\Common7\Tools\VsDevCmd.bat'
)
foreach ($p in $paths) {
    if (Test-Path $p) { $vsDevCmd = $p; break }
}
# Fallback: try vswhere
if (-not $vsDevCmd) {
    $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
    if (Test-Path $vswhere) {
        $installPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
        if ($installPath) {
            $candidate = Join-Path $installPath 'Common7\Tools\VsDevCmd.bat'
            if (Test-Path $candidate) { $vsDevCmd = $candidate }
        }
    }
}
if (-not $vsDevCmd) {
    Write-Host 'ERROR: Could not find VsDevCmd.bat'
    exit 1
}

$env:PATH = "$env:PATH;C:\Program Files\Git\cmd"
$electronVersion = (Get-Content "$ProjectRoot\node_modules\electron\package.json" | ConvertFrom-Json).version
Write-Host "Using: $vsDevCmd"
Write-Host "Electron version: $electronVersion"
Write-Host "Project root: $ProjectRoot"

cmd /c "`"$vsDevCmd`" -arch=amd64 >nul 2>&1 && cd /d `"$ProjectRoot\node_modules\node-pty`" && npx node-gyp rebuild --runtime=electron --target=$electronVersion --arch=x64 --dist-url=https://electronjs.org/headers 2>&1"
