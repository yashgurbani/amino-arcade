# Implementation Status V4

## Completed in Current Rewrite

- Stitch assets downloaded to `.stitch/source`.
- Design brief created in `DESIGN_BRIEF_V4.md`.
- `buildFoldingFrames` removed from live source.
- Frontend trajectory math moved to `frontend/src/lib/foldingGameMath.js`.
- Teaching observables are computed from inspectable math modules.
- Learn mode has necessity-first missions and break-it controls.
- Fold mode uses a shared frame/trajectory shape for teaching and backend results.
- Mol* is installed and attempted lazily in the structure viewer, with CA trace fallback.
- Backend prediction responses return `provenance`, `frames`, `meta`, `pdb`, and `plddt`.
- LocalColabFold adapter uses `LOCALCOLABFOLD_BIN`, conservative defaults, optional `LOCALCOLABFOLD_DATA_DIR`/`LOCALCOLABFOLD_MSA_MODE`/`LOCALCOLABFOLD_MODEL_TYPE` flags, VRAM guardrails, and PDB artifact parsing.
- LocalColabFold CPU smoke environment installed under `.venv-colabfold`; AlphaFold2-ptm parameters downloaded under `models/colabfold-data`.
- LocalColabFold WSL GPU environment installed under `~/localcolabfold`; WSL JAX reports `CudaDevice(id=0)` on RTX 5060 Laptop GPU.
- Real LocalColabFold run completed for Trp-cage sequence `NLYIQWLKDGGPSSGRPPPS` with provenance `real-af2`, 20 residue pLDDT values, PDB, score JSON, and PAE artifacts.
- WSL GPU wrapper added at `scripts/colabfold_batch_wsl.cmd`/`.py`; backend scripts support `-UseWslGpu`.
- Job queue has cached results, logs, cancellation state, persisted job summaries, report endpoint, and full result endpoint.
- UI fetches completed job results via `/api/predict/jobs/{id}/result` instead of rerunning the engine.
- Right inspector renders provenance, logs, confidence summary, and report metadata.
- Backend reloads persisted job summaries on startup and hydrates full results/reports from the prediction cache.
- Archive/Reports UI loads persisted backend jobs, refreshes them, and opens stored job result/report artifacts.
- Top-bar search filters Dashboard artifacts and Archive/Reports jobs by id, engine, status, sequence, cache key, and provenance text.
- Running LocalColabFold jobs are cancellable through the job API; the backend signals the active subprocess, terminates it, and records termination logs.
- Production build splits React/vendor/Mol* bundles explicitly; Mol* remains a named lazy chunk instead of inflating the main app bundle.
- README and local-model architecture docs describe the current queue, report, cancellation, guardrail, and provenance contracts.
- Verification scripts added:
  - `scripts/verify.ps1`
  - `scripts/verify.sh`

## Verification

Latest passing command:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\verify.ps1
```

This runs:

- `npm test`
- `npm run lint`
- `npm run build`
- `python -m unittest backend.test_backend`
- `rg "buildFoldingFrames" frontend/src backend` as a removal gate

Live smoke checked against backend `http://127.0.0.1:8011`:

- Created educational simulator job.
- Retrieved full result from `/api/predict/jobs/{id}/result`.
- Retrieved report from `/api/predict/jobs/{id}/report`.
- Confirmed PDB present, provenance kind `teaching-sim`, and report frame metadata present.
- Restarted backend and confirmed `/api/predict/jobs` lists persisted jobs.
- Opened a persisted job and confirmed hydrated PDB plus report artifact metadata.
- Verified search wiring with `scripts/verify.ps1` after frontend filter implementation.
- Verified LocalColabFold cancellation with a slow executable stub; the job reaches `cancelled` and logs subprocess termination.
- Verified Vite production build after explicit Mol* chunking; no chunk warning is emitted with the configured release threshold.
- Suppressed only the known upstream Starlette test-client deprecation warning in backend tests; backend suite output is otherwise clean.
- Verified real LocalColabFold execution through the backend adapter:
  - Command: `.\\scripts\\Run-LocalColabFoldSmoke.ps1`
  - Artifact: `work/localcolabfold_real_trpcage.json`
  - Summary: `work/localcolabfold_real_trpcage_summary.md`
  - Residue confidence CSV: `work/localcolabfold_real_trpcage_plddt.csv`
  - Result: `real-af2`, one AlphaFold2-ptm model, one recycle, single-sequence MSA mode, mean pLDDT `73.93`, latest smoke-script runtime `32.71s` on CPU after parameter/cache warmup.
- Verified WSL GPU LocalColabFold execution through the same backend adapter:
  - Command path: `scripts/colabfold_batch_wsl.cmd`
  - Artifact: `work/localcolabfold_wsl_gpu_trpcage.json`
  - Script-verified artifact: `work/localcolabfold_wsl_gpu_trpcage_script.json`
  - Summary: `work/localcolabfold_wsl_gpu_trpcage_summary.md`
  - Residue confidence CSV: `work/localcolabfold_wsl_gpu_trpcage_plddt.csv`
  - ColabFold log says `Running on GPU`; WSL JAX reports backend `gpu`.
  - Result: `real-af2`, one AlphaFold2-ptm model, one recycle, single-sequence MSA mode, mean pLDDT `73.59`-`73.67`, runtime about `90`-`95s`.

## Known Remaining Work

- Browser visual verification is still incomplete because headless Chromium launch was blocked by the sandbox/approval state in the previous run. The code builds and the dev servers respond, but screenshot-level layout QA is still pending.
- Mol* is included and mounted opportunistically, but the visual integration needs browser QA and likely CSS polish once screenshot verification is available.
- Windows-native JAX still detects CPU only. Use the WSL GPU wrapper for GPU execution; keep the Windows CPU path as a fallback smoke.
