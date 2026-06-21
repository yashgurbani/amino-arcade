# Release reconcile + additions — 2026-06-21

This pass reconciled the diverged trees, added a preview-first reference protein
library, verified what could be verified inside a sandbox, and lays out the
UI/UX and pedagogy roadmap. Read the "Verify before you commit" section first —
the full build/test suite still needs to run on your Windows machine.

## 1. Repo state that was found (important)

There were **two diverged copies**, and only one had git history:

- `3d-companion/` — the real git repo (12 commits, branch `main`, **no remote**).
  Its committed state had codex's curated-targets work, but it was **missing the
  entire gpt5.5pro review P0 pass**, and carried a set of *older* uncommitted
  edits (its `backend/app.py` had **zero** of the 5 review features).
- `amino-arcade-release/` — **not a git repo**, but the **newest** source. It had
  all the review P0 work: `schemas.py`, `apiTypes.js`, `requirements.txt`,
  `New-SourceRelease.ps1`, the LensRail scope-card move, CORS/provenance/PDB
  hardening.
- `amino-arcade-history-clean/` — the cleaned-history clone the release handoff
  claimed to start **did not exist**.

Decision (per your choice): **reconcile into the existing git repo**. The
git-filter-repo history rewrite from the release handoff is **unnecessary** —
the repo is already clean (148 tracked files, no junk dirs tracked, `.git` is
only ~33 MB; the 6 demo-cache JSONs ~11 MB *should* ship, they power the
zero-install demo).

`amino-arcade-release/` is now **superseded** by the git repo. Keep it as a
backup until the push succeeds, then archive it.

## 2. What was changed

### 2.1 Reconcile (amino → git repo)

20 source files were synced from `amino-arcade-release/` into `3d-companion/`
(no deletions; amino was a strict superset). These are the review P0 files:
`.gitignore`, `README.md`, `requirements.txt`, `requirements-dev.txt`,
`scripts/New-SourceRelease.ps1`, `backend/{app,adapters,guardrails,job_queue,provenance,schemas,test_backend}.py`,
`frontend/README.md`, `frontend/src/App.jsx`, `frontend/src/components/LensRail.jsx`,
`frontend/src/data/{paperGrounding,sceneSpecs}.js`, `frontend/src/lib/{api,apiTypes}.js`.

The pre-existing uncommitted edits in the repo (CONTEXT.md, docs/\*, mock_server,
manifest.json, two PowerShell scripts) are legitimate and were left in place to
be committed as part of this release.

### 2.2 New reference protein library (lysozyme, calmodulin, Ras)

The curated six-lens tour is hard-asserted at exactly six targets in fixed lens
order by `targets.test.mjs`, so the new proteins were added as a **separate
`libraryTargets()` export** rather than appended to the tour. They are
`library: true` and **preview-first**: the Mol\* RCSB preview (chain-scoped)
loads immediately; the offline "Fold" needs a demo cache that hasn't been
generated yet (see §4).

Sequences are exact RCSB chain-A FASTA records (fetched and verified 2026-06-21):

| Target | PDB | Chain | Len | Lens reused | Teaching hook |
|---|---|---|---|---|---|
| Lysozyme | 1LYZ | A | 129 | coevolution | beginner/reference; disulfides omitted |
| Calmodulin | 1CLL | A | 148 | ipa | two lobes + floppy linker → read **PAE** not just pLDDT |
| Ras GTPase | 5P21 | A | 166 | fape | rigid core + mobile switch loops; **GTP/Mg²⁺ omitted** |

