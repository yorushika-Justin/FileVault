@echo off
chcp 936 >nul
title Install Auto-start
cls
echo ========================================
echo   FileVault - Install Auto-start
echo ========================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install_autostart.ps1"

echo.
echo Press any key to exit...
pause >nul
