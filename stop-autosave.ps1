$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidPath = Join-Path $projectRoot ".autosave.pid"
$heartbeatPath = Join-Path $projectRoot ".autosave.heartbeat"

if (-not (Test-Path $pidPath)) {
  Write-Output "No autosave process file found."
  exit 0
}

$pidLine = Get-Content -LiteralPath $pidPath | Where-Object { $_ -like "pid=*" } | Select-Object -First 1
$autosavePid = [int]($pidLine -replace "^pid=", "")

if (Get-Process -Id $autosavePid -ErrorAction SilentlyContinue) {
  Stop-Process -Id $autosavePid -Force
  Start-Sleep -Milliseconds 250
  Remove-Item -LiteralPath $pidPath -Force
  if (Test-Path $heartbeatPath) {
    Remove-Item -LiteralPath $heartbeatPath -Force
  }
  Write-Output "Stopped autosave process $autosavePid."
} else {
  Remove-Item -LiteralPath $pidPath -Force
  if (Test-Path $heartbeatPath) {
    Remove-Item -LiteralPath $heartbeatPath -Force
  }
  Write-Output "Autosave process was not running."
}
