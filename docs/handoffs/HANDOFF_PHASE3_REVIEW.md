# Phase 3 - Review, Pedagogy Audit, OSS Viability, Next Hard Parts

Date: 2026-06-20
Author: Claude (review + targeted implementation session)

This covers: (A) what shipped this session and is verified, (B) how far the build
is from the "evolving pedagogical lens" vision, (C) an honest review of educational
utility for a first-time AlphaFold reader, (D) open-source viability with a
pre-mortem, (E) the next hard parts (specified) and scaffolding left for Codex.

================================================================================
## A. Shipped + verified this session

1. Smoke-test 404 fixed (root cause found). The app fetches `/api/physics/status`
   on mount (App.jsx:90); the Playwright `mockBackend` did not stub it, so the
   page logged 404 console errors and the "no unexpected console errors" assert
   failed. Added routes to `frontend/tests/arcade-smoke.spec.js` for
   `/api/physics/status`, `/manifest`, and `/frames/*`. `node --check` passes.
   Re-run `npm run smoke` on your machine to confirm green.

2. MMseqs2 sanity-gate JUDGMENT logic (the hard, science part) - DONE + tested.
   - `backend/sanity_gate.py`: `evaluate_sanity_gate(result, ...)` returns
     {passed, best_mean_plddt, checks[], summary}. Checks: mean pLDDT threshold,
     improvement over the single-sequence baseline, recycle convergence trend
     (aligned RMSD-to-previous decays), engine == localcolabfold, msa_mode match.
   - `backend/test_sanity_gate.py`: 5 tests, incl. the REAL cached GFP job which
     correctly FAILS the gate (pLDDT ~26, single_sequence) and a synthetic healthy
     run which PASSES. All pass.
3. Live runner SCAFFOLD: `scripts/run_mmseqs_sanity_gate.py` - starts a real
   localcolabfold + mmseqs2 job, polls, fetches result, calls the (tested) judge,
   writes a report under work/sanity-gate/. Needs a configured backend/GPU to run;
   judgment is already proven.

