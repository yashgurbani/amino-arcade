# SPEC — FoldYourProtein: a scientifically honest AlphaFold2 game companion

Status: design spec for the next major version (v3). Supersedes the "next steps" framing in `docs/handoffs/HANDOFF_CLAUDE_CODE.md` where noted.
Audience: the developer/agent who builds this, and the physicist-artist who owns the product.
Companion documents: `IMPLEMENTATION_PLAN.md` (how + when), `docs/handoffs/PEDAGOGICAL_HANDOFF.md` (why + what to teach).

---

## 0. The one-paragraph thesis

The repo already contains two good things that do not talk to each other. `frontend/src/lib/conceptMath.js` has *real, tested* mathematics for the five core AlphaFold2 ideas (coevolution via precision-matrix inversion, the triangle inequality, an exact IPA SE(3)-invariance proof, FAPE-under-reflection, recycling as a fixed-point). And `ResultsCompanion.jsx` has a *gamified* folding loop with missions, playback, a score, and provenance. But the game loop is driven by `buildFoldingFrames` — nine hand-tuned easing curves that are disconnected from the real math. So the part that is scientifically real is not a game, and the part that is a game is not scientifically real. **The central move of v3 is to delete `buildFoldingFrames` and drive the game from the real concept-math, so that every number the player sees is computed from a model they can inspect.** Everything else — Mol\*, reactive missions, trajectory ingestion, real inference — hangs off that spine.

---

## 1. What exists today (honest baseline)

This corrects two stale claims in the current handoff. Read it as the starting line, not a critique.

### 1.1 Backend (`backend/`)

- `app.py` — FastAPI app, CORS open, endpoints: `/health`, `/api/backend/capabilities`, `/api/predict`, `/api/predict/jobs` (+`/{id}`), `/api/predict/status`, `/api/compare`, `/api/examples` (+`/{id}`). Clean and small.
- `prediction_engine.py` — the educational simulator. This is *genuinely good physics*: NeRF backbone placement with correct bond lengths/angles, Chou–Fasman propensity-based secondary-structure assignment, deterministic pLDDT profile. `test_backend.py` verifies bond geometry to ±0.02 Å. It is honest about being a teaching tool, not AF2.
- `adapters.py` — engine registry + real subprocess adapters for `localcolabfold` (`colabfold_batch`) and `minalphafold2` (overfit-single-pdb smoke), capability detection via `*_BIN` env vars, sequence sanitation/validation, an 8 GB-VRAM length cap (`AF_COMPANION_MAX_SEQUENCE`, default 150).
- `job_queue.py` — in-memory threaded job runner with a JSON disk cache keyed by `sha256(engine:sequence)`. No cancellation, no logs, no persistence across restart (jobs dict is memory-only; cache survives).
- Cached artifacts exist: `prediction-cache/*.json` and two real minAlphaFold2 run PDBs under `prediction-cache/runs/minalphafold2/`.

### 1.2 Frontend (`frontend/src/`)

- `lib/conceptMath.js` + `lib/conceptMath.test.mjs` — **the crown jewels.** Real math, real tests (invariance to 1e-9, triangle realizability, FAPE reflection penalty, recycling monotonicity).
- `components/ConceptPanels.jsx` — five interactive teaching panels that *use* `conceptMath`. Sliders + heatmaps + SVG scenes. These are the scientifically honest surface.
- `components/ResultsCompanion.jsx` — the "FoldYourProtein" game/workbench. **Uses synthetic `buildFoldingFrames`, not `conceptMath`.** This is the disconnect.
- `components/Mini3D.jsx` — hand-rolled SVG projection of the CA trace, confidence-colored. No depth sorting, no surface, not a molecular viewer.
- `data/sceneSpecs.js`, `data/paperGrounding.js`, `data/exampleFallbacks.js` — paper grounding (equations, glossary, references to the Nature paper + supplement + a companion guide PDF).
- `App.jsx` — routes between concept panels and the workbench; defaults to the workbench.

### 1.3 Corrections to the current handoff

| Handoff says | Reality |
|---|---|
| "Replace `buildFoldingFrames` with pure concept-math modules (they don't exist yet)" | The concept-math already exists and is tested in `conceptMath.js`. The work is *wiring*, not *authoring from scratch*. |
| "minAF2 smoke succeeded previously" | Confirmed — two real predicted PDBs are cached on disk. The path works; it is just not surfaced as a trajectory. |
| "Game loop teaches the paper" | The game loop teaches a *plausible-looking curve*. It does not currently compute anything from a model. |

