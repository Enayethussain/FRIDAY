@echo off
REM Shows real JARVIS startup state: task installed? backend alive? app running?
setlocal
set TASK=JARVIS Auto Start
echo --- JARVIS Startup Status ---
schtasks /query /tn "%TASK%" /fo LIST 2>nul | findstr /i "TaskName Status Last"
if %ERRORLEVEL% NEQ 0 echo Startup task : NOT INSTALLED
echo.
set HEALTH=
for /f %%i in ('curl.exe -s -m 5 http://127.0.0.1:3000/api/health 2^>nul') do set HEALTH=%%i
if defined HEALTH (
  echo Backend     : ONLINE ^(port 3000^)
) else (
  echo Backend     : OFFLINE
)
tasklist /fi "imagename eq electron.exe" 2>nul | findstr /i "electron.exe" >nul
if %ERRORLEVEL% EQU 0 (
  echo Desktop app : RUNNING
) else (
  echo Desktop app : NOT RUNNING
)
echo.
echo Detail: JARVIS Online appears in-app only when the voice session is live.
endlocal
exit /b 0
