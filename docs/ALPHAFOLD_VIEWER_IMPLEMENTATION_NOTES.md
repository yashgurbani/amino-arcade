# AlphaFold-Style Protein Display Panel Implementation Notes

These notes describe how to reproduce the interactive protein display pattern from the AlphaFold Server example page and compare it with the older `biasmv/pv` WebGL protein viewer implementation.

Primary references:

- AlphaFold Server example: <https://alphafoldserver.com/example/examplefold_pdb_8aw3>
- Mol* viewer docs: <https://molstar.org/viewer-docs/>
- PV repository: <https://github.com/biasmv/pv>
- PV docs: <https://pv.readthedocs.io/en/v1.8.1/>

## What the AlphaFold Server panel is doing

The AlphaFold Server example is a compact scientific workspace, not just a molecule canvas.

It combines:

1. A 3D molecular viewer.
2. A pLDDT confidence legend.
3. Global confidence scores, such as `ipTM` and `pTM`.
4. A Predicted Aligned Error (PAE) heatmap.
5. A sequence/input table.
6. Download and navigation actions.

The rendered page exposes a custom Angular component tree with names such as `gdm-af-fold-viewer`, `gdm-af-predicted-aligned-error`, and `gdm-af-fold-input`. The 3D viewer controls match the Mol* interface: animation, reset zoom/camera, screenshot/state snapshot, controls panel, expanded viewport, settings/control info, and selection mode.

The visible canvas stack includes:

- A high-resolution WebGL molecular canvas.
- A 2D PAE heatmap canvas.
- Overlay canvases for chain-border lines and interaction masks.

## Recommended data model

Use one normalized result object and derive all views from it.

```ts
type ResidueRef = {
  chainId: string;
  residueIndex: number;
  residueName?: string;
  globalIndex: number;
};

type ChainInfo = {
  id: string;
  type: "protein" | "rna" | "dna" | "ligand" | "ion";
  copies: number;
  sequence?: string;
  startGlobalIndex: number;
  endGlobalIndex: number;
};

type ConfidenceMetrics = {
  pTM?: number;
  ipTM?: number;
  meanPlddt?: number;
};

type PAEData = {
  matrix: number[][];
  maxPredictedAlignedError: number;
  chainBreaks: number[];
};

type StructureResult = {
  title: string;
  structureUrl: string;
  structureFormat: "pdb" | "cif" | "mmcif";
  chains: ChainInfo[];
  residueByGlobalIndex: Record<number, ResidueRef>;
  plddtByGlobalIndex: Record<number, number>;
  pae: PAEData;
  metrics: ConfidenceMetrics;
};

type ViewerState = {
  hoveredResidue?: ResidueRef;
  selectedResidues: ResidueRef[];
  hoveredPair?: {
    alignedResidue: number;
    scoredResidue: number;
    pae: number;
  };
  showChainBorders: boolean;
  colorMode: "plddt" | "chain" | "element";
  selectionMode: boolean;
};
```

## Component layout

```txt
AlphaFoldDemoPanel
  HeaderActions
    BackButton
    DownloadButton
  ConfidenceLegend
    PlddtBands
    GlobalScores
  StructureWorkspace
    ProteinViewer3D
    PAEHeatmap
  SequenceInputTable
```

Desktop layout:

- Header and score legend across the top.
- 3D viewer on the left.
- PAE heatmap on the right.
- Sequence/input table below.

Mobile layout:

- Stack the 3D viewer first.
- Stack the PAE heatmap second.
- Collapse the sequence table into chain cards or a horizontally scrollable table.

## Option A: Mol* / AlphaFold-like implementation

Use this option if the goal is to feel close to AlphaFold Server and support modern molecular viewer expectations.

Install:

```bash
npm install molstar
```

Why this is the stronger default:

- AlphaFold Server's 3D control surface resembles Mol*.
- Mol* has built-in structure loading, sequence panel concepts, camera controls, screenshots, selection mode, and modern structure formats.
- It is actively used in structural biology tooling.
- It supports richer future features: selections, measurements, representations, surfaces, density, session/state snapshots.

Core viewer responsibilities:

- Load `mmCIF` or `PDB` structure.
- Render cartoon/ribbon as the default representation.
- Color residues by pLDDT.
- Expose hover and selection callbacks.
- Support reset camera, screenshot, fullscreen, and selection mode.
- Allow later addition of chain color, element color, ligand display, and measurement tools.

