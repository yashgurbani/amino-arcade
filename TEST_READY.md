# Test Infrastructure Readiness (TEST_READY)

This document provides instructions for executing the E2E and stress test suites, outlines the feature coverage, lists test statistics, and provides a feature readiness checklist.

## Test Runner Instructions

### 1. Prerequisites
Ensure you have the required Python packages installed:
```bash
pip install fastapi uvicorn numpy pydantic
```

### 2. Running the E2E Test Suite
The main E2E test suite automatically spawns the mock server in the background, runs all tests, verifies health checks, and terminates the server cleanly (including all child processes on Windows).

Run command:
```bash
python e2e_tests/run_tests.py
```

### 3. Running the Stress & Boundary Test Suite
The stress test runner exercises direct API boundaries, negative limit handling, and runs sensitivity checks to ensure the E2E tests properly detect mock backend anomalies (OOM, internal errors, corrupted output).

Run command:
```bash
python e2e_tests/stress_test_runner.py
```

---

## Feature Coverage & Checklist

| Feature ID | Feature Name | Test Coverage Cases | Status |
|------------|--------------|---------------------|--------|
| **F1** | ML Backend Integration | Valid prediction, lowercase normalization, invalid character rejection (HTTP 400), empty request rejection, missing parameter validation, single residue boundary, upper VRAM limit, maximum allowed sequence boundary, whitespace/FASTA sanitization, exception recovery. | **ACTIVE** |
| **F2** | 3D Frontend Companion | Prediction trigger loading state, successful 3D model rendering, error notification banner, network timeout graceful failure, malformed PDB file handling, out of memory VRAM warning mapping. | **ACTIVE** (API endpoints & data parsing verified; UI-only tests skipped) |
| **F3** | Interactive Explanations | Coevolution visual layout file check, triangle consistency visual layout file check, IPA & FAPE visual layout file check, folding trajectory animation UI file check. | **ACTIVE** (Data layer verified; UI-only tests skipped) |
| **UI** | Frontend UI & Interactions | Scaffolding layout, canvas interactions, tab switches, debounce, viewport resize, tooltips, animation states, color synchronization, coordinates coupling, caching/recall. | **SKIPPED** (Awaiting UI scaffolding) |

---

## Test Statistics

### Main E2E Test Suite (`run_tests.py`)
- **Total Test Cases**: 40
- **Active Tests Passed**: 26
- **Skipped Tests**: 14 (Annotated with `@unittest.skip("Frontend UI not scaffolded yet")`)

### Stress & Boundary Test Suite (`stress_test_runner.py`)
- **Direct API Boundary Checks**: 14 checks (all PASSED, including HTTP 400 response checks for invalid characters and unicode/emojis).
- **Mock Anomalies Sensitivity Checks**: 4 cases (all reported **YES** / PASSED):
  - **Case A (Internal Error)**: Detected failure successfully.
  - **Case B (OOM)**: Detected failure successfully.
  - **Case C (Corrupt PDB)**: Detected failure successfully.
  - **Case D (Low VRAM)**: Detected failure successfully.

---

## Process Release Verification
The test runners use a robust process tree termination logic on Windows (`taskkill /F /T /PID <pid>`) to ensure that `uvicorn` and all sub-processes are terminated, releasing port 8000 clean for subsequent runs.