This is good news: the hard, error-prone part (correct math) is done. The remaining work is integration, a real viewer, and inference plumbing.

---

## 2. Product principles (inherited, sharpened)

From `PRODUCT.md`: precise, calm, instrument-like; scientific honesty above all; linked representations; teach through manipulable invariants. v3 adds three sharper rules:

1. **No number without a model.** Every value displayed in the game (confidence, FAPE, triangle violation, covariance) must be the output of a function the user can open and inspect. If we can't compute it honestly, we don't show it as a metric — we show it as narration.
2. **Provenance is a type, not a badge.** Every structure carries a `provenance` object through the whole stack (backend → API → UI → report). The badge is a *render* of that type. You can never accidentally show a simulated structure as real because the type travels with the data.
3. **The game is a lens on the math, never a replacement.** The "fold" the player watches is explicitly a *optimization/refinement trajectory over a teaching model*, with a permanent, non-dismissible label distinguishing it from AF2 internals. We make the abstraction visible, not hidden (this is the anti-reference: spectacle that doesn't encode state).

### Scientific honesty contract (the line we never cross)

- We **never** claim the teaching optimizer reproduces AlphaFold2 internals or predicts real structures.
- We **never** color a simulated/teaching structure with the same provenance treatment as a real AF2-family run.
- pLDDT is described as predicted local reliability, **not** folding probability or free energy. PAE is domain-placement confidence, not error in Å of a single atom.
- When a real engine is unavailable, we fall back to cached or simulated output **and say so in the same view**, never silently.

---

## 3. Target architecture

### 3.1 The spine: a single trajectory abstraction

Define one data structure that *both* the teaching engine and real engines produce. The game renders this; it does not know or care which engine made it.

```ts
// frontend/src/lib/types (documented in JSDoc; this repo is JS not TS)
FoldTrajectory = {
  provenance: Provenance,          // see §3.4 — the honesty type
  sequence: string,
  frames: FoldFrame[],             // ordered; index 0 = initial, last = final
  meta: { engine, version, runtime, cacheKey, command? }
}

FoldFrame = {
  step: number,
  label: string,                   // "MSA seed", "Recycle 2", ...
  // structure (optional per frame; real engines may only give endpoints)
  pdb?: string,                    // full atoms when available
  ca?: number[][],                 // CA trace fallback for cheap rendering
  plddt: number[],                 // per-residue
  pae?: number[][],
  // concept-math observables — ALL computed, never hand-tuned:
  observables: {
    covariance: { matrix, contacts, indirectPair },   // from coevolutionMatrices()
    triangleViolation: number,                          // max over sampled triples
    ipaInvariantError: number,                          // residual after global transform
    fape: number,                                       // frame-aligned point error vs target/self-consistency
    chiralitySatisfied: boolean,
    constraintViolations: number,                       // clash/geometry count
    confidence: number                                  // mean pLDDT
  }
}
```

This is the contract that resolves the §0 disconnect. `buildFoldingFrames` is replaced by `buildTeachingTrajectory(sequence, mission)` which calls `conceptMath` functions to fill `observables`. Real engines fill the same shape; when an engine only returns endpoints, `frames` has length 1–2 and the game presents fewer steps rather than faking intermediate ones.

### 3.2 Concept-math, promoted and extended

Move/extend `conceptMath.js` into a small library `frontend/src/lib/foldingGameMath.js` (per the handoff's requested filename) that re-exports the existing functions and adds trajectory builders:

- `buildTeachingTrajectory(sequence, missionId)` — produces a `FoldTrajectory` where each frame's `observables` come from the real functions, parameterized by a refinement variable `t`. Example: triangleViolation falls because we *actually relax a pair-distance matrix*; FAPE falls because we *actually run the FAPE computation* against a stabilizing target; covariance contacts come from the *actual precision-matrix inversion*.
- New honest modules to add (these are the scientific upgrade the handoff asks for in §"Scientific Accuracy Boundaries"):
  - **MSA/contact module** — synthesize a small MSA from a planted contact set, compute empirical covariance, invert to precision, show direct-vs-indirect. (`coevolutionMatrices` is the seed; extend to sequence-derived MSAs.)
  - **Triangle relaxation module** — maintain an N×N pair-distance matrix; each step, find the most-violated triple and apply a triangle-multiplicative update; expose the violation curve. (`trianglePoints` is the 3-point seed.)
  - **IPA module** — already exact for invariance; extend to show query/key points in two residue frames and the distance-biased attention weight, plus the invariance residual under a random global transform (should be ~0; that *is* the lesson).
  - **FAPE module** — already has reflection; extend to per-frame local-frame error against a target and expose the clamp.
  - **Recycling module** — already a fixed-point demo; connect it to *real* cached intermediate structures when an engine provides them (see §3.3).

Keep every new function pure and tested beside `conceptMath.test.mjs`. **Same output shape rule:** the UI binds to `observables`, so math can evolve without UI churn.

### 3.3 Real outputs flow into the same spine

- If a prediction response includes a `trajectory`, the game uses it directly (frames = real per-recycle structures).
- LocalColabFold can emit per-recycle PDBs; parse them into frames. When it only emits the final model, trajectory length = 1 and the UI shows "endpoint only — this engine does not expose intermediates."
- minAlphaFold2 overfit run can expose optimization steps; surface them as frames where available.
- The teaching trajectory is the fallback **only** when the selected engine cannot expose internals, and it is labeled as such.

### 3.4 The honesty type

```ts
Provenance = {
  kind: "real-af2" | "real-arch-smoke" | "fallback-model" | "teaching-sim" | "cached",
  engine: string,            // "localcolabfold" | "minalphafold2" | "esmfold" | "educational-simulator"
  label: string,             // "REAL: LocalColabFold", "SIMULATED: teaching", ...
  tone: "success" | "info" | "warning",
  claims: string[],          // what this output CAN support
  disclaimers: string[],     // what it CANNOT support
  source?: string            // cache key / run dir / command
}
```

Backend constructs this; UI only renders it. This makes principle #2 enforceable: a teaching structure literally cannot be constructed with `kind: "real-af2"`.

### 3.5 The molecular viewer

Replace `Mini3D.jsx`'s SVG projection with **Mol\*** (`molstar`) for the result/structure surface, while *keeping* lightweight custom Three/R3F or SVG overlays for the concept diagrams (contact pairs, triangle triplets, local frames, FAPE ghost). Rationale (per handoff step 2): Mol\* gives depth-correct cartoon/surface rendering, pLDDT coloring, selection, and PAE views for free, and is the standard the target user already trusts. The concept overlays stay custom because Mol\* is not a diagram tool. This is the one heavy dependency we add; gate it behind code-splitting (the build already warns at 500 kB).

---

## 4. Game design (the pedagogical loop)

The game's job is to make the five invariants *felt*, then connect them to a real fold. The loop:

```
pick a target  →  watch/step the refinement  →  observables update from real math
       ↑                                                      ↓
   run real engine  ←  beat mission objectives  ←  inspect what each number means
```

### 4.1 Modes (make the mode switch decisive — handoff UI note)

- **Learn mode** — mission rail + one concept scene (the `ConceptPanels` content, promoted into the arena) + contextual explanation. Layout collapses the inference console.
- **Fold mode** — target list + Mol\* structure arena + inference console/logs. Layout collapses the teaching scene to a strip.

The current mode switch doesn't change layout much; v3 makes Learn and Fold genuinely different workspaces (CSS grid template swaps, not just a class).

### 4.2 Missions become reactive (handoff step 4)

Each mission gets *objectives evaluated against computed observables*, not vibes:

| Mission | Objective (computed) | Unlock |
|---|---|---|
| Coevolution | Identify the planted contact pair from the precision matrix (not the strongest covariance pair) | "Direct vs indirect coupling" interpretation card |
| Triangle | Drive max triangle violation below ε via the relaxation steps | "Why pair tables must be globally consistent" card |
| IPA | Apply a random global transform and confirm invariant error < 1e-6 | "SE(3) invariance" card |
| FAPE | Make the reflected structure score worse than the aligned one | "Chirality and handedness" card |
| Recycling | Reach the fixed point (Δstructure < δ) before N cycles | "Refinement ≠ folding time" card |

Add a "break it" affordance: let the user toggle a technical parameter (e.g., remove triangle updates, freeze a frame, force reflection) and *watch the relevant observable degrade*. The failure is the lesson.

### 4.3 Scoring

The "fold score" stops being `frame.confidence` from a curve. It becomes a transparent composite the user can expand:
`score = w1·meanPLDDT + w2·(1 − normTriangleViolation) + w3·chirality − w4·clashes`, with each term sourced and the weights visible. Honesty principle #1 applies: clicking the score shows the formula and the live inputs.

---

## 5. Backend / inference target (summarized; detailed in IMPLEMENTATION_PLAN §Real inference)

- **Trajectory-aware responses.** `predict_with_engine` returns the `FoldTrajectory` shape, including `provenance` and (when available) `trajectory` frames.
- **VRAM guardrails (RTX 5060 8 GB).** Enforce max sequence length, max recycles, max model count, templates off by default; pre-flight check that estimates memory and refuses with a clear message rather than OOM-crashing.
- **Job control.** Add cancellation, streamed logs (SSE or polling a log buffer), timeout, and artifact metadata (run dir, command, versions). Persist job records to disk so a restart doesn't lose history.
- **LocalColabFold setup.** The blocker is host setup (WSL `ext4.vhdx` attach failure / `colabfold_batch` not on PATH). Plan provides three unblock paths: fix WSL, use a native-Windows `LOCALCOLABFOLD_BIN`, or run the backend itself inside WSL/Docker. All three covered in the implementation plan.
- **Provenance report endpoint.** `GET /api/predict/jobs/{id}/report` returns the full provenance: engine, version, command/config, runtime, cache key, input sequence, warnings, artifact paths (handoff step 6).

---

## 6. Non-goals (scope discipline)

- Not training or fine-tuning any model. minAlphaFold2 overfit smoke stays a smoke test.
- Not a general MSA server; synthetic/cached MSAs for teaching, MMseqs2 only via LocalColabFold when configured.
- Not a cloud product. Local-first, single-user workstation. No auth, no telemetry.
- Not a replacement for the AlphaFold paper or ColabFold; a companion to them.

---

## 7. Acceptance criteria for "beyond a toy"

v3 is done when:

1. The game's observables are 100% computed by inspectable functions; `buildFoldingFrames` is deleted; `grep buildFoldingFrames` returns nothing.
2. Every mission has a computed objective and unlocks its card only when the objective is met.
3. The result arena renders real structures in Mol\* with pLDDT/PAE coloring and selection; concept overlays still work.
4. A LocalColabFold run (on a correctly configured host) returns a real `FoldTrajectory` with `provenance.kind = "real-af2"` and, where available, per-recycle frames — verified end-to-end by an automated test using a stubbed `colabfold_batch`.
5. VRAM guardrails refuse oversized jobs with a clear message instead of crashing (tested with a mocked capability probe).
6. The provenance report endpoint returns complete metadata and the UI renders it.
7. `npm test`, `npm run lint`, `npm run build`, and `python -m unittest backend.test_backend` all pass, plus new tests for trajectory shape, mission evaluation, guardrails, and provenance typing.

---

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Mol\* bundle size blows the build budget | Lazy-load via dynamic import; route-split Fold mode; keep Learn mode Mol\*-free. |
| Teaching trajectory still "feels" like a fold and misleads | Permanent non-dismissible provenance label; "what this is / isn't" card pinned in the arena; score formula always inspectable. |
| LocalColabFold stays blocked on this host | Ship stubbed-binary tests + cached real outputs so the path is provably correct even when the host can't run it; document all three unblock routes. |
| Concept-math creep makes the math wrong | Every new function gets a test asserting the *property* (invariance, monotonicity, realizability), not just a value. |
| Scope sprawl from "creative options" | Creative ideas live in `docs/handoffs/PEDAGOGICAL_HANDOFF.md` as a backlog, gated behind the v3 acceptance criteria. |

---

## 9. Sources

- Jumper, J., Evans, R., Pritzel, A. et al. "Highly accurate protein structure prediction with AlphaFold." *Nature* 596, 583–589 (2021). https://doi.org/10.1038/s41586-021-03819-2 — and its Supplementary Information (Algorithms 1–32; IPA = Alg. 22; FAPE = §1.9.2).
- ColabFold / LocalColabFold: Mirdita, M. et al. "ColabFold: making protein folding accessible to all." *Nature Methods* 19, 679–682 (2022). https://github.com/YoshitakaMo/localcolabfold
- minAlphaFold2: https://github.com/ChrisHayduk/minAlphaFold2 (architecture-faithful teaching reimplementation).
- Mol\* viewer: https://molstar.org — Sehnal, D. et al. *Nucleic Acids Research* 49, W431–W437 (2021).
- ESMFold: Lin, Z. et al. "Evolutionary-scale prediction of atomic-level protein structure with a language model." *Science* 379, 1123–1130 (2023).
- Repo internal: `PRODUCT.md`, `DESIGN.md`, `docs/handoffs/HANDOFF_CLAUDE_CODE.md`, `frontend/src/lib/conceptMath.js`, `frontend/src/data/paperGrounding.js`.