AlphaFold-like pLDDT color buckets:

```ts
function plddtColor(score: number): string {
  if (score > 90) return "#1f6feb"; // very high
  if (score > 70) return "#25c7d9"; // confident
  if (score > 50) return "#f4e409"; // low
  return "#f28c28"; // very low
}
```

Mol* integration notes:

- Wrap Mol* in a `ProteinViewer3D` component that owns only the imperative viewer instance.
- Keep app state in React, not inside the viewer.
- On structure load, create a color theme based on `plddtByGlobalIndex`.
- On residue hover/click, translate Mol* selection loci into `ResidueRef`.
- On external PAE hover, highlight both involved residues or chains in Mol*.
- Keep `viewerRef.current` isolated behind a small adapter API.

Adapter shape:

```ts
type ProteinViewerAdapter = {
  loadStructure(result: StructureResult): Promise<void>;
  setColorMode(mode: ViewerState["colorMode"]): void;
  highlightResidue(residue?: ResidueRef): void;
  highlightResiduePair(pair?: ViewerState["hoveredPair"]): void;
  setSelectionMode(enabled: boolean): void;
  resetCamera(): void;
  exportPng(): Promise<Blob>;
  destroy(): void;
};
```

Design behavior:

- Toolbar lives on the right edge of the 3D viewer.
- Use icon buttons, not text buttons, for viewer actions.
- Provide tooltips for icons.
- Use a neutral white or near-white panel background.
- Keep pLDDT colors purely data-driven; do not reuse those colors for decoration.

Implementation risk:

- Mol* integration has a steeper setup cost.
- Styling the built-in UI can be more work than styling a custom wrapper.
- If the app only needs a teaching demo and not true structural biology tooling, Mol* may be more capability than needed.

## Option B: PV / lightweight implementation

Use this option if the goal is a simple, fast, easily embedded protein viewer and the demo does not need deep Mol* features.

PV is a WebGL protein viewer from `biasmv/pv`. Its README says the project is no longer maintained, and the latest GitHub release shown is `v1.8.1` from 2015. Treat it as legacy but useful for a controlled educational demo.

PV strengths:

- Small integration surface.
- Simple `pv.Viewer(parentElement, options)` API.
- Built-in render modes: `cartoon`, `tube`, `trace`, `lineTrace`, `sline`, `lines`, `spheres`, `ballsAndSticks`, and `points`.
- Simple camera APIs: `centerOn`, `autoZoom`, `fitTo`, `setCamera`, `setCenter`, `setZoom`, `spin`.
- Custom coloring hooks via `pv.color.byResidueProp`, `pv.color.byAtomProp`, and custom `ColorOp`.
- Click/picking events for atoms/residues.
- Selection highlighting introduced in PV 1.8.

PV limitations:

- Not maintained.
- Older build ecosystem: Bower, Grunt, checked-in minified bundle.
- Less suitable for modern React/Next bundling without a wrapper.
- Less complete than Mol* for modern structural biology workflows.
- PAE heatmap, pLDDT legend, linked sequence table, and AlphaFold-style controls must be custom-built.
- No out-of-the-box AlphaFold confidence semantics.

Minimal PV initialization:

```html
<div id="viewer"></div>
<script src="/vendor/bio-pv.min.js"></script>
<script>
  const viewer = pv.Viewer(document.getElementById("viewer"), {
    width: "auto",
    height: "auto",
    antialias: true,
    quality: "medium",
    background: "white",
    outline: true,
    animateTime: 500,
    selectionColor: "#19a974"
  });

  pv.io.fetchPdb("/structures/example.pdb", function(structure) {
    viewer.on("viewerReady", function() {
      viewer.cartoon("prediction", structure, {
        color: pv.color.byResidueProp("plddt", plddtGradient(), [0, 100])
      });
      viewer.autoZoom();
    });
  });
</script>
```

PV wrapper API:

```ts
type PVViewerAdapter = {
  loadPdb(url: string, result: StructureResult): Promise<void>;
  setStyle(style: "cartoon" | "tube" | "trace" | "lines" | "spheres"): void;
  setColorMode(mode: "plddt" | "chain" | "element" | "secondaryStructure"): void;
  highlightResidue(residue?: ResidueRef): void;
  setSelection(residues: ResidueRef[]): void;
  fitSelection(): void;
  resetCamera(): void;
  spin(enabled: boolean): void;
  destroy(): void;
};
```

PV event handling:

