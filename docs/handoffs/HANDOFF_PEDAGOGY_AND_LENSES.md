# Implementation Plan — Pedagogical Overhaul + Live Lens Overlays

**Date:** 2026-06-19
**Author:** Claude (working session with Yash)
**Inputs:** `work/advisory-5.5pro/output.md` (GPT-5.5 Pro audit), direct code read of `frontend/src/App.jsx`, `frontend/src/lib/conceptMath.js`, `backend/adapters.py`, `backend/pdb_utils.py`, and forensic analysis of the failing example-2 job `prediction-cache/jobs/94e52501-0d98-40be-b21e-44f2bd377cf8.json`.
**Product direction (decided this session):**
1. **Lenses-first.** The evolving six-lens overlay is the headline. Honest computed diagnostics are the *substrate* that makes the lenses real, not a competing feature.
2. **Both MSA + curation.** Add an MSA-backed run path so flagship proteins actually fold, *and* explicitly label which curated examples are "success" demos vs deliberate "low-confidence lessons."
3. This document is a **plan only** — no code was changed.

> How to read this: Part 3 (the sanity check) is first because it changes how you should interpret everything else. Part 1 is the fix list. Part 2 is the lens system. Part 4 is MSA + examples. Part 5 sequences the work. Citations to the audit are `[audit §N]`; code citations are `file:line`.

---

## Part 3 — Sanity check: do the current snapshots make sense?

**Short answer: the snapshots are real and honestly produced, but the run you looked at was scientifically doomed before it started, and a viewer bug makes the little real signal there is look like aimless spinning.** Three independent problems stacked on top of each other.

### 3.1 Root cause #1 — the run had no MSA (the decisive one)

The exact command stored in the job (`result.meta.command`) was:

```
colabfold_batch --num-recycle 8 --num-models 1 --msa-mode single_sequence \
  --model-type alphafold2_ptm ... query.fasta out
```

`--msa-mode single_sequence` means AlphaFold saw **one sequence and no evolutionary alignment**. GFP (your example 2, `MSKGEELFT…`, 236 residues) only folds in AlphaFold because the coevolutionary statistics of its homolog family encode which residues touch. Remove the MSA and you remove essentially all of the folding signal. This is not a bug — it is the single biggest determinant of AF2 quality, and the whole point of the "Coevolution" lens.

The ColabFold log embedded in the job proves it never converged to anything good:

| recycle | pLDDT | pTM | tol (Å) |
|--:|--:|--:|--:|
| 0 | 25.6 | 0.168 | — |
| 1 | 25.2 | 0.183 | 9.23 |
| 2 | 25.4 | 0.185 | 4.49 |
| 3 | 25.9 | 0.189 | 2.25 |
| 4 | 25.3 | 0.182 | 5.92 |
| 5 | 25.9 | 0.191 | 6.80 |
| 6 | 26.1 | 0.201 | 1.48 |
| 7 | 26.4 | 0.217 | 1.73 |
| 8 | 26.4 | 0.227 | 1.64 |

pLDDT 25→26 and pTM 0.17→0.23 is "the model is guessing." For context, GFP with a real MSA folds to pLDDT ~90. **The score "stays around 25" because there is nothing to be confident about.** That is the correct, honest behavior of AF2 on a no-MSA input — and it is a *fantastic* teaching moment, but only if the UI frames it as one instead of presenting it as a fold that should have worked.

### 3.2 Root cause #2 — the viewer never superposes consecutive frames (the "rotating" illusion)

I recomputed Cα RMSD between recycle frames two ways from the cached coordinates: raw (as stored) and after Kabsch alignment (rigid-body rotation+translation removed):

| frame | raw RMSD → final | Kabsch RMSD → final | Kabsch RMSD → prev | centroid shift |
|--:|--:|--:|--:|--:|
| 0 | 23.85 | 17.58 | — | 6.55 |
| 1 | 12.99 | 10.53 | 14.43 | 1.82 |
| 2 | 6.29 | 6.04 | 8.29 | 0.63 |
| 3 | 14.40 | 4.50 | 3.53 | 1.35 |
| 4 | 11.21 | 10.38 | 9.76 | 1.83 |
| 5 | 17.37 | 5.62 | 11.83 | 1.07 |
| 6 | 7.33 | 4.40 | 2.24 | 0.86 |
| 7 | 6.56 | 2.38 | 2.68 | 1.17 |
| 8 | 0.00 | 0.00 | 2.38 | 0.00 |

