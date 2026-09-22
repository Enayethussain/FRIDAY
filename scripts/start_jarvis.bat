@echo off
REM JARVIS manual launcher — same entry point the Task Scheduler task uses.
REM Usage: start_jarvis.bat [--autostart]
setlocal
cd /d "%~dp0.."
if not exist "data\logs" mkdir "data\logs"
set LOG=%CD%\data\logs\startup.log
echo [%DATE% %TIME%] start_jarvis: launching from %CD% args=%* >> "%LOG%"
where electron.cmd >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  if not exist "node_modules\electron\dist\electron.exe" (
    echo JARVIS cannot start: electron not installed. Run "npm install" first.
    echo [%DATE% %TIME%] start_jarvis: FAILED electron missing >> "%LOG%"
    exit /b 1
  )
  start "" /min "%CD%\node_modules\electron\dist\electron.exe" "%CD%" %* >> "%LOG%" 2>&1
) else (
  start "" /min cmd /c "npx electron . %* >> ""%LOG%"" 2>&1"
)
echo JARVIS launching — Orb/HUD window will appear. Logs: data\logs\startup.log
endlocal
exit /b 0