```js
viewer.on("click", function(picked, ev) {
  if (picked === null || picked.target() === null) return;
  if (picked.node().structure === undefined) return;

  const atom = picked.target();
  const residue = atom.residue();

  appEvents.onResidueClicked({
    chainId: residue.chain().name(),
    residueIndex: residue.num(),
    residueName: residue.name()
  }, {
    extendSelection: ev.shiftKey
  });
});
```

PV selection pattern:

PV's sample selection implementation creates or reuses a structure view, toggles atoms with `removeAtom` / `addAtom`, applies `setSelection`, and calls `viewer.requestRedraw()`. For an AlphaFold-style demo, selection should operate at residue level, not atom level:

```js
function setResidueSelection(renderObject, residues) {
  const structure = renderObject.structure();
  const selection = structure.createEmptyView();

  residues.forEach(function(ref) {
    const residueView = structure.select({
      cname: ref.chainId,
      rnum: ref.residueIndex
    });
    residueView.eachAtom(function(atom) {
      selection.addAtom(atom);
    });
  });

  renderObject.setSelection(selection);
  viewer.requestRedraw();
}
```

PV coloring notes:

- If pLDDT values can be placed onto residues as a numeric property, use `pv.color.byResidueProp("plddt", gradient, [0, 100])`.
- If residue properties are awkward to inject, use a custom `ColorOp` that maps residue chain/id to an external `plddtByGlobalIndex` object.
- Preserve AlphaFold-style discrete buckets rather than a continuous rainbow; rainbow coloring conflicts with the confidence legend.

Implementation risk:

- PV may require direct script loading rather than clean ESM imports.
- It should be isolated behind a vendor wrapper.
- Verify mobile gestures. PV added multi-touch support historically, but modern mobile browser behavior should be tested.
- Use only if the project accepts legacy dependency risk.

## Shared PAE heatmap implementation

The PAE heatmap should be custom for both options. Do not rely on the molecule viewer for it.

Use a canvas-based implementation:

```tsx
function PAEHeatmap({
  data,
  showChainBorders,
  hoveredPair,
  onHoverPair,
  onSelectPair
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawPAE(ctx, data, canvas.width, canvas.height, showChainBorders, hoveredPair);
  }, [data, showChainBorders, hoveredPair]);

  return (
    <canvas
      ref={canvasRef}
      width={640}
      height={640}
      onMouseMove={(event) => {
        const pair = getPairFromPointer(event, data.matrix.length);
        onHoverPair(pair);
      }}
      onMouseLeave={() => onHoverPair(undefined)}
      onClick={() => hoveredPair && onSelectPair(hoveredPair)}
    />
  );
}
```

PAE draw function:

```ts
function drawPAE(
  ctx: CanvasRenderingContext2D,
  data: PAEData,
  width: number,
  height: number,
  showChainBorders: boolean,
  hoveredPair?: ViewerState["hoveredPair"]
) {
  const n = data.matrix.length;
  const cellW = width / n;
  const cellH = height / n;

  ctx.clearRect(0, 0, width, height);

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const pae = data.matrix[y][x];
      ctx.fillStyle = paeToGreenScale(pae, data.maxPredictedAlignedError);
      ctx.fillRect(x * cellW, y * cellH, Math.ceil(cellW), Math.ceil(cellH));
    }
  }

  if (showChainBorders) {
    ctx.strokeStyle = "rgba(0, 0, 0, 0.75)";
    ctx.lineWidth = 1;
    for (const breakIndex of data.chainBreaks) {
      const x = breakIndex * cellW;
      const y = breakIndex * cellH;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }

  if (hoveredPair) {
    const x = hoveredPair.scoredResidue * cellW;
    const y = hoveredPair.alignedResidue * cellH;
    ctx.strokeStyle = "rgba(20, 20, 20, 0.85)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function paeToGreenScale(value: number, max: number) {
  const t = Math.max(0, Math.min(1, value / max));
  const lightness = 35 + t * 55;
  return `hsl(145 65% ${lightness}%)`;
}
```

Pointer mapping:

```ts
function getPairFromPointer(
  event: React.MouseEvent<HTMLCanvasElement>,
  residueCount: number
) {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  const scoredResidue = Math.floor((x / rect.width) * residueCount);
  const alignedResidue = Math.floor((y / rect.height) * residueCount);

  return {
    alignedResidue,
    scoredResidue
  };
}
```

PAE interaction behavior:

