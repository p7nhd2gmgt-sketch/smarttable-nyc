param(
  [int]$IntervalSeconds = 30
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidPath = Join-Path $projectRoot ".autosave.pid"
$daemonPath = Join-Path $projectRoot "autosave-daemon.js"
$bundledNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$pathNode = Get-Command node -ErrorAction SilentlyContinue

if (Test-Path $pidPath) {
  $pidLine = Get-Content -LiteralPath $pidPath | Where-Object { $_ -like "pid=*" } | Select-Object -First 1
  if ($pidLine) {
    $existingPid = [int]($pidLine -replace "^pid=", "")
    if (Get-Process -Id $existingPid -ErrorAction SilentlyContinue) {
      Write-Output "Autosave is already running with pid $existingPid."
      exit 0
    }
  }
  Remove-Item -LiteralPath $pidPath -Force
}

if ($pathNode) {
  $nodeExe = $pathNode.Source
} elseif (Test-Path $bundledNode) {
  $nodeExe = $bundledNode
} else {
  Write-Error "Node.js was not found. Install Node 18+ or run this in the Codex environment."
}

$process = Start-Process -FilePath $nodeExe -ArgumentList $daemonPath, "--interval", $IntervalSeconds -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru
Start-Sleep -Seconds 1

if (Test-Path $pidPath) {
  Get-Content -LiteralPath $pidPath
} else {
  Write-Output "Autosave process started with pid $($process.Id), waiting for heartbeat."
}
