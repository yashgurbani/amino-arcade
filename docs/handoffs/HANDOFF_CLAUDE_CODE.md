# Claude Code Handoff: AlphaFold 3D Companion / FoldYourProtein

## Current Goal

Build this into a serious pedagogical AlphaFold2 companion: an interactive game/workbench where users can watch a fold improve step by step, connect each step to paper concepts, and run real local inference when the hardware/software stack is configured. The app must be scientifically honest: educational simulations are useful for intuition, but they must not be presented as AlphaFold predictions.

## Product Direction

The app is a dense scientific workstation, not a landing page. The user is studying the Jumper et al. AlphaFold2 paper and wants to explain concepts like coevolution, triangle updates, invariant point attention, FAPE/chirality, and recycling through manipulable visualizations.

Design principles already documented:

- `PRODUCT.md`: product register, scientific honesty, linked representations, open-source extension.
- `DESIGN.md`: dark instrument-like UI, semantic confidence colors, 8px component radius, constrained motion.

Gemini headless UI/UX advice was consulted. The main recommendation was to shift from a crowded static 3-column dashboard toward a mode-based workbench and make data provenance unmistakable with badges like `REAL: LocalColabFold`, `REAL: minAF2 smoke`, and `SIMULATED: teaching`. The `taste-skill` GitHub skill was installed from `Leonxlnx/taste-skill`, but its own scope says it is not for dashboards/dense product UI, so use it only as a taste filter. `impeccable` product-register guidance is the stronger fit.

## Current Running Shape

Frontend:

- Vite/React app in `frontend/`.
- Main user-facing game/workbench component: `frontend/src/components/ResultsCompanion.jsx`.
- Styling for the workbench: `frontend/src/App.css`.
- Main tab defaults to the results/game surface in `frontend/src/App.jsx`.
- Current verified local frontend was `http://127.0.0.1:5179/` with backend `http://127.0.0.1:8003`.

Backend:

- FastAPI app in `backend/app.py`.
- Adapter layer in `backend/adapters.py`.
- Job queue/cache in `backend/job_queue.py`.
- Cached examples in `backend/example_store.py` and `prediction-cache/`.

Verification status:

- `cd frontend && npm test` passes.
- `cd frontend && npm run lint` passes.
- `cd frontend && npm run build` passes. Vite reports a chunk-size warning only.
- Browser smoke via Chrome CDP passed on `5179`: fold score changed from `37` to `61` after pressing `Watch fold`; mission progress, parameter dashboard, timeline, and provenance panel rendered; no console errors.

## Latest Implemented UI/Game Changes

`ResultsCompanion.jsx` now has a reactive folding game loop:

- `buildFoldingFrames(sequence, missionId)` produces 9 educational optimization frames.
- Each frame exposes:
  - `confidence`
  - `covariance`
  - `triangleConsistency`
  - `frameAlignment`
  - `fape`
  - `chirality`
  - `violations`
  - synthetic per-residue `plddt`
- Users can:
  - switch `Learn` / `Fold` mode;
  - pick missions;
  - watch/pause folding;
  - step forward;
  - reset;
  - change playback speed;
  - run/queue/compare inference engines.
- The fold score, pLDDT bars, molecular projection coloring, mission progress bars, parameter meters, and recycling timeline all update as the frame advances.
- The viewer rotation is slightly affected by the active frame so the scene feels alive during the fold.
- Provenance is shown near both the arena and inference console.

Important distinction: the folding animation is an educational optimizer, not streamed AlphaFold internals. Keep this distinction visible.

## Real Inference Status

Implemented adapters:

- `educational-simulator`: deterministic educational backend, useful for demos and tests.
- `minalphafold2`: real executable minAlphaFold2 architecture smoke path. It can run locally through the cloned repo and venv, but it is not arbitrary production sequence-to-structure inference. UI and warnings must keep saying this.
- `localcolabfold`: adapter exists and calls `colabfold_batch` when configured. It is the intended true AF2-family inference route.
- `esmfold`: optional fallback path guarded by availability.

Known local status:

- `models/minAlphaFold2` exists under ignored `models/`.
- minAlphaFold2 smoke path succeeded previously with `MINALPHAFOLD2_DIR` and its local venv Python.
- LocalColabFold is not currently runnable because `colabfold_batch` is not on PATH and WSL is broken:
  - WSL reported failure attaching `D:\RelocatedAppData\WSL\Ubuntu-24.04\ext4.vhdx`.
  - Fixing WSL or providing a Windows-accessible `LOCALCOLABFOLD_BIN` is required before true LocalColabFold runs.

Backend API surface:

- `GET /api/examples`
- `GET /api/backend/capabilities`
- `GET /api/predict/status`
- `POST /api/predict`
- `POST /api/predict/jobs`
- `GET /api/predict/jobs/{id}`
- `POST /api/compare`

Prediction responses should include engine, sequence, pdb, plddt, optional pae/trajectory, warnings, and runtime.