Sources: [RCSB 1LYZ](https://www.rcsb.org/structure/1LYZ),
[RCSB 1CLL](https://www.rcsb.org/structure/1cll),
[PDB-101 Calmodulin](https://pdb101.rcsb.org/motm/44),
[RCSB 5P21](https://www.rcsb.org/structure/5p21).

Files touched: `frontend/src/data/targets.js` (3 sequences + `libraryTargets()`),
`frontend/src/data/targets.test.mjs` (4 new tests, curated-stays-6 guard),
`frontend/src/App.jsx` (import, combined `arcadeTargets()`, rail split into
curated cyan buttons + divider + amber `L1/L2/L3` reference buttons).

Each library button carries scope copy explaining what is and isn't folded, in
the same scientific-honesty style as the curated six.

## 3. Verify before you commit (run on Windows — I could not)

The sandbox has a stale read-cache on the Windows mount, so it could not run the
full suite reliably. What **was** verified here: `targets.js` and the App.jsx
rail snippet pass `node --check` in isolation; `libraryTargets()` returns 3
well-formed entries with correct lengths (129/148/166) and lens concepts that
resolve; no code assumes exactly six targets; the Fold-without-cache path is
wrapped in try/catch (graceful error, no crash); the guided tour uses
`findIndex` and still selects the curated target first.

Run these to confirm the rest:

```powershell
cd D:\Projects\alphafold\3d-companion
Remove-Item -Force .git\index.lock   # clears a stale lock left by this session

cd frontend
npm ci
npm run lint
npm test -- --run        # expect prior 70 + 4 new library tests
npm run build            # confirms the App.jsx rail edit compiles
cd ..
python -m pytest -q backend\test_analysis.py backend\test_sanity_gate.py backend\test_backend.py
```

Then visually smoke-test: the arcade rail should show `1..6` (cyan), a divider,
then `L1 L2 L3` (amber); selecting L2 (Calmodulin) should load its 1CLL chain-A
preview; clicking Fold on a library target should show a graceful "needs
backend / no bundled demo" message, not a crash.

## 4. Make library "Fold" work offline (optional, needs a GPU)

Library targets have no bundled demo cache, so offline Fold falls back to the
error path by design. To make them first-class zero-install targets, generate
caches on a machine with LocalColabFold/GPU:

```powershell
python scripts\cache_arcade_examples.py   # extend it to include libraryTargets()
```

Until then the preview-first behavior is the honest default.

## 5. Commit + push

```powershell
cd D:\Projects\alphafold\3d-companion
git add -A
git status                # review — includes the review P0 files + new library
git commit -m "feat: reconcile review P0 release; add lysozyme/calmodulin/Ras reference library"
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

(No remote is configured yet — paste your GitHub URL in place of the placeholder.
Tell me the URL and I can prepare the exact commands or a CI workflow.)

## 6. UI/UX & visual cleanup suggestions

Grounded in the current build:

1. **Signal that library targets are preview-only.** Right now Fold on `L1–L3`
   only fails *after* a click. Better: when `curT.library` and no backend,
   relabel the Fold button to "Preview only" or show an inline chip
   "no bundled fold — preview + local backend only". Small change in the
   `runFold` button block (App.jsx ~line 1152); it removes the one remaining way
   a user hits a confusing error.
2. **Add a one-line legend for the rail colors** (cyan = lens tour, amber =
   reference library). The divider helps but the color semantics are implicit.
3. **Distinguish `predictionScope` from `omittedContext` visually** in LensRail —
   scope as the primary line, omitted-context as a muted/secondary line — so the
   honesty layer reads as "what you get" vs "what's stripped".
4. **Header is dense and will overflow on narrow widths** (logo, ARCADE/FIY,
   target buttons, guided tour, guardrail chip, info). Add `flex-wrap` or a
   responsive breakpoint.
5. **Keep the good defaults** confirmed in the handoffs: spin 0.18, shadows/
   outline off, VR hidden, app-level fullscreen. No change needed.
6. **App.jsx is ~136 KB and fragile** (the review's §5.2). Don't refactor under
   release pressure, but the next safe slice is extracting `runFold`/job
   orchestration into `src/state/usePredictionJob.js`, leaving `MolPlayfield`
   untouched and verifying after each move.

## 7. Pedagogy roadmap (prioritized P1 from the review)

The new proteins were chosen to **seed three lessons**, so build these next:

1. **MSA / Potts mini-lab** (review §6.3) — covariance → inverse-covariance
   (precision) → contact map → 3D highlight. This is the most direct match to
   your field-theory / inverse-problems interest, and `conceptMath.js` already
   has covariance/partial-correlation primitives to build on.
2. **Confidence calibration: pLDDT vs PAE** (§6.8) — use **Calmodulin (new L2)**
   as the worked example: high pLDDT in each lobe, low PAE across the hinge.
   This converts a new preview into a real lesson.
3. **Ligand/cofactor omission** — use **Ras (new L3)** and Carbonic anhydrase:
   "the fold never sees the GTP/Zn²⁺ that defines the biology."
4. **IPA invariance scene** (§6.6) — an SE(3) rotate/translate slider where the
   distance logits stay fixed; physics-native and currently only conceptual.
5. **FAPE/chirality** (§6.7) — extend the existing REFLECT toggle into a proper
   mirror-vs-distance-matrix demonstration.
6. **Protein Basics onboarding path** (§6.2) and **misconception cards**
   ("recycling is not folding", "pLDDT is not free energy") (§6.1, §11).

Deferred to P2: AF3 token/diffusion mode, PAE click-to-highlight in Mol\*,
saved progress/quizzes.

## 8. Scientific-honesty audit (still clean)

Codex's hemoglobin fix holds: target 6 is Adenylate kinase (4AKE chain A), and
all six curated targets carry `pdbChain` + `predictionScope` + `omittedContext`.
Amylase flags Ca²⁺/Cl⁻, GFP the chromophore, CA the Zn²⁺, PGK the shallow MSA.
The three new library targets follow the same pattern. The core principle from
the review — distinguish "what is predicted" from "what is shown" — is upheld
across all nine targets.
