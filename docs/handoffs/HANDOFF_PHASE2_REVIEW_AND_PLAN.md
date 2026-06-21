# Phase 2 Review + Forward Plan (post-Codex)

Date: 2026-06-19
Author: Claude (review/planning session)
Scope: Reviewed Codex's Phase 2/3/4 implementation, audited the hard modules,
and laid out the remaining work split into "hard" (specified precisely) and
"scaffolding" (left for Codex to fill in).

IMPORTANT: read Section 0 first. This session hit an environment problem that
prevented me from safely editing or test-verifying code, so this deliverable is
a rigorous review + plan, NOT new code. Nothing in your repo was changed by me
this session except a one-line repair to `frontend/package.json` (see 0.2).

--------------------------------------------------------------------------------
## 0. Environment problem found this session (READ FIRST)

### 0.1 The sandbox mount was serving corrupted file views
My code-execution sandbox (the Linux mount used to run pytest / npm / eslint and
to edit via shell) was returning CORRUPTED views of several real files, while the
direct file reader returned them intact. Concretely:

- `frontend/src/lib/api.js`: sandbox saw 84 lines (truncated mid-function);
  real file is 109 lines and complete (manifest/frame helpers present).
- `frontend/src/App.jsx`: real content is intact through `export default App;`
  but the sandbox copy had ~10,300 trailing NUL bytes appended.
- `backend/app.py`, `backend/adapters.py`, `backend/job_queue.py`,
  `backend/test_backend.py`, `frontend/src/components/MolPlayfield.jsx`:
  sandbox saw them truncated mid-line.
- `frontend/package.json`: was genuinely truncated mid-`devDependencies`.

Because the corruption was stable across retries, I concluded the sandbox
snapshot of your `D:\` drive is desynced/partial. YOUR ACTUAL FILES ARE FINE
(the direct reader shows complete, valid content). The implication for me:
- Test/lint/build runs in my sandbox are UNRELIABLE here (false failures).
- Editing code through the sandbox risks writing truncation back to disk.
So I stopped making code changes and switched to review + planning.

Recovery for you / next session: close and reopen the workspace (or restart the
Cowork session) so the drive re-syncs, then re-run the verification commands in
Section 5. If a fresh session still shows truncated files via shell, the issue is
the sync layer, not the repo.

### 0.2 One change I did make: package.json repair
`frontend/package.json` was actually truncated on disk (cut off at
`"eslint-plugin-`), which breaks ALL npm commands. I repaired it by preserving
the intact prefix (your scripts incl. the full `test` glob, and dependencies)
and completing the standard devDependencies tail (eslint-plugin-react-hooks,
eslint-plugin-react-refresh, globals, postcss, tailwindcss, vite). The reader now
shows it valid and complete. ACTION: please eyeball `package.json` and confirm it
matches what you expect (especially if Codex added any frontend dependency I
might not have known about).

--------------------------------------------------------------------------------
## 1. Correctness review of Codex's hard modules

I reviewed the modules where subtle scientific/logic bugs would matter most.
Verdict: Codex's work is solid and honest. Findings below are refinements, not
blockers, unless marked BUG.

### 1.1 backend/physics.py (OpenMM local relaxation) - GOOD
- Correctly gated: `physics_status()` reports availability; `local_relaxation`
  raises cleanly if OpenMM/PDBFixer missing. Honest "not folding" labeling
  throughout. Energy before/after returned in kJ/mol. maxIterations clamped 1..1000.
- Note (not a bug): it loads `amber14-all.xml` + `amber14/tip3pfb.xml` but never
  adds solvent (NoCutoff, no `addSolvent`) - i.e. vacuum minimization. That is a
  fine, fast, honest choice for a teaching relaxation. Keep the copy as "local
  geometry cleanup," never "in water."
- Refinement: `addHydrogens`/`createSystem` will throw on nonstandard residues
  (e.g. the GFP chromophore, or odd termini). The API endpoint MUST catch and
  return a friendly 422/disabled message rather than a 500. Verify in app.py
  (Section 2.1) and add a test with a deliberately unfixable PDB.

