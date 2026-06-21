# Handoff — onboarding, library expansion, PAE plan, App refactor — 2026-06-21

Continues `HANDOFF_2026-06-21_UI_LIBRARY_PEDAGOGY.md`. Repo:
`D:\Projects\alphafold\3d-companion` (git, branch `main`, no remote yet).

## TL;DR

- **Protein Basics onboarding** implemented as a new self-contained component
  (`ProteinBasics.jsx`), wired behind a `✦ BASICS` nav button.
- **Protein library expanded 7 → 10** with prion (1QLX), p53 DBD (1TUP), and
  HIV-1 protease (1HSG), each with a distinct learning outcome; tests updated.
- **PAE click-to-highlight**: detailed implementation plan in §3 (it is already
  partially wired — clicking a PAE/contact cell highlights residues in Mol*).
- **App refactor**: a real, verifiable first slice landed (the library page and
  onboarding now live in their own components, removing ~45 lines of JSX from
  `App.jsx`); a phased plan for the rest is in §4.

**Verification caveat (important):** the sandbox I worked in has an unreliable
read path on the Windows mount — `node`/`cp` intermittently return *truncated*
bytes for files edited through the editor, so I could not run `npm test`/`build`
against the real files here. Every change was validated another way (see §5).
**You must run `npm run build` + `npm test` on Windows before committing.**

## 1. Protein Basics onboarding

New file `frontend/src/components/ProteinBasics.jsx` — an 8-step overlay with a
small inline diagram per step, prev/next + step dots, and a finish action that
can hand off to the library:

1. amino acids & residues → 2. backbone & N→C direction → 3. side-chain chemistry
→ 4. secondary structure (helix/sheet) → 5. tertiary & quaternary → 6. structure
determines function → 7. why proteins fold + Levinthal/funnel → 8. what AlphaFold
predicts and does **not** (cofactors, partners, modifications, dynamics, kinetics;
read pLDDT/PAE; a structure is not a movie and not a function).

Wired in `App.jsx`: import, `basicsOpen` state, a `✦ BASICS` button in the
ARCADE/FIY/LIBRARY nav group, and an overlay render. The finish button calls
`onOpenLibrary` so beginners flow Basics → Library → a target.

Directly addresses review §6.2 ("add a beginner path before AF2 architecture").

## 2. Library expansion (now 10)

`frontend/src/data/targets.js` — `libraryTargets()` grew 7 → 10. Sequences are
exact RCSB chain-A FASTA (verified 2026-06-21); lengths asserted in tests.

| New target | PDB | Len | Lens | Learning outcome |
|---|---|---|---|---|
| Prion protein | 1QLX | 210 | ipa | disordered tail (low pLDDT) + folded core; the PrP→PrP-Sc disease conversion is invisible to one prediction |
| p53 DNA-binding domain | 1TUP | 219 | coevolution | a protein whose function is binding DNA — the partner (and Zn) are omitted by a monomer fold |
| HIV-1 protease | 1HSG | 99 | triangle | the active enzyme is a homodimer — monomer fold is fine but function lives at the interface (+ inhibitor omitted) |

Full library: lysozyme, calmodulin, Ras, ubiquitin, villin headpiece, TIM barrel,
alpha-synuclein, prion, p53 DBD, HIV protease. Tests in `targets.test.mjs` assert
library length 10, the three new lengths/sequences, `learningOutcome` on every
entry, lens-concept validity, and that the curated set is still exactly 6.

These remain **preview-first** (Mol* preview loads from RCSB; offline Fold needs
caches from `scripts/cache_arcade_examples.py`).

## 3. PAE click-to-highlight — implementation plan

### What already exists
- `state.selectedPae = { i, j, value, source }`.
- `PaePanel` (`onSelect`) and `ContactDeltaMap` (`onSelectPair`) set `selectedPae`.
- `App` passes `selectedResidues: [i+1, j+1]` into `MolPlayfield`.
- `MolPlayfield.applyResidueOverlay()` consumes `selectedResidues` and draws a
  residue overlay; it reacts on change (`componentDidUpdate`).

So **PAE cell → 3D residue highlight already works one-way.** The plan completes
it into a clear, bidirectional, chain-aware interaction.

### Step 1 — Make the highlight legible (forward path)
- In `applyResidueOverlay`, render the two selected residues with *distinct*
  emphasis: residue `i` as the alignment **anchor** (e.g., cyan sphere) and `j`
  as the **uncertain partner** (amber sphere), plus a thin dashed line between
  their Cα. Add residue-number labels.
- Add a small caption near the map: "PAE(i,j): expected error in residue j's
  position when the structure is aligned on residue i = X Å" so the color has a
  sentence.

### Step 2 — Reverse path (3D / bars → map)
- Add an `onResidueClick(resno)` prop to `MolPlayfield`; wire a Mol* click
  handler (loci → label seq id). In `App`, set `selectedPae = { i: r-1, j: r-1,
  source: "viewer" }` and, if a second residue is clicked, form the pair.
- Make `renderPlddtBars()` bars clickable to select residue `i` too.

### Step 3 — Chain awareness (for multimer references)
- Extend the selection model from bare indices to `{ chain, resno }`. For the
  library's HIV protease / p53 (multi-chain biological assemblies), highlight the
  residue in *both* chains, or label which chain. Today everything assumes chain A.
- Thread `pdbChain` (already a prop) through the overlay; map global residue index
  → (chain, auth seq id) once real multi-chain results exist.

### Step 4 — Affordances
- Click empty viewer background or press `Esc` clears `selectedPae`.
- Hover a PAE cell = transient preview; click = sticky selection.
- When `mapMode === "delta"` or `"contact"`, keep the same highlight pathway
  (the `source` field already distinguishes them).

