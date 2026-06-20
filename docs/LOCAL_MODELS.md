# Local Model Adapters

## Setup Tiers

1. **Visualization-only**: run the frontend and use cached examples plus the educational simulator.
2. **Cached examples**: use `/api/examples` to replay deterministic PDB/confidence artifacts without GPU work.
3. **LocalColabFold**: configure `LOCALCOLABFOLD_BIN` or ensure `colabfold_batch` is on `PATH`.
4. **minAlphaFold2**: configure `MINALPHAFOLD2_DIR` for a cloned checkout. This is a real architecture/overfit smoke path, not pretrained arbitrary sequence inference.

## RTX 5060 8GB Guardrails

- The WSL-GPU path has completed cached arcade targets through the 768-residue collagen-like chain with four recycles. A 1023-residue collagen-like attempt failed with LocalColabFold exit code 139, so the default cap stays below that failure point.
- Disable templates unless needed.
- Use conservative recycle counts for interactive runs: one model, four recycles for richer once-cached arcade outputs; lower recycles for quick interactive debugging.
- Cache every successful output and replay it through the results companion.
- Never run unattended model commands directly from the request handler; use a queue with cancellation, timeouts, and log capture.

## Adapter Contract

Adapters must return the same shape as `/api/predict`:

```json
{
  "status": "success",
  "engine": "localcolabfold",
  "sequence": "ACDE...",
  "pdb": "HEADER...",
  "plddt": [90.1],
  "frames": [
    {
      "label": "rank_001",
      "pdb": "HEADER...",
      "plddt": [90.1],
      "observables": {
        "confidence": 90.1
      }
    }
  ],
  "meta": {
    "runtime_seconds": 42.0,
    "cached": false,
    "run_dir": "prediction-cache/..."
  },
  "provenance": {
    "kind": "real-af2",
    "label": "REAL: LocalColabFold",
    "engine": "LocalColabFold",
    "claims": [],
    "disclaimers": []
  }
}
```

## Queue Contract

Real model adapters should execute through the queue instead of a direct request handler:

```json
{
  "id": "uuid",
  "status": "queued | running | succeeded | failed | cancelled",
  "engine": "localcolabfold",
  "sequence": "ACDE...",
  "cache_key": "sha-prefix",
  "result": null,
  "error": null,
  "logs": []
}
```

The backend executes LocalColabFold when `LOCALCOLABFOLD_BIN` is available or `colabfold_batch` is found on `PATH`. It executes minAlphaFold2's `scripts/overfit_single_pdb.py` when `MINALPHAFOLD2_DIR` is configured. Successful results are cached and persisted; `/api/predict/jobs/{id}/result` and `/api/predict/jobs/{id}/report` hydrate full artifacts from that cache.

## Environment Variables

- `LOCALCOLABFOLD_BIN`: path to `colabfold_batch`.
- `LOCALCOLABFOLD_NUM_RECYCLE`: default `4` for richer saved recycle trajectories; lower it for faster interactive runs.
- `LOCALCOLABFOLD_NUM_MODELS`: default `1`.
- `LOCALCOLABFOLD_MODEL_TYPE`: default `auto`.
- `LOCALCOLABFOLD_MSA_MODE`: optional ColabFold MSA mode such as `single_sequence`.
- `LOCALCOLABFOLD_DATA_DIR`: optional path to downloaded AlphaFold parameter data.
- `LOCALCOLABFOLD_OVERWRITE`: default `1`, passes `--overwrite-existing-results`.
- `LOCALCOLABFOLD_SAVE_RECYCLES`: default `1`, passes `--save-recycles` so each recycle writes a Mol*-loadable `.rN.pdb` frame.
- `MINALPHAFOLD2_DIR`: path to a cloned `minAlphaFold2` checkout.
- `MINALPHAFOLD2_PYTHON`: Python executable for that checkout.
- `MINALPHAFOLD2_TEST_PDB`: optional PDB path for the overfit smoke run.
- `MINALPHAFOLD2_STEPS`: default `25`.
- `AF_COMPANION_REAL_TIMEOUT_SECONDS`: default `1800`.
- `AF_COMPANION_MAX_SEQUENCE`: default `768`; direct WSL-GPU success currently covers cached arcade targets through the 768-residue collagen-like chain with four recycles. Targets above that are experimental and need a fresh benchmark before use.
- `AF_COMPANION_VRAM_BUDGET_MIB`: default `7000`.

## Cancellation

Queued LocalColabFold jobs are cooperative at the API layer and forceful at the subprocess boundary. `POST /api/predict/jobs/{id}/cancel` sets the job cancel flag; the adapter polls that flag, terminates the running process, kills it if it does not exit promptly, and appends the termination event to job logs.

## Reproducible LocalColabFold Smoke

Full arcade target ladder:

```powershell
.\scripts\Run-WslGpuScalingLadder.ps1 -ContinueOnFailure
```

This writes `work/wslgpu-scaling/summary.json`, `work/wslgpu-scaling/summary.md`, per-target result JSON, stdout logs, and GPU CSV samples.



Preferred WSL2 GPU path:

```powershell
wsl bash -lc "cd ~ && bash /mnt/d/Projects/alphafold/3d-companion/work/install_colabbatch_linux.sh"
.\scripts\Run-LocalColabFoldSmoke.ps1 -UseWslGpu
.\scripts\Start-Backend-LocalColabFold.ps1 -UseWslGpu -Port 8011
```

The WSL GPU wrapper is `scripts/colabfold_batch_wsl.cmd`. It converts Windows paths to `/mnt/<drive>/...`, activates `~/localcolabfold/colabfold-conda`, and runs `colabfold_batch` with conservative XLA memory settings. Verified environment:

- WSL2 Ubuntu 24.04
- RTX 5060 Laptop GPU, 8151 MiB
- JAX `CudaDevice(id=0)`, backend `gpu`
- LocalColabFold 1.6.1

Windows CPU fallback:

```powershell
.\scripts\Setup-RealInference.ps1 -InstallLocalColabFoldWindowsCpu -DownloadAlphaFold2Params
.\scripts\Run-LocalColabFoldSmoke.ps1
```

The smoke uses a 20-residue Trp-cage sequence, one AlphaFold2-ptm model, one or more recycles, `single_sequence` MSA mode, and recycle-frame saving when `LOCALCOLABFOLD_SAVE_RECYCLES` is enabled. It writes:

- `work/localcolabfold_real_trpcage.json`
- `work/localcolabfold_real_trpcage_summary.md`
- `work/localcolabfold_real_trpcage_plddt.csv`
- `work/localcolabfold_wsl_gpu_trpcage.json`
- `work/localcolabfold_wsl_gpu_trpcage_summary.md`
- `work/localcolabfold_wsl_gpu_trpcage_plddt.csv`
- `prediction-cache/runs/localcolabfold/NLYIQWLKDGGPSSGRPPPS/out/query_unrelaxed_rank_001_alphafold2_ptm_model_1_seed_000.rN.pdb` recycle frames when `--save-recycles` is enabled
- `prediction-cache/runs/localcolabfold/NLYIQWLKDGGPSSGRPPPS/out/query_unrelaxed_rank_001_alphafold2_ptm_model_1_seed_000.pdb` final ranked model
- ColabFold score, PAE, pLDDT, coverage, config, citation, and log artifacts in the same run directory.

## Scientific Honesty

Only LocalColabFold or another validated AF2-family adapter should be described as real AlphaFold-family sequence inference. minAlphaFold2 should be described as a real paper-faithful architecture smoke path unless a trained checkpoint/inference harness is added. The educational simulator is for geometry, API, and visualization pedagogy only.
