# Design Brief v3 - FoldYourProtein

Status: draft for owner review before implementation.
Scope: rebuild the app into a production-quality open-source teaching workstation with real inference paths, inspectable scientific math, and a clear contribution surface.

## 1. Product Position

FoldYourProtein is a local AlphaFold2 learning workstation, not a black-box predictor and not a decorative folding animation. It should help a technically fluent learner move between:

- a paper concept;
- an inspectable mathematical model;
- a manipulable scene;
- a real or simulated structure;
- a provenance statement explaining what the output licenses them to claim.

The rebuild keeps the existing scientific ambition but replaces the current split between "real math panels" and "synthetic game loop" with one shared trajectory contract.

## 2. Non-Negotiable Scientific Contract

1. Every displayed metric must come from an inspectable function or from a real inference artifact.
2. Teaching trajectories must never be labeled or styled as AF2 predictions.
3. Real AF2-family output, cached output, architecture-smoke output, and teaching simulations must carry explicit provenance through backend, API, UI, and reports.
4. pLDDT must be framed as predicted local reliability, not folding probability, free energy, or correctness.
5. Recycling must be framed as representational refinement, not physical folding time.

## 3. Learning Promise

The app succeeds when a learner can explain five AlphaFold2 ideas by testing them:

- Coevolution: correlation is not contact; precision helps separate direct from indirect coupling.
- Triangle updates: pairwise residue relationships must become globally consistent.
- IPA: geometry should be invariant to global rotation and translation.
- FAPE and chirality: matching distances is insufficient when handedness is wrong.
- Recycling: iterative refinement seeks a stable representation, not a movie of molecular kinetics.

Each concept should start from a Socratic question, expose one manipulated invariant, and end with an earned interpretation card tied to the paper.

## 4. UX Direction

The interface should feel like a compact research instrument: dense, legible, calm, and exact.

- Default screen is the working app, not a landing page.
- Learn mode and Fold mode must be visually and functionally distinct.
- Learn mode prioritizes concept scene, mission rail, and interpretation.
- Fold mode prioritizes target selection, molecular viewer, inference console, logs, and provenance.
- Selections should travel across structure, contact map, plots, and concept overlays.
- "Break it" controls are required: each lesson needs a perturbation that makes the relevant observable fail.

Visual language follows the existing `DESIGN.md`: dark neutral surfaces, restrained signal colors, 8px radius, visible focus states, no decorative spectacle. Motion only encodes state.

## 5. Design-System Workflow

Use the TypeUI-style design-system approach as a discipline: keep UI decisions as reviewable markdown and component rules before implementation. Relevant TypeUI guidance emphasizes MCP-backed design systems, reviewing markdown source files such as `SKILL.md`, colors, typography, layout, and buttons, then iterating with targeted variations.

Use the Stitch-style workflow for ideation discipline: generate or compare interface variants from intent, critique them against the scientific contract, then implement only the variant that improves clarity. Since the public Stitch page did not expose machine-readable content in this environment, treat Stitch as a design-review workflow rather than an assumed runtime dependency unless a connector is installed later.

Concrete artifacts to maintain:

- `DESIGN.md`: stable tokens and component rules.
- `DESIGN_BRIEF_V3.md`: product and pedagogy contract.
- Future `docs/ui-decisions.md`: accepted/rejected layout decisions with rationale.

## 6. Technical Architecture

The central interface contract is `FoldTrajectory`:

- `provenance`: typed honesty object.
- `sequence`: input sequence.
- `frames`: ordered `FoldFrame` objects.
- `meta`: engine, version, runtime, cache key, command where applicable.

Every `FoldFrame` contains structure data when available plus computed observables:

- covariance/contact signal;
- triangle violation;
- IPA invariant residual;
- FAPE;
- chirality status;
- constraint/clash count;
- transparent confidence score.

Frontend teaching trajectories and backend real inference responses must both speak this shape. The UI renders trajectories; it does not invent scientific numbers.

## 7. Implementation Slices

### Slice 0: Baseline and Contract

- Confirm current tests/build status.
- Add verify scripts.
- Add JSDoc trajectory/provenance contract.
- No UI behavior change.

### Slice 1: Math-Driven Teaching Trajectory

- Add `foldingGameMath.js`.
- Re-export current `conceptMath`.
- Implement teaching trajectory from pure math.
- Delete `buildFoldingFrames`.
- Add property tests for monotonicity, invariance, direct-vs-indirect coupling, chirality, and clashes.

### Slice 2: Reactive Missions

- Add mission objective evaluators.
- Unlock interpretation cards only from computed success.
- Add "break it" controls and tests.

### Slice 3: Real Molecular Viewer

- Add lazy-loaded Mol* viewer for Fold mode.
- Keep lightweight custom diagrams for Learn mode.
- Link residue selection across viewer and concept surfaces.

### Slice 4: Real Inference Hardening

- Add backend provenance factory.
- Add trajectory-aware adapter results.
- Add VRAM preflight guardrails.
- Add job cancellation, logs, persisted job records, timeout, and report endpoint.
- Test LocalColabFold with a stub binary so the real path is validated without requiring GPU execution.

### Slice 5: Open-Source Polish

- Update architecture docs.
- Add contribution guide for new concepts, engines, examples, and missions.
- Add issue templates or checklists for scientific honesty and tests.

## 8. First Step I Will Implement After Approval

Start with Slice 0 and the smallest part of Slice 1:

1. Run the baseline verification commands.
2. Add `frontend/src/lib/foldTypes.js` with JSDoc typedefs only.
3. Add `scripts/verify.ps1` and `scripts/verify.sh`.
4. Add `frontend/src/lib/foldingGameMath.js` as a thin re-export first.
5. Add a failing test that asserts a teaching trajectory has the shared shape and computed observables.

Then implement only enough math-driven trajectory code to make that test pass. This keeps the rebuild reviewable and prevents a large unverified rewrite.

## 9. Review Questions

Before implementation, decide:

1. Should the first shipped milestone stop at math-driven teaching mode, or include Mol* immediately?
2. Should Learn mode default to paper-faithful order or necessity-first order?
3. Should the real-inference path prioritize LocalColabFold, minAlphaFold2, or the existing educational simulator contract first?