### Step 5 — Tests
- Unit: index → (chain, resno) mapping helper in `lib/` (pure, mount-safe).
- Component/Playwright: click a PAE cell → assert `data-testid="mol-playfield"`
  receives non-empty `selectedResidues`; press Esc → cleared.

### Files
`frontend/src/App.jsx` (selection state + reverse handlers),
`frontend/src/components/MolPlayfield.jsx` (`applyResidueOverlay`, click handler),
`frontend/src/components/PaePanel.jsx` (hover vs click), and a new
`frontend/src/lib/residueSelection.js` (pure mapping + tests).

## 4. App refactor

### Done this pass (verifiable slice)
`App.jsx` was ~140 KB doing everything. Two presentational surfaces were pulled
into their own components, with `App` now delegating:
- `frontend/src/components/LibraryPage.jsx` — the full library grid + Myth→Reality
  panel (props: `colors, defs, targets, onOpen, onClose`). `App.renderLibrary()`
  is now a one-line delegator.
- `frontend/src/components/ProteinBasics.jsx` — the onboarding overlay (new).

This removed ~45 lines of inline JSX from `App.jsx` and establishes the pattern
(presentational component + props; `App` keeps state and passes handlers).

### Phased plan for the rest (review §5.2)
Do each phase on a machine where `npm run build && npm test` runs, and verify
after every slice. Suggested order, lowest-risk first:

- **Phase 1 — data out of App.** Move `conceptDefs`, `glossary`, `equationDeck`,
  and the Myth/Basics content into `src/data/` modules (some already external).
  Pure data; near-zero risk.
- **Phase 2 — lens scenes.** Extract `sceneCoev/Tri/Ipa/Fape/Rec` and their math
  (`coevData`, `ipaData`, `fapeData`, `triMax`, `recShape`, `matInv`) into
  `src/lib/lensMath.js` (pure, unit-testable) + `src/components/scenes/*`. Pass
  the relevant slice of state and an `onChange` callback as props.
- **Phase 3 — prediction orchestration (highest value).** Extract `runFold`, the
  job pollers, and `createPredictionJob`/report wiring into
  `src/state/usePredictionJob.js` (hook) or a small controller class. This is the
  part the review most wanted isolated; it also makes folding testable.
- **Phase 4 — layout split.** Break the render into `<ArcadeHeader>`,
  `<ViewerStage>` (Mol* + chips + legend + fullscreen), `<ReadoutPanel>`
  (metrics + bars + map + trajectory), `<TrajectoryFooter>`.
- **Phase 5 — optional.** Once pieces are isolated, consider converting `App`
  from a class to a function component with hooks.

Guardrails: keep `MolPlayfield` untouched where possible; one phase per commit;
`node --check` + `npm run build` + `npm test` + a screenshot after each.

## 5. Verification status

Ran here (mount-safe / isolated):
- `node --check` passes for `App.jsx`, `ProteinBasics.jsx`, `LibraryPage.jsx`.
- New library entries + all sequence lengths (210/219/99 and the earlier seven)
  validated in isolated node scripts.
- Confirmed via the authoritative editor view that `targets.js` is complete
  (L1–L10, array closes) and `App.renderLibrary` delegates with no leftover body.

Could NOT run here (mount read returns truncated bytes intermittently):
- `npm run lint` / `npm test` / `npm run build`. The `node --test targets.test.mjs`
  failures seen in-session were truncated-read artifacts, not code errors.

Run on Windows before commit:
```powershell
cd D:\Projects\alphafold\3d-companion
Remove-Item -Force .git\index.lock   # if present (stale sandbox lock)
cd frontend
npm ci
npm run lint
npm test -- --run    # targets.test.mjs now asserts the 10-entry library
npm run build        # REQUIRED — compiles App.jsx + the two new components
```
Click-test: `✦ BASICS` opens the 8-step path and its finish button opens the
library; `▦ LIBRARY` shows 6 lens-tour + 10 reference cards; opening prion/
alpha-synuclein shows low pLDDT; a PAE cell click highlights residues in Mol*.

## 6. Files changed/added this pass

- `frontend/src/components/ProteinBasics.jsx` — NEW (onboarding)
- `frontend/src/components/LibraryPage.jsx` — NEW (extracted library page)
- `frontend/src/data/targets.js` — +3 sequences, `libraryTargets()` → 10
- `frontend/src/data/targets.test.mjs` — library tests → 10
- `frontend/src/App.jsx` — imports, `basicsOpen` state, `✦ BASICS` button,
  `ProteinBasics` render, `renderLibrary` now delegates to `LibraryPage`

## 7. Commit

```powershell
cd D:\Projects\alphafold\3d-companion
git add -A
git status
git commit -m "feat: protein-basics onboarding, +3 library proteins, extract LibraryPage/ProteinBasics (App refactor slice)"
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```
Still need your GitHub URL to set the remote and push.

## 8. Risks / notes

- `App.jsx` changes are validated by `node --check` only; the Windows `npm run
  build` is the real gate (esp. the new `h(ProteinBasics …)` / `h(LibraryPage …)`
  call sites and the delegated `renderLibrary`).
- `ProteinBasics` uses `useState` (function component) — first hook-based
  component in the tree; fine with the installed React, but confirm in the build.
- New library targets share lens `concept`s with curated ones; the guided tour
  uses `findIndex`, so it still selects the curated target first.
- Multi-chain references (HIV protease, p53) are previewed as chain A only; full
  quaternary highlighting is part of the PAE plan (§3, Step 3).
