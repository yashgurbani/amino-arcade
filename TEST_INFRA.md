# Test Infrastructure - AlphaFold 3D Companion

This document describes the End-to-End (E2E) testing infrastructure, the test suites, mock configurations, and the 40 enumerated test cases used to verify the application.

---

## 1. Features Under Test

The application has been decomposed into three core features for testing purposes:

| Feature ID | Feature Name | Description |
|---|---|---|
| **F1** | **ML Backend Integration** | Handles the structural prediction pipeline, input sequence validation (IUPAC amino acid alphabet, length restrictions), VRAM resource management (RTX 5060 8GB constraint), PDB coordinate generation, and per-residue pLDDT confidence array construction. |
| **F2** | **3D Frontend Companion** | Input form for FASTA/raw amino acid sequences, submission throttling/loading animations, Mol* 3D molecular viewer canvas rendering of coordinate data, and pLDDT-based color mapping. |
| **F3** | **Interactive Explanations** | Educational dashboard displaying pedagogical explanations and interactive visualizations for 5 core AlphaFold concepts: Coevolution, Triangle Consistency, Invariant Point Attention (IPA), FAPE & Chirality, and Folding Trajectory. |

---

## 2. Test Tiers and Case Enumeration (40 Cases)

### 2.1 Tier 1: Feature Coverage (15 Cases)
*Validates the basic, happy-path functionality of each feature in isolation.*

#### Feature F1: ML Backend Integration
* **TC-T1-F1-01: Valid Sequence Prediction**
  * *Description*: Verify that sending a standard, valid amino acid sequence returns a successful PDB prediction.
  * *Steps*: Send `POST /api/predict` with sequence `"MGEELFTGVVPILVEL"`.
  * *Expected Result*: HTTP 200 OK, JSON containing `status="success"`, the sequence, a valid coordinate-headed PDB string, and a non-empty list of pLDDT floats matching the sequence length.
* **TC-T1-F1-02: Lowercase Sequence Normalization**
  * *Description*: Verify that sequence characters in lowercase are automatically converted to uppercase by the backend.
  * *Steps*: Send `POST /api/predict` with sequence `"mgeelftgvvpilvel"`.
  * *Expected Result*: HTTP 200 OK, returned `sequence` is normalized to `"MGEELFTGVVPILVEL"`, prediction succeeds.
* **TC-T1-F1-03: Invalid Character Rejection**
  * *Description*: Verify that the backend rejects amino acid sequences containing invalid (non-IUPAC) characters.
  * *Steps*: Send `POST /api/predict` with sequence `"MGEELFTGVVPILVELX"`.
  * *Expected Result*: HTTP 200 OK, JSON contains `status="error"` and message details character `'X'`.
* **TC-T1-F1-04: Empty Request Payload Rejection**
  * *Description*: Verify that a blank sequence yields a validation error.
  * *Steps*: Send `POST /api/predict` with sequence `""`.
  * *Expected Result*: HTTP 400 Bad Request or JSON error indicating empty sequence input.
* **TC-T1-F1-05: Missing Parameter Validation**
  * *Description*: Verify that sending a request without the `sequence` key returns a bad request error.
  * *Steps*: Send `POST /api/predict` with empty body or `{"invalid_key": "MGEEL"}`.
  * *Expected Result*: HTTP 422 Unprocessable Entity or HTTP 400 Bad Request.

#### Feature F2: 3D Frontend Companion
* **TC-T1-F2-06: Frontend Scaffolding Layout**
  * *Description*: Verify that the landing page renders all key UI sections.
  * *Expected Result*: Page displays header, sequence input, "Predict Structure" button, 3D Mol* canvas container, and explanations panel.
* **TC-T1-F2-07: Prediction Trigger & Loading State**
  * *Description*: Verify that triggering a prediction shows a loading spinner and disables controls.
  * *Steps*: Submit sequence `"MOCKSUCCESS"`.
  * *Expected Result*: Predict button shows spinner/loading text, input text area becomes read-only.
* **TC-T1-F2-08: Successful 3D Model Rendering**
  * *Description*: Verify that a successful prediction is loaded and rendered in the 3D viewer.
  * *Steps*: Submit `"MOCKSUCCESS"` and wait.
  * *Expected Result*: Loading state ends, WebGL canvas renders 3D structure, and status badge indicates high confidence.
* **TC-T1-F2-09: 3D Viewer Canvas Interactions**
  * *Description*: Verify that the molecular viewer handles user rotation and zoom actions.
  * *Steps*: Simulate drag and zoom on canvas.
  * *Expected Result*: WebGL context receives pointer events and updates without crashes or console errors.
* **TC-T1-F2-10: Error Notification Banner**
  * *Description*: Verify that a validation error from the API is displayed in a user-friendly way.
  * *Steps*: Input invalid sequence, click predict.
  * *Expected Result*: Alert or error banner displays the validation message.

