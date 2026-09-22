#Requires -Version 5.1
<#
  Installs "Send with FRIDAY" into Explorer file context menu.
  Scope: HKEY_CURRENT_USER only (no admin, no system-wide hooks, no DLLs).
  Run: powershell -File install-context-menu.ps1
  Remove: powershell -File install-context-menu.ps1 -Uninstall
#>
param([switch]$Uninstall)

$ErrorActionPreference = 'Stop'
$key = 'HKCU:\Software\Classes\*\shell\SendWithFRIDAY'

if ($Uninstall) {
  if (Test-Path -LiteralPath $key) {
    Remove-Item -LiteralPath $key -Recurse -Force
    Write-Host 'Send with FRIDAY menu hata diya.'
  } else {
    Write-Host 'Menu pehle se installed nahi hai.'
  }
  exit 0
}

$stager = Join-Path $PSScriptRoot 'Send-With-FRIDAY.ps1'
if (-not (Test-Path -LiteralPath $stager)) {
  Write-Host 'Stager script nahi mili.'
  exit 1
}

New-Item -Path $key -Force | Out-Null
Set-ItemProperty -LiteralPath $key -Name '(Default)' -Value 'Send with FRIDAY'
New-Item -Path "$key\command" -Force | Out-Null
$cmd = 'powershell.exe -NoProfile -WindowStyle Hidden -File "{0}" "%1"' -f $stager
Set-ItemProperty -LiteralPath "$key\command" -Name '(Default)' -Value $cmd
Write-Host 'Send with FRIDAY menu install ho gaya (current user only).'
Write-Host 'Note: FRIDAY server isi PC par chalna chahiye (http://127.0.0.1:3000).'
