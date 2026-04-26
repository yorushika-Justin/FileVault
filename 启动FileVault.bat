@echo off
title FileVault 文件同步系统
color 0A
cd /d "%~dp0"
echo ========================================
echo    FileVault 文件同步系统
echo ========================================
echo.
echo 正在启动服务...
echo.
node server.js
pause
