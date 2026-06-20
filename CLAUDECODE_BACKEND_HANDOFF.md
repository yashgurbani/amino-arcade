# Claude Code Handoff: Amino Arcade Backend + Real-Time PDB Rendering

## Objective

Implement the Amino Arcade UI against the existing backend. Do not reuse the current UI as the source of truth if it conflicts with the Claude Design handoff. The UI should be rebuilt from the design handoff while consuming the backend contract below.

The agreed technical direction:

- Use **Mol\*** as the primary protein viewer.
- Use **LocalColabFold** for real AF2-family inference.
- Use LocalColabFold `--save-recycles` outputs as the real inference-refinement trajectory.
- Each trajectory step must be a real, Mol\*-loadable PDB frame.
- Be scientifically explicit: recycle frames are model refinement snapshots, not a measured physical folding pathway.

## Key Files

- Backend API: `backend/app.py`
- Backend adapters: `backend/adapters.py`
- PDB parsing and recycle-frame discovery: `backend/pdb_utils.py`
- Job queue: `backend/job_queue.py`
- Backend tests: `backend/test_backend.py`
- LocalColabFold launcher: `scripts/Start-Backend-LocalColabFold.ps1`
- WSL wrapper: `scripts/colabfold_batch_wsl.cmd`
- Local model docs: `docs/LOCAL_MODELS.md`
- Product glossary: `CONTEXT.md`
- Claude UI handoff source: `work/design-handoff/Amino Arcade.dc.html`
- AlphaFold-style viewer notes: `work/design-handoff/ALPHAFOLD_VIEWER_IMPLEMENTATION_NOTES.md`

## Backend Runtime

Start the backend with LocalColabFold enabled:

```powershell
cd D:\Projects\alphafold\3d-companion
powershell -ExecutionPolicy Bypass -File scripts\Start-Backend-LocalColabFold.ps1 -UseWslGpu -NumModels 1 -NumRecycle 2
```

Default backend URL:

```text
http://127.0.0.1:8011
```

Start frontend separately, usually:

```powershell
cd D:\Projects\alphafold\3d-companion\frontend
$env:VITE_API_BASE='http://127.0.0.1:8011'
npm run dev -- --host 127.0.0.1 --port 5190
```

## LocalColabFold Contract

`backend/adapters.py` builds the LocalColabFold command. It now appends:

```text
--save-recycles
```

unless:

```text
LOCALCOLABFOLD_SAVE_RECYCLES=0
```

The backend expects LocalColabFold to emit files like:

```text
query_unrelaxed_rank_001_alphafold2_ptm_model_1_seed_000.r0.pdb
query_unrelaxed_rank_001_alphafold2_ptm_model_1_seed_000.r1.pdb
query_unrelaxed_rank_001_alphafold2_ptm_model_1_seed_000.r2.pdb
query_unrelaxed_rank_001_alphafold2_ptm_model_1_seed_000.pdb
```

`backend/pdb_utils.py` prefers `.rN.pdb` recycle files over the final duplicate and sorts them numerically. The UI should treat these as the real inference trajectory frames.

Important helpers:

- `recycle_index(path)` returns the recycle index from `.rN.pdb`.
- `read_recycle_pdbs(output_dir)` returns sorted recycle PDBs.
- `read_pdbs(output_dir)` returns recycle PDBs if present, otherwise final PDBs.
- `has_structure_atoms(pdb)` ensures the PDB contains `ATOM` lines and can be loaded by Mol\*.

## API Contract

### Capabilities

```http
GET /api/backend/capabilities
```

Shape currently returned:

```json
{
  "status": "success",
  "default_engine": "educational-simulator",
  "engines": [
    {
      "id": "localcolabfold",
      "label": "LocalColabFold",
      "available": true,
      "role": "real-af2-family",
      "notes": []
    }
  ],
  "hardware_profile": {}
}
```

Frontend must read `engines`, not only `capabilities`.

### Create Prediction Job

