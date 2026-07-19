$ErrorActionPreference = "Stop"

$project = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = "C:\Users\budai\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$out = Join-Path $project "server-debug.out"
$err = Join-Path $project "server-debug.err"

$existing = @(netstat -ano | Select-String ":4173" | ForEach-Object {
  ($_ -split "\s+")[-1]
} | Select-Object -Unique)

foreach ($procId in $existing) {
  if ($procId -match "^\d+$") {
    Stop-Process -Id ([int] $procId) -Force -ErrorAction SilentlyContinue
  }
}

Start-Sleep -Milliseconds 300

$process = Start-Process `
  -FilePath $node `
  -ArgumentList "server.js" `
  -WorkingDirectory $project `
  -RedirectStandardOutput $out `
  -RedirectStandardError $err `
  -WindowStyle Hidden `
  -PassThru

Start-Sleep -Seconds 2

if (Get-Process -Id $process.Id -ErrorAction SilentlyContinue) {
  "started pid=$($process.Id)"
} else {
  "server-exited pid=$($process.Id)"
  if (Test-Path $err) {
    Get-Content -LiteralPath $err
  }
}