### 1.2 frontend/src/lib/ensembleMetrics.js (model disagreement) - GOOD
- Pairwise RMSD uses `kabschRmsd(a.ca, b.ca)` (aligns internally) - correct.
- Per-residue spread aligns all models onto model[0] then measures RMS spread
  about the per-residue centroid - correct and documented as "disagreement, not
  motion."
- Refinement (not a bug): spread is measured in model[0]'s frame. A consensus
  reference (iterative mean) would be marginally fairer for >2 models, but
  aligning to rank-1 is a defensible, simpler choice. Leave as-is unless you add
  many models.

### 1.3 frontend/src/lib/lensColors.js (residue coloring) - GOOD, one refinement
- HONEST: displacement color is normalized to the frame max for the ramp, but
  `residueColorLegend` discloses the REAL max in Angstrom ("max: X.XX A") and
  titles it "Ca displacement to final (aligned)". This satisfies the audit rule
  that any normalization must keep the true scale visible.
- REFINEMENT (worth doing): the displacement max is computed PER FRAME, so the
  color scale shifts between recycles - a residue at 4 A may look different in two
  frames because each frame's max differs. For an EVOLVING lens this slightly
  misleads. Fix: normalize displacement color to a GLOBAL max across all frames
  (compute once from analysis, pass down), so colors are comparable across the
  trajectory. Keep the per-frame max in the legend too. (Hard-ish; see 3.1.)

### 1.4 backend/analysis.py - GOOD (mine from Phase 1, retained)
- JSON-safe (NaN -> None), reference="final", tested. No change needed.

### 1.5 Not yet re-verified by me (sandbox corruption)
I could not trust shell test runs, so I did NOT independently confirm the
"29 backend / 54 frontend passed, build passed" numbers from Codex's handoff.
Re-run them in a clean session (Section 5) before trusting the green state.

--------------------------------------------------------------------------------
## 2. Confirmed-correct architecture (no action needed)
- MSA mode plumbed end-to-end (PredictRequest -> options -> cache key -> command
  -> provenance). Good.
- Manifest/frame endpoints exist (api.js: fetchPredictionManifest,
  fetchPredictionFrame) to avoid shipping full PDB payloads.
- Component split done: MolPlayfield, ContactDeltaMap, PaePanel, RecycleTimeline,
  ResultInspector, LensRail, EnsemblePanel, PhysicsModePanel; data/targets.js;
  lib/{sequence,lensColors,contactDeltaView,exportMetadata,ensembleMetrics}.js.
- Export watermarking on PDB (REMARK 950) / mmCIF (comments) / JSON
  (export_watermark block).

--------------------------------------------------------------------------------
## 3. Forward plan - HARD parts (specify precisely; do these carefully)

