# Comprehensive Technical Handoff Document

**Target Audience:** Codex (or other future AI agents)  
**Project:** AlphaFold 3D Companion  
**Location:** `d:/Projects/alphafold/3d-companion/`

## Project Context
The **AlphaFold 3D Companion** is an educational, interactive web application designed to visually explain the mathematical and architectural pillars of the original AlphaFold paper (Jumper et al., 2021). The goal is to provide a 3D simulation engine that runs on a hardware setup limited to **8GB VRAM (RTX 5060)** and **32GB RAM**.

---

## What Was Built (Incomplete Phase 1)

The multi-agent system encountered fatal `RESOURCE_EXHAUSTED` (429) API rate limits and terminated before Phase 1 could be fully completed. The repository currently contains a **partially built foundation**:

### 1. The Frontend (`/frontend`)
- **Status:** Scaffolded but lacking the requested "impeccable premium design".
- **What Exists:** React, Vite, and Tailwind CSS. The 5 raw JSX visualizations were ported into `App.jsx` as interactive tabs. A 6th "Live Prediction" tab was manually added using a basic CDN script for `3Dmol.js`.
- **Incomplete:** The design is functional but basic. It lacks the highly polished, visually stunning aesthetics requested. Comprehensive visual examples to aid understanding of the simulation results are missing.

### 2. The ML Backend Service (`/backend`)
- **Status:** Uses a mock engine, missing the actual ML implementation.
- **What Exists:** FastAPI endpoint (`/api/predict`) that accepts sequences and returns PDB/pLDDT data. However, `prediction_engine.py` is currently just a heuristic mock that generates plausible shapes using secondary structure propensities.
- **Incomplete:** The original prompt required finding and integrating a *real* GitHub implementation of AlphaFold capable of running on an 8GB VRAM RTX 5060 (e.g., Minifold or LocalColabFold). This was never implemented.

### 3. E2E Testing Infrastructure (`/e2e_tests`)
- **Status:** 40 opaque-box tests exist in `test_suite.py` testing the API constraints, but they currently validate against the mock server, not a real ML model.

---

## What Codex Needs To Do (Phase 2 & Finishing Phase 1)

Codex must take over this partially built repository and fully satisfy the original user prompt. 

### 1. Implement a Real ML Backend (8GB VRAM Constraint)
- **Task:** Find a lightweight AlphaFold implementation on GitHub (e.g., LocalColabFold, MiniFold, or FastFold) that can legitimately run on an 8GB VRAM RTX 5060 GPU and 32GB RAM.
- **Task:** Create an automated setup script to install the model and download its weights.
- **Task:** Replace the mock logic in `backend/prediction_engine.py` with actual ML inference code calling the local model.
- **Task:** Ensure memory management is heavily optimized to prevent Out-Of-Memory (OOM) crashes during predictions.

### 2. Overhaul to an "Impeccable" Frontend Design
- **Task:** Completely redesign the frontend UI (`App.jsx` and styling) using a premium, modern aesthetic (e.g., glassmorphism, rich dark mode, curated vibrant colors, and dynamic micro-animations).
- **Task:** Elevate the presentation of the 6 tabs so they feel like a state-of-the-art interactive companion guide rather than a basic dashboard.

### 3. Advanced 3D Viewer & Comprehensive Examples
- **Task:** Upgrade the basic `3Dmol.js` integration. Add advanced UI controls to toggle surface rendering, backbone trace, and specifically color the structure by pLDDT confidence scores.
- **Task:** Provide pre-loaded comprehensive simulation examples (e.g., hard targets vs easy targets) to better aid the user's understanding of the paper's mechanics, as requested in the original prompt.
- **Task:** Add interpretations and visual approaches to help the user understand the results of the predictions.

---

## Instructions for Codex
1. Examine `d:/Projects/alphafold/3d-companion/frontend/src/App.jsx` to see the current basic UI state.
2. Examine `d:/Projects/alphafold/3d-companion/backend/prediction_engine.py` to see the mock logic that MUST be replaced with a real 8GB-VRAM-compatible ML model.
3. Start frontend servers with `npm run dev` and backend servers with `python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000`.
4. Work aggressively to implement the real ML backend and the premium frontend redesign. Maintain high coding standards and ensure zero linting/build errors.
