@echo off
cd /d "%~dp0"
echo Starting Extension Explorer Server (API + Frontend)...
echo Open http://localhost:3000 in your browser.
node server/server.cjs
pause
