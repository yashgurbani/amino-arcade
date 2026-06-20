# AlphaFold 3D Companion Frontend

React/Vite frontend for the paper-grounded AlphaFold2 learning companion.

## Run

```powershell
npm install
npm run dev
```

The app expects the FastAPI backend at `http://127.0.0.1:8000`, but it also includes a small offline fallback so the shell remains inspectable before the backend starts.

## What It Shows

- Coevolution as inverse Potts / direct coupling.
- Triangle consistency in the pair representation.
- Invariant Point Attention with SE(3) frame controls.
- FAPE and chirality through local-frame comparison.
- Recycling as learned fixed-point refinement.
- Cached examples and the `/api/predict` backend contract.

## Dependency Note

The production target is Mol* plus React Three Fiber for the molecular and conceptual 3D layers. The current implementation uses dependency-free SVG projections because package installation was blocked by a network reset during implementation. The component boundary is isolated in `src/components/Mini3D.jsx` so Mol*/R3F can replace that renderer without changing the app shell or concept math.
