# Amino Arcade — Implementation Handoff (Next Steps)

_Last updated: 2026-06-19_

This handoff covers the state of the Amino Arcade frontend after porting the
Claude Design prototype (`work/design-handoff/Amino Arcade.dc.html`) onto the
real LocalColabFold + Mol* backend, plus a prioritized list of what to do next.

Read first: `CLAUDECODE_BACKEND_HANDOFF.md` (backend contract + scientific
language rules). This file is the *frontend / next-iteration* companion to it.

---

## 1. Current state — what works

- `frontend/src/App.jsx` is a class-component port of the prototype's arcade
  cockpit: marquee, ARCADE/FIY switch, six protein chips, transparent SCORE
  popup, protein strip, LIVE LENSES rail, LIVE READOUT panel (stats, per-residue
  pLDDT, contact/PAE map, trajectory chart), flipper controls, and all five
  interactive concept scenes (coevolution / triangle / IPA / FAPE / recycling).
- The six named arcade targets are real foldable sequences (Insulin B-chain,
  GFP, Myoglobin, Collagen peptide, T4 Lysozyme, Hemoglobin alpha).
- Central playfield is the **full Mol\* viewer** (zoom/rotate, reset camera,
  axes, expand/fullscreen, screenshot, settings) styled via the precompiled
  `molstar/build/viewer/molstar.css`.
- The stage loads the **reference RCSB structure by PDB id** immediately
  (4INS / 1EMA / 1MBN / 1BKV / 253L / 2HHB), so a real 3D molecule is always
  visible. After a LocalColabFold run, the same viewer swaps to the real
  recycle-PDB frames and the flipper steps through them.
- Verified: ESLint clean, Babel parse OK, frontend unit tests 12/12.

---

## 2. Fixes landed this session

- **api.js envelope unwrap.** Backend wraps payloads (`{job}`, `{result}`,
  `{report}`). `lib/api.js` now unwraps them. This fixed the core "folding does
  not run" symptom: previously `created.id` was `undefined`, so the UI polled
  `/api/predict/jobs/undefined` -> 404 and never showed results even though the
  job was created (`POST 200`).
- **Mol\* upgraded** from a chrome-less viewer to the full AlphaFold-Server-style
  UI, and given RCSB-by-id loading as the default view.
- **Honest 400 surfacing.** The 150-residue guard message now reaches the error
  banner instead of failing silently.

---

## 3. Open items / next steps (prioritized)

### P0 — confirm the happy path on real hardware
1. Start backend via `scripts/Start-Backend-LocalColabFold.ps1` and the
   frontend via `npm run dev`. Note: the build/dev cannot run in the Claude
   sandbox because `node_modules` holds Windows-native rolldown binaries — run
   on the Windows host.
2. Click FOLD on **Insulin** (30 aa, fast). Confirm: `POST /api/predict/jobs`
   returns a real id, polling hits `/jobs/<id>` (not `undefined`), recycle
   frames load into Mol\* and the flipper steps through them.
3. Confirm the Mol\* toolbar renders styled (CSS import working) and the side
   panels do not overlap the arcade chrome.

### P1 — fidelity + UX
4. **pLDDT / B-factor cartoon coloring.** Apply AlphaFold's color scheme
   (recycle frames colored by pLDDT, RCSB structures by B-factor) instead of
   Mol\*'s default chain coloring. Hook the existing `◐` color toggle and the
   pLDDT legend HUD to the real Mol\* color theme.
5. **Length-cap decision (GFP / Myoglobin / Lysozyme > 150 residues).** Choose:
   (a) raise `AF_COMPANION_MAX_SEQUENCE` (watch 8 GB VRAM), (b) swap to sub-150
   foldable variants, or (c) pre-disable FOLD for over-limit targets with a
   clear tooltip. RCSB structures already display regardless.
6. **Smooth trajectory playback.** Current playback reloads Mol\* per frame
   (camera re-centers each step). Consider concatenating recycle frames into one
   multi-MODEL PDB, parse once, and step the model index — preserves camera and
   gives true frame-stepping.
7. **Lens overlays on the real structure.** Overlays (coevolution lines,
   triangle, IPA frames, FAPE ring, recycling ring) currently draw on the
   teaching SVG ribbon only. Decide whether to project them onto the Mol\*
   canvas (Mol\* shapes/representations) or keep them as readouts + the
   expandable interactive scenes (current behavior).
8. **Engine fallback.** If `localcolabfold` is unavailable, auto-select an
   available engine instead of posting an unavailable one.

### P2 — cleanup + robustness
9. Delete now-orphaned components: `ConceptPanels.jsx`, `Controls.jsx`,
   `Mini3D.jsx`, `PaperGuide.jsx` (no longer imported).
10. **Real PAE.** `result.pae` is currently null; the map falls back to a
    CA-distance contact map. Wire real PAE when the backend emits it.
11. **FIY for custom sequences** has no RCSB reference; it shows the SVG preview
    until a fold completes. Confirm that is the desired resting state.
12. Add a Playwright smoke test matching the handoff's browser checks
    (`.arcade-shell` exists, lens click updates a scene, a completed job yields
    multiple Mol\*-loadable frames).
13. Accessibility pass: the cockpit is heavily inline-styled and mouse-driven;
    add keyboard focus states and ARIA labels to controls.

---

## 4. Key files

- `frontend/src/App.jsx` — the whole cockpit + `MolPlayfield` Mol\* component.
- `frontend/src/lib/api.js` — backend client (envelope unwrapping lives here).
- `frontend/src/index.css` — fonts, keyframes, scrollbar, `.msp-plugin` host.
- `frontend/index.html` — JetBrains Mono / Roboto font links.
- `backend/app.py` — API; note response envelopes (`{job}`, `{result}`...).
- `backend/adapters.py` — engine detection + LocalColabFold command.
- `backend/guardrails.py` — `AF_COMPANION_MAX_SEQUENCE` (default 150).

---

## 5. Run / verify

```powershell
# backend (real folding)
cd D:\Projects\alphafold\3d-companion
powershell -ExecutionPolicy Bypass -File scripts\Start-Backend-LocalColabFold.ps1 -NumModels 1 -NumRecycle 2

# frontend
cd D:\Projects\alphafold\3d-companion\frontend
$env:VITE_API_BASE='http://127.0.0.1:8011'
npm run dev -- --host 127.0.0.1 --port 5190

# checks
npm run lint
npm test
npm run build
```

Capabilities sanity: `GET http://127.0.0.1:8011/api/backend/capabilities`
should list `localcolabfold` with `"available": true`.

---

## 6. Scientific honesty (do not regress)

- "Real-time" means **playback of real recycle PDB frames** produced by
  `--save-recycles`, not per-GPU-step streaming and not physical folding time.
- Keep the language: "inference trajectory", "recycle frames", "real
  inference-refinement frames", "Mol\*-loadable PDB frame", "FIY".
- Avoid: "physical folding path", "molecular dynamics", "real-time physical
  folding", or any claim that recycle steps are measured kinetic folding time.
- The BACKEND SPECIFICS popup must keep distinguishing TEACHING PREVIEW
  (synthetic model) from REAL (LocalColabFold `kind: "real-af2"`).
