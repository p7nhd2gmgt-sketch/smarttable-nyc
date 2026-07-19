param(
  [string]$Reason = "manual"
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backupRoot = Join-Path $projectRoot "backups"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$safeReason = ($Reason -replace "[^a-zA-Z0-9_-]", "-").Trim("-")
if (-not $safeReason) {
  $safeReason = "save"
}

New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null

$archiveName = "smarttable-$timestamp-$safeReason.zip"
$archivePath = Join-Path $backupRoot $archiveName
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("smarttable-save-" + [guid]::NewGuid().ToString("N"))

New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null

try {
  Get-ChildItem -LiteralPath $projectRoot -Force |
    Where-Object { $_.Name -notin @("backups", ".autosave.pid", ".autosave.heartbeat", "autosave.log") } |
    ForEach-Object {
      $destination = Join-Path $tempRoot $_.Name
      Copy-Item -LiteralPath $_.FullName -Destination $destination -Recurse -Force
    }

  Compress-Archive -Path (Join-Path $tempRoot "*") -DestinationPath $archivePath -Force

  $latestPath = Join-Path $backupRoot "latest.txt"
  @(
    "createdAt=$((Get-Date).ToString("s"))"
    "reason=$Reason"
    "archive=$archivePath"
  ) | Set-Content -LiteralPath $latestPath -Encoding UTF8

  Write-Output $archivePath
} finally {
  if (Test-Path $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}
