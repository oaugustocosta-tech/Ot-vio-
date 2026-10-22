@echo off
rem Clique duas vezes neste arquivo para instalar o Ultron no Windows.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\instalar.ps1"
