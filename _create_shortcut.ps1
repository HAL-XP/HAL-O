$WshShell = New-Object -ComObject WScript.Shell

# Start Menu shortcut
$shortcutPath = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\HAL-O.lnk"
$shortcut = $WshShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "cmd.exe"
$shortcut.Arguments = '/c "cd /d D:\GitHub\ProjectCreator && npx electron-vite dev"'
$shortcut.WorkingDirectory = "D:\GitHub\ProjectCreator"
$shortcut.IconLocation = "D:\GitHub\ProjectCreator\resources\icon.ico,0"
$shortcut.Description = "HAL-O - Claude Code Command Center"
$shortcut.WindowStyle = 7
$shortcut.Save()

# Desktop shortcut
$desktopPath = "$env:USERPROFILE\Desktop\HAL-O.lnk"
$shortcut2 = $WshShell.CreateShortcut($desktopPath)
$shortcut2.TargetPath = "cmd.exe"
$shortcut2.Arguments = '/c "cd /d D:\GitHub\ProjectCreator && npx electron-vite dev"'
$shortcut2.WorkingDirectory = "D:\GitHub\ProjectCreator"
$shortcut2.IconLocation = "D:\GitHub\ProjectCreator\resources\icon.ico,0"
$shortcut2.Description = "HAL-O - Claude Code Command Center"
$shortcut2.WindowStyle = 7
$shortcut2.Save()

Write-Host "Done! Shortcuts created at:"
Write-Host "  Start Menu: $shortcutPath"
Write-Host "  Desktop: $desktopPath"
Write-Host "Right-click Desktop shortcut -> Pin to taskbar"
