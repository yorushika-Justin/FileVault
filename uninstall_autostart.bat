@echo off
chcp 936 >nul
title Remove Auto-start
cls
echo ========================================
echo   FileVault - Remove Auto-start
echo ========================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall_autostart.ps1"

echo.
echo Press any key to exit...
pause >nul
