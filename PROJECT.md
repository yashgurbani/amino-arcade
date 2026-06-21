# Project: AlphaFold 3D Companion

## Architecture
The application consists of a decoupled frontend-backend architecture:
1. **Python ML Backend**: A lightweight Python service (FastAPI) that loads a lightweight AlphaFold implementation (e.g., MiniFold or local ColabFold) and exposes an API endpoint (`POST /api/predict`) to predict protein structures from an amino acid sequence. It outputs coordinates in PDB format.
2. **React 3D Frontend**: A polished React web application built with Vite and Tailwind CSS. It features:
   - An interactive explanation dashboard showcasing the 5 pedagogical visualizations (coevolution, triangle consistency, IPA invariance, FAPE & chirality, folding trajectory) from the original AlphaFold paper.
   - A 3D molecular viewer (e.g., Mol* or NGL viewer) to render both default structures and newly predicted PDB structures.
   - A sequence input form to trigger predictions on the backend.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Test Infrastructure | Create E2E test cases (Tiers 1-4) and publish `TEST_READY.md`. | None | PLANNED |
| M2 | ML Backend Integration | Implement `backend/` using a lightweight AlphaFold model. Expose `/api/predict` and verify via `test_backend.py` (RTX 5060 8GB VRAM constraint). | None | PLANNED |
| M3 | Frontend Visualization | Scaffold `frontend/` React/Vite app. Port and polish the 5 interactive visualization tabs from `AlphaFold2_Visualizations.jsx`. | None | PLANNED |
| M4 | 3D Molecule Visualizer | Integrate Mol*/NGL viewer in the frontend. Connect frontend input to the backend `/api/predict` API and display predicted structures. | M2, M3 | PLANNED |
| M5 | E2E Integration & Verification | Run the full E2E test suite (Tiers 1-4) to verify frontend and backend work together seamlessly. | M1, M4 | PLANNED |
| M6 | Adversarial Hardening | Implement Tier 5 testing (adversarial coverage, extreme sequences, error handling) and refine code quality. | M5 | PLANNED |
| M7 | Technical Handoff Document | Compile a comprehensive technical handoff document summarizing the design, implementation, test cases, and configuration instructions. | M6 | PLANNED |

## Interface Contracts
### Frontend ↔ Backend API
- **Endpoint**: `POST /api/predict`
- **Request Body**:
  ```json
  {
    "sequence": "MGEELFTGVVPILVELDGDVNGHKFSVSGEGEGDATYGKLTLKFICTTGKLPVPWPTLVTTFSYGVQCFSRYPDHMKQHDFFKSAMPEGYVQERTIFFKDDGNYKTRAEVKFEGDTLVNRIELKGIDFKEDGNILGHKLEYNYNSHNVYIMADKQKNGIKVNFKIRHNIEDGSVQLADHYQQNTPIGDGPVLLPDNHYLSTQSALSKDPNEKRDHMVLLEFVTAAGITHGMDELYK"
  }
  ```
- **Response Body (Success)**:
  ```json
  {
    "status": "success",
    "sequence": "...",
    "pdb": "HEADER    PROTEIN DATA BANK...\nATOM      1  N   MET A   1...",
    "plddt": [92.4, 91.2, ...]
  }
  ```
- **Response Body (Error)**:
  ```json
  {
    "status": "error",
    "message": "Invalid amino acid sequence character 'X'."
  }
  ```

## Code Layout
- `backend/` - Python FastAPI app, ML model loading, inference logic.
  - `backend/app.py` - Main FastAPI service.
  - `backend/test_backend.py` - Programmatic verification script.
- `frontend/` - React frontend app.
  - `frontend/src/` - React components, visualizations, 3D viewer.
- `e2e_tests/` - E2E test suites (Tiers 1-4).
- `HANDOFF.md` - Technical handoff documentation for future developers.

