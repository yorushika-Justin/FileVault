@echo off
chcp 936 >nul
title FileVault
cls
echo ====================================
echo   FileVault File Backup System
echo ====================================
echo.
echo [Info] Starting server...
echo.

cd /d "%~dp0"

start /b node server.js

echo [Info] Waiting for server...
timeout /t 2 /nobreak >nul

echo [Info] Opening browser...
start "" "http://localhost:8888"

echo.
echo ====================================
echo   Server Started!
echo   URL: http://localhost:8888
echo ====================================
echo.
echo [Tip] Close this window to stop server
echo.
pause
