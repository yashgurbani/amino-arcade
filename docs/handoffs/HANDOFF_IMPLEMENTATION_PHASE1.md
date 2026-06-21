# Handoff — Phase 1 shipped + Phase 2/3 plan for codex

**Date:** 2026-06-19
**Companion docs:** `HANDOFF_PEDAGOGY_AND_LENSES.md` (the why + full design). This doc is the *what shipped* and *what's next*.

This session implemented the hard, correctness-critical core of the pedagogy/lens
plan and verified it with tests. The remaining work is mostly mechanical wiring
and UI, scaffolded precisely below so codex can continue immediately.

---

## 0. Verification status (read this first)

| Check | Status |
| --- | --- |
| Backend `python -m pytest backend/test_backend.py backend/test_analysis.py` | **29 passed** |
| Frontend `npm test` (node --test, lib/data suites) | **54 passed** |
| `npx eslint src tests` (whole frontend + smoke test) | **clean (exit 0)** |
| `npm run build` (vite) | **passed** on the Windows dev environment |
| Playwright smoke | **1 passed** (Chromium, real-analysis fixture) |

The Phase 1 App.jsx/MolPlayfield extraction and the Phase 2 additions below now
have production-build and browser-smoke coverage on the Windows dev environment:

```
cd 3d-companion/frontend
npm run build        # must succeed
npm run dev          # then visually confirm Mol* still renders + lenses toggle
npm run smoke        # playwright e2e
```

If another platform reports a native binary mismatch, run `npm install` there
first to fetch the correct platform binaries.

### Phase 2 progress (Codex continuation, 2026-06-19)

- **2a shipped:** Mol* per-residue overpaint now consumes the real
  `computeLensModel().residueColors` channel. Displacement uses a quantized
  sequential color ramp with an explicit, unamplified Angstrom legend; pLDDT
  uses documented confidence bands. Real computed highlight residues replace
  the illustrative teaching presets.
- **2c shipped:** live readouts use real bond outliers, clashes, and C-alpha FAPE;
  the recycle chart plots mean pLDDT plus aligned RMSD-to-previous.
- **2d shipped:** low-confidence runs render the truth-label lesson card.
- **2e shipped:** the side-panel map now has explicit Contact / PAE / Δ Contacts
  tabs. The real Δ Contacts tab visualizes gained, lost, and stable contacts
  against the final recycle and exposes counts from real contact-delta data.
- **2b shipped:** enabling the Coevolution lens adds transient Mol* contact-line
  overlays from `computeLensModel().contactLines`, using green gained, red lost,
  and dim cyan stable lines. Lines are cleared/rebuilt with lens and frame changes.
- The stage viewer now exposes the previously unreachable SS/pLDDT color toggle.
- **3a/3b shipped:** request-level `msa_mode` now flows through backend options,
  cache keys, LocalColabFold command env, provenance/meta, and the curated
  arcade targets. GFP is explicitly tagged as a single-sequence lesson; flagship
  targets request `mmseqs2_uniref_env`.
- **Backend hardening shipped:** LocalColabFold run dirs now include a SHA-1
  sequence suffix, LocalColabFold execution is single-flight around the
  process-wide env/subprocess path, option-aware cache hydration is fixed, and
  generic sequence validation is separated from LocalColabFold preflight.
- **Manifest endpoints shipped:** jobs now expose compact manifests and
  per-frame retrieval endpoints so future UI work can lazy-load large trajectory
  artifacts instead of relying only on the full result JSON.
- **Component split progressed:** curated arcade target data now lives in
  `src/data/targets.js`; sequence/PDB helper utilities now live in
  `src/lib/sequence.js`, with focused tests for both. The shared recycle/custom
  trajectory SVG renderer now lives in `src/components/RecycleTimeline.jsx`, and
  the real PAE matrix panel now lives in `src/components/PaePanel.jsx`. The
  result-inspector/downloads panel now lives in `src/components/ResultInspector.jsx`.
  The lens toggle rail and active lens chips now live in `src/components/LensRail.jsx`.
- **Open-source hygiene progressed:** added MIT `LICENSE`, GitHub Actions CI
  for backend/frontend gates, tightened `.gitignore` for generated caches/logs/
  structure artifacts, and updated `README.md` with quickstart, manifest API,
  engine-honesty, and attribution notes.
