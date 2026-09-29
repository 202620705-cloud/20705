@echo off
cd /d "%~dp0"
start "맛집 지도 서버" cmd /k "npm start"
timeout /t 3 /nobreak >nul
start "" "http://localhost:3000"
