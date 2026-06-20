Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$frontend = Join-Path $root "frontend"

Push-Location $frontend
try {
  npm test
  npm run lint
  npm run build
}
finally {
  Pop-Location
}

Push-Location $root
try {
  python -m unittest backend.test_backend
  $matches = rg "buildFoldingFrames" frontend/src backend
  if ($LASTEXITCODE -eq 0) {
    Write-Error "buildFoldingFrames is still present. Delete stale synthetic trajectory code."
  }
  if ($LASTEXITCODE -gt 1) {
    exit $LASTEXITCODE
  }
}
finally {
  Pop-Location
}

Write-Output "Verification passed."
