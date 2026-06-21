# Claude Code handoff: release prep, curated targets, demo cache, and cleaned history

Repo:

```text
D:\Projects\alphafold\3d-companion
```

Current local commit in the main repo:

```text
efbf1fa feat: curate arcade targets for release
```

The main repo working tree was clean after this commit.

## Summary

The app was updated so the six curated Amino Arcade targets are scientifically scoped, zero-install friendly, and better prepared for a GitHub release. The misleading hemoglobin all-lenses example was replaced with adenylate kinase, PDB previews are now chain-scoped, demo cache defaults on, spin is slower and target-specific, and Mol* shadows/outlines are off by default.

## Committed changes

### 1. Demo cache / zero-install behavior

All six curated targets now have public demo-cache files:

```text
frontend/public/demo-cache/1-salivary-amylase.json
frontend/public/demo-cache/2-gfp.json
frontend/public/demo-cache/3-myoglobin.json
frontend/public/demo-cache/4-carbonic-anhydrase.json
frontend/public/demo-cache/5-phosphoglycerate-kinase.json
frontend/public/demo-cache/6-adenylate-kinase.json
frontend/public/demo-cache/manifest.json
```

The manifest now maps correctly to the new target order.

Removed stale old cache mappings:

```text
frontend/public/demo-cache/1-myoglobin.json
frontend/public/demo-cache/2-hemoglobin.json
frontend/public/demo-cache/3-phosphoglycerate-kinase.json
frontend/public/demo-cache/4-salivary-amylase.json
frontend/public/demo-cache/5-carbonic-anhydrase.json
frontend/public/demo-cache/6-gfp.json
```

Updated:

```text
frontend/src/lib/api.js
```

Demo cache behavior changed:

- Before: demo cache only loaded if `VITE_DEMO_CACHE=1`.
- Now: demo cache is enabled unless `VITE_DEMO_CACHE=0`.

Reason: curated target `Fold` should work in a static/zero-install demo without the Python backend. The user saw:

```text
localcolabfold unavailable; falling back to educational-simulator
00.0
queued educational-simulator · 496 residues
!!
error: Failed to fetch
JOB
pending · FAILED
```

The direct cause was that backend `127.0.0.1:8011` was not running. With demo cache default-on, curated targets should load bundled LocalColabFold results instead of immediately needing the backend.

### 2. Target set and pedagogy

Updated:

```text
frontend/src/data/targets.js
```

Added:

```js
ADK_SEQ
```

Source: E. coli adenylate kinase, RCSB `4AKE` chain A, 214 aa.

Changed target 6:

- Old: Hemoglobin / `2HHB`
- New: Adenylate kinase / `4AKE` chain A

Reason: hemoglobin preview was a full biological assembly/multimer/cofactor context, while the fold sequence was a single alpha chain. That made the PDB preview look larger than the actual folded protein. Adenylate kinase is a cleaner all-lenses target because the preview and prediction are both one protein chain.

PGK remains the recycling target.

Added metadata to all curated targets:

```js
pdbChain
predictionScope
omittedContext
```

This explicitly explains what is folded and what biological context is omitted, such as cofactors, ligands, partner chains, substrate, metals, heme, waters, etc.

Added:

```js
defaultSpin: true
```

only for:

- target 3 Myoglobin / IPA
- target 6 Adenylate kinase / all-lenses

### 3. Chain-scoped PDB previews

New file:

```text
frontend/src/lib/pdbChain.js
```

New test:

```text
frontend/src/lib/pdbChain.test.mjs
```

Behavior:

```js
filterPdbByChain(pdbText, chainId, options)
```

- Keeps only the requested chain from RCSB PDB text.
- Strips `HETATM` by default so preview matches protein-only prediction.
- Can preserve same-chain `HETATM` only if `includeHetatm: true`.
- Falls back to original text if the requested chain has no coordinates.

Integrated in:

```text
frontend/src/components/MolPlayfield.jsx
```

Mol* RCSB preview now loads `pdbId + pdbChain`, for example:

```text
4AKE chain A
```

### 4. Visible scientific scope panel

Updated:

```text
frontend/src/App.jsx
```

Added a right-side card:

```text
WHAT IS BEING FOLDED
```

It displays:

- `curT.predictionScope`
- `curT.omittedContext`

This is the visible scientific-honesty layer explaining single-chain/protein-only scope.

### 5. Spin behavior

New file:

```text
frontend/src/lib/molstarTrackball.js
```

New test:

```text
frontend/src/lib/molstarTrackball.test.mjs
```

Changed behavior:

- Removed “IPA lens always forces spin.”
- Spin is now target-level via `defaultSpin`.
- Slowed spin speed from aggressive `0.6` to `0.18`.
- Preserved Mol* required spin axis:

```js
{ name: "spin", params: { speed: 0.18, axis: [0, -1, 0] } }
```

Reason: user said rotation was too much, but still wanted Claude’s intended IPA “invariance you can watch” effect.

### 6. Viewer defaults

Updated:

```text
frontend/src/components/MolPlayfield.jsx
```

Current defaults:

- Outline: off.
- Shadow: off.
- Wrench/full Mol* controls panel: hidden.
- App-level fullscreen icon restored.
- VR/XR button hidden.

This addresses the prior broken controls and over-dark/over-shadowed rendering.

### 7. Cache generation script

Updated:

```text
scripts/cache_arcade_examples.py
```

Changes:

