# Amino Arcade Target Scaling Plan

_Last updated: 2026-06-19_

## Current proof point

- Backend started with `scripts/Start-Backend-LocalColabFold.ps1 -NumModels 1 -NumRecycle 2 -Port 8011`.
- Capabilities reported `localcolabfold` as available.
- Fresh Insulin B-chain job (`30 aa`, `localcolabfold`) succeeded.
- Result contained 3 Mol*-loadable recycle frames (`Recycle 0`, `Recycle 1`, `Recycle 2`), each with 30 CA coordinates and 30 pLDDT values.
- Browser smoke at `http://127.0.0.1:5190` found `.arcade-shell`, posted through the UI, showed `REAL RECYCLE PDB`, showed `MEAN pLDDT`, and captured no console errors.

## Hardware reality

- `nvidia-smi` sees an `NVIDIA GeForce RTX 5060 Laptop GPU` with `8151 MiB`.
- The current Windows LocalColabFold run reported `WARNING: no GPU detected, will be using CPU`.
- WSL-wrapper runs now show `Running on GPU` for the full arcade ladder. The Windows CPU path remains available, but target scaling should use `-UseWslGpu`.

## Decision

The WSL-GPU ladder passed for all six arcade targets, and subsequent cached runs completed the 768-residue collagen-like chain with four recycles. The app now uses an expanded default guardrail of `AF_COMPANION_MAX_SEQUENCE=768`, while preserving `NumModels=1`, `NumRecycle=4`, `MsaMode=single_sequence`, templates off, saved recycles, and the `7000 MiB` VRAM budget gate. A 1023-residue collagen-like attempt failed with LocalColabFold exit code 139, so targets above 768 residues should be treated as unproven until a fresh benchmark succeeds.

## Benchmark ladder

Run each benchmark candidate with `--num-models 1`, `--num-recycle 4`, `--msa-mode single_sequence`, templates off, and `--save-recycles`. Historical rows below used two recycles unless noted.

| Step | Target | Residues | Goal |
| --- | --- | ---: | --- |
| 1 | Insulin B-chain | 30 | Confirm end-to-end UI and frame parsing |
| 2 | Collagen-like GPP chain | 768 | Demonstrate chirality/FAPE with the largest raised-limit target proven on this workstation so far |
| 3 | Hemoglobin alpha | 141 | Validate near-limit target under current guardrail |
| 4 | Myoglobin | 154 | First controlled over-limit candidate |
| 5 | Lysozyme | 164 | Mid over-limit candidate |
| 6 | GFP | 238 | Largest arcade target; only enable after GPU path is stable |


## WSL-GPU benchmark results

Command: `powershell -ExecutionPolicy Bypass -File scripts\Run-WslGpuScalingLadder.ps1 -ContinueOnFailure`

| Target | Residues | Runtime (s) | Backend (s) | Peak GPU MiB | Frames | Mean pLDDT | GPU log | Cached |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| Insulin B-chain | 30 | 83.4 | 82.54 | 4224 | 3 | 50.24 | true | false |
| Historical collagen peptide | 30 | 73.31 | 72.48 | 4224 | 3 | 68.58 | true | false |
| Hemoglobin alpha | 141 | 89.4 | 88.75 | 4228 | 3 | 43.96 | true | false |
| Myoglobin | 154 | 86.01 | 85.12 | 4230 | 3 | 40.16 | true | false |
| Lysozyme | 164 | 75.64 | 74.77 | 4228 | 3 | 41.77 | true | false |
| GFP | 238 | 80.51 | 79.54 | 4226 | 3 | 26.55 | true | false |

Artifacts: `work/wslgpu-scaling/summary.json`, `work/wslgpu-scaling/summary.md`, per-target JSON, stdout logs, and GPU CSV samples.

Interpretation: measured peak VRAM stayed around 4.23 GiB for every current target. The old quadratic heuristic overestimated GFP at 16.9 GiB, so `backend/guardrails.py` now uses a measured WSL-GPU-oriented LocalColabFold heuristic while keeping higher model/recycle counts expensive enough to block unsafe runs.
## Raise-limit criteria

The raise-limit gate has passed for the cached arcade targets through 768 residues. Before relying on targets above that range, or before calling any higher cap production-safe, record:

- backend route used: Windows CPU or WSL GPU;
- wall-clock runtime;
- peak GPU memory from `nvidia-smi`;
- whether LocalColabFold logs say `Running on GPU`;
- number of recycle frames parsed;
- Mol* load success in the frontend;
- no out-of-memory, process kill, or thermal throttling symptoms.

## Compute optimizations to evaluate

Evaluate in this order:

1. Start backend with `-UseWslGpu`; this is the preferred route for larger arcade targets.
2. Keep `NumModels=1`, `NumRecycle=4`, `MsaMode=single_sequence`, templates off for richer once-cached arcade outputs; lower recycles only for quick debugging.
3. Keep the backend queue single-flight for real LocalColabFold jobs on 8 GB VRAM.
4. Capture peak GPU memory during jobs before changing the guardrail.
5. If GPU memory becomes constrained on future larger targets, prefer target-specific shorter variants over lowering scientific honesty or faking frames.
6. If RAM or disk becomes the bottleneck, move old `prediction-cache` runs out of the hot path instead of weakening runtime guardrails.

## UI follow-up

- Allow `FOLD THIS` for current targets under the active 768-residue guardrail; explicitly label targets above the cached 768-residue evidence range as experimental until benchmarked.
- Keep RCSB reference structures available regardless of fold eligibility.
- Show the active local limit and route (`CPU` vs `WSL GPU`) in the backend specifics panel.
- Preserve language: these are `Inference Trajectory` recycle frames, not physical folding paths.