## Scientific Accuracy Boundaries

Do not claim the current game optimizer reproduces AlphaFold2 internals. It is a pedagogical projection of concepts.

Current educational frame parameters are proxies:

- MSA covariance: stands in for residue coevolution evidence.
- Triangle consistency: stands in for pair-representation geometric repair.
- IPA frame alignment: stands in for SE(3)-aware local frame attention.
- FAPE proxy: stands in for local-frame structure loss.
- Chirality satisfied: stands in for mirror-image rejection.
- Violations: stands in for distance/geometry constraint violations.
- Confidence: stands in for pLDDT-like model confidence.

The next scientific upgrade should replace these proxy curves with math modules and fixtures that are closer to the paper:

- MSA/contact module: generate small synthetic MSAs, compute covariance, show direct vs indirect coupling, link contact cells to residue highlights.
- Triangle module: maintain a pair-distance matrix and explicitly update inconsistent triplets.
- IPA module: represent residue local frames, query/key/value points, distance-biased attention, and global transform invariance.
- FAPE module: compute local-frame error against a target, include reflected structures to show chirality failure.
- Recycling module: store actual per-cycle predicted structures for cached examples or LocalColabFold outputs when available.

## Recommended Next Implementation Steps

1. Replace `buildFoldingFrames` with pure concept-math modules:
   - Put them under `frontend/src/lib/foldingGameMath.js`.
   - Add tests beside `conceptMath.test.mjs`.
   - Keep the same frame output shape so UI remains stable.

2. Upgrade the visual scene:
   - Add explicit overlays for contact pairs, triangle triplets, local residue frames, and FAPE ghost/reflection.
   - Current `Mini3D.jsx` projection can carry this, but for serious molecular viewing migrate the result viewer to Mol* while keeping custom Three/R3F overlays for concept diagrams.

3. Connect game frames to real outputs:
   - If a prediction response includes `trajectory`, use it instead of synthetic frames.
   - For LocalColabFold cached outputs, parse per-recycle intermediate models when available and expose them through `/api/predict`.
   - Keep fallback synthetic frames only when the selected engine cannot expose trajectory internals.

4. Make missions reactive to actual user performance:
   - Define mission objectives like “raise triangle consistency above 80%” or “reduce FAPE below 0.35”.
   - Unlock interpretation cards when the frame crosses thresholds.
   - Let user toggle technical parameters and show what breaks.

5. Harden real inference:
   - Fix WSL/LocalColabFold setup or point `LOCALCOLABFOLD_BIN` at a working executable.
   - Add VRAM guardrails for RTX 5060 8GB: max sequence length, recycle count, model count, templates off by default, clear OOM errors.
   - Add job cancellation, logs, timeout, and result artifact metadata.

6. Add a true provenance/result report:
   - Every result should show engine, version, command/config, runtime, cache key, input sequence, warnings, and artifact paths.
   - UI should distinguish cached LocalColabFold outputs, live LocalColabFold runs, minAlphaFold2 architecture smoke, ESMFold fallback, and educational simulation.

## UI Notes For Next Pass

- Keep the UI restrained and instrument-like. Do not add decorative glass, gradient text, or marketing hero patterns.
- Semantic pLDDT colors are reserved for biological confidence, not generic buttons.
- Continue using explicit labels and numeric values so color is not the only encoding.
- The current three-pane layout is still dense. Gemini recommended evolving toward a stronger mode switch:
  - Learn mode: mission rail + visual concept scene + contextual explanation.
  - Fold mode: target list + structure arena + inference console/logs.
- Current mode switch exists but does not yet radically change layout. A future pass can make it more decisive.

## Files Changed In Latest Pass

- `frontend/src/components/ResultsCompanion.jsx`
  - Added folding frames, mission progress, parameter dashboard, playback controls, provenance panel, and reactive score updates.
- `frontend/src/App.css`
  - Added styling for mode switch, mission progress, fold controls, parameter meters, timeline steps, arena status, and provenance panel.
- `HANDOFF_CLAUDE_CODE.md`
  - This handoff.

## Exact Verification Commands

Run from `D:\Projects\alphafold\3d-companion` unless noted:

```powershell
cd frontend
npm test
npm run lint
npm run build
```

Optional backend smoke:

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
python -m unittest backend.test_backend
```

Optional browser smoke if Chrome remote debugging is available on `9225`:

- Load `http://127.0.0.1:5179/`.
- Confirm `FoldYourProtein` is visible.
- Press `Watch fold`.
- Confirm fold score changes, timeline advances, and no console errors appear.

## Open Risks

- The educational optimizer is still synthetic and should be treated as scaffolding for real concept math.
- LocalColabFold true inference is implemented but blocked by host setup.
- minAlphaFold2 path is useful for proving executable model integration, not for arbitrary folding claims.
- The app still needs deeper tests for React controls and browser rendering.
- Vite build warns that the JS chunk exceeds 500 kB; future code splitting is recommended once Mol* or more 3D code is added.
