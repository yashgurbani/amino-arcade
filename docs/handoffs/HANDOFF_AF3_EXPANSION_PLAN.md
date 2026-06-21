# Amino Arcade — Expansion Plan: AlphaFold3-class Inference + AF2-vs-AF3 Comparison

_Last updated: 2026-06-19_

## 0. Goal

Extend Amino Arcade beyond the AF2-family pipeline (LocalColabFold) to also run an
**AlphaFold3-class** predictor locally, and add a **comparison mode** that runs
both on the same target and visualizes where AF3 improves over AF2 (accuracy,
confidence, complexes/ligands). The teaching layer should explain *why* AF3 is
different, grounded in the AF3 paper (Abramson et al., Nature 2024).

This builds on the current app (see `HANDOFF_AMINO_ARCADE_NEXT.md` and
`CLAUDECODE_BACKEND_HANDOFF.md`). Do P0 items there first (confirm a real AF2
fold runs) before starting this.

---

## 1. AF3 is architecturally different — teach the difference, don't reuse AF2 framing

AF2 (current app): MSA -> Evoformer (triangle updates) -> structure module (IPA,
FAPE) -> **recycling** to a fixed point. The app's "inference trajectory" = recycle
frames.

AF3: MSA -> **Pairformer** -> **diffusion module** that denoises all-atom
coordinates over sampling steps, all-atom (proteins + nucleic acids + ligands +
ions), trained with cross-distillation. Key consequences for us:

- **No recycle-frame trajectory in the AF2 sense.** The natural "trajectory" for
  AF3 is the **diffusion denoising steps / multiple samples**, not recycles.
  Keep the scientific language honest: AF3's steps are a generative denoising
  process, not physical folding time and not AF2 recycling.
- **Output is mmCIF**, not PDB. Mol* loads mmCIF natively (`parseTrajectory(data, "mmcif")`).
- **Confidence metrics**: pLDDT, PAE, pTM, ipTM (interface), PDE (Boltz adds a
  diffusion-uncertainty PDE). ipTM/PAE matter most for complexes.
- **New capabilities to showcase**: protein-ligand, protein-nucleic-acid, and
  multimer interfaces — things AF2 monomer folding can't do.

New teaching lenses to add for AF3 (mirror the existing 5 AF2 lenses):
diffusion denoising, all-atom/ligand handling, interface confidence (ipTM/PAE),
and "cross-distillation / no MSA-recycling".

---

## 2. Engine options (research, June 2026) — pick the local AF3-class backend

AF3 itself: code is open but **weights are gated and non-commercial** (DeepMind),
so it is poor for a self-hostable teaching app. Prefer an open reproduction:

| Engine | License | Notes for us |
|---|---|---|
| **Protenix-v1** (ByteDance) | Apache 2.0 (code + weights) | Recommended primary. First fully open model reported to match/beat AF3 at the same data cutoff/budget. PyTorch AF3 reproduction; commercial-friendly. |
| **Boltz-2** (MIT/NVIDIA) | MIT | Structure **+ binding affinity** in one pass; AF3-style confidence + PDE; strong ecosystem (NVIDIA NIM, ChimeraX). Heaviest VRAM. |
| **Chai-1** | Apache 2.0 (moved from restrictive) | AF3-class, widely benchmarked. |
| **OpenFold3** | open | Foundational/extensible platform; heavier setup. |
| **AlphaFold3** (reference) | code open, **weights gated, non-commercial** | Use only as an optional, manually-provisioned "ground-truth" engine; do not bundle weights. |

Comparison harness already exists: **ABCFold** (`github.com/rigdenlab/ABCFold`)
takes an AF3-style JSON input, runs AF3/Boltz-1/Chai-1 with shared MMseqs2 MSAs,
and emits a results table + PAE viewer + pLDDT plots. **Reuse its input format
and ideas**; optionally shell out to it for the comparison backend.

**Recommendation:** primary = **Protenix-v1** (Apache 2.0, no gated weights);
secondary = **Boltz-2** (affinity story). Wrap both behind the existing engine
registry so the UI just sees new engine ids.

### Hardware reality (RTX 5060, 8 GB) — important
AF3-class diffusion models are VRAM-hungry. Boltz-2's official NIM minimum is
**48 GB**; on L40S ~11 GB is used for structure + ~7-8 GB for affinity. On 8 GB
Windows, only **small** predictions are reported feasible. Plan for:

1. **Tiny targets only on-device** (e.g. Trp-cage, Insulin chains, short
   peptide-ligand) with reduced diffusion samples; expect slow runs.
2. A **remote/offload option** (Modal/RunPod/Nebius or NVIDIA NIM) selectable in
   the UI, since 8 GB will not run larger complexes.
3. Aggressive guardrails (extend `AF_COMPANION_MAX_SEQUENCE`, add a separate
   `AF3_MAX_SEQUENCE` and a VRAM preflight per engine).

---

## 3. Backend work

Files: `backend/adapters.py`, `backend/app.py`, `backend/pdb_utils.py`,
`backend/guardrails.py`, `backend/provenance.py`, `scripts/`.

1. **Engine registry**: add capabilities entries `protenix`, `boltz2` (and
   optional `chai1`, `alphafold3`) to `backend_capabilities()`, each with
   `available` detection (env `PROTENIX_BIN` / `BOLTZ_BIN` or installed module),
   `role: "af3-class"`, and honest notes (license, VRAM).
