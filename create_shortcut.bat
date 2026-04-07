@echo off
chcp 936 >nul
title Create Desktop Shortcut
cls
echo ========================================
echo   FileVault - Create Desktop Shortcut
echo ========================================
echo.

set "DESKTOP=%USERPROFILE%\Desktop"
set "SHORTCUT=%DESKTOP%\FileVault.lnk"
set "TARGET=%~dp0FileVault.vbs"

powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT%'); $s.TargetPath = 'wscript.exe'; $s.Arguments = '%TARGET%'; $s.WorkingDirectory = '%~dp0'; $s.Description = 'FileVault'; $s.Save()"

if exist "%SHORTCUT%" (
    echo [Success] Desktop shortcut created!
    echo.
    echo [Tip] Double-click "FileVault" on desktop to start
) else (
    echo [Failed] Shortcut creation failed
)

echo.
echo Press any key to exit...
pause >nul
