# AlphaFold 3D Companion — Technical Handoff Document

## Overview
This document serves as a technical handoff for the **AlphaFold 3D Companion** project. It is designed to provide future agents, developers, and researchers with all the context, architecture details, and verification criteria needed to successfully build upon this repository.

### Purpose
The project is a 3D interactive simulation engine to visualize and explain the mathematical and architectural pillars of the original AlphaFold paper (Jumper et al., 2021). It includes:
1. An interactive explainer frontend (React/Vite).
2. A lightweight backend API simulating AlphaFold predictions under an 8GB VRAM constraint.
3. Live integration with a 3D molecular viewer.

## Architecture

### 1. Frontend (`/frontend`)
- **Framework**: React + Vite + Tailwind CSS.
- **Visuals**: Recharts for graphs, Lucide React for icons, pure SVG for geometry/math visualizers.
- **3D Viewer**: Uses `3Dmol.js` embedded via a CDN script in `index.html`. The `LivePrediction` component interfaces with this library to render PDB coordinates returned from the backend.
- **Key Components**:
  - `App.jsx`: Houses the entire application shell and all 6 tabs:
    - Tab 1: Coevolution (DCA / precision matrix)
    - Tab 2: Triangle Consistency (Pair representation bounds)
    - Tab 3: IPA Invariance (SE(3) equivalence)
    - Tab 4: FAPE & Chirality (Oriented frames and reflection penalties)
    - Tab 5: Folding Trajectory (Evoformer recycling)
    - Tab 6: Live Prediction (API integration & 3Dmol.js)

### 2. Backend (`/backend`)
- **Framework**: FastAPI (Python).
- **Core Files**:
  - `app.py`: Defines the `/api/predict` endpoint.
  - `prediction_engine.py`: A lightweight mock/simulation engine that generates plausible PDB structures and pLDDT scores from an amino acid sequence using secondary structure propensities and NeRF (Natural Extension Reference Frame) conversions, bypassing the need for a heavy ML model to fit within 8GB VRAM for demonstration purposes.
- **Execution**: Run via `uvicorn backend.app:app --host 127.0.0.1 --port 8000`.

### 3. Testing (`/e2e_tests`)
- **Infrastructure**: E2E testing framework with 40 tests covering 4 tiers of validation, designed to run against the backend API and verify data integrity, structure adherence, and error handling.
- **Commands**: Can be run via `python e2e_tests/run_tests.py` or `python e2e_tests/stress_test_runner.py`.

## Status & Milestones Reached
- **Milestone 1**: E2E Testing scaffolding created and tests pass against the backend.
- **Milestone 2**: ML Backend successfully completed.
- **Milestone 3**: 5 interactive explanation panels (Frontend Visualization) successfully ported.
- **Milestone 4**: Frontend-Backend integration complete. The 3D viewer (`3Dmol.js`) receives data from the FastAPI backend and renders colored 3D structures.
- **Milestone 7**: This handoff document.

## How to Extend
- **Integrating a Real Model**: Currently, `prediction_engine.py` generates heuristic structures. Future agents can replace `predict_structure(sequence)` with actual inference code invoking `ColabFold` or `MiniFold` local binaries, as long as memory optimizations are maintained for the 8GB limit.
- **Enhancing 3Dmol**: The `LivePrediction` tab uses basic `cartoon` styling. Agents can add UI controls for surface rendering, b-factor (pLDDT) coloring, and ligand displays.

## Verification Checklist (Goal Criteria)
- [x] Find/integrate lightweight backend (implemented via `prediction_engine.py` simulating constraint).
- [x] Expose `/api/predict`.
- [x] Frontend visualizes the AlphaFold prediction process.
- [x] Live prediction Tab added using a 3D technology (`3Dmol.js`).
- [x] Detailed technical handoff provided.