- Hover a PAE cell: show crosshair, tooltip, and the PAE value.
- Hover a PAE cell: highlight the aligned and scored residues in the 3D viewer.
- Click a PAE cell: pin that pair until the user clears it.
- Toggle chain borders: redraw the overlay lines.
- Keep the heatmap square with `aspect-ratio: 1 / 1`.
- Add axis ticks at chain boundaries and regular residue intervals.

## Feature comparison

| Feature | AlphaFold Server pattern | Mol* option | PV option |
|---|---|---|---|
| 3D protein rendering | Modern molecular viewer, likely Mol*-style controls | Strong fit | Basic fit |
| pLDDT coloring | First-class visual concept | Custom color theme | Custom color op |
| PAE heatmap | Custom 2D canvas plot | Custom canvas needed | Custom canvas needed |
| Chain-border overlay | Canvas overlay | Custom canvas | Custom canvas |
| Residue hover linking | Expected | Supported through selection/loci mapping | Possible through picking and custom selection |
| Selection mode | Built into Mol*-style UI | Strong support | Possible, but manual |
| Screenshot/state snapshot | Viewer toolbar | Built in or adapter-level | Screenshot custom; state snapshot custom |
| Sequence panel | AlphaFold-specific table | Can integrate with Mol* sequence concepts or custom table | Custom table |
| Future extensibility | High | High | Moderate/low |
| Maintenance risk | Low if using Mol* | Low/moderate | High |
| Implementation speed for demo | Medium | Medium | Fast for simple viewer, slower for AlphaFold parity |

## Recommended paths

### Path 1: Best AlphaFold-like result

Use Mol* for the 3D viewer and a custom canvas for PAE.

Choose this if:

- The demo should feel credible to scientific users.
- You want selection, screenshots, camera controls, and future measurements.
- You expect to support `mmCIF`, ligands, nucleic acids, or ions.

Build order:

1. Implement static layout and pLDDT legend.
2. Add Mol* structure loading.
3. Add pLDDT coloring.
4. Add PAE canvas rendering.
5. Link PAE hover to Mol* highlighting.
6. Add sequence table and residue linking.
7. Add screenshot/reset/fullscreen controls.

### Path 2: Lightweight educational demo

Use PV for the 3D viewer and a custom canvas for PAE.

Choose this if:

- The demo is self-contained and controlled.
- You only need PDB loading, cartoon rendering, simple color modes, and basic selection.
- You want a smaller, simpler viewer wrapper and accept legacy dependency risk.

Build order:

1. Vendor `bio-pv.min.js` under `public/vendor/`.
2. Build `PVProteinViewer` as an imperative adapter component.
3. Load one bundled demo PDB.
4. Add custom pLDDT color operation.
5. Add PAE canvas and tooltip.
6. Add click/shift-click residue selection.
7. Test mobile and high-DPI behavior.

### Path 3: Hybrid design-first prototype

Use a static/generated protein visual and build the PAE/legend/sequence interactions first. Replace the static visual with Mol* later.

Choose this if:

- Claude Design needs to explore the UI before engineering the real molecular viewer.
- The immediate goal is a compelling AlphaFold-at-home demonstration screen.
- You need fast design iteration.

Build order:

1. Use a rendered protein PNG or simple Three.js ribbon placeholder.
2. Build the full AlphaFold-style shell.
3. Make the PAE heatmap interactive.
4. Simulate residue highlighting.
5. Swap in Mol* once the layout and interaction model are approved.

## Design guidance for Claude Design

Do:

- Make the main screen the actual tool, not a landing page.
- Use a quiet scientific workspace style.
- Use compact typography.
- Put real data visualizations above explanation text.
- Use icon buttons for viewer tools.
- Keep the pLDDT legend as data UI, not decoration.
- Make the PAE heatmap square and inspectable.
- Make hover states precise and immediate.

Avoid:

- Oversized marketing hero sections.
- Decorative gradients or abstract backgrounds.
- Card-heavy layouts around every panel.
- Text explaining obvious controls inside the app.
- One-note blue/purple themes.
- Fake charts that do not map to residue data.

## Final recommendation

For the actual app, use Mol* plus a custom PAE canvas. That gives the closest AlphaFold Server behavior with the least long-term technical risk.

Keep PV as a secondary option for a lightweight, legacy-compatible prototype or a teaching-only mode. PV is valuable because it is simple and fast, but its unmaintained status makes it a poor default for a modern AlphaFold-at-home product.