#### Feature F3: Interactive Explanations
* **TC-T1-F3-11: Dashboard Navigation Tabs**
  * *Description*: Verify switching between the 5 interactive visualization tabs.
  * *Steps*: Click tabs: "Coevolution", "Triangle Consistency", "IPA Invariance", "FAPE & Chirality", "Folding Trajectory".
  * *Expected Result*: Active tab updates with visual indicator, content panel loads corresponding view.
* **TC-T1-F3-12: Coevolution Visual Layout**
  * *Description*: Verify Coevolution tab renders sequence alignment matrix and contact map.
  * *Expected Result*: Contact map SVG/canvas and MSA conservation plot are visible.
* **TC-T1-F3-13: Triangle Consistency Visual Layout**
  * *Description*: Verify Triangle Consistency tab renders the residue distance update matrix.
  * *Expected Result*: Interactive 2D matrix representing residue distance updates is displayed.
* **TC-T1-F3-14: IPA & FAPE Visual Layout**
  * *Description*: Verify IPA Invariance tab displays local coordinate frames.
  * *Expected Result*: Visual schematic showing local coordinate axes is rendered.
* **TC-T1-F3-15: Folding Trajectory Animation UI**
  * *Description*: Verify Folding Trajectory tab renders animation controls.
  * *Expected Result*: Trajectory view contains Play, Pause, Step-forward/backward, and scrubber slider.

---

### 2.2 Tier 2: Boundary & Corner Cases (15 Cases)
*Tests limits of data formats, lengths, resource constraints, and error boundaries.*

#### Feature F1: ML Backend Integration
* **TC-T2-F1-16: Sequence Single Residue Boundary**
  * *Description*: Verify backend behavior for a sequence of length 1 (minimum boundary).
  * *Steps*: Send `POST /api/predict` with sequence `"M"`.
  * *Expected Result*: Succeeds and returns a single CA coordinate PDB or returns sequence length constraint error.
* **TC-T2-F1-17: Upper VRAM Limit Rejection**
  * *Description*: Verify that a sequence exceeding the maximum size limit is rejected to protect VRAM.
  * *Steps*: Send `POST /api/predict` with sequence of 151 residues when limit is 150.
  * *Expected Result*: Returns status="error" and message details GPU VRAM limit.
* **TC-T2-F1-18: Maximum Allowed Sequence Boundary**
  * *Description*: Verify that a sequence exactly at the VRAM boundary succeeds.
  * *Steps*: Send `POST /api/predict` with sequence of 150 residues.
  * *Expected Result*: HTTP 200 OK, prediction succeeds.
* **TC-T2-F1-19: Whitespace and FASTA Header Sanitization**
  * *Description*: Verify that trailing whitespace, newlines, and FASTA-style comment lines are ignored.
  * *Steps*: Send `POST /api/predict` with sequence `">seq_1\nMGEE LFTG\n"`.
  * *Expected Result*: Sanitized to `"MGEELFTG"` and returns success.
* **TC-T2-F1-20: Backend PyTorch/Inference Exception Recovery**
  * *Description*: Verify that the API fails gracefully if an unexpected runtime/CUDA exception occurs.
  * *Steps*: Send sequence `"MOCKINTERNALERROR"`.
  * *Expected Result*: HTTP 500 Internal Server Error with JSON body describing CUDA execution failure.

#### Feature F2: 3D Frontend Companion
* **TC-T2-F2-21: Large Input UI Counter Limit**
  * *Description*: Verify character counter turns red/warns when input exceeds 150 residues.
  * *Expected Result*: Warning indicator is displayed in UI when sequence length is greater than 150.
* **TC-T2-F2-22: Network Timeout Graceful Failure**
  * *Description*: Verify lagging backend response shows timeout toast and re-enables controls.
  * *Steps*: Submit sequence `"MOCKTIMEOUT"`.
  * *Expected Result*: App does not crash, shows timeout toast, re-enables submit button.
* **TC-T2-F2-23: Malformed PDB File Handling**
  * *Description*: Verify that if the backend returns corrupted PDB data, the 3D viewer doesn't crash the browser page.
  * *Steps*: Submit sequence `"MOCKCORRUPT"`.
  * *Expected Result*: Mol* viewer displays "Unable to parse structure coordinates", rest of application remains active.
* **TC-T2-F2-24: Rapid Button Click Debounce**
  * *Description*: Verify that double-clicking the predict button does not spawn duplicate API calls.
  * *Steps*: Double-click submit button rapidly.
  * *Expected Result*: Only 1 outgoing network request is made.
* **TC-T2-F2-25: Out of Memory (VRAM) Warning Mapping**
  * *Description*: Verify that VRAM limit error message maps to troubleshooting card.
  * *Steps*: Submit sequence `"MOCKVRAMERROR"`.
  * *Expected Result*: UI displays specific troubleshooting card for 8GB VRAM RTX 5060 constraints.