- **Export watermark shipped for current downloads:** PDB/mmCIF exports now
  include visible REMARK/comment honesty watermarks, and JSON exports include a
  machine-readable `export_watermark` block sourced from `truthLabels`.
- **Ranked ensemble view shipped:** multi-model LocalColabFold outputs now get
  a real ensemble-disagreement panel beside the ranked model selector. It
  reports aligned pairwise RMSD, per-residue spread, and top disagreement
  residues from final-model C-alpha traces, with copy stating this is model
  disagreement rather than physical motion.
- **Physics tab seam shipped:** Result Inspector now has a separate Physics tab
  for OpenMM **local relaxation**, never folding. Backend endpoints expose
  physics availability and an optional `/api/physics/local-relaxation` path. On
  this workstation OpenMM/PDBFixer are not installed, so the tab and endpoint
  honestly report unavailable rather than pretending to run minimization.
- **Still next:** Phase 3 real MMseqs2 sanity-gate benchmarking and the
  remaining Phase 4 media screenshot/GIF/WebM capture path if added. Large
  existing logs/artifacts still need explicit cleanup/history decisions before
  any public release.

Repository note: `D:\Projects\alphafold\.git` is currently an empty directory,
so Git status, diff, history, and commit operations are unavailable. Do not
initialize a replacement repository until the intended history/remotes are known.

---

## 1. What shipped this session (Phase 1 — the computational substrate)

### Backend (all tested)
- **`backend/analysis.py`** (new): the honest diagnostics engine, framework-free.
  - `kabsch`, `superpose`, `kabsch_rmsd`, `raw_rmsd`, `per_residue_displacement`
  - `contact_pairs`, `contact_delta` (gained/lost/stable/Jaccard)
  - `ca_fape` — clamped Ca-frame FAPE approximation (SE(3)-invariant; detects reflection)
  - `geometry_violations` (clashes, bond outliers), `plddt_stats` (mean/median/low-conf fractions), `radius_of_gyration`
  - `build_analysis(frames, reference="final")` — the public entrypoint; returns a JSON-safe per-frame `analysis` object. Reference is the **final** recycle (product decision).
- **`backend/pdb_utils.py`**: added `parse_structure` (chain-aware, keyed by `(chain, resnum, icode)`) and `ca_by_chain`. Legacy flat parsers kept for back-compat.
- **`backend/adapters.py`**: `_trajectory` now attaches `result["analysis"]` (and per-model `analysis`) via `build_analysis`, wrapped so it can never break a prediction.
- **`backend/test_analysis.py`** (new): 11 tests incl. a regression against the real GFP job `94e52501…` reproducing the forensic numbers (raw-vs-aligned RMSD gap, pLDDT stuck ~25, >90% residues below 70).

### Frontend (all tested with node --test)
- **`src/lib/superpose.js`**: Kabsch in pure JS (`kabsch`, `superpose`, `kabschRmsd`, `rmsd`) + `transformPdb` / `superposePdbToReference` for aligning recycle-frame PDB text onto the final recycle. Mirrors the backend; tested against the real GFP coordinates.
- **`src/lib/contactMap.js`**: `contactPairs`, `contactDelta` (mirrors backend constants).
- **`src/lib/recycleMetrics.js`**: consumers/formatters over `result.analysis` (`convergenceSeries`, `isLowConfidence`, `fmtA/fmtDelta/fmtPct`).
- **`src/lib/lensModel.js`**: the lens brain — `lensMetrics(entry)` (real per-lens strings), `lensHighlightResidues`, `lensContactLines`, `lensResidueColors`, `computeLensModel`. Replaces the synthetic placeholders.
- **`src/lib/truthLabels.js`**: the language contract (audit §5 copy).
- **`src/lib/viewer.js`**: shared helpers (`st`, `withTimeout`, `fallbackPdb`) extracted from App.jsx.
- **`src/components/MolPlayfield.jsx`**: the Mol* viewer, extracted from App.jsx (pure move + import wiring).

