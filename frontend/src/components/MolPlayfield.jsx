// Mol* 3D viewer component (recycle-frame playback + live lens annotations).
// Extracted from App.jsx. Pure move + import wiring; rendering logic unchanged.

import { Component, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { fetchReferencePdb } from "../lib/api";
import { CONTACT_DELTA_STYLES, visibleContactDeltaCells } from "../lib/contactDeltaView";
import { groupResidueColors, residueColorLegend } from "../lib/lensColors";
import { localFrameSegmentForLength } from "../lib/localFrameSegment";
import { superposePdbToReference } from "../lib/superpose";
import { st, withTimeout, fallbackPdb } from "../lib/viewer";

// Per-lens accent colours (match App C.coev/tri/ipa/fape/rec) for solid overlays.
const LENS_COLORS = { coevolution: "#2fd6ff", triangle: "#3dffa8", ipa: "#b06bff", fape: "#ff4fd8", recycling: "#ffb347" };

class MolPlayfield extends Component {
  constructor(props) { super(props); this.host = null; this.plugin = null; this.roots = new WeakMap(); this.state = { mode: "loading", lensLabel: "" }; this._mounted = false; this._loadSeq = 0; this._contactLineRefs = []; this._trajKey = null; this._trajFailed = false; this._trajModelRef = null; this._trajCount = 0; this._trajTransforms = null; this._initOffset = 0; }
  componentDidMount() { this._mounted = true; this.load({ resetCamera: true }); }
  componentDidUpdate(prev) {
    const frames = this.props.frames;
    const trajCapable = Array.isArray(frames) && frames.length > 1 && !this._trajFailed;
    const lensesChanged = (prev.activeLenses || []).join(",") !== (this.props.activeLenses || []).join(",");
    const selChanged = (prev.selectedResidues || []).join(",") !== (this.props.selectedResidues || []).join(",");
    const reflectChanged = prev.reflected !== this.props.reflected;
    if (trajCapable) {
      const key = this.framesKey(frames);
      if (key !== this._trajKey || reflectChanged) { const newRun = key !== this._trajKey; this._trajKey = key; this.loadTrajectory(frames, this.props.frameIndex || 0, newRun); return; }
      if (prev.frameIndex !== this.props.frameIndex) { this.stepModel(this.props.frameIndex || 0); return; }
    } else {
      this._trajKey = null;
      const previewSequenceChanged = !this.props.pdb && !this.props.pdbId && prev.fallbackSequence !== this.props.fallbackSequence;
      if (prev.pdb !== this.props.pdb || prev.pdbId !== this.props.pdbId || previewSequenceChanged || reflectChanged) {
        const frameToFrame = !!(prev.pdb && this.props.pdb) && !reflectChanged;
        this.load({ resetCamera: !frameToFrame, quiet: frameToFrame });
        return;
      }
      if (prev.colorMode !== this.props.colorMode) this.applyVisualTheme();
    }
    if (lensesChanged || selChanged || prev.lens !== this.props.lens || prev.lensModel !== this.props.lensModel) this.applyLensAnnotations();
    if (prev.lensModel !== this.props.lensModel || lensesChanged || prev.lens !== this.props.lens || prev.colorMode !== this.props.colorMode) { this.applyColorTheme(); this.applyResidueOverlay(); }
    if (lensesChanged) this.applySpin();
    if (prev.lensModel !== this.props.lensModel || lensesChanged) this.applyContactLines();
  }
  componentWillUnmount() { this._mounted = false; this._loadSeq += 1; try { if (this.plugin && this.plugin.dispose) this.plugin.dispose(); } catch (e) { void e; } this.plugin = null; this._contactLineRefs = []; }
  mirrorPdb(text) {
    return String(text || "").split("\n").map((l) => {
      if (l.startsWith("ATOM") || l.startsWith("HETATM")) {
        const x = parseFloat(l.slice(30, 38));
        if (!Number.isNaN(x)) return l.slice(0, 30) + (-x).toFixed(3).padStart(8) + l.slice(38);
      }
      return l;
    }).join("\n");
  }

  // IPA in the main viewer: gently auto-spin so "no privileged orientation" is
  // something you watch, not just read. Spin only while the IPA lens is active.
  async applySpin() {
    if (!this.plugin) return;
    const spin = (this.props.activeLenses || []).includes("ipa");
    try {
      const { PluginCommands } = await import("molstar/lib/mol-plugin/commands");
      await PluginCommands.Canvas3D.SetSettings(this.plugin, { settings: (props) => {
        if (props.trackball) props.trackball.animate = spin ? { name: "spin", params: { speed: 0.6 } } : { name: "off", params: {} };
      } });
    } catch (e) { void e; }
  }

  async resolvePdb() {
    // A real recycle-frame PDB string wins; otherwise pull the reference
    // crystal structure for this target from RCSB by its PDB id.
    if (this.props.pdb) {
      // Superpose each recycle frame onto the final recycle (alignment only) so
      // playback shows internal refinement, not global tumbling. See superpose.js.
      let text = this.props.referenceCa
        ? superposePdbToReference(this.props.pdb, this.props.referenceCa, this.props.frameCa || null)
        : this.props.pdb;
      if (this.props.reflected) text = this.mirrorPdb(text);
      return { text, label: (this.props.frame && this.props.frame.label) || "recycle.pdb", source: "real" };
    }
    if (this.props.pdbId) {
      try {
        const text = await withTimeout(fetchReferencePdb(this.props.pdbId), 10000, `RCSB ${this.props.pdbId}`);
        return { text, label: `${this.props.pdbId} (RCSB)`, source: "rcsb" };
      } catch (err) {
        console.info("RCSB reference unavailable; using local preview PDB", err);
        return { text: fallbackPdb(this.props.fallbackSequence, `${this.props.pdbId} preview`), label: `${this.props.pdbId} preview`, source: "preview" };
      }
    }
    return { text: fallbackPdb(this.props.fallbackSequence, "FIY preview"), label: "FIY preview", source: "preview" };
  }

  async applyDarkCanvas() {
    if (!this.plugin) return;
    try {
      const [{ PluginCommands }, { Color }] = await Promise.all([
        import("molstar/lib/mol-plugin/commands"),
        import("molstar/lib/mol-util/color"),
      ]);
      await PluginCommands.Canvas3D.SetSettings(this.plugin, { settings: (props) => {
        props.renderer.backgroundColor = Color(0x050812);
        props.postprocessing = {
          ...props.postprocessing,
          shadow: { name: "on", params: { steps: 2, maxDistance: 4, tolerance: 1 } },
          outline: { name: "on", params: { scale: 1, threshold: 0.33, color: Color(0x000000), includeTransparent: true } },
        };
        if (props.camera && props.camera.helper && props.camera.helper.axes) props.camera.helper.axes = { name: "off", params: {} };
      } });
    } catch (err) {
      console.info("Mol* dark canvas unavailable", err);
    }
  }

  async applyColorTheme() {
    if (!this.plugin) return;
    const structures = this.plugin.managers?.structure?.hierarchy?.current?.structures || [];
    if (!structures.length) return;
    const active = new Set(this.props.activeLenses || []);
    const anyLens = ["coevolution", "triangle", "ipa", "fape", "recycling"].some((l) => active.has(l));
    const usePlddt = this.props.colorMode === "plddt" || active.has("confidence");
    const plddtParams = { domain: [0, 100], list: { kind: "interpolate", colors: "red-white-blue" } };
    try {
      let color = "secondary-structure";
      let colorParams;
      if (usePlddt) {
        color = "uncertainty"; colorParams = plddtParams;
      } else if (anyLens) {
        // Neutral slate base so bright lens overlays / lines read with high contrast
        // (pink secondary-structure colouring used to swallow the overlays).
        const { Color } = await import("molstar/lib/mol-util/color");
        color = "uniform"; colorParams = { value: Color(0x39415a) };
      } else if (this.props.colorMode !== "ss") {
        color = "uncertainty"; colorParams = plddtParams;
      }
      for (const structure of structures) {
        await this.plugin.managers.structure.component.updateRepresentationsTheme(structure.components, { color, colorParams });
      }
    } catch (err) {
      console.info("Mol* color theme unavailable", err);
    }
  }

  async applyVisualTheme() {
    await this.applyColorTheme();
    await this.applyResidueOverlay();
  }

  // IPA has no per-residue scalar to colour. Mark ONE contiguous local-frame
  // neighbourhood as a single patch (a coherent region, not scattered dots). Its
  // real, visceral demo - rotate the protein, the local readout is unchanged -
  // lives in the interactive scene (open with the lens ⤢ button).
  localFrameSegment() {
    return localFrameSegmentForLength(this.props.frame?.plddt?.length || this.props.fallbackSequence?.length || 30);
  }

  // Three residues forming a triangle for the Triangle lens. Prefer a real
  // contacting triple from the computed contact map; else three spread points.
  triangleResidues() {
    const lines = this.props.lensModel?.contactLines;
    const src = lines ? (lines.gained?.length ? lines.gained : lines.stable || []) : [];
    if (src.length) {
      const [i, j] = src[0];
      const third = src.find((pr) => pr[0] !== i && pr[1] !== j && pr[0] !== j && pr[1] !== i);
      const k = third ? third[0] : Math.round((i + j) / 2);
      const tri = [...new Set([i + 1, j + 1, k + 1])];
      if (tri.length === 3) return tri;
    }
    const n = Math.max(3, (this.props.frame?.plddt?.length || this.props.fallbackSequence?.length || 30));
    return [Math.round(n * 0.2), Math.round(n * 0.55), Math.round(n * 0.82)].map((r) => Math.max(1, Math.min(n, r)));
  }

  async applyResidueOverlay() {
    if (!this.plugin) return;
    const structures = this.plugin.managers?.structure?.hierarchy?.current?.structures || [];
    const components = structures.flatMap((structure) => structure.components || []);
    if (!components.length) return;
    try {
      const [{ setStructureOverpaint, clearStructureOverpaint }, { Script }, { StructureSelection }, { Color }] = await Promise.all([
        import("molstar/lib/mol-plugin-state/helpers/structure-overpaint"),
        import("molstar/lib/mol-script/script"),
        import("molstar/lib/mol-model/structure"),
        import("molstar/lib/mol-util/color"),
      ]);
      await clearStructureOverpaint(this.plugin, components);
      const paint = async (residues, hex) => {
        if (!residues || !residues.length) return;
        const color = Color(parseInt(String(hex).slice(1), 16));
        await setStructureOverpaint(this.plugin, components, color, async (structure) => {
          const selection = Script.getStructureSelection((Q) => Q.struct.generator.atomGroups({
            "residue-test": Q.core.set.has([Q.core.type.set(residues), Q.struct.atomProperty.macromolecular.label_seq_id()]),
            "group-by": Q.struct.atomProperty.macromolecular.residueKey(),
          }), structure);
          return StructureSelection.toLociWithSourceUnits(selection);
        });
      };
      // (1) Real per-residue gradient (FAPE displacement / confidence pLDDT).
      const groups = groupResidueColors(this.props.lensModel?.residueColors);
      for (const group of groups) await paint(group.residues, group.color);
      // (2) IPA is the only active lens with no per-residue gradient or lines: mark
      // a single local-frame neighbourhood so the toggle does something coherent.
      const active = (this.props.activeLenses && this.props.activeLenses.length) ? this.props.activeLenses : (this.props.lens ? [this.props.lens] : []);
      if (active.includes("ipa") && !groups.length) {
        await paint(this.localFrameSegment(), LENS_COLORS.ipa);
      }
    } catch (err) {
      console.info("Mol* residue color overlay unavailable", err);
    }
  }

  async clearContactLines() {
    if (!this.plugin || !this._contactLineRefs.length) return;
    try {
      const update = this.plugin.state.data.build();
      for (const ref of this._contactLineRefs) update.delete(ref);
      await update.commit({ doNotLogTiming: true });
    } catch (err) {
      console.info("Mol* contact line cleanup unavailable", err);
    } finally {
      this._contactLineRefs = [];
    }
  }

  async residueLoci(structure, seqId) {
    const [{ Script }, { StructureSelection }] = await Promise.all([
      import("molstar/lib/mol-script/script"),
      import("molstar/lib/mol-model/structure"),
    ]);
    const selection = Script.getStructureSelection((Q) => Q.struct.generator.atomGroups({
      "residue-test": Q.core.rel.eq([
        Q.struct.atomProperty.macromolecular.label_seq_id(),
        seqId,
      ]),
      "group-by": Q.struct.atomProperty.macromolecular.residueKey(),
    }), structure);
    return StructureSelection.toLociWithSourceUnits(selection);
  }

  async applyContactLines() {
    await this.clearContactLines();
    if (!this.plugin) return;
    const active = new Set(this.props.activeLenses || []);
    const structure = this.plugin.managers?.structure?.hierarchy?.current?.structures?.[0]?.cell?.obj?.data;
    if (!structure || !this.plugin.managers?.structure?.measurement?.addDistance) return;
    const drawLine = async (a, b, hex, size, dash) => {
      const lociA = await this.residueLoci(structure, a);
      const lociB = await this.residueLoci(structure, b);
      const result = await this.plugin.managers.structure.measurement.addDistance(lociA, lociB, {
        customText: "",
        lineParams: { linesColor: parseInt(hex.slice(1), 16), linesSize: size, dashLength: dash },
        visualParams: { visuals: ["lines"] },
      });
      for (const selector of [result?.representation, result?.selection]) {
        if (selector?.ref) this._contactLineRefs.push(selector.ref);
      }
    };
    try {
      // Coevolution: gained / lost / stable contact lines from real coevolving pairs.
      const lines = this.props.lensModel?.contactLines;
      if (active.has("coevolution") && lines) {
        const cells = visibleContactDeltaCells(lines, { stableLimit: 14 })
          .filter((cell) => cell.kind !== "stable" || (lines.gained?.length || lines.lost?.length || 0) < 10)
          .slice(0, 40);
        for (const { kind, pair } of cells) {
          const styleDef = CONTACT_DELTA_STYLES[kind];
          await drawLine(pair[0] + 1, pair[1] + 1, styleDef.color, kind === "stable" ? 0.035 : 0.07, kind === "lost" ? 0.12 : 0.2);
        }
      }
      // Triangle: one closed triple of distance lines. The loop only closes when
      // all three pairwise distances are mutually consistent - the lens's whole point.
      if (active.has("triangle")) {
        const tri = this.triangleResidues();
        if (tri.length === 3) {
          await drawLine(tri[0], tri[1], "#3dffa8", 0.09, 0.2);
          await drawLine(tri[1], tri[2], "#3dffa8", 0.09, 0.2);
          await drawLine(tri[0], tri[2], "#3dffa8", 0.09, 0.2);
        }
      }
    } catch (err) {
      console.info("Mol* contact line overlay unavailable", err);
      await this.clearContactLines();
    }
  }

  lensResidues() {
    const n = Math.max(1, (this.props.frame?.plddt?.length || this.props.fallbackSequence?.length || 30));
    const clamp = (v) => Math.max(1, Math.min(n, Math.round(v)));
    const presets = {
      coevolution: [2, clamp(n / 3), clamp((2 * n) / 3), n - 1],
      triangle: [3, clamp(n / 2), n - 2],
      ipa: localFrameSegmentForLength(n),
      fape: [clamp(n / 2) - 2, clamp(n / 2) - 1, clamp(n / 2), clamp(n / 2) + 1, clamp(n / 2) + 2],
      recycling: [1, clamp(n / 2), n],
    };
    const active = (this.props.activeLenses && this.props.activeLenses.length ? [...this.props.activeLenses] : [this.props.lens]).filter(Boolean);
    const selected = Array.isArray(this.props.selectedResidues) ? this.props.selectedResidues.map(clamp) : [];
    const computed = Array.isArray(this.props.lensModel?.highlightResidues) ? this.props.lensModel.highlightResidues.map(clamp) : [];
    // Teaching mode keeps the illustrative presets. Real runs use only the
    // residues selected by computed lens data; mixing in presets would imply
    // evidence at arbitrary positions.
    const illustrative = this.props.lensModel ? [] : active.flatMap((id) => presets[id] || []).map(clamp);
    const residues = [...new Set([...illustrative, ...computed, ...selected])];
    if (selected.length) active.push("PAE selection");
    return { active, residues };
  }

  async applyLensAnnotations() {
    const { active, residues } = this.lensResidues();
    const label = active.length ? `${active.join(" + ")}${this.props.lensModel ? "" : " · illustrative"}` : "";
    if (this.state.lensLabel !== label) this.setState({ lensLabel: label });
    if (!this.plugin) return;
    if (!residues.length) {
      this.plugin.managers.interactivity.lociHighlights.clearHighlights();
      return;
    }
    const structure = this.plugin.managers?.structure?.hierarchy?.current?.structures?.[0]?.cell?.obj?.data;
    if (!structure) return;
    try {
      const [{ Script }, { StructureSelection }] = await Promise.all([
        import("molstar/lib/mol-script/script"),
        import("molstar/lib/mol-model/structure"),
      ]);
      // Select EVERY annotated residue (PAE pins both residues; lens presets add more),
      // not just residues[0] (the previous bug the audit flagged).
      const seqIds = residues;
      const selection = Script.getStructureSelection((Q) => Q.struct.generator.atomGroups({
        "residue-test": Q.core.set.has([Q.core.type.set(seqIds), Q.struct.atomProperty.macromolecular.label_seq_id()]),
        "group-by": Q.struct.atomProperty.macromolecular.residueKey(),
      }), structure);
      const loci = StructureSelection.toLociWithSourceUnits(selection);
      this.plugin.managers.interactivity.lociHighlights.highlightOnly({ loci });
    } catch (err) {
      console.info("Mol* lens annotation unavailable", err);
    }
  }
  async load({ resetCamera = true, quiet = false } = {}) {
    const loadSeq = ++this._loadSeq;
    const isCurrent = () => this._mounted && loadSeq === this._loadSeq;
    try {
      if (!quiet) this.setState({ mode: "loading" });
      if (this.plugin) {
        await this.plugin.clear().catch(() => undefined);
      }
      const src = await this.resolvePdb();
      if (!isCurrent()) return;
      if (!src) { this.setState({ mode: "empty" }); return; }
      const [{ createPluginUI }, { DefaultPluginUISpec }, { PluginConfig }] = await withTimeout(Promise.all([
        import("molstar/lib/mol-plugin-ui"),
        import("molstar/lib/mol-plugin-ui/spec"),
        import("molstar/lib/mol-plugin/config"),
      ]), 12000, "Mol* imports");
      if (!isCurrent() || !this.host) return;
      if (!this.plugin) {
        const defaultSpec = DefaultPluginUISpec();
        // Full Mol* viewport tools restored: reset camera, screenshot,
        // fullscreen/settings/lighting. XR/VR is disabled below.
        this.plugin = await withTimeout(createPluginUI({
          target: this.host,
          spec: {
            ...defaultSpec,
            layout: { initial: { isExpanded: false, showControls: false } },
            config: [
              ...(defaultSpec.config || []),
              [PluginConfig.Viewport.ShowXR, false],
              [PluginConfig.Viewport.ShowSelectionMode, false],
              [PluginConfig.Viewport.ShowAnimation, false],
            ],
          },
          render: (component, container) => {
            let root = this.roots.get(container);
            if (!root) { root = createRoot(container); this.roots.set(container, root); }
            root.render(component);
          },
        }), 12000, "Mol* plugin UI");
      }
      if (!isCurrent()) return;
      await this.plugin.clear();
      const data = await withTimeout(this.plugin.builders.data.rawData({ data: src.text, label: src.label }), 8000, "Mol* raw data");
      if (!isCurrent()) return;
      const trajectory = await withTimeout(this.plugin.builders.structure.parseTrajectory(data, "pdb"), 8000, "Mol* PDB parse");
      if (!isCurrent()) return;
      await withTimeout(this.plugin.builders.structure.hierarchy.applyPreset(trajectory, "default", {
        representationPreset: "polymer-cartoon",
        representationPresetParams: {
          ignoreHydrogens: true,
          quality: "auto",
          theme: {
            globalName: this.props.colorMode === "ss" ? "secondary-structure" : "uncertainty",
          },
        },
      }), 12000, "Mol* structure preset");
      await this.applyDarkCanvas();
      await this.applyVisualTheme();
      await this.applyLensAnnotations();
      await this.applyContactLines();
      await this.applySpin();
      if (resetCamera && this.plugin.canvas3d) this.plugin.canvas3d.requestCameraReset();
      if (isCurrent()) this.setState({ mode: "molstar" });
    } catch (err) {
      console.info("Mol* unavailable", err);
      if (isCurrent()) this.setState({ mode: "error" });
    }
  }
  framesKey(frames) {
    if (!Array.isArray(frames) || !frames.length) return null;
    return `${frames.length}:${frames[0]?.label || ""}:${(frames[0]?.pdb || "").length}:${(frames[frames.length - 1]?.pdb || "").length}`;
  }

  buildMultiModelPdb(frames) {
    const ref = this.props.referenceCa || null;
    const real = frames.map((f) => {
      let text = ref ? superposePdbToReference(f.pdb, ref, f.ca || null) : f.pdb;
      if (this.props.reflected) text = this.mirrorPdb(text);
      return String(text || "").split("\n").filter((l) => l.startsWith("ATOM") || l.startsWith("HETATM") || l.startsWith("TER"));
    });
    const models = [];
    this._initOffset = 0;
    real.forEach((atoms) => models.push(atoms.join("\n")));
    return models.map((m, i) => `MODEL     ${i + 1}\n${m}\nENDMDL`).join("\n") + "\nEND\n";
  }

  async loadTrajectory(frames, index, morph) {
    const loadSeq = ++this._loadSeq;
    const isCurrent = () => this._mounted && loadSeq === this._loadSeq;
    try {
      if (!this.host) return;
      if (!this.plugin) { await this.load({ resetCamera: true }); }
      if (!this.plugin) throw new Error("no plugin");
      const multi = this.buildMultiModelPdb(frames);
      const { StateTransforms } = await import("molstar/lib/mol-plugin-state/transforms");
      if (!isCurrent()) return;
      await this.plugin.clear();
      const data = await withTimeout(this.plugin.builders.data.rawData({ data: multi, label: "recycle trajectory" }), 8000, "traj raw");
      if (!isCurrent()) return;
      const trajectory = await withTimeout(this.plugin.builders.structure.parseTrajectory(data, "pdb"), 8000, "traj parse");
      if (!isCurrent()) return;
      const model = await this.plugin.builders.structure.createModel(trajectory);
      const structure = await this.plugin.builders.structure.createStructure(model);
      await this.plugin.builders.structure.representation.applyPreset(structure, "polymer-cartoon");
      this._trajModelRef = model.ref;
      this._trajCount = frames.length + this._initOffset;
      this._trajTransforms = StateTransforms;
      const target = Math.max(0, Math.min(this._trajCount - 1, (index || 0) + this._initOffset));
      if (morph && this._initOffset) {
        this.setState({ initMorphing: true });
        for (let m = 0; m <= target; m += 1) {
          if (!isCurrent()) return;
          await this.plugin.build().to(this._trajModelRef).update(StateTransforms.Model.ModelFromTrajectory, (old) => ({ ...old, modelIndex: m })).commit({ doNotLogTiming: true });
          await new Promise((r) => setTimeout(r, 130));
        }
        if (isCurrent()) this.setState({ initMorphing: false });
      } else if (target) {
        await this.stepModel(index, true);
      }
      await this.applyDarkCanvas();
      await this.applyVisualTheme();
      await this.applyLensAnnotations();
      await this.applyContactLines();
      await this.applySpin();
      // No camera reset here: keep the preview's camera so Fold doesn't snap.
      if (isCurrent()) this.setState({ mode: "molstar" });
    } catch (err) {
      console.info("Mol* trajectory unavailable; falling back to per-frame load", err);
      this._trajFailed = true;
      this._trajModelRef = null;
      this.load({ resetCamera: false, quiet: true });
    }
  }

  async stepModel(index, internal) {
    if (!this.plugin || !this._trajModelRef || !this._trajTransforms) { if (!internal) this.load({ resetCamera: false, quiet: true }); return; }
    try {
      const T = this._trajTransforms;
      const idx = Math.max(0, Math.min(this._trajCount - 1, (index || 0) + this._initOffset));
      await this.plugin.build().to(this._trajModelRef).update(T.Model.ModelFromTrajectory, (old) => ({ ...old, modelIndex: idx })).commit({ doNotLogTiming: true });
      if (!internal) { await this.applyResidueOverlay(); await this.applyLensAnnotations(); await this.applyContactLines(); }
    } catch (err) {
      console.info("Mol* model step failed; falling back", err);
      this._trajFailed = true;
      this.load({ resetCamera: false, quiet: true });
    }
  }

  render() {
    const colorLegend = residueColorLegend(this.props.lensModel?.residueColors);
    return h("div", { "data-testid": "mol-playfield", "data-color-mode": this.props.colorMode || "plddt", style: st("position:absolute;inset:0;background:radial-gradient(circle at 48% 44%,#101a30,#050812 62%,#03040a);transition:background .25s ease;") },
      h("div", { ref: (el) => (this.host = el), className: "molstar-dark-host", style: st(`position:absolute;inset:0;background:#050812;visibility:${this.state.mode === "molstar" ? "visible" : "hidden"};`) }),
      this.state.lensLabel ? h("div", { "data-testid": "mol-lens-annotation", style: st("position:absolute;left:50%;bottom:10px;transform:translateX(-50%);z-index:5;max-width:80%;padding:3px 10px;border-radius:6px;background:rgba(10,6,18,.55);color:#9fb0c8;font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.5px;white-space:nowrap;pointer-events:none;") }, this.state.lensLabel) : null,
      colorLegend ? h("div", { "data-testid": "mol-residue-color-legend", style: st("position:absolute;right:12px;bottom:12px;z-index:5;width:220px;padding:8px 10px;border-radius:8px;background:rgba(10,6,18,.82);border:1px solid rgba(255,255,255,.16);color:#d9d2ef;font-family:'JetBrains Mono',monospace;font-size:9px;pointer-events:none;") },
        h("div", { style: st("margin-bottom:6px;letter-spacing:.5px;") }, colorLegend.title),
        h("div", { style: st(`height:7px;border-radius:4px;background:linear-gradient(90deg,${colorLegend.lowColor},${colorLegend.highColor});`) }),
        h("div", { style: st("display:flex;justify-content:space-between;margin-top:4px;color:#9d8fd6;") }, h("span", null, colorLegend.min), h("span", null, colorLegend.max))) : null,
      this.state.mode !== "molstar" ? h("div", { style: st("position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:'JetBrains Mono',monospace;font-size:12px;color:#6f6298;") }, this.state.mode === "error" ? "Mol* failed to load this structure" : this.state.mode === "empty" ? (this.props.emptyLabel || "Run a fold to see real recycle frames") : "Loading Mol*…") : null);
  }
}

export default MolPlayfield;
