param(
  [string]$ModelsDir = "models",
  [switch]$CloneMinAlphaFold2,
  [switch]$InstallLocalColabFoldWindowsCpu,
  [switch]$DownloadAlphaFold2Params
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$modelsPath = Join-Path $root $ModelsDir
New-Item -ItemType Directory -Force -Path $modelsPath | Out-Null

Write-Host "AlphaFold 3D Companion real-inference setup"
Write-Host "Project: $root"
Write-Host "Models:  $modelsPath"

if ($CloneMinAlphaFold2) {
  $target = Join-Path $modelsPath "minAlphaFold2"
  if (Test-Path $target) {
    Write-Host "minAlphaFold2 already exists: $target"
  } else {
    git clone https://github.com/ChrisHayduk/minAlphaFold2 $target
  }
  Write-Host ""
  Write-Host "Next for minAlphaFold2:"
  Write-Host "  cd $target"
  Write-Host "  python -m venv .venv"
  Write-Host "  .\.venv\Scripts\Activate.ps1"
  Write-Host "  pip install -e .[dev]"
  Write-Host "  `$env:MINALPHAFOLD2_DIR='$target'"
  Write-Host "  `$env:MINALPHAFOLD2_PYTHON='$target\.venv\Scripts\python.exe'"
}

if ($InstallLocalColabFoldWindowsCpu) {
  $venv = Join-Path $root ".venv-colabfold"
  $cache = Join-Path $root ".uv-cache"
  $env:UV_CACHE_DIR = $cache
  if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    throw "uv is required for the Windows CPU setup. Install uv first, or install LocalColabFold in WSL2/Linux and set LOCALCOLABFOLD_BIN."
  }
  if (-not (Test-Path $venv)) {
    uv venv $venv --python 3.10
  }
  uv pip install --python (Join-Path $venv "Scripts\python.exe") "colabfold[alphafold]"
  Write-Host ""
  Write-Host "LocalColabFold Windows CPU environment:"
  Write-Host "  $venv"
  Write-Host "  LOCALCOLABFOLD_BIN='$(Join-Path $venv "Scripts\colabfold_batch.exe")'"
}

if ($DownloadAlphaFold2Params) {
  $venvPython = Join-Path $root ".venv-colabfold\Scripts\python.exe"
  if (-not (Test-Path $venvPython)) {
    throw "Expected $venvPython. Run -InstallLocalColabFoldWindowsCpu first or provide parameters manually."
  }
  $dataDir = Join-Path $modelsPath "colabfold-data"
  & $venvPython -c "from pathlib import Path; from colabfold.download import download_alphafold_params; download_alphafold_params('alphafold2_ptm', Path(r'$dataDir'))"
  Write-Host ""
  Write-Host "AlphaFold2 parameters ready:"
  Write-Host "  $dataDir"
}

Write-Host ""
Write-Host "LocalColabFold:"
Write-Host "  Recommended for GPU on Windows: install inside WSL2/Linux and use scripts\colabfold_batch_wsl.cmd."
Write-Host "  Verified WSL command:"
Write-Host "    cd ~ && bash /mnt/d/Projects/alphafold/3d-companion/work/install_colabbatch_linux.sh"
Write-Host "    .\scripts\Run-LocalColabFoldSmoke.ps1 -UseWslGpu"
Write-Host "    .\scripts\Start-Backend-LocalColabFold.ps1 -UseWslGpu -Port 8011"
Write-Host "  Reproducible CPU smoke on this host: scripts\Setup-RealInference.ps1 -InstallLocalColabFoldWindowsCpu -DownloadAlphaFold2Params"
Write-Host "  Required command contract: colabfold_batch query.fasta output_dir"
Write-Host "  Conservative defaults used by this app: --num-recycle 1 --num-models 1"