Verification in THIS session (sandbox): backend `test_analysis` + `test_sanity_gate`
= 16 passed; backend app/adapters/job_queue/test_backend parse clean. NOTE: I could
not re-run the full frontend build/eslint here because the sandbox's copy of
App.jsx was still null-byte corrupted (a session-sync artifact, not your real file -
your machine's Section-5 run passed). Re-run the full suite on your box.

================================================================================
## B. How far from the "evolving pedagogical lens" vision?

Closer than it looks - the substrate is largely built. Status per lens (all now
driven by REAL per-frame analysis, not synthetic placeholders):

  Lens          Real metric            3D overlay                  Status
  ----          -----------            ----------                  ------
  Coevolution   gained/lost/Jaccard    contact lines               DONE
  Triangle      clashes/bond outliers  (geometry readout)          DONE (approx*)
  IPA           aligned RMSD           superposed frames           DONE
  FAPE          Ca-FAPE to final       per-residue displ. color    DONE
  Recycling     RMSD-to-prev + dpLDDT  convergence chart           DONE
  Confidence    pLDDT + PAE            pLDDT color + PAE panel     DONE

Remaining gaps to the full vision (ranked by pedagogical payoff):

1. No GOOD fold is demonstrable yet. The vivid "contacts snap in, pLDDT climbs,
   Delta-RMSD decays" story needs an MSA-backed success. Examples are tagged
   (insulin/myoglobin/lysozyme/hemoglobin = success+mmseqs2; GFP/collagen =
   lesson), but the success runs have not actually been executed + cached. Until
   then a first-timer mostly sees the honest GFP FAILURE, which teaches "MSA
   matters" but never shows the triumph. THIS is the biggest gap.
2. Cross-frame color comparability: displacement color normalizes to per-frame
   max, so the same Angstrom value can look different across recycles (see prior
   handoff 3.1 - use a global trajectory max; legend already shows true Angstrom).
3. *Triangle lens is geometry-sanity, an approximation to the distogram-level
   triangle story. Honest, but label it as such in-canvas.
4. No guided narrative. The lenses exist as an expert rail with question +
   boundary + citation each, but there is no necessity-first tour or earned
   interpretation cards. (See C - this is the make-or-break for novices.)

================================================================================
## C. Honest educational-utility review (first-time AlphaFold reader)

Framing (Jobs-to-be-Done): a first-timer "hires" this to *understand what
AlphaFold actually does and why* - hands-on, without being misled. Judged against
that job, not against being a research tool.

What genuinely works (do not lose these):
- The honesty discipline is rare and is the product's real moat. Separating
  teaching-sim vs AF2 inference vs alignment-view vs confidence vs local
  relaxation, and refusing to call recycles or OpenMM "folding," directly
  corrects the single most common misconception a newcomer arrives with.
- The GFP low-confidence lesson turns a failure into the most important lesson in
  the whole field (no MSA -> no coevolution signal -> no fold). That is excellent.
- Lenses map to the paper's actual ideas with citations - rare rigor.
- The IPA/superposition fix doubles as a concept demo (global pose is meaningless).

Where it currently falls short for a true novice (unflinching):
1. Cognitive overload. Six lenses + PAE + contact-delta + ensemble + physics tabs
   is an expert cockpit. A first-timer needs a single guided path, not a
   dashboard. Without a tour, most will bounce. HIGHEST-IMPACT fix.
2. No success to marvel at (see B.1). Right now the most-honest example (GFP)
   also looks the most broken. A newcomer needs to SEE a confident fold and watch
   a lens light up before being taught how it fails. Sequence the emotion:
   wonder -> mechanism -> honest limits.
3. Vocabulary wall. pLDDT, PAE, FAPE, IPA, Ca, Jaccard, recycle, distogram - the
   glossary exists in data (paperGrounding.js) but is not surfaced in-context
   (hover/whatis). A novice drowns by the second panel.
4. Access friction. The "aha" requires running a Python backend + LocalColabFold
   (+ a GPU for real MSA folds). A person *reading* about AlphaFold cannot get
   there. Without bundled cached real runs or a hosted demo, the teaching payload
   is gated behind an install most readers will never do.
5. Narrative thread. Each lens has a "why" (the q/boundary fields) but they are
   not woven into a story of how AF2 turns a sequence into a structure. The
   how/why/what/when scaffolding is latent in the code but not in the UX.

Net: the SCIENTIFIC and HONESTY foundations are strong-to-excellent; the
FIRST-TIMER ONBOARDING is the missing half. It is currently a great tool for
someone who already knows AlphaFold to inspect a run honestly - and a confusing
one for the newcomer it claims to serve. Closing C.1, C.2, C.4 would flip that.

================================================================================
## D. Open-source viability (pre-mortem + red-team)

Pre-mortem ("it's a year later and the repo flopped - why?"):
- [BLOCKER] Git is broken (`.git` unusable). No version control = not a real OSS
  project. Priority zero; nothing else matters until this is fixed and Codex's
  work is committed. Also: this session and the last both hit silent file
  corruption - without git you are one bad write from losing work (it already
  happened twice).
- [HIGH] No hosted/zero-install demo. Scientific teaching tools live or die on
  "let me see it in 30 seconds." A backend + LocalColabFold + GPU requirement
  kills casual evaluation and most contributions.
- [HIGH] Setup fragility/heft (LocalColabFold, MMseqs2, optional OpenMM) raises
  contributor friction.
- [MED] Repo hygiene: large PDFs, logs, prediction caches, and many overlapping
  HANDOFF_*.md files make the project look like a scratchpad, not a product.
- [MED] Identity confusion: "Amino Arcade" vs "3d-companion" vs "AlphaFold" - pick
  one name and a one-line promise.

Red-team ("a skeptic says it's just a thin shell over Mol* + ColabFold"):
- Rebuttal: the value is the honest *diagnostics layer* (analysis.py, the lens
  model, the truth-labels contract) + the pedagogy, which nothing else does. But
  the repo must SHOW that immediately or the skeptic wins by default.

What's already good for OSS: MIT license, CI, tests across backend + frontend
libs, clean separation of concerns, builds on Lindy-stable deps (Mol*, ColabFold).

Viability verdict: viable and genuinely differentiated AS AN EDUCATIONAL PROJECT,
conditional on: (1) fix git + commit, (2) a zero-install demo using BUNDLED CACHED
real runs (one success + the GFP lesson) so the lenses work with no backend, (3) a
guided first-timer tour, (4) repo cleanup + single identity. The science is the
hard part and it's done; distribution/onboarding is the unfinished and decisive
part.

================================================================================
## E. Next hard parts (specified) + scaffolding for Codex

HARD (do carefully; high value):
H1. Execute + cache real MSA folds (unblocks B.1 and the whole "see a success"
    story). Use scripts/run_mmseqs_sanity_gate.py on a configured box for insulin
    (small, fast) first; gate it with backend/sanity_gate.py; cache a SMALL result
    fixture (trim PDB text if large) the frontend can load with NO backend. This
    is the single highest-impact next step for both pedagogy and demo.
H2. Zero-install demo mode: a frontend flag that loads bundled cached results
    (H1) instead of calling the backend, so a reader sees real lenses immediately.
    Wire to the existing result-loading path; do not fork the rendering.
H3. Global-max displacement normalization (prior handoff 3.1): add
    max_displacement_overall to build_analysis; thread a globalMax through
    lensColors.groupResidueColors and lensModel; keep per-frame max in the legend.
    Add a test asserting equal Angstrom -> equal color across frames.
H4. Physics endpoint error hardening: ensure POST /api/physics/local-relaxation
    catches OpenMM/forcefield failures on nonstandard residues and returns a
    structured 422, never a 500. Add a backend test with an unparametrizable PDB.

SCAFFOLDING (mechanical / needs env; clear specs):
S1. Guided "necessity-first" tour (the novice fix, C.1/C.5): a step sequence
    Recycling -> Coevolution -> Triangle -> IPA -> FAPE -> Confidence, each step
    focusing one lens, showing its q/boundary/citation (already in App.jsx lens
    defs) as an "earned" card, with prev/next. Pure UI over existing data.
S2. In-context glossary (C.3): surface paperGrounding.js glossary as hover/tap
    "what's this?" chips next to pLDDT/PAE/FAPE/IPA/recycle labels.
S3. Success-first example ordering + a one-line "what to notice" per target
    (targets.js already has concept + expectation; add a `notice` string).
S4. Git repair + commit (BLOCKER, D): get the tree under working version control,
    commit Codex's current state, then enforce the .gitignore (caches/logs/PDFs).
S5. Repo identity + README hero: one name, one-line promise, a GIF of a lens
    evolving, and the zero-install demo link (after H2).
S6. CI: add httpx to the backend install (TestClient needs it) - prior handoff S2.
S7. Media export watermark - only when GIF/WebM/screenshot export is added.

Suggested order: S4 (git) -> S6 (cheap CI) -> H4 (cheap risk removal) -> H1+H2
(the demo + success story) -> S1+S2+S3 (novice onboarding) -> H3 (polish) -> S5.

Honesty guardrails remain in force: teaching-sim / AF2 inference / alignment /
confidence / relaxation stay SEPARATE; never narrate recycles or OpenMM as folding.
