# Open-Source Contribution Target

## Best Target: `ChrisHayduk/minAlphaFold2`

`minAlphaFold2` is the strongest upstream target because its stated purpose is pedagogical: a readable PyTorch AlphaFold2 implementation where modules map 1:1 to the supplement algorithms. It already provides implementation clarity, training ladders, an overfit script, relaxation, and algorithm mapping. What it does not appear to provide is an interactive or browser-readable visual trace of the geometry mechanisms.

## Proposed Contribution

Add an **AlphaFold2 geometry trace exporter** plus a small static visualizer handoff.

### User Value

- Lets readers see triangle updates, IPA frame distances, FAPE/chirality, pLDDT, and recycling as data rather than only code.
- Makes the repo more useful for seminar teaching and onboarding AI/physics users into structural biology.
- Keeps the upstream repo focused: it is not a hosted app, not a heavy dependency, and not a new inference system.

### Proposed PR Shape

1. Add `scripts/export_geometry_trace.py`.
   - Input: one existing minAlphaFold2 overfit/prediction artifact directory.
   - Output: `artifacts/.../geometry_trace.json`.
   - Include fields:
     - `sequence`
     - `residue_index`
     - `pair_summary`
     - `recycling_steps`
     - `plddt`
     - `selected_frames`
     - `fape_summary`
     - `provenance`

2. Add `docs/geometry_trace_format.md`.
   - Defines the JSON schema.
   - Maps fields to supplement algorithms:
     - Algorithm 11/12: triangle multiplication
     - Algorithm 22: invariant point attention
     - Algorithm 28: FAPE
     - Algorithm 32: recycling

3. Add `examples/geometry_trace_viewer/`.
   - A single static HTML file or tiny dependency-free viewer.
   - Reads a local `geometry_trace.json`.
   - Shows:
     - pair/contact heatmap
     - recycling confidence curve
     - residue-frame schematic
     - pLDDT-colored backbone trace

4. Add tests.
   - Unit test that exporter writes valid JSON for the existing single-PDB overfit fixture.
   - Schema check for required fields.
   - No GPU required.

## Why Not OpenFold First?

OpenFold is production-grade and training/inference oriented. A visualization trace PR would be less central there and would need to satisfy heavier engineering expectations. It is better as a later target after the format proves useful.

## Why Not ColabFold / LocalColabFold First?

ColabFold and LocalColabFold focus on accessible prediction workflows. They already expose notebooks, pLDDT/PAE-oriented outputs, PyMOL coloring snippets, and install paths. A contribution there should be downstream of the trace format: for example, exporting a compatible result bundle from `colabfold_batch`. That is useful, but the pedagogical trace should be validated in a pedagogical repo first.

## How This Local Project Helps

This companion already has most of the downstream consumer:

- `frontend/src/data/sceneSpec.schema.json`
- `frontend/src/lib/conceptMath.js`
- `frontend/src/components/ConceptPanels.jsx`
- `frontend/src/components/ResultsCompanion.jsx`
- backend cached example format and provenance fields

The next local step should be adding an importer for `geometry_trace.json`. Once that works locally, the upstream PR can be small: exporter + schema + minimal viewer/docs.

## Suggested Issue Text

Title: Add geometry trace export for visualizing triangle updates, IPA, FAPE, and recycling

Body:

`minAlphaFold2` is already unusually good for reading AlphaFold2 algorithm-by-algorithm. One thing that would make it even more useful for teaching is a lightweight trace export from an overfit/prediction run into a browser-readable JSON artifact. The trace would expose summaries of pair representations, recycling steps, pLDDT, selected residue frames, and FAPE-related quantities, mapped back to the supplement algorithms. This would not add a heavy UI dependency or change training/inference behavior; it would simply make the existing pedagogical implementation easier to inspect visually.

I can contribute:

- `scripts/export_geometry_trace.py`
- a documented `geometry_trace.json` schema
- a tiny static viewer or example consumer
- tests using the existing single-PDB overfit path

The goal is to help readers move from "I can read the code" to "I can see what the code is doing."