### 3.1 Global-max displacement normalization (honesty + pedagogy) [HARD]
Problem in 1.3. Implement:
- Backend: in `build_analysis`, add per-trajectory `max_displacement_overall_a`
  (max over all frames of each frame's max per-residue displacement to final).
- Frontend: `lensColors.groupResidueColors(channel, { globalMax })` should accept
  and prefer a global max; `lensModel.lensResidueColors` should pass it through.
- Legend shows BOTH per-frame max and trajectory max.
- Test: two synthetic frames with known displacements; assert identical absolute
  displacement -> identical color across frames when globalMax is used.

### 3.2 MMseqs2 sanity-gate evaluation logic [HARD - the science]
The valuable, hard part is the PASS/FAIL evaluation, not the HTTP plumbing.
Implement as a pure, tested function (so it can be unit-tested without a live run):

  evaluate_sanity_gate(result) -> { passed, checks[], summary }
  Checks:
   - mean pLDDT of best model >= MSA_PASS_THRESHOLD (suggest 70 for GFP; make it
     a per-target expectation, since not all targets reach 70).
   - best model mean pLDDT is meaningfully above the single-sequence ceiling
     (delta >= 25 vs the recorded single_sequence baseline for that target).
   - recycle rmsd_to_previous is non-increasing on average (monotone-ish decay):
     allow noise but require last third mean < first third mean.
   - provenance.engine == "localcolabfold" and options.msa_mode == "mmseqs2_uniref_env".
- Unit-test it against (a) the cached single_sequence GFP job -> FAIL (proves the
  Part 3 diagnosis), and (b) a synthetic high-pLDDT monotone fixture -> PASS.
Leave the live runner (poll job, fetch result, write report JSON) as SCAFFOLD
(Section 4), because it needs a configured LocalColabFold + network.

### 3.3 Physics endpoint error hardening [HARD-ish]
- Ensure POST /api/physics/local-relaxation catches OpenMM/forcefield exceptions
  (nonstandard residues, missing atoms) and returns a structured 422 with a clear
  message, never a 500. Add a backend test that feeds a PDB OpenMM can't
  parametrize and asserts the friendly failure shape.

### 3.4 Contact-line scale comparability across frames [HARD-ish]
- The coevolution contact lines (gained/lost/stable vs final) are correct, but
  verify the line set is recomputed per displayed frame against the SAME final
  reference (not against the previous frame) so "gained since start -> converging
  to final" reads monotonically. Confirm in MolPlayfield + lensModel wiring.

--------------------------------------------------------------------------------
## 4. Forward plan - SCAFFOLDING (leave for Codex to fill in)

These are well-defined but mechanical, or need a configured machine:

S1. MMseqs2 live runner: `scripts/run_mmseqs_sanity_gate.py`
    - args: --base-url, --target/--sequence, --threshold.
    - POST localcolabfold + msa_mode=mmseqs2_uniref_env; poll; fetch result;
      call evaluate_sanity_gate() (3.2); write JSON report to an ignored dir;
      print a concise console summary. Do not auto-run long jobs.

S2. CI dependency fix: add `httpx` to `.github/workflows/ci.yml` backend install
    and to the README backend test command (TestClient needs it). Trivial but real.

S3. Media export watermark: only if/when GIF/WebM/screenshot export is added -
    burn in engine, recycle/model index, msa_mode, and "rendered, not a physical
    folding movie." Reuse exportMetadata.js conventions.

S4. App.jsx further split: extract prediction-job state/actions into a hook/
    controller; extract download/export concerns; extract inspector modal state.
    Run eslint + build + playwright after each extraction.

S5. UI polish: residue-color and contact-line legends in-canvas; compact ensemble
    wording; loading/error states for physics + manifest fetches; keyboard/focus
    in Result Inspector tabs.

S6. OpenMM integration test gated by package availability (skip if openmm absent).

--------------------------------------------------------------------------------
## 5. Verification commands (run in a CLEAN session on Windows)

    cd D:\Projects\alphafold\3d-companion
    python -m pytest backend/ -q
    cd frontend
    npm test
    npx eslint src tests
    npm run build
    npm run smoke   # playwright, needs a built/preview server

If any source file appears truncated via shell but opens fine in an editor, the
sandbox sync is stale - restart the session before trusting shell output.

--------------------------------------------------------------------------------
## 6. Recommended sequence
1. Restart/re-sync the session; confirm package.json (0.2) and re-run Section 5
   to establish a real green baseline.
2. Do 3.3 (physics error hardening) + S2 (CI httpx) - cheap, removes real risk.
3. Do 3.2 evaluation logic (tested) + S1 runner; then run the real GFP MMseqs2
   gate on a configured box and record numbers in the handoff.
4. Do 3.1 (global-max displacement) + 3.4 (contact-line reference) for honest,
   comparable evolving lenses.
5. S4/S5 polish; S3/S6 when those features/deps land.
6. Keep every surface honest: teaching sim vs AF2 inference vs alignment view vs
   confidence vs local relaxation are SEPARATE; never call recycles or OpenMM
   relaxation "folding."