The gap between raw and aligned columns (e.g. frame 3: 14.40 raw vs 4.50 aligned; frame 5: 17.37 vs 5.62) is **rigid-body tumbling**. Each recycle PDB comes out of ColabFold in its own arbitrary global orientation, and `MolPlayfield.load()` only resets the camera on the *first* load (`App.jsx:1424`, `resetCamera: !frameToFrame`) — it never *aligns the coordinates* of frame N to frame N−1. So when you scrub recycles, most of what your eye tracks is the whole blob spinning, not internal change. This is a pure viewer bug, fixable independently of prediction quality, and fixing it is also the literal demonstration of the **IPA / SE(3) lens** (see §2, lens 3).

### 3.3 Root cause #3 — even aligned, it's a non-converging molten blob

After removing rotation, the aligned RMSD-to-final still bounces non-monotonically: 17.6 → 10.5 → 6.0 → 4.5 → 10.4 → 5.6 → 4.4 → 2.4 → 0. A healthy fold converges monotonically toward a stable basin. This one wanders. Radius of gyration stays ~21–22 Å for all 9 frames (a real GFP β-barrel is ~17 Å; a 236-residue *extended* chain would be ~60 Å+). So the structure is neither extended-then-collapsing (there is no dramatic folding to film, exactly as `[audit §1]` warns) nor converging to a real barrel. It is a compact-but-wrong glob jittering in place. **Your perception — "rotating around but not really changing structure" — is literally correct.**

### 3.4 Root cause #4 — the six-lens data is empty on real runs

Every real frame's `observables` is `{confidence: <pLDDT>, triangleViolation: null, ipaInvariantError: null, fape: null, recycleDelta: null, constraintViolations: 0}` (`backend/adapters.py:172`). Only `confidence` (mean pLDDT) is real. The teaching path hardcodes the rest (`adapters.py:323` sets `triangleViolation: 0.12, fape: 0.38, recycleDelta: 0.05`). On the frontend, the lens metrics during a real run are also synthetic — `App.jsx:1044` shows `ipa: "residual < 1e-12"`, `fape: "0.18"`, and `recDelta()` returns a hardcoded geometric series `[1, 0.4, 0.16, 0.064, 0.026, 0.01]` (`App.jsx:626`). **So the "concept overlay is missing for the six ideas" because there was never any real per-frame lens computation — the overlays are decorative.** This is the central thing Part 2 fixes.

### 3.5 Verdict

The tool is doing real science correctly; the disappointment is a stack of fixable framing/engineering gaps:
- The run should have used an MSA (Part 4).
- The viewer must superpose frames (Part 1.1 / lens 3).
- The lenses must be computed from real coordinates and evolve (Part 2).
- A bad prediction must be *taught*, not hidden (Part 1.5).

Nothing here requires faking motion. Everything the audit feared (`[audit §7]` "do not inflate coordinate deltas," "do not build an extended-chain→fold animation") is avoidable while still delivering visible, evolving, honest lenses.

---

## Part 1 — Pedagogical improvements & code fixes

Ordered by impact-to-effort. Each item cites the audit and the exact code site.

### 1.1 Superpose recycle frames (Kabsch) — **do this first**
**Why:** kills the rotation illusion (§3.2); it's the precondition for any lens that compares frames.
**Where:** new `frontend/src/lib/superpose.js` (Kabsch on Cα); call site in `MolPlayfield.load()` (`App.jsx:1364`).
**How:** when advancing frame N, compute the rigid transform that best fits frame N's Cα onto a fixed reference (recommend the **final** recycle as reference, so the trajectory visibly settles into its endpoint), apply it to the coordinates before handing the PDB string to Mol*, and never reset the camera between frames. Alternatively use Mol*'s built-in `alignAndSuperpose` across loaded structures, but a one-function Cα Kabsch is simpler and unit-testable.
**Honesty note `[audit §7]`:** this is alignment, not interpolation — no frames are invented, no deltas amplified. Label the viewer "frames superposed on final recycle (rigid alignment only)."
**Validation:** unit-test Kabsch against a known rotation of a synthetic structure (RMSD → 0); assert raw vs aligned RMSD matches the table in §3.2.

