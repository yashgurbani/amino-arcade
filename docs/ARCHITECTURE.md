# Architecture

AlphaFold 3D Companion is split into three replaceable layers:

1. **Concept engine**: pure JavaScript math and SceneSpec metadata for the educational simulations.
2. **Results engine**: backend examples, cached PDB-like outputs, confidence data, and optional inference adapters.
3. **Viewer shell**: React product UI that links controls, plots, concept scenes, and molecular structure views.

## Backend

The FastAPI backend exposes:

- `POST /api/predict` for a stable prediction contract.
- `POST /api/predict/jobs` for queued prediction with cache, logs, reports, and cancellation.
- `GET /api/predict/jobs` for persisted archive summaries.
- `GET /api/predict/jobs/{id}/result` and `/report` for hydrated cached artifacts.
- `GET /api/examples` for curated cached teaching examples.
- `GET /api/examples/{id}` for a single full example.
- `GET /api/backend/capabilities` for simulator/model availability.
- `POST /api/backend/preflight` for conservative local-inference guardrails.

The default `educational-simulator` is deterministic and local. It is not a scientific AlphaFold2 model. LocalColabFold is the real AF2-family sequence-inference adapter when `LOCALCOLABFOLD_BIN` or `colabfold_batch` is available. minAlphaFold2 is treated as a paper-faithful architecture smoke path, not arbitrary pretrained sequence inference.

## Frontend

The React app should stay modular:

- `src/data/` stores scene specs and cached UI copy.
- `src/lib/` stores pure math, API helpers, and PDB parsing.
- `src/components/` stores app shell, concept modules, controls, plots, and viewers.

Mol* is loaded lazily for PDB-backed structures. The app keeps a dependency-free CA-trace fallback for offline teaching frames, Mol* load failures, and screenshot-safe degradation.

## SceneSpec

Scene specs describe concepts, controls, equations, paper references, and interpretation. The renderer consumes specs; concept math stays in pure functions with tests.

The formal schema lives at `frontend/src/data/sceneSpec.schema.json`. Every scene must declare:

- identity and display labels;
- controls and derived values;
- camera mode and default pose;
- annotations;
- references into the Nature paper, supplement, and companion guide.

## Phase 2 Runtime Contracts

Prediction work can be handled either synchronously or through the lightweight queue:

- `POST /api/predict/jobs` creates a prediction job.
- `GET /api/predict/jobs/{id}` returns status and a result summary.
- `POST /api/predict/jobs/{id}/cancel` requests cancellation and terminates a running LocalColabFold subprocess.
- `GET /api/predict/jobs/{id}/logs` returns captured lifecycle/subprocess logs.
- `GET /api/predict/jobs/{id}/result` hydrates the full cached result.
- `GET /api/predict/jobs/{id}/report` returns provenance and artifact metadata.
- `GET /api/predict/status` returns queue counts.
- `POST /api/compare` compares engine availability/results for one sequence.

The queue runs the educational simulator, LocalColabFold, and minAlphaFold2 through a shared adapter contract and caches outputs under ignored `prediction-cache/`. Real model commands must stay behind preflight guardrails, timeouts, cancellation, and log capture.