```http
POST /api/predict/jobs
Content-Type: application/json

{
  "sequence": "NLYIQWLKDGGPSSGRPPPS",
  "engine": "localcolabfold"
}
```

Returns a job object with `id`, `status`, `engine`, timestamps, and logs.

### Poll Job

```http
GET /api/predict/jobs/{job_id}
```

Poll until:

```text
succeeded | failed | cancelled
```

LocalColabFold jobs can take minutes. Use long polling. Do not use a short timeout designed for the simulator.

### Logs

```http
GET /api/predict/jobs/{job_id}/logs
```

Use this for a live FIY console.

### Result

```http
GET /api/predict/jobs/{job_id}/result
```

Important shape:

```json
{
  "status": "success",
  "engine": "localcolabfold",
  "sequence": "NLYIQWLKDGGPSSGRPPPS",
  "provenance": {
    "kind": "real-af2",
    "label": "...",
    "engine": "localcolabfold",
    "claims": [],
    "disclaimers": []
  },
  "frames": [
    {
      "label": "Recycle 0",
      "pdb": "HEADER ...\nATOM ...",
      "ca": [[0, 0, 0]],
      "plddt": [70.2],
      "observables": {
        "confidence": 70.2,
        "triangleViolation": 0,
        "ipaInvariantError": 0,
        "fape": 0,
        "recycleDelta": null,
        "constraintViolations": 0
      },
      "pdb_atom_count": 123
    }
  ],
  "plddt": [88.0],
  "pae": null,
  "meta": {
    "trajectory_note": "LocalColabFold recycle PDBs parsed as real inference-refinement frames."
  },
  "warnings": []
}
```

Each `frames[n].pdb` is the string to load into Mol\*. Do not synthesize a fake structure when this exists.

### Report

```http
GET /api/predict/jobs/{job_id}/report
```

Use this for provenance/details panels, not for primary rendering.

### Job List

```http
GET /api/predict/jobs
```

Shape currently returned:

```json
{
  "status": "success",
  "active_jobs": 0,
  "queued_jobs": 0,
  "completed_jobs": 62,
  "failed_jobs": 4,
  "cancelled_jobs": 21,
  "recent_jobs": []
}
```

Frontend must read `recent_jobs`, not only `jobs`.

## Mol\* Rendering Engine Requirements

Use Mol\* as the primary viewer. The UI should expose a single structure playfield. Avoid separate “Structure” and “Arcade” tabs. Concept lenses should sit around or overlay the same real structure trajectory.

Recommended React viewer responsibilities:

1. Own one Mol\* plugin instance for the life of the component.
2. Load the active frame PDB string with Mol\* raw data parsing.
3. Clear and reload when `activeFrame.pdb` changes.
4. Show a lightweight fallback only when there is no real PDB.
5. Drive timeline playback by changing the active frame index.
6. Keep pLDDT, PAE/contact map, score chart, and concept lenses derived from the active frame.

Existing working Mol\* integration pattern:

```js
const [{ createPluginUI }, { DefaultPluginUISpec }, { PluginConfig }] = await Promise.all([
  import("molstar/lib/mol-plugin-ui"),
  import("molstar/lib/mol-plugin-ui/spec"),
  import("molstar/lib/mol-plugin/config"),
]);

const defaultSpec = DefaultPluginUISpec();
plugin = await createPluginUI({
  target,
  spec: {
    ...defaultSpec,
    layout: { initial: { isExpanded: false, showControls: false } },
    components: { controls: { left: "none", right: "none", top: "none", bottom: "none" } },
    config: [
      ...(defaultSpec.config || []),
      [PluginConfig.Viewport.ShowExpand, false],
      [PluginConfig.Viewport.ShowControls, false],
      [PluginConfig.Viewport.ShowSelectionMode, false],
      [PluginConfig.Viewport.ShowAnimation, false],
    ],
  },
  render: (component, container) => {
    // Use React createRoot(container).render(component)
  },
});

await plugin.clear();
const data = await plugin.builders.data.rawData({ data: activeFrame.pdb, label: activeFrame.label });
const trajectory = await plugin.builders.structure.parseTrajectory(data, "pdb");
await plugin.builders.structure.hierarchy.applyPreset(trajectory, "default");
```