### 1.2 Compute real per-frame metrics in the backend
**Why:** replaces the `null`/hardcoded observables (§3.4) with truth; feeds both the metric strip and the lenses.
**Where:** new `backend/analysis.py`; wire into `backend/adapters.py` where frames are assembled (around `:172`). Expose under a separate `analysis` object keyed by `(model_id, recycle_index)`, **not** bolted into `observables` `[audit §6 backend]`.
**Compute (all from Cα + pLDDT + PAE already present):** mean/median pLDDT, ΔpLDDT vs previous, RMSD-to-previous, RMSD-to-final (Kabsch), max residue displacement, Cα contact count, contact Jaccard-to-final, low-confidence fraction (pLDDT<50 and <70). Schema per `[audit §2]`.
**Validation:** synthetic frames with known RMSD; snapshot-test the metrics JSON.

### 1.3 Rename misleading real-run labels `[audit §2, §6]`
- `FOLD SCORE` → `DISPLAY CONFIDENCE` (or `MEAN pLDDT`) on real runs. Site: `App.jsx:1206` (`hasReal ? Math.round(cMeanP) : cscore`) and the score modal title `App.jsx:1230`. Keep "FOLD SCORE" only in teaching mode where the composite (`scoreParts`, `App.jsx:1050`) is honestly synthetic.
- `contactProbabilities()` → `contactProximityScore()` (`App.jsx:350`): it's a geometric proximity heuristic, not a probability.
- `ranking_score` fallback → `mean_plddt_rank_proxy` (`App.jsx:317`): AF2 has no AF3 ranking_score; the current fallback to mean pLDDT should say so.
**Validation:** text snapshot tests.

### 1.4 Fix PAE "pin both residues" `[audit §2, §6]`
**Bug:** copy says "Click a PAE cell to pin both residues" (`App.jsx:908`) but `applyLensAnnotations()` highlights only `residues[0]` (`App.jsx:1353`, `const seqId = residues[0]`). Also `highlightOnly` is a transient hover-highlight that clears on mouse-move — it should be a persistent selection/representation.
**Fix:** build the selection from *all* `residues` (loop, not `[0]`), and use a durable mechanism (add a colored representation component or use the selection manager) so the pin survives. This is a prerequisite for the PAE lens being a flagship feature.
**Validation:** smoke test that both clicked residues are highlighted and persist after pointer move.

### 1.5 Low-confidence lesson card `[audit §2, §5]`
**Why:** turns the §3.1 GFP failure from a dead end into the lesson. When mean pLDDT < 70 (or low-confidence fraction is high), show a card: "LOW-CONFIDENCE PREDICTION — LEARN FROM IT," explaining MSA dependence, pointing at PAE/contacts/spread. Copy is ready in `[audit §5]`.
**Where:** new `ResultInspector`/`LessonCard` surface; trigger off the real `analysis.low_confidence_fraction`.
**Validation:** stub a low-pLDDT result, assert the card appears.

### 1.6 Freeze the language contract — `truthLabels.js` `[audit §8.1]`
**Why:** stop every component inventing its own wording for recycles, pLDDT, PAE, MD. One source of truth consumed by badges, tooltips, the metric strip, exports.
**Where:** new `frontend/src/lib/truthLabels.js`. Seed it with the copy pack in `[audit §5]` (recycle badge, low-confidence warning, "why this doesn't look like folding" explainer, contact-delta labels).

### 1.7 Backend correctness fixes (do before multichain / reference overlays)
- **Chain-aware PDB parsing** `[audit §6]`: `parse_residue_plddt()` (`pdb_utils.py:18`) and `parse_ca_trace()` (`pdb_utils.py:32`) key by integer residue number only; key by `(chain_id, residue_number, insertion_code)` instead. Required before hemoglobin multichain (example 6) or RCSB reference overlays.
- **Run-dir collisions** `[audit §6]`: `_run_dir()` uses `sequence[:28]` alphanumeric only (`adapters.py:156`) — related constructs collide and overwrite `query.fasta`/`out`. Use the existing cache key or a SHA prefix.
- **Single-flight real jobs** `[audit §6]`: `temporary_env()` mutates process-wide env (`adapters.py:30`); the queue spawns a daemon thread per job, so concurrent real runs race env values. Add a real-job semaphore/worker so only one ColabFold job runs at a time.
- **Option-aware cache hydration** `[audit §6]`: pass `job["options"]` into `load_cached_prediction()` so option-specific results survive reload/compaction.
- **Split validation from preflight** `[audit §6]`: `validate_sequence()` (`adapters.py:73`) always preflights as `localcolabfold` even for the teaching engine; separate generic sequence validation from engine-specific guardrails.

