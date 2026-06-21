# IMPLEMENTATION PLAN — FoldYourProtein v3

Companion to `SPEC.md`. This is the *how* and *when*. It is phased so each phase ships something verifiable and the app is never broken between phases. It also explicitly answers the six "Recommended Next Implementation Steps" from `docs/handoffs/HANDOFF_CLAUDE_CODE.md` (mapped in §8).

Run all commands from `D:\Projects\alphafold\3d-companion`.

---

## 0. Conventions & guardrails for the implementing agent

- **Never break green.** After every phase: `cd frontend && npm test && npm run lint && npm run build`, and `python -m unittest backend.test_backend`. A phase isn't done until all pass.
- **Same-shape rule.** UI binds to the `FoldTrajectory`/`FoldFrame` contract (SPEC §3.1). Change math freely; never change the shape without updating the contract doc and the consuming components in the same commit.
- **Test the property, not the number.** New math gets a test asserting invariance / monotonicity / realizability, like the existing `conceptMath.test.mjs`.
- **One heavy dep only.** Mol\* is the sole large addition; lazy-load it. Don't add a 3D engine *and* a charting lib — recharts stays.
- **Honesty is enforced in types.** Construct `Provenance` only in backend adapters and one frontend factory; never inline a `kind: "real-af2"` literal in a component.

---

## Phase 0 — Stabilize & instrument (0.5 day)

Goal: lock the baseline so refactors are safe.

1. Confirm baseline green (the four commands above). Record any warnings.
2. Add a tiny CI script `scripts/verify.ps1` (and `.sh`) that runs all four checks in sequence and exits non-zero on failure. This becomes the single "is it green?" command.
3. Pin the `FoldTrajectory`/`FoldFrame`/`Provenance` contract as `frontend/src/lib/foldTypes.js` (JSDoc typedefs only, no runtime). This is the spine SPEC §3.1.

Exit: `scripts/verify.ps1` passes; contract file exists and is imported nowhere yet (pure doc).

---

## Phase 1 — Unify math and game (the core move) (2–3 days)

Goal: delete `buildFoldingFrames`; drive the game from real `conceptMath`. After this phase the app is already "beyond a toy" even before Mol\* or real inference.