### App.jsx wiring (lint-verified, needs runtime confirmation)
- Imports the new libs; **real lens metrics** now used when a real run exists (`analysisActive()` → `computeLensMetrics`), synthetic only in teaching mode.
- **Frame superposition**: `referenceCa()` + `frameCa` passed to `MolPlayfield`; `resolvePdb` superposes each recycle onto the final recycle before rendering (kills the tumbling illusion). This is also the **IPA/SE(3) lens** demonstration.
- **PAE both-residue pin fixed**: `applyLensAnnotations` now selects *every* annotated residue (`Q.core.set.has`), not just `residues[0]`.
- **Renames**: `FOLD SCORE` → `DISPLAY CONFIDENCE` on real runs; `contactProbabilities` → `contactProximityScore`.
- Recycle caption now uses `truthLabels.superposeNote`.

---

## 2. Phase 2 — the visible lens overlay (highest value next; hard part is done)

The data is ready (`lensModel.computeLensModel` returns contact lines, per-residue
displacement, highlight residues). What remains is **drawing it in Mol\***. Do this
inside `MolPlayfield.jsx`.

### 2a. Per-residue color overlay (FAPE / displacement, Confidence / pLDDT)
- `computeLensModel(...).residueColors` gives `{ mode, units, values[] }` (real Angstrom or pLDDT, never rescaled).
- Implement a Mol* custom color theme (or reuse the `uncertainty` theme machinery already in `applyColorTheme`) that maps `values[i]` → color. For displacement use a sequential ramp (0 → maxA); document the scale in the legend so no fake motion is implied.

### 2b. Contact lines (Coevolution lens)
- `computeLensModel(...).contactLines = { gained, lost, stable }` as 0-based `[i, j]` Ca pairs.
- Draw as Mol* shape primitives (cylinders/lines) between the two Ca: gained = bright, lost = fading/red, stable = dim. Use `MeshBuilder`/`Shape` from `molstar/lib/mol-geo` or the `Representation` custom-shape API. Toggle with the `coevolution` lens.

### 2c. Replace remaining synthetic readouts
- `recDelta()` (App.jsx) and `f.triViol`/`fp.fape` panels still feed teaching values into the right-hand strip on the recycle view. When `hasReal`, source these from `analysisActive()` (`rmsd_to_previous_a`, `geometry.clashes`, `fape_to_reference_a`).
- Convergence chart (`renderTraj`): when real, plot `convergenceSeries(analysis)` (rmsd-to-previous decay + pLDDT) instead of the synthetic curve.

### 2d. Low-confidence lesson card
- Trigger: `isLowConfidence(analysisActive())`. Render `truthLabels.lowConfidenceTitle/Body/plddtBands`. This converts the GFP failure into the lesson.

### 2e. Contact-map delta tabs
- A 2D panel with tabs (`truthLabels.contactDeltaLabels`): Now / Gained / Lost / Stable-to-final / Different-from-final, from `contactDelta`.

---

## 3. Phase 3 — MSA web API + honest example curation

- **MSA path shipped:** `PredictRequest.msa_mode` flows through normalized job
  options and cache keys, into `LOCALCOLABFOLD_MSA_MODE`, and into
  LocalColabFold provenance/meta. The adapter also records `msa_depth` when
  `.a3m`/`.aln`/`.sto` artifacts are present.
- **Curation shipped:** each `arcadeTargets` entry (`App.jsx`) is tagged with
  `msaMode` and `expectation: "success" | "lesson"`. GFP remains an explicit
  `single_sequence` lesson; flagship targets request `mmseqs2_uniref_env`.
- **Still pending sanity gate:** re-run GFP *with* MMseqs2 MSA and assert pLDDT
  jumps well above the 26 ceiling and rmsd-to-previous decays monotonically —
  proof the Part 3 diagnosis was right. This needs a real LocalColabFold/MMseqs2
  run, not just the stubbed backend tests.

---

## 4. Backend hardening (straightforward; needs the web stack to test)

From the audit §6:
- **Run-dir collisions shipped:** `_run_dir` uses a readable sequence prefix plus
  a SHA-1 sequence suffix, so two sequences sharing the first 28 residues no
  longer collide.
- **Single-flight real jobs shipped:** LocalColabFold prediction now runs under
  a process-wide semaphore around `temporary_env` and the subprocess path, so
  concurrent jobs cannot race on `LOCALCOLABFOLD_*` environment variables.
- **Option-aware cache hydration shipped:** job result/report reloads pass
  `job["options"]` into `load_cached_prediction()`.
