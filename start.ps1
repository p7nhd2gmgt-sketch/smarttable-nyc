$ErrorActionPreference = "Stop"

$bundledNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$pathNode = Get-Command node -ErrorAction SilentlyContinue

if ($pathNode) {
  & $pathNode.Source server.js
} elseif (Test-Path $bundledNode) {
  & $bundledNode server.js
} else {
  Write-Error "Node.js was not found. Install Node 18+ or run this in the Codex environment."
}
