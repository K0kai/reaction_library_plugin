@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0Bootstrap.ps1" -Language pt-BR
if errorlevel 1 pause