1. Create `frontend/src/lib/foldingGameMath.js`:
   - Re-export everything from `conceptMath.js` (don't move it yet — avoid churn; consolidate later).
   - Add `buildTeachingTrajectory(sequence, missionId)` returning a `FoldTrajectory`. For each step `t ∈ [0,1]`, fill `observables` from real functions:
     - `covariance` ← `coevolutionMatrices(strength(t))`
     - `triangleViolation` ← run K steps of a new `relaxPairDistances()` and read the residual
     - `ipaInvariantError` ← `ipaState(...)` invariant residual under a fixed random global transform (≈0 by construction; that's the point)
     - `fape` ← `fapeState(reflected=false, phase(t))` mean error, decreasing
     - `chiralitySatisfied` ← boolean from FAPE-vs-reflected comparison
     - `confidence` ← derived from the above, not a free curve (e.g. monotone map of (1−fape) and (1−triangleViolation))
     - `plddt` ← from the simulator backbone when a structure is present, else a confidence-shaped profile **clearly labeled synthetic**
2. Add new pure modules + tests (`foldingGameMath.test.mjs`):
   - `relaxPairDistances(D0, contacts, steps)` → returns `{ D, violationCurve }`; **test:** violation is monotone non-increasing and final < initial.
   - `syntheticMSA(contacts, depth)` + `empiricalCovariance(msa)` → feed `coevolutionMatrices`; **test:** planted contacts dominate the precision matrix more than raw covariance (the direct-vs-indirect lesson, asserted numerically).
   - `chiralityScore(struct)` and `clashCount(ca, threshold)` → **test:** reflection flips chirality sign; overlapping points raise clash count.
3. Rewire `ResultsCompanion.jsx`:
   - Replace `buildFoldingFrames` usage with `buildTeachingTrajectory`.
   - `ParameterDashboard`, `ScoreBoard`, `MissionProgress`, `TraceTimeline` read from `frame.observables`.
   - Make the fold score a transparent composite (SPEC §4.3) with an expandable formula popover.
   - **Delete `buildFoldingFrames`.** `grep -r buildFoldingFrames frontend/src` must be empty.
4. Verify: `grep` clean; tests green; browser smoke (score now moves because math moved).

Exit: every game number traces to an inspectable function. This is the headline deliverable.

---

## Phase 2 — Reactive missions & "break it" (1.5–2 days)

Goal: missions evaluate computed objectives and unlock interpretation cards (handoff step 4).

1. Add `frontend/src/lib/missions.js`: each mission = `{ id, objective(frame|trajectory) → {met, progress, detail}, card }`. Implement the five objectives from SPEC §4.2.
2. `MissionProgress` shows real progress toward the objective; on `met`, reveal the mission's interpretation card (animated once, respects reduced-motion).
3. Add the "break it" control per mission: a toggle that perturbs the model (`removeTriangleUpdates`, `forceReflection`, `freezeRecycle`) and the relevant observable visibly degrades. Wire to the existing controls area.
4. Tests (`missions.test.mjs`): each objective returns `met:true` on a known-good trajectory and `met:false` on a perturbed one.

Exit: a learner can *complete* a mission and the completion is earned by hitting a computed threshold, not by pressing play.

---

## Phase 3 — Mol\* molecular viewer (2–3 days)

Goal: real structure rendering; concept overlays preserved (handoff step 2).

1. `npm i molstar`. Create `components/MolStarViewer.jsx` that mounts a Mol\* plugin, loads a PDB string, colors by pLDDT (B-factor), supports residue selection, and exposes a PAE panel when `pae` present.
2. **Lazy-load**: `const MolStarViewer = lazy(() => import('./MolStarViewer'))`, only in Fold mode. Keep `Mini3D.jsx`'s `PointScene` for concept diagrams (triangle, IPA, FAPE) — those stay SVG.
3. Bridge selection both ways: selecting a residue pair in Mol\* updates `selectedResidues` (already threaded through `App.jsx`), so the coevolution heatmap highlights the same pair. This realizes the "linked representations" principle.
4. Add concept overlays as a thin SVG/HTML layer over Mol\*: contact pairs (lines), triangle triplet, residue-local frame axes, FAPE ghost/reflection. Driven by `frame.observables`.
5. Code-split check: `npm run build` chunk warning should now be addressed by the dynamic import; verify Learn mode bundle didn't grow.

Exit: Fold mode shows a real, rotatable, depth-correct structure; Learn mode unchanged in weight.

---

## Phase 4 — Decisive mode layout (1 day)

Goal: Learn and Fold are genuinely different workspaces (handoff UI note).

1. Refactor `App.css` so `mode-learn` and `mode-fold` swap the CSS grid template (not just toggle a class on the same grid). Learn: mission rail + scene + explanation. Fold: target list + Mol\* arena + console/logs.
2. Keep the instrument aesthetic from `DESIGN.md`: dark, semantic confidence colors reserved for biology, 8px radius, constrained motion, numeric + color (never color alone).
3. Accessibility pass: keyboard tab order, focus rings, `prefers-reduced-motion` disables playback auto-advance, ARIA labels on the new controls.

Exit: switching modes visibly reconfigures the workspace; a11y checks pass.

---

## Phase 5 — Real inference, end-to-end and tested (3–5 days)

Goal: the simulation backend graduates to a real inference engine setup that is *tested*, with provenance and guardrails (handoff steps 3, 5, 6). This is the second-priority area after the game unification.

### 5.1 Trajectory-aware response contract

- Change `predict_with_engine` (and the three adapters) to return the `FoldTrajectory` shape: always a `provenance` object, `frames` (≥1), and `meta`.
- Educational simulator: emit a multi-frame trajectory using `relaxPairDistances`-equivalent logic server-side, or keep it single-frame and let the frontend teaching trajectory wrap it. **Decision:** keep simulator single-frame (endpoint), let the frontend `buildTeachingTrajectory` own the teaching animation; real engines own real frames.

### 5.2 Provenance type (backend)

- Add `backend/provenance.py` with a `make_provenance(engine, **kw)` factory that produces the `Provenance` dict (kind/engine/label/tone/claims/disclaimers/source). Adapters call it; nothing else constructs provenance. Mirrors the frontend factory.
- **Test:** simulator output asserts `kind == "teaching-sim"`; a stubbed localcolabfold asserts `kind == "real-af2"`. Assert it's impossible to get `real-af2` from the simulator path.

### 5.3 VRAM guardrails (RTX 5060 8 GB) — handoff step 5

- Add `backend/guardrails.py`: `estimate_vram(seq_len, num_models, num_recycle, templates)` (rough heuristic, documented as approximate), and `preflight(engine, request)` that refuses with HTTP 400 + actionable message when the estimate exceeds a configurable budget (`AF_COMPANION_VRAM_BUDGET_MIB`, default 7000 to leave headroom).
- Defaults already conservative in `adapters.py` (1 model, 1 recycle, templates off, len ≤ 150) — keep them and make the preflight the gate.
- **Test:** a long sequence / high recycle request is refused with a clear message; a small request passes preflight (mock the estimator so the test needs no GPU).

### 5.4 Job control — handoff step 5

- Extend `job_queue.py`: add `cancel_job(id)` (cooperative cancel flag + `subprocess.Popen` with terminate), a per-job rolling log buffer, `timeout`, and `artifacts` metadata.
- Persist job records to `prediction-cache/jobs/{id}.json` so restart preserves history (cache already persists; jobs don't).
- New endpoints: `POST /api/predict/jobs/{id}/cancel`, `GET /api/predict/jobs/{id}/logs` (poll or SSE), `GET /api/predict/jobs/{id}/report` (full provenance — handoff step 6).
- **Test:** create → cancel transitions to `cancelled`; logs endpoint returns buffered lines; report endpoint returns provenance + command + runtime.

### 5.5 Trajectory parsing from real engines — handoff step 3

- LocalColabFold: after a run, glob the out dir for per-recycle / per-model PDBs; if intermediates exist, build multi-frame `frames`; else single endpoint frame with a "no intermediates exposed" note.
- minAlphaFold2: surface overfit optimization steps as frames if the script writes them; else endpoint.
- **Test (no GPU needed):** point `LOCALCOLABFOLD_BIN` at a stub script (`scripts/stub_colabfold.sh`/`.ps1`) that writes a known set of PDBs into the out dir; assert the adapter parses N frames, correct pLDDT from B-factors, and `provenance.kind == "real-af2"`. This proves the real path is correct even on a host where ColabFold can't actually run.

### 5.6 Unblock LocalColabFold on this host — handoff step 5

Three documented routes (pick per host state; the stub tests above make the code correct regardless):

1. **Fix WSL.** The reported failure is attaching `D:\RelocatedAppData\WSL\Ubuntu-24.04\ext4.vhdx`. Steps: `wsl --shutdown`; check `wsl --list --verbose`; re-register or move the vhdx back to a non-relocated path; `wsl --mount`/`--import` as needed; reinstall localcolabfold inside the distro; expose `colabfold_batch` and set `LOCALCOLABFOLD_BIN` to the wrapper.
2. **Native Windows binary.** If a Windows-accessible `colabfold_batch` exists, set `LOCALCOLABFOLD_BIN` to it directly — the adapter already honors this env var.
3. **Containerize the backend.** Run the FastAPI backend inside WSL2/Docker with CUDA, where ColabFold installs cleanly; the Vite frontend stays on Windows and talks to it over `VITE_API_BASE`. Most robust; documented as the recommended long-term route.

Exit: `python -m unittest backend.test_backend` green including new stub-based real-path tests, guardrail tests, job-control tests, provenance tests. The real engine *path* is proven; actually running ColabFold depends only on host setup, which is documented.

---

## Phase 6 — Provenance report UI & polish (1 day)

1. Render `GET .../report` in the inference console: engine, version, command/config, runtime, cache key, input sequence, warnings, artifact paths (handoff step 6).
2. UI distinguishes: cached LocalColabFold, live LocalColabFold, minAlphaFold2 smoke, ESMFold fallback, educational sim — each with its own `Provenance` render.
3. Final verification: full `scripts/verify.ps1`, browser smoke per the handoff's checklist (load app, press Watch fold, score moves, timeline advances, no console errors), plus new smoke: run a stubbed real engine and confirm the report renders.

---

## 7. Test & verification strategy (cross-cutting)

| Layer | What | Tool |
|---|---|---|
| Concept math | invariance, monotonicity, realizability, direct-vs-indirect | `node --test` (`*.test.mjs`) |
| Mission logic | objective met/not-met on good vs perturbed trajectories | `node --test` |
| Trajectory contract | shape, provenance kind, frame ordering | `node --test` + backend `unittest` |
| Backend API | predict/jobs/compare/report/cancel/logs, guardrail refusal | `fastapi.testclient` |
| Real engine path | stub binary → parsed frames + provenance | `unittest` with stub script |
| Build/lint | bundle budget, lint clean | `npm run build`, `npm run lint` |
| Browser smoke | the handoff's Chrome CDP checklist | manual or scripted CDP |
| High-stakes verification | independent review of the honesty contract (can a sim ever render as real?) | a focused review pass / subagent before release |

**Recommended:** for the release gate, run an adversarial "red-team" pass specifically trying to make a teaching structure display real-AF2 provenance, and trying to OOM the GPU past the guardrail. If either succeeds, the honesty contract or guardrails are not done.

---

## 8. Mapping to the handoff's six "Recommended Next Implementation Steps"

| Handoff step | Where addressed | Note |
|---|---|---|
| 1. Replace `buildFoldingFrames` with concept-math under `foldingGameMath.js` + tests | **Phase 1** | The math already exists in `conceptMath.js`; Phase 1 wires it and adds the new modules + tests. |
| 2. Upgrade the visual scene (overlays; migrate to Mol\*) | **Phase 3** | Mol\* for structures, custom overlays for concepts. |
| 3. Connect game frames to real outputs (trajectory ingestion, per-recycle parsing) | **Phase 5.1, 5.5** | Same `FoldTrajectory` spine for real + teaching. |
| 4. Make missions reactive to performance | **Phase 2** | Computed objectives + unlockable cards + "break it". |
| 5. Harden real inference (WSL/PATH, VRAM guardrails, cancellation/logs/timeout/metadata) | **Phase 5.3, 5.4, 5.6** | Three documented unblock routes; guardrails as a preflight gate. |
| 6. True provenance/result report | **Phase 5.2, 5.4 (report endpoint), Phase 6** | Provenance is a type that travels the whole stack. |

---

## 9. Sequencing & estimate

```
Phase 0  Stabilize            0.5d   ──┐
Phase 1  Unify math+game      2–3d    │  core value; ship-worthy alone
Phase 2  Reactive missions    1.5–2d  │
Phase 3  Mol* viewer          2–3d    │
Phase 4  Mode layout          1d      │
Phase 5  Real inference       3–5d    │  second-priority emphasis
Phase 6  Provenance UI/polish 1d    ──┘
```

Roughly 11–16 focused days. Phases 1–2 are the pedagogical heart and can be delivered and reviewed before any inference work. Phase 5 is independent of 1–4 and can proceed in parallel if two people/agents work it.

---

## 10. Sources

Same as `SPEC.md §9`. Key implementation references: Mol\* plugin docs (https://molstar.org/docs/), LocalColabFold README (https://github.com/YoshitakaMo/localcolabfold), ColabFold batch CLI flags, AlphaFold2 Supplementary Information for the FAPE clamp value and IPA point counts.