- **Validation/preflight split shipped:** `validate_sequence` is generic amino
  acid validation; LocalColabFold guardrails run at the app endpoint only for
  LocalColabFold requests. Educational simulator runs are not blocked by the
  real-backend safe-sequence cap.
- **Manifest endpoints shipped** (audit §2): `/api/predict/jobs/{job_id}/manifest`
  returns compact frame/model/analysis metadata without large PDB strings, and
  `/api/predict/jobs/{job_id}/frames/{frame_index}` returns one full frame on
  demand. `frontend/src/lib/api.js` has matching client wrappers.

---

## 5. Phase 4+ (later) — exports, ensembles, physics
- Mandatory export watermark (`truthLabels.exportWatermarkRecycle`) on GIF/WebM/screenshots.
- **Ranked model ensemble view shipped** for existing multi-model result
  payloads: pairwise aligned RMSD, per-residue spread, top disagreement
  residues, and honest model-disagreement copy. Still opt-in at run time via
  `num_models>1`.
- **Physics tab shipped:** OpenMM path is behind a separate Result Inspector
  Physics tab and labelled **local relaxation**, never folding. Backend exposes
  `/api/physics/status` and `/api/physics/local-relaxation`. In the current
  environment OpenMM/PDBFixer are missing, so the endpoint returns 503 with an
  explicit availability message. Short restrained MD remains future work after
  dependency/install decisions.

---

## 6. Full component split (the rest of the App.jsx refactor)

MolPlayfield + viewer helpers are already extracted. Continue the same seam, one
component per PR, running `npm run build` + visual check each time:

```
src/data/targets.js          # shipped: arcadeTargets + sequences (GFP_SEQ etc.)
src/lib/sequence.js          # shipped: cleanSequence, meanOf, slug, pdbToCif, parsePdbAtoms
src/components/RecycleTimeline.jsx     # shipped: shared recycle/custom trajectory SVG
src/components/ContactDeltaMap.jsx   # Phase 2e shipped; extracted from App.jsx
src/components/PaePanel.jsx            # shipped: real PAE matrix + residue pin copy
src/components/ResultInspector.jsx   # shipped: metrics/downloads/run metadata panel
src/components/LensRail.jsx           # shipped: lens toggle rail + active chips
src/components/EnsemblePanel.jsx      # shipped: ranked model disagreement metrics
src/components/PhysicsModePanel.jsx  # shipped: separate local-relaxation tab
```

Pattern that worked this session: move the self-contained unit to its own file,
import the shared helpers from `lib/`, import the component back into App.jsx, then
`npx eslint src` (catches every missing/again-unused symbol) before the build.

---

## 7. Open-source repo hygiene (for the public release)

- **LICENSE shipped:** `LICENSE` is MIT for this companion source. `README.md`
  now calls out that dependencies/optional engines keep their own licenses and
  that model weights/databases must stay out of the repo.
- **CI shipped:** `.github/workflows/ci.yml` runs:
  - backend: `python -m pytest backend/test_backend.py backend/test_analysis.py -q`
  - frontend: `npm ci`, `npm test`, `npx eslint src tests`, `npm run build`
  - Playwright smoke remains optional/manual because it requires launching the
    app stack.
- **.gitignore tightened:** excludes prediction caches, logs, virtualenvs,
  node_modules, build/test reports, local work scratch, and generated
  structure/MSA artifacts.
- **README updated:** quickstart now includes install/test commands, manifest
  endpoints, engine-honesty model, and a pointer to
  `HANDOFF_PEDAGOGY_AND_LENSES.md` for scientific framing.
- **Still pending before public:** decide whether to delete/move existing large
  local logs/artifacts and, once real Git history is available, remove any
  accidentally committed generated files from history. Do not do destructive
  cleanup until the intended repository/history is known.

---

## 8. Test commands (current)

```
# backend
cd 3d-companion && python -m pytest backend/test_backend.py backend/test_analysis.py -q

# frontend unit (no native deps; runs anywhere)
cd 3d-companion/frontend && npm test

# lint
cd 3d-companion/frontend && npx eslint src

# build + e2e (run on a box with platform-correct node_modules)
cd 3d-companion/frontend && npm run build && npm run smoke
```
