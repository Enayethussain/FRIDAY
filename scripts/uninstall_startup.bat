@echo off
REM Removes ONLY the "JARVIS Auto Start" scheduled task. Never touches the project.
setlocal
set TASK=JARVIS Auto Start
schtasks /query /tn "%TASK%" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo No "%TASK%" task found — nothing to remove.
  exit /b 0
)
schtasks /delete /tn "%TASK%" /f >nul 2>&1
schtasks /query /tn "%TASK%" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
  echo FAILED: task still exists. Try running this file as Administrator.
  exit /b 1
)
echo JARVIS automatic startup removed. Project files untouched.
endlocal
exit /b 0