2. **Adapters**: `_predict_protenix(...)`, `_predict_boltz(...)` building the
   AF3-style JSON input (sequences, optional ligand SMILES / CCD, nucleic acids)
   and invoking the tool. Normalize outputs to the existing result shape:
   - `frames[]` = diffusion samples (or denoising snapshots if the tool can emit
     them), each with `cif` (preferred) or `pdb`, `plddt`, `ca`, and
     `observables`.
   - top-level `pae`, plus new `ptm`, `iptm`, and per-sample confidence.
   - `provenance.kind = "real-af3"`, with engine + license + disclaimers.
3. **mmCIF support** in `pdb_utils.py`: parse CIF, extract CA + per-residue
   confidence (B-factor column carries pLDDT for these tools), atom counts.
4. **Comparison endpoint**: `POST /api/compare/structures` taking `{sequence|json,
   engines:["localcolabfold","protenix"]}`, running both (queued), and returning
   both normalized results plus a computed **alignment**: CA-RMSD / TM-score,
   per-residue confidence delta, and PAE/contact deltas. (Or shell out to ABCFold
   and parse its output.)
5. **Guardrails per engine**: VRAM preflight using each engine's footprint;
   separate length caps; clear "needs remote / too large for local 8 GB" errors.
6. **Provenance/honesty**: never claim AF3 weights are bundled; label diffusion
   steps as denoising, not folding or recycling.

---

## 4. Frontend work

Files: `frontend/src/App.jsx`, `frontend/src/lib/api.js`.

1. **New top-level mode: `VERSUS` (AF2 ⇄ AF3)** alongside ARCADE / FIY.
   - Pick a target or paste a sequence (and optionally a ligand SMILES).
   - "RUN BOTH" submits LocalColabFold + the chosen AF3-class engine.
   - **Two Mol\* viewers side by side** (reuse `MolPlayfield`), each labelled
     with engine + provenance; a **superpose** toggle overlays both into one
     viewer with CA-RMSD/TM-score readout.
2. **Improvement panel** ("WHAT IMPROVED"): mean pLDDT delta, ipTM/PAE for
   interfaces, RMSD to a reference (RCSB) structure for the named targets, and a
   plain-language summary ("AF3 resolves the ligand pocket AF2 can't model").
3. **AF3 lenses**: add diffusion-denoising, all-atom/ligand, and interface-
   confidence scenes (mirror the existing interactive concept scenes).
4. **mmCIF in the viewer**: extend `MolPlayfield` to detect `cif` vs `pdb`
   (`parseTrajectory(data, frame.cif ? "mmcif" : "pdb")`).
5. **Engine availability + remote toggle**: if an AF3 engine is unavailable
   locally, offer the remote option or disable with a clear tooltip; keep the
   existing engine-fallback fix.
6. **Trajectory semantics**: for AF3, the flipper steps **diffusion samples**,
   labelled accordingly — not "Recycle 1..5".

---

## 5. Phasing

- **P0 — Foundation (1 engine, no compare).** Add Protenix as an engine; mmCIF
  parsing; show a single AF3 result in the existing Mol\* viewer for a tiny
  target. Honest VRAM guardrail + remote stub.
- **P1 — Comparison.** `VERSUS` mode, dual Mol\* viewers, superpose + RMSD/TM,
  confidence-delta panel. Optionally wrap ABCFold.
- **P2 — AF3 capabilities + teaching.** Ligand/nucleic-acid inputs, ipTM/PAE
  interface lens, diffusion-denoising lens, "what improved" narrative.
- **P3 — Polish.** Boltz-2 affinity readout, remote-execution backend, caching of
  comparison runs, Playwright comparison smoke test.

---

## 6. Risks / decisions pending

- **8 GB VRAM is the dominant constraint.** Decide early: on-device tiny-only,
  remote offload, or both. This shapes the whole UX.
- **Which AF3 engine(s)** to ship: Protenix (recommended) only, or Protenix +
  Boltz-2 for the affinity angle?
- **Reference truth for "improvement."** For named targets we have RCSB
  structures (RMSD vs experimental). For arbitrary FIY sequences there is no
  ground truth — frame improvement as confidence/agreement, not accuracy.
- **Build vs reuse ABCFold** for the comparison backend.
- **Licensing**: keep AF3 (gated weights) optional and user-provisioned; default
  to Apache/MIT engines.

---

## 7. Scientific honesty (AF3 additions)

- AF3 is a **diffusion** model; its sampling steps are generative denoising, not
  physical folding and not AF2 recycling.
- Do not present AlphaFold3's weights as open; they are gated/non-commercial.
  The open engines (Protenix/Boltz/Chai) are reproductions/relatives.
- Comparisons show **model agreement and confidence**, plus RMSD-to-experimental
  only where an experimental structure exists; do not imply either model is
  "correct" without a reference.

---

## 8. References

- Comparison of AF3 / Boltz-1 / Chai-1 — https://medium.com/@punta.indratomo/comparison-of-alphafold-3-boltz-1-and-chai-1-9bc818f4efa0
- Protenix-v1 (bioRxiv) — https://www.biorxiv.org/content/10.64898/2026.02.05.703733v2.full
- AF3 vs Boltz-2 vs ESMFold — https://purna.ai/blog/alphafold-vs-boltz-vs-esmfold/
- Boltz-2 FAQ (Rowan) — https://rowansci.com/blog/boltz2-faq
- Boltz-2 NVIDIA NIM model card / support — https://build.nvidia.com/mit/boltz2/modelcard ; https://docs.nvidia.com/nim/bionemo/boltz2/latest/support-matrix.html
- ABCFold (run + compare AF3/Boltz/Chai) — https://github.com/rigdenlab/ABCFold ; https://academic.oup.com/bioinformaticsadvances/article/5/1/vbaf153/8176613
- Protein AI landscape — https://huggingface.co/blog/MaziyarPanahi/protein-ai-landscape
