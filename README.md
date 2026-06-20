# AlphaFold 3D Companion

AlphaFold 3D Companion is a local, seminar-ready workstation for understanding Jumper et al. (2021) through interactive geometry simulations, cached example structures, and optional model adapters.

## Setup Tiers

1. **Visualization-only**
   - Start the frontend.
   - Use the built-in offline fallback and concept scenes.
2. **Backend simulator**
   - Start FastAPI and use `/api/examples` plus `/api/predict`.
   - Outputs are deterministic educational simulations, not real AlphaFold2 predictions.
3. **LocalColabFold**
   - Install LocalColabFold outside the repo or under ignored `models/`.
   - Set `LOCALCOLABFOLD_BIN` or put `colabfold_batch` on `PATH`.
   - Run through `POST /api/predict/jobs` for logs, cache reuse, reports, and cancellation.
4. **minAlphaFold2 architecture smoke**
   - Clone `ChrisHayduk/minAlphaFold2` and set `MINALPHAFOLD2_DIR`.
   - This runs/reads the repo's overfit test-protein artifact and proves the paper-faithful architecture path works.
   - It is not pretrained arbitrary sequence inference.

## Commands

Backend:

```powershell
python -m pip install fastapi httpx numpy pydantic pytest uvicorn
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
python -m pytest backend/test_backend.py backend/test_analysis.py -q
```

Frontend:

```powershell
cd frontend
npm ci
npm run dev
npm run build
npm test
npx eslint src tests
```

## API

- `POST /api/predict`
- `POST /api/predict/jobs`
- `GET /api/predict/jobs/{id}`
- `POST /api/predict/jobs/{id}/cancel`
- `GET /api/predict/jobs/{id}/logs`
- `GET /api/predict/jobs/{id}/result`
- `GET /api/predict/jobs/{id}/report`
- `GET /api/predict/jobs/{id}/manifest`
- `GET /api/predict/jobs/{id}/frames/{frame_index}?model_index=0`
- `GET /api/physics/status`
- `POST /api/physics/local-relaxation`
- `GET /api/examples`
- `GET /api/examples/{id}`
- `POST /api/compare`
- `GET /api/backend/capabilities`
- `POST /api/backend/preflight`

All prediction-like outputs include typed `provenance`, `frames`, `meta`, `pdb`, and `plddt` fields. Teaching simulator, LocalColabFold, and minAlphaFold2 outputs are intentionally labeled differently.

## Engine Honesty Model

This project is deliberately explicit about what each engine can and cannot prove:

- **Teaching simulator**: deterministic, local, fast, and useful for explaining confidence, PAE/contact changes, recycling, and lens behavior. It is not a biological structure predictor.
- **LocalColabFold**: optional real inference path. Jobs are labeled with MSA mode, recycle count, cache provenance, pLDDT/PAE, and saved frame manifests when the adapter produces those artifacts.
- **minAlphaFold2 smoke path**: architecture demonstration only. It validates integration with a paper-faithful repository artifact and is not arbitrary-sequence pretrained inference.

The UI surfaces this distinction through provenance panels, target metadata, confidence legends, and pedagogical lens copy. See `HANDOFF_PEDAGOGY_AND_LENSES.md` for the teaching model and lens language.

Physics mode is also separated from inference. When OpenMM is installed, `/api/physics/local-relaxation` can energy-minimize an existing predicted PDB as local relaxation. It is not AlphaFold inference, not sequence-to-structure prediction, and not a folding trajectory.

## Guardrails

- `AF_COMPANION_MAX_SEQUENCE`: default `768` residues. The WSL-GPU path has completed and cached the 768-residue collagen-like chain with four recycles; a 1023-residue attempt failed with LocalColabFold exit code 139 on this workstation.
- `AF_COMPANION_VRAM_BUDGET_MIB`: default `7000`.
- `AF_COMPANION_REAL_TIMEOUT_SECONDS`: default `1800`.
- `LOCALCOLABFOLD_NUM_MODELS`: default `1`.
- `LOCALCOLABFOLD_NUM_RECYCLE`: default `4` for richer saved recycle trajectories; lower it for faster interactive runs.

Use `/api/backend/preflight` before long LocalColabFold runs. The guardrail is a measured WSL-GPU-oriented estimate for the current arcade settings, not a live hardware probe.

## Paper Modules

- Coevolution / inverse Potts.
- Evoformer triangle consistency.
- IPA / SE(3) invariance.
- FAPE and chirality.
- Recycling as fixed-point refinement.
- Results companion with confidence and provenance.
- Paper guide with glossary, equations, source map, and per-scene references.

## Open-Source Extension Points

- Add a new `SceneSpec` in `frontend/src/data/sceneSpecs.js`.
- Validate shape against `frontend/src/data/sceneSpec.schema.json`.
- Add pure concept math in `frontend/src/lib/conceptMath.js`.
- Add cached examples in `backend/example_store.py`.
- Add real model adapters behind `backend/adapters.py`.

## License and Attribution

The companion source code is MIT licensed; see `LICENSE`.

Third-party dependencies and optional engines keep their own licenses. In particular, Mol* is MIT licensed, ColabFold/AlphaFold-derived tooling is separately licensed, and model weights or databases must not be committed to this repository. Keep downloaded weights, MSA databases, prediction caches, generated structures, and logs in ignored local directories.

See `PRODUCT.md`, `DESIGN.md`, `docs/ARCHITECTURE.md`, and `docs/LOCAL_MODELS.md` for implementation constraints.

## Real Inference Setup Helper

```powershell
.\scripts\Setup-RealInference.ps1 -CloneMinAlphaFold2
```

LocalColabFold is best installed in WSL2/Linux on Windows. Set `LOCALCOLABFOLD_BIN` to a wrapper that accepts `colabfold_batch query.fasta output_dir`.

## Verification

Run the verified WSL-GPU scaling ladder when changing target limits or LocalColabFold settings:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Run-WslGpuScalingLadder.ps1 -ContinueOnFailure
```

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify.ps1
```

This runs frontend concept tests, lint, production build, backend unit tests, and the source gate that prevents the obsolete `buildFoldingFrames` helper from returning.