### 1.8 App.jsx refactor `[audit §6]`
`App.jsx` is 1,439 lines doing data + teaching sims + job orchestration + charts + Mol* + inspector + export. Split per the audit before the lens work lands, otherwise Part 2 turns it into a knot: `src/data/targets.js`, `src/lib/{superpose,recycleMetrics,contactMap}.js`, `src/components/{MolPlayfield,RecycleTimeline,ContactDeltaMap,PaePanel,ResultInspector,LensOverlay}.jsx`. **Recommendation:** do a *minimal* extraction first — pull `MolPlayfield` and the new lens code into their own files — rather than a big-bang refactor, to keep risk low.

---

## Part 2 — Live, evolving lens overlays (the headline)

**Principle (reconciling your lenses-first choice with the audit's honesty bar):** each lens is bound to a **real per-frame quantity computed from the recycle coordinates / pLDDT / PAE**, rendered as a 3D overlay that **changes as you scrub recycles**. No lens animates fake motion; the "evolution" is the real frame-to-frame change in a real quantity. This is how we get visible drama (`[audit §2]` predicts contact changes are *more* visible than backbone motion) without theater.

Shared infrastructure all lenses depend on: §1.1 superposition, §1.2 backend `analysis`, and a `LensOverlay` component that reads the active frame's analysis and draws into the Mol* canvas (3D primitives via Mol* shapes, or an SVG layer registered to camera). Replace the synthetic `lensMetric`/`recDelta` (`App.jsx:1044`, `:626`) with values read from `analysis`.

For each lens below: **Signal** (what real number drives it) · **Overlay** (what you see in 3D) · **Evolution** (what changes across recycles) · **Boundary** (the honesty caveat, drawn from the existing `defs` in `App.jsx:959`).

### Lens 1 — Coevolution / Contacts
- **Signal:** Cα contact map per frame (threshold ~8 Å, min sequence separation ~6), plus gained/lost/stable vs previous and vs final (§1.2).
- **Overlay:** draw contact pairs as thin lines between Cα in 3D; color newly-gained contacts bright, lost contacts fading. Optional 2D contact-map panel beside it with the Δ tabs from `[audit §2]`.
- **Evolution:** contacts "snap into place" as recycles proceed — on a *good* (MSA) run this is the most legible folding signal you'll get; on the GFP no-MSA run it visibly *fails* to lock in, which is the lesson.
- **Boundary** (`App.jsx:959`): "AF2 learns a pair representation rather than inverting DCA"; the displayed contacts are read off predicted coordinates, and the coevolution *concept* (that touching residues mutate together) is taught separately via the existing 2D planted-matrix toy.

### Lens 2 — Triangle inequality / geometric realizability
- **Signal:** real output coordinates always satisfy the triangle inequality, so the honest live metric is **steric/geometry sanity per frame**: Cα–Cα clash count and gross bond-length outliers (`constraintViolations`, currently always 0 at `adapters.py:178`).
- **Overlay:** flag clashing residue pairs in 3D; small "realizable?" readout reusing the existing teaching widget logic (`conceptMath.trianglePoints`, `App.jsx:743`).
- **Evolution:** violations should trend toward 0 as recycles refine geometry.
- **Boundary** (`App.jsx:959`): "real triangle consistency is over the *pair table / distogram*, not the final coords" — be explicit that this overlay shows output geometry sanity, and keep the distogram-level triangle story in the 2D teaching lens. (If you later expose the distogram from ColabFold, the true distogram-triangle check can become live; note as future work.)

### Lens 3 — IPA / SE(3) invariance ← **directly fixes the rotation bug**
- **Signal:** the rigid transform from §1.1 (rotation R + translation t) that aligns each frame to the reference; the residual (aligned RMSD) is the real invariant quantity.
- **Overlay:** toggle between "world frame" (raw, tumbling) and "aligned frame" (superposed). Show the discarded global R,t as a ghosted axis triad. The lesson writes itself: *the global pose carries no structural information; IPA is built to ignore exactly this.*
- **Evolution:** the aligned residual shrinks toward 0 at the final frame; the global pose jitter is shown to be meaningless.
- **Boundary** (`App.jsx:959`): replace the fake `"residual < 1e-12"` (`App.jsx:1044`) with the real aligned-RMSD per frame.
- **Note:** this lens and §1.1 are the same engineering work — ship them together.

### Lens 4 — FAPE & chirality
- **Signal:** per-residue Frame-Aligned-style error of the active frame vs the final (or vs an RCSB reference when available): build local frames per residue, measure neighbor-position error; plus a chirality/handedness check.
- **Overlay:** color the cartoon by per-residue FAPE-to-final (high error = hot); a chirality badge that flips if a mirror is detected (reuse the existing reflect demo, `App.jsx:772`).
- **Evolution:** the error coloring cools as the structure approaches its endpoint; on the GFP run it stays hot everywhere — the lesson.
- **Boundary** (`App.jsx:962`): "real FAPE is over all atoms in all frames with a clamp"; ours is a Cα/backbone approximation to a reference, clearly labeled. Replace hardcoded `FAPE 0.18/3.6` (`App.jsx:1044`) with the computed value.

### Lens 5 — Recycling
- **Signal:** real `recycleDelta` = Kabsch RMSD-to-previous per frame (the §3.2 "Kabsch RMSD → prev" column), and the pLDDT/pTM trajectory.
- **Overlay:** convergence curve (Δ vs recycle) beside the structure; a "settling" ring whose radius is the real Δ. Replace the synthetic `recDelta()` series (`App.jsx:626`) and the synthetic ring text (`App.jsx:858`).
- **Evolution:** Δ should decay toward a fixed point on a good run; on GFP it stays jagged (1.6–14 Å) — visibly *not* converging, which is the honest result.
- **Boundary** (`App.jsx:963`): "representational iteration, never folding kinetics" — keep this label verbatim; the convergence curve is the single most defensible "trajectory" you have.

### Lens 6 — Confidence (pLDDT / PAE)
- **Signal:** real per-residue pLDDT (already shown) and the PAE matrix (already present).
- **Overlay:** pLDDT cartoon coloring (already done via `uncertainty` theme) + PAE matrix with **both-residue** pinning (§1.4) into 3D.
- **Evolution:** pLDDT recoloring per recycle; PAE block structure sharpening (or not).
- **Boundary** (existing inspector copy is good; tighten the PAE line per `[audit §6]`): "PAE — expected residue-position error after aligning on another residue; useful for domain placement, not a measured motion trajectory."

### Cross-lens UX
- The existing toggle rail (`App.jsx:1110`) and chip system (`App.jsx:1047`) already support multiple active lenses and the "All five lenses" grand-tour example (`App.jsx:976`); they just need to read real data.
- Add a **guided "necessity-first" tour** `[audit §3]`: Recycling → Coevolution → Triangle → IPA → FAPE → Confidence, with an earned interpretation card per lens (the `PEDAGOGICAL_HANDOFF.md` already asks for earned cards).

---

## Part 4 — MSA path & honest example curation

The §3.1 failure is structural: single-sequence inputs can't fold real proteins. Decision: **do both** an MSA path and explicit curation.

### 4.1 Add an MSA-backed run path
Two viable routes (recommend offering A as default, B as the offline/heavy option):
- **A. ColabFold MMseqs2 web API** (`--msa-mode mmseqs2_uniref_env`, the ColabFold default). Lightest to add: drop the forced `single_sequence` and let ColabFold call the public MSA server. Cost: network dependency + external-service honesty note (results depend on the remote MSA). Add a clear provenance line recording which MSA mode produced the run.
- **B. Local MSA databases** (UniRef/env DBs on disk). Best reproducibility and offline; heavy disk/RAM and setup. Gate behind the existing guardrail.
**Plumbing:** `msa_mode` is already a first-class command option (`adapters.py:355`) — surface it in the UI run controls and the cache key, and stop hardcoding `single_sequence` for curated examples. Record MSA depth (Neff) in provenance so the Coevolution lens can show "this is how much evolutionary signal you actually had."

### 4.2 Curate examples into two honest buckets
- **"Folds well (MSA)" demos:** small, fast, high-pLDDT-with-MSA targets where the lenses light up — e.g. Trp-cage (already validated in `work/localcolabfold_*_trpcage*`), a small designed protein, insulin (`work/wslgpu_insulin_smoke.json`). These are where contacts snap in and Δ converges.
- **"Low-confidence lesson" demos:** keep a GFP-style single-sequence run *explicitly labeled* as "what happens without an MSA," wired to the §1.5 lesson card. This is now a feature, not an embarrassment.
- Tag each curated target (`arcadeTargets`, `App.jsx:972`) with `msaMode` and `expectation: success | lesson` so the UI sets honest expectations before the run.
- `[audit §3]` "example selector optimized for pedagogical signal": benchmark each target's contact-change / displacement / PAE visibility and order examples by lesson value, not final pLDDT.

---

## Part 5 — Sequencing (milestones)

**M0 — Truth + correctness (1–2 days).** `truthLabels.js` (§1.6); rename FOLD SCORE / contactProbabilities / ranking_score (§1.3); fix PAE both-residue pin (§1.4); backend chain-aware parsing + run-dir + single-flight (§1.7). Low risk, immediate honesty win.

**M1 — Superposition + real metrics (2–3 days).** `superpose.js` + frame alignment + no inter-frame camera reset (§1.1); backend `analysis.py` real per-frame metrics (§1.2); replace synthetic `recDelta`/`lensMetric` with real values; low-confidence lesson card (§1.5). **This alone fixes your "rotating, score stuck at 25" experience.**

**M2 — Lens system (4–6 days).** Minimal `MolPlayfield`/`LensOverlay` extraction (§1.8); implement lenses 5, 3, 6 first (cheapest — all read metrics that M1 already computes), then 1 (contacts), then 4 (FAPE), then 2 (geometry). Guided tour.

**M3 — MSA + curation (parallel-able with M2).** Enable `mmseqs2` MSA mode (§4.1A); re-run and re-curate examples into success/lesson buckets (§4.2). Re-benchmark.

**M4 — Polish (later).** Ghost final-frame overlay; residue-displacement coloring; RCSB reference alignment; export watermarks; (only much later) the OpenMM physics tab the audit scopes in `[audit §4]`, kept entirely separate from the fold view.

---

## Part 6 — Validation plan

- **Unit:** Kabsch (known-rotation → RMSD 0); contact map (threshold, min separation, gained/lost/stable); metrics JSON snapshot; truthLabels text snapshots.
- **Backend:** chain-aware parse on a synthetic 2-chain PDB with overlapping numbering; option-aware cache hydration; single-flight lock under two concurrent jobs; extend existing `backend/test_backend.py`.
- **E2E (extend, don't replace, the existing smoke test):** PAE click highlights *both* residues and persists; superposed frames don't tumble (assert aligned vs raw RMSD); low-confidence card appears on a stubbed bad run; each lens shows a numeric (non-placeholder) value on a real run.
- **Scientific sanity gate:** re-run GFP with MSA and assert pLDDT jumps well above the 26 ceiling and Δ-to-prev decays monotonically — proof the §3.1 diagnosis was right.

---

## Part 7 — Honesty guardrails (do-not-cross, from `[audit §7]`)

- No extended-chain→fold animation. No inflated/normalized coordinate deltas presented as motion. No frame interpolation unless explicitly labeled as visual-only.
- Never call pLDDT gains "stabilization," "energy," or "folding progress." pLDDT is confidence (EMBL-EBI). Recycling Δ is representational iteration, not kinetics.
- Don't hide the low-confidence GFP run — teach it.
- Keep "collagen-like GPP chain" language (example 4); don't claim native triple-helix collagen.
- Every shared/exported asset carries a provenance watermark (M4).

---

## Open questions for you

1. **MSA route:** start with the ColabFold MMseqs2 **web API** (fast to ship, network-dependent) or go straight to **local DBs** (offline, heavy)? I lean web API for M3, local later.
2. **Superposition reference:** align all frames to the **final** recycle (my recommendation — shows settling) or to **frame 0** (shows departure from the initial guess)? Could be a toggle.
3. **Lens 2 (triangle):** acceptable to render it as *output-geometry sanity* now, and treat the true distogram-triangle check as future work pending distogram export? Or is the distogram-level check important enough to prioritize?
4. **Refactor appetite:** minimal extraction of `MolPlayfield` + lenses now (low risk), or the full `App.jsx` split the audit recommends (cleaner, more churn)?

---

### Source map
- Audit: `work/advisory-5.5pro/output.md` (sections cited inline as `[audit §N]`).
- Failing run analyzed: `prediction-cache/jobs/94e52501-0d98-40be-b21e-44f2bd377cf8.json`.
- Code: `frontend/src/App.jsx`, `frontend/src/lib/conceptMath.js`, `frontend/src/data/paperGrounding.js`, `backend/adapters.py`, `backend/pdb_utils.py` (line numbers as of 2026-06-19).
- Paper grounding (existing): AlphaFold2, Nature 596 (s41586-021-03819-2); pLDDT/PAE definitions, EMBL-EBI; OpenMM docs — per the audit's reference list.
