param(
  [int]$Port = 8011,
  [string]$HostAddress = "127.0.0.1",
  [string]$ColabFoldBin = "",
  [string]$DataDir = "",
  [string]$ModelType = "alphafold2_ptm",
  [string]$MsaMode = "single_sequence",
  [int]$NumModels = 1,
  [int]$NumRecycle = 4,
  [int]$TimeoutSeconds = 7200,
  [int]$MaxSequence = 768,
  [int]$VramBudgetMiB = 7000,
  [switch]$UseWslGpu
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

if ($UseWslGpu -and -not $ColabFoldBin) {
  $ColabFoldBin = Join-Path $root "scripts\colabfold_batch_wsl.cmd"
}
if (-not $ColabFoldBin) {
  $ColabFoldBin = Join-Path $root ".venv-colabfold\Scripts\colabfold_batch.exe"
}
if (-not $UseWslGpu -and -not $DataDir) {
  $DataDir = Join-Path $root "models\colabfold-data"
}

if (-not (Test-Path $ColabFoldBin)) {
  throw "LocalColabFold executable not found: $ColabFoldBin"
}
if (-not $UseWslGpu -and -not (Test-Path (Join-Path $DataDir "params\download_finished.txt"))) {
  throw "AlphaFold2 parameters are not ready under $DataDir. Run scripts\Setup-RealInference.ps1 -InstallLocalColabFoldWindowsCpu -DownloadAlphaFold2Params first."
}

$env:LOCALCOLABFOLD_BIN = (Resolve-Path $ColabFoldBin).Path
if ($UseWslGpu -and -not $DataDir) {
  Remove-Item Env:LOCALCOLABFOLD_DATA_DIR -ErrorAction SilentlyContinue
  $env:LOCALCOLABFOLD_DISABLE_UNIFIED_MEMORY = "1"
} else {
  $env:LOCALCOLABFOLD_DATA_DIR = (Resolve-Path $DataDir).Path
}
$env:LOCALCOLABFOLD_MODEL_TYPE = $ModelType
$env:LOCALCOLABFOLD_MSA_MODE = $MsaMode
$env:LOCALCOLABFOLD_NUM_MODELS = "$NumModels"
$env:LOCALCOLABFOLD_NUM_RECYCLE = "$NumRecycle"
$env:LOCALCOLABFOLD_OVERWRITE = "1"
$env:AF_COMPANION_REAL_TIMEOUT_SECONDS = "$TimeoutSeconds"
$env:AF_COMPANION_MAX_SEQUENCE = "$MaxSequence"
$env:AF_COMPANION_VRAM_BUDGET_MIB = "$VramBudgetMiB"

Write-Host "Starting backend with LocalColabFold enabled"
Write-Host "  URL: http://$HostAddress`:$Port"
Write-Host "  LOCALCOLABFOLD_BIN: $env:LOCALCOLABFOLD_BIN"
Write-Host "  LOCALCOLABFOLD_DATA_DIR: $env:LOCALCOLABFOLD_DATA_DIR"
Write-Host "  WSL GPU wrapper: $UseWslGpu"
Write-Host "  model=$ModelType msa=$MsaMode models=$NumModels recycle=$NumRecycle max_sequence=$MaxSequence budget_mib=$VramBudgetMiB"

python -m uvicorn backend.app:app --host $HostAddress --port $Port