- Exports target metadata into demo payload and manifest:
  - `pdb_chain`
  - `prediction_scope`
  - `omitted_context`
- Manifest writer rejects stale rows whose sequence hash no longer matches the current target slot.

This prevents old manifest drift like “target 6 = GFP” after target reordering.

### 8. Tests updated

Updated:

```text
frontend/src/data/targets.test.mjs
frontend/package.json
```

Added/updated assertions:

- all targets have `pdbChain`
- all targets have `predictionScope`
- all targets have `omittedContext`
- all-lenses target is Adenylate kinase
- ADK uses `4AKE`, chain `A`, length 214
- recycling target remains PGK with shallow-MSA disclosure

`frontend/package.json` test command now includes:

```text
src/lib/molstarTrackball.test.mjs
src/lib/pdbChain.test.mjs
```

### 9. Release hygiene

Updated:

```text
.gitignore
```

Added:

```text
*.7z
```

So local archives like `3d-companion.7z` and `backend/backend.7z` do not get committed.

## Verification before commit

Ran:

```powershell
cd D:\Projects\alphafold\3d-companion\frontend
npm test
npm run lint
npm run build
```

Results:

- 70 tests passed.
- lint passed.
- production build passed.

## Clean release copy

Created:

```text
D:\Projects\amino-arcade-release
```

This is a filesystem copy excluding:

- `.git`
- `node_modules`
- `frontend/dist`
- logs
- archives
- prediction cache
- model cache
- work folders
- venvs

This copy is source-only and does not preserve Git commit history.

## Clean-history GitHub publishing attempt

User wants GitHub to show past progress but not push old/unneeded blobs.

Started a separate cleaned-history clone:

```text
D:\Projects\amino-arcade-history-clean
```

Commands already run:

```powershell
git clone --no-hardlinks D:\Projects\alphafold\3d-companion D:\Projects\amino-arcade-history-clean
python -m pip install --user git-filter-repo
cd D:\Projects\amino-arcade-history-clean
python -m git_filter_repo --path frontend/public/demo-cache --invert-paths --force
```

Result:

- Rewrote commit history in the clone.
- Removed `frontend/public/demo-cache` from every historical commit.
- Commit messages were preserved, but commit hashes changed.
- `origin` remote was removed by `git-filter-repo`.

Cleaned-history log began:

```text
5539f6f feat: curate arcade targets for release
ca3c188 fix: restore viewer controls and simplify arcade chrome
350b3e7 feat: update arcade UI and live lens tour
39b683a test: verify current lens and recycling flow
064750c feat: redesign live structure overlays
d45ccb7 feat: add dramatic PGK recycling benchmark
728154d feat: add guided AlphaFold learning tour
0fa4202 feat: improve live lens targets and recycling lesson
e78087e Clear stale real frames on target switch
688c75f Refresh demo folds with GPU cache
c00f8e9 Add real cached demo folds
0e7e826 Initialize 3d companion repository
```

After filtering, `git count-objects -vH` in the cleaned-history clone showed about:

```text
size-pack: 407.44 KiB
```

This was before re-adding current curated demo-cache.

Important: user interrupted during the large-object audit. Do not assume `D:\Projects\amino-arcade-history-clean` is fully release-ready yet.

## Recommended next steps for Claude Code

### Option A: push main repo as-is

Pros:

- Exact local commit history.
- Easy.

Cons:

- Pushes historical demo-cache artifacts and old junk in Git history.

Main repo has no remote configured. `git remote -v` was empty.

Push command once the user provides a GitHub repo URL:

```powershell
cd D:\Projects\alphafold\3d-companion
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

### Option B: finish cleaned-history publish repo

Recommended if the user wants progress history but not old cache junk.

Continue here:

```text
D:\Projects\amino-arcade-history-clean
```

Re-add only the current curated demo-cache from the main repo:

```powershell
cd D:\Projects\amino-arcade-history-clean
New-Item -ItemType Directory -Force frontend\public\demo-cache
Copy-Item D:\Projects\alphafold\3d-companion\frontend\public\demo-cache\* frontend\public\demo-cache\ -Force
git add frontend/public/demo-cache
git commit -m "chore: add curated demo cache fixtures"
```

Audit size/history:

```powershell
git count-objects -vH
git log --oneline --max-count=15
git rev-list --objects --all |
  ForEach-Object {
    $parts = $_ -split ' ', 2
    if ($parts.Length -eq 2) {
      $size = git cat-file -s $parts[0]
      [pscustomobject]@{ Size = [int64]$size; Path = $parts[1]; Object = $parts[0] }
    }
  } |
  Sort-Object Size -Descending |
  Select-Object -First 20 @{Name='MB';Expression={[math]::Round($_.Size/1MB,2)}},Path,Object
```

Then add the GitHub remote and push:

```powershell
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

Need the user’s GitHub remote URL before pushing.

## Notes for Claude Code

- Do not rerun full cache generation unless needed; all six current curated cache files exist in the main repo.
- Keep PGK as the recycling target. It is the measured controlled recycling winner.
- Keep ADK as the all-lenses target.
- Do not reintroduce hemoglobin as all-lenses unless it is explicitly framed as a multimer/cofactor limitation lesson.
- Keep shadows off by default.
- Keep outline off by default.
- Keep spin slow and target-level only.
- Do not push from the main repo if the user wants old cache junk removed from public history; finish and push the cleaned-history clone instead.
