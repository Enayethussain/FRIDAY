@echo off
REM Installs the "JARVIS Auto Start" Task Scheduler task (logon trigger, 30s delay).
REM No admin needed. Never claims success unless schtasks verifies the task.
setlocal
cd /d "%~dp0.."
set ROOT=%CD%
set TASK=JARVIS Auto Start
set LAUNCHER=%ROOT%\scripts\start_jarvis.bat

if not exist "%LAUNCHER%" (
  echo FAILED: launcher not found at "%LAUNCHER%"
  exit /b 1
)
if not exist "%ROOT%\electron\main.cjs" (
  echo FAILED: desktop shell missing ^(electron\main.cjs^)
  exit /b 1
)

schtasks /create /tn "%TASK%" /tr "cmd /c \"\"%LAUNCHER%\" --autostart\"" /sc onlogon /delay 0000:30 /f >nul 2>&1
schtasks /query /tn "%TASK%" /fo LIST 2>&1 | findstr /i /c:"ERROR" >nul
if %ERRORLEVEL% EQU 0 (
  echo FAILED: Task Scheduler task was NOT created. Run this file normally ^(no admin needed^).
  schtasks /query /tn "%TASK%" 2>&1
  exit /b 1
)
echo.
echo JARVIS automatic startup installed successfully.
echo JARVIS will start automatically when you log into Windows.
echo Task : %TASK%
echo Root : %ROOT%
endlocal
exit /b 0
