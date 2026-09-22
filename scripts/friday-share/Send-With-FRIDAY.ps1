#Requires -Version 5.1
<#
  Send with FRIDAY — stages local files for FRIDAY Share.
  Runs ON THE PC (localhost only). Reads the device token that the FRIDAY
  web HUD stored in this Windows user's profile and POSTs each selected
  file path to /api/share/stage. The server only validates the path and
  returns metadata; the HUD Share panel then sends the file through the
  normal verified transfer flow. No file contents leave the machine here.
  Usage: Send-With-Friday.ps1 <file1> [file2 ...]
#>
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Files
)

$ErrorActionPreference = 'Stop'

if (-not $Files -or $Files.Count -eq 0) {
  Write-Host 'Koi file select nahi hui.'
  exit 1
}

# FRIDAY device token lives in the browser profile; the HUD also mirrors it
# to a plain-text file on explicit user request ("Export PC token" copies it).
$tokenFile = Join-Path $env:APPDATA 'FRIDAY\pc-device-token.txt'
if (-not (Test-Path -LiteralPath $tokenFile)) {
  Write-Host 'FRIDAY PC token nahi mila.'
  Write-Host 'Pehle FRIDAY kholo (http://localhost:3000), Device Link me register karo,'
  Write-Host 'phir token ko is file me rakho:'
  Write-Host ("  " + $tokenFile)
  exit 2
}
$token = (Get-Content -LiteralPath $tokenFile -Raw).Trim()
if (-not $token) {
  Write-Host 'Token file khaali hai.'
  exit 2
}

$ok = 0
$fail = 0
foreach ($f in $Files) {
  try {
    $body = @{ token = $token; path = $f } | ConvertTo-Json -Compress
    $r = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/share/stage' `
      -Method POST -ContentType 'application/json' -Body $body -TimeoutSec 20
    if ($r.success) {
      Write-Host ("Staged: {0} ({1} bytes) — FRIDAY Share panel kholo aur bhejo." -f $r.staged.name, $r.staged.size)
      $ok++
    } else {
      Write-Host ("Reject: {0} — {1}" -f $f, $r.error)
      $fail++
    }
  } catch {
    Write-Host ("Fail: {0} — {1}" -f $f, $_.Exception.Message)
    $fail++
  }
}

Write-Host ("Done: {0} staged, {1} failed. FRIDAY kholo -> Share." -f $ok, $fail)
exit ($fail -eq 0 ? 0 : 3)
