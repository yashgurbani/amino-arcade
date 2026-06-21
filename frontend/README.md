# AlphaFold 3D Companion Frontend

React/Vite frontend for the paper-grounded AlphaFold2 learning companion.

## Run

```powershell
$env:VITE_API_BASE="http://127.0.0.1:8011"
npm ci
npm run dev
```

The app defaults to the FastAPI backend at `http://127.0.0.1:8011`. It also includes bundled demo-cache results so the shell remains inspectable before the backend starts.

## What It Shows

- Coevolution as inverse Potts / direct coupling.
- Triangle consistency in the pair representation.
- Invariant Point Attention with SE(3) frame controls.
- FAPE and chirality through local-frame comparison.
- Recycling as learned fixed-point refinement.
- Cached examples, provenance labels, guardrail decisions, and the `/api/predict` backend contract.

## Dependency Note

Mol* is the molecular viewer boundary in `src/components/MolPlayfield.jsx`. The concept panels use lightweight React/SVG components for tensor, MSA, contact-map, PAE, local-frame, and recycling explanations. React Three Fiber is not currently installed.