Do not import Mol\* SCSS from plain CSS unless Sass is installed. The current project builds without adding Sass.

## Real-Time Trajectory Behavior

The intended UI flow:

1. User selects example protein or enters FIY sequence.
2. User runs LocalColabFold.
3. Backend queues job and streams logs.
4. UI polls job status.
5. When job succeeds, UI receives `frames`.
6. Timeline renders one tick per frame.
7. Playback changes `activeFrame`.
8. Mol\* reloads `activeFrame.pdb`.
9. Concept visualizations update from `activeFrame.plddt`, `activeFrame.ca`, and `activeFrame.observables`.

This is “real-time” in the UI playback sense: once recycle PDBs are produced, the viewer steps through real PDB artifacts. It is not molecular dynamics and not a true physical folding path.

## Example Protein for Fast Real Test

Use Trp-cage for smoke tests:

```text
NLYIQWLKDGGPSSGRPPPS
```

Previously verified LocalColabFold recycle outputs for this sequence produced Mol\*-loadable PDBs:

```text
Recycle 0 mean pLDDT ~70.27
Recycle 1 mean pLDDT ~73.46
Recycle 2 mean pLDDT ~84.25
Recycle 3 mean pLDDT ~88.06
```

## UI Guidance for Claude Code

Source of truth for visual design:

```text
work/design-handoff/Amino Arcade.dc.html
```

Important design requirements:

- Arcade cockpit, not Carbon workstation.
- JetBrains Mono visual language.
- No separate “structure” vs “arcade” tabs.
- Real structure viewer is the central playfield.
- FIY is part of the same app, not a separate old workflow.
- Lenses are concept overlays/readouts around the real trajectory.
- Dynamic concept visualizations:
  - Coevolution/contact map
  - Triangle consistency
  - IPA invariance
  - FAPE/chirality
  - Recycling fixed-point convergence
- AlphaFold-style elements:
  - Mol\* viewer
  - pLDDT legend
  - PAE/contact canvas
  - sequence/run console
  - provenance/backend specifics

## Known Frontend Gotchas

The current frontend had a blank-page crash when backend responses were normalized incorrectly:

- `/api/backend/capabilities` returns `engines`, not `capabilities`.
- `/api/predict/jobs` returns `recent_jobs`, not `jobs`.

Any new UI should defensively normalize response shapes:

```js
const engines = Array.isArray(data) ? data : data.engines || data.capabilities || [];
const jobs = Array.isArray(data) ? data : data.recent_jobs || data.jobs || [];
```

Add an error boundary early so startup exceptions show as readable errors rather than a black screen.

## Verification Commands

Run full verification:

```powershell
cd D:\Projects\alphafold\3d-companion
powershell -ExecutionPolicy Bypass -File scripts\verify.ps1
```

Expected:

- Frontend unit tests pass.
- Frontend lint passes.
- Frontend build passes.
- Backend unit tests pass.

Browser smoke target:

```text
http://127.0.0.1:5190
```

Minimum browser checks:

- App is not blank.
- `.arcade-shell` or equivalent main app shell exists.
- No Vite/framework overlay.
- No relevant console errors.
- FIY engine select includes/uses `localcolabfold` when backend reports it available.
- Clicking a concept lens updates the concept visualization.
- Running or loading a completed LocalColabFold job produces multiple Mol\*-loadable PDB frames.

## Scientific Language to Preserve

Use:

- “Inference trajectory”
- “Recycle frames”
- “Real inference-refinement frames”
- “Mol\*-loadable PDB frame”
- “FIY / Fold It Yourself”

Avoid:

- “Physical folding path”
- “Molecular dynamics trajectory”
- “Real-time physical folding”
- Any claim that AlphaFold recycle steps are measured kinetic folding time.

