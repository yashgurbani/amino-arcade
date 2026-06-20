# Design Brief V4 — AlphaFold Scientific Workstation

## Source Material

- Product spec: `SPEC.md`
- Implementation plan: `IMPLEMENTATION_PLAN.md`
- Pedagogical guide: `PEDAGOGICAL_HANDOFF.md`
- Stitch project: AlphaFold Scientific Workstation (`12199674373347158803`)
- Local Stitch assets:
  - `.stitch/source/01-fold-dashboard-archive.png`
  - `.stitch/source/02-workbench-fold-mode.png`
  - `.stitch/source/03-concepts-learn-mode.png`
  - matching HTML exports in the same directory

## Product Position

This is a local-first scientific workstation for learning the five geometric ideas behind AlphaFold2 while running honest, provenance-carrying inference when LocalColabFold is configured. It is not a marketing site, not a cinematic protein toy, and not a cloud inference product.

The core design rule is necessity-first: every visible metric must be backed by inspectable math or by a real inference artifact, and every teaching scene must show what fails when a necessary modeling constraint is removed.

## Immediate Product Decisions

- Include Mol* immediately, but lazy-load it behind the structure viewer so Learn mode remains light. If Mol* is not installed or cannot load, the viewer falls back to an inspectable CA trace without changing provenance.
- LocalColabFold is the first real inference backend. The backend must support `LOCALCOLABFOLD_BIN` and a stubbed executable test path so the real adapter is verifiable without a GPU.
- Keep the educational simulator, but label it as teaching output and never style it like a real AF2-family run.
- Make provenance a first-class contract across backend, jobs, reports, and UI.

## Visual System From Stitch

The Stitch screens define a Carbon-inspired enterprise research instrument:

- Top bar: compact product title, primary mode tabs, search, blue Run Inference button, utility icons.
- Left rail: project identity, New Experiment action, mission/navigation groups, system links pinned low.
- Main workspace: white/gray analytical surfaces, tight section headers, data-dense tables, charts, timeline strips, and structure canvas.
- Right inspector: provenance, run metadata, logs, equations, paper references, and confidence summaries.
- Structure arena: dark, high-contrast scientific viewport where confidence colors are meaningful, not decorative.

Design tokens:

- Background: `#ffffff`
- Work surface: `#f4f4f4`
- Raised/selected surface: `#ffffff`
- Border: `#e0e0e0`
- Text: `#161616`
- Muted text: `#525252`
- Primary action: `#0f62fe`
- Success: `#198038`
- Danger: `#da1e28`
- Warning: `#f1c21b`
- Radius: 0-4px, no pill-heavy styling
- Font: IBM Plex Sans preferred, system sans fallback
- Body text: 14px; labels: 11-12px; dense UI text: 12-13px; page headings: 18-24px

## Information Architecture

1. Dashboard
   - Archive of folds and recent jobs.
   - Selected run details: pLDDT, PAE, distribution, provenance, artifacts, and open-in-workbench action.
2. Fold
   - Sequence input, model parameters, mission strip, Mol*/trace viewer, frame timeline, LocalColabFold logs, provenance report.
   - The first successful path should be: paste sequence, choose engine, run, inspect provenance, scrub frames, export report.
3. Learn
   - Necessity-first concept missions: coevolution, triangle updates, IPA, FAPE, recycling.
   - Each mission has: question, manipulable scene, break-it toggle, computed objective, paper grounding, toy boundary.
4. Archive
   - Local job records and cached artifacts, with filters by engine/provenance/status.

## Component Families

- App shell: top bar, left nav, primary content, right inspector.
- Buttons: blue primary, outlined secondary, ghost utility icons.
- Panels: square Carbon-style containers with subtle borders; no nested card stacks.
- Data views: compact rows, tags only for typed status/provenance, charts with numeric labels.
- Viewer: lazy Mol* if available; CA trace fallback; confidence legend and selection bridge.
- Logs: monospace black console for inference logs and command provenance.
- Mission controls: sliders, toggles, small numeric readouts, objective progress.

## Educational Contract

- “Watch fold” means watch a teaching optimization or exposed engine trajectory, never physical folding time.
- pLDDT is local reliability; PAE is domain-placement confidence. Neither is energy or probability.
- Every mission includes a “break it” affordance:
  - Coevolution: show covariance confusion before precision-matrix correction.
  - Triangle: disable relaxation and watch realizability fail.
  - IPA: rotate/translate globally and verify invariant residual.
  - FAPE: force reflection and show handedness penalty.
  - Recycling: freeze iteration and show failure to reach a fixed point.

## Implementation Shape

- Backend: FastAPI modules for sequence validation, provenance, guardrails, adapters, job queue, reports.
- Frontend: React + Vite with small feature components, shared tokens, inspectable math modules, and local state.
- Tests: property-based frontend math tests, backend adapter/guardrail/provenance tests, build/lint verification.

## Fidelity Checklist

- Stitch Carbon density, left rail, top tabs, right inspector, and dark structure arena are preserved.
- Confidence colors are reserved for structure/scientific meaning.
- No untyped “REAL” badges; provenance is rendered from the data contract.
- Learn mode prioritizes necessity and failure, not passive explanation.
- LocalColabFold path is real and testable through a stub, even if the host cannot run GPU inference.