#### Feature F3: Interactive Explanations
* **TC-T2-F3-26: Animation State Transition on Tab Switch**
  * *Description*: Verify that switching tabs while the folding trajectory is playing automatically pauses the animation.
  * *Expected Result*: Animation state pauses to conserve background rendering cycles.
* **TC-T2-F3-27: Layout Responsiveness on Viewport Resize**
  * *Description*: Verify visual matrix charts scale correctly when window size changes.
  * *Expected Result*: Charts adapt layout to smaller widths without menu overlap.
* **TC-T2-F3-28: Triangle Consistency Matrix Tooltip Boundary**
  * *Description*: Verify tooltip functionality for extreme matrix coordinates.
  * *Steps*: Hover over cells (0, 0) and (N, N).
  * *Expected Result*: Tooltips display correct residue indices and distance values.
* **TC-T2-F3-29: FAPE Mode Toggle Boundaries**
  * *Description*: Verify toggling FAPE error coordinates highlights correct structural deviations.
  * *Expected Result*: Overlay changes between ideal and predicted structures.
* **TC-T2-F3-30: Empty Trajectory Fallback**
  * *Description*: Verify folding trajectory UI handles cases where prediction did not generate trajectory frames.
  * *Expected Result*: Scrubber slider is disabled, showing "Folding trajectory steps are only available for full relaxation models."

---

### 2.3 Tier 3: Cross-Feature Combinations (5 Cases)
*Tests integration points and state synchronization across F1, F2, and F3.*

* **TC-T3-01: Predict-to-Trajectory Interactive Pipeline**
  * *Description*: Verify that predicting a new sequence successfully populates both the 3D viewer and the folding trajectory frames.
  * *Expected Result*: 3D viewer animates through coordinates corresponding to each folding trajectory frame returned from the API.
* **TC-T3-02: Interrupt Active Prediction with Explanation View**
  * *Description*: Verify that navigating explanation tabs during active prediction does not break the UI.
  * *Steps*: Submit `"MOCKTIMEOUT"`, click "Coevolution" tab, browse, click back.
  * *Expected Result*: Request completes normally, viewer updates.
* **TC-T3-03: Coevolution-to-3D Viewer Highlight Sync**
  * *Description*: Verify that selecting a residue pair in the contact map highlights their 3D coordinates.
  * *Steps*: Click contact map cell (12, 45).
  * *Expected Result*: 3D viewer highlights Residues 12 and 45 and draws a distance line.
* **TC-T3-04: pLDDT Score Graph & 3D Color Synchronization**
  * *Description*: Verify that pLDDT values from the backend sync with charts and 3D color mapping.
  * *Expected Result*: Colors on 3D model match the confidence thresholds displayed in the confidence chart.
* **TC-T3-05: Trajectory Scrubber and 3D Coordinates Coupling**
  * *Description*: Verify that moving the trajectory slider controls the 3D coordinates of the molecular model.
  * *Expected Result*: 3D viewer updates structure backbone geometry in real time to match the selected frame.

---

### 2.4 Tier 4: Real-world Scenarios (5 Cases)
*Simulates actual production workflows, system failures, and user sessions.*

* **TC-T4-36: Sequence History Caching and Recall**
  * *Description*: Verify the user can cycle between previously predicted sequences without re-triggering API requests.
  * *Expected Result*: Loading from history uses cached PDB and does not trigger a new API predict request.
* **TC-T4-37: ML Backend Cold-Start Recovery**
  * *Description*: Verify frontend UI handles backend cold starts gracefully.
  * *Steps*: Simulate delay and inspect UI warning.
  * *Expected Result*: UI displays "Warming up ML backend weights...", remains stable, and updates on return.
* **TC-T4-38: Concurrent UI Sandbox Isolation**
  * *Description*: Verify that running predictions in multiple browser tabs simultaneously does not cause state bleeding.
  * *Expected Result*: Tab 1 and Tab 2 show isolation; Tab 2 rendering does not overwrite Tab 1's viewer.
* **TC-T4-39: Recovery after VRAM Exhaustion Fault**
  * *Description*: Verify system remains operational after encountering a GPU out-of-memory error.
  * *Steps*: Submit sequence that exceeds VRAM, then immediately submit a shorter, valid sequence.
  * *Expected Result*: The OOM error is displayed, and the subsequent prediction succeeds and renders the smaller structure.
* **TC-T4-40: High-Frequency Prediction Stress Test (WebGL Memory Leak Check)**
  * *Description*: Verify consecutively folding multiple proteins does not crash the WebGL context.
  * *Steps*: Programmatically submit 10 distinct sequences in rapid succession.
  * *Expected Result*: App does not freeze, WebGL context is preserved, all structures render.

---

## 3. Running the E2E Tests

The E2E tests are run using the custom test runner script:

```powershell
python e2e_tests/run_tests.py
```

This script will:
1. Boot the Mock Backend Server in the background.
2. Run the `test_suite.py` containing the 40 test cases.
3. Verify all tests pass.
4. Cleanly terminate the background mock server.
