param(
  [string]$Sequence = "NLYIQWLKDGGPSSGRPPPS",
  [string]$Output = "work\localcolabfold_real_trpcage.json",
  [string]$ColabFoldBin = "",
  [string]$DataDir = "",
  [string]$ModelType = "alphafold2_ptm",
  [string]$MsaMode = "single_sequence",
  [int]$NumModels = 1,
  [int]$NumRecycle = 1,
  [int]$TimeoutSeconds = 7200,
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

$code = @'
import json
import os
import time
from pathlib import Path

from backend.adapters import predict_with_engine

sequence = os.environ["AF_COMPANION_SMOKE_SEQUENCE"]
output = Path(os.environ["AF_COMPANION_SMOKE_OUTPUT"])
logs = []
started = time.time()
result = predict_with_engine(sequence, "localcolabfold", log_callback=logs.append)
elapsed = round(time.time() - started, 2)
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps({"logs": logs, "result": result, "elapsed_seconds": elapsed}, indent=2), encoding="utf-8")

plddt = result.get("plddt", [])
summary = {
    "artifact": str(output),
    "sequence": sequence,
    "engine": result.get("engine"),
    "provenance_kind": result.get("provenance", {}).get("kind"),
    "frames": len(result.get("frames", [])),
    "plddt_count": len(plddt),
    "mean_plddt": round(sum(plddt) / len(plddt), 2) if plddt else None,
    "min_plddt": round(min(plddt), 2) if plddt else None,
    "max_plddt": round(max(plddt), 2) if plddt else None,
    "pdb_lines": len((result.get("pdb") or "").splitlines()),
    "elapsed_seconds": elapsed,
    "run_dir": result.get("meta", {}).get("run_dir"),
}
print(json.dumps(summary, indent=2))
'@

$env:AF_COMPANION_SMOKE_SEQUENCE = $Sequence
$env:AF_COMPANION_SMOKE_OUTPUT = $Output
$code | python -
