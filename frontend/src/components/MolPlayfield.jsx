// Mol* 3D viewer component (recycle-frame playback + live lens annotations).
// Extracted from App.jsx. Pure move + import wiring; rendering logic unchanged.

import { Component, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { fetchReferencePdb } from "../lib/api";
import { CONTACT_DELTA_STYLES, visibleContactDeltaCells } from "../lib/contactDeltaView";
import { groupResidueColors, residueColorLegend } from "../lib/lensColors";
import { superposePdbToReference } from "../lib/superpose";
import { st, withTimeout, fallbackPdb } from "../lib/viewer";

class MolPlayfield extends Component {
  constructor(props) { super(props); this.host = null; this.plugin = null; this.roots = new WeakMap(); this.state = { mode: "loading", lensLabel: "" }; this._mounted = false; this._loadSeq = 0; this._contactLineRefs = []; }
  componentDidMount() { this._mounted = true; this.load({ resetCamera: true }); }
  componentDidUpdate(prev) {
    const previewSequenceChanged = !this.props.pdb && !this.props.pdbId && prev.fallbackSequence !== this.props.fallbackSequence;
      if (prev.pdb !== this.props.pdb || prev.pdbId !== this.props.pdbId || previewSequenceChanged) {
      const frameToFrame = !!(prev.pdb && this.props.pdb);
      this.load({ resetCamera: !frameToFrame });
    } else if (prev.colorMode !== this.props.colorMode) this.applyVisualTheme();
    if ((prev.activeLenses || []).join(",") !== (this.props.activeLenses || []).join(",") || (prev.selectedResidues || []).join(",") !== (this.props.selectedResidues || []).join(",") || prev.lens !== this.props.lens || prev.lensModel !== this.props.lensModel) this.applyLensAnnotations();
    if (prev.lensModel !== this.props.lensModel) this.applyResidueOverlay();
    if (prev.lensModel !== this.props.lensModel || (prev.activeLenses || []).join(",") !== (this.props.activeLenses || []).join(",")) this.applyContactLines();
  }
  componentWillUnmount() { this._mounted = false; this._loadSeq += 1; try { if (this.plugin && this.plugin.dispose) this.plugin.dispose(); } catch (e) { void e; } this.plugin = null; this._contactLineRefs = []; }
  async resolvePdb() {
    // A real recycle-frame PDB string wins; otherwise pull the reference
    // crystal structure for this target from RCSB by its PDB id.
    if (this.props.pdb) {
      // Superpose each recycle frame onto the final recycle (alignment only) so
      // playback shows internal refinement, not global tumbling. See superpose.js.
      const text = this.props.referenceCa
        ? superposePdbToReference(this.props.pdb, this.props.referenceCa, this.props.frameCa || null)
        : this.props.pdb;
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
      await PluginCommands.Canvas3D.SetSettings(this.plugin, { settings: (props) => { props.renderer.backgroundColor = Color(0x050812); } });
    } catch (err) {
      console.info("Mol* dark canvas unavailable", err);
    }
  }

  async applyColorTheme() {
    if (!this.plugin) return;
    const structures = this.plugin.managers?.structure?.hierarchy?.current?.structures || [];
    if (!structures.length) return;
    const color = this.props.colorMode === "ss" ? "secondary-structure" : "uncertainty";
    try {
      for (const structure of structures) {
        await this.plugin.managers.structure.component.updateRepresentationsTheme(structure.components, {
          color,
          colorParams: color === "uncertainty"
            ? { domain: [0, 100], list: { kind: "interpolate", colors: "red-white-blue" } }
            : undefined,
        });
      }
    } catch (err) {
      console.info("Mol* color theme unavailable", color, err);
    }
  }

  async applyVisualTheme() {
    await this.applyColorTheme();
    await this.applyResidueOverlay();
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
      const groups = groupResidueColors(this.props.lensModel?.residueColors);
      for (const group of groups) {
        const color = Color(parseInt(group.color.slice(1), 16));
        await setStructureOverpaint(this.plugin, components, color, async (structure) => {
          const selection = Script.getStructureSelection((Q) => Q.struct.generator.atomGroups({
            "residue-test": Q.core.set.has([
              Q.core.type.set(group.residues),
              Q.struct.atomProperty.macromolecular.label_seq_id(),
            ]),
            "group-by": Q.struct.atomProperty.macromolecular.residueKey(),
          }), structure);
          return StructureSelection.toLociWithSourceUnits(selection);
        });
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
    const lines = this.props.lensModel?.contactLines;
    if (!active.has("coevolution") || !lines) return;
    const structure = this.plugin.managers?.structure?.hierarchy?.current?.structures?.[0]?.cell?.obj?.data;
    if (!structure || !this.plugin.managers?.structure?.measurement?.addDistance) return;
    const cells = visibleContactDeltaCells(lines, { stableLimit: 14 })
      .filter((cell) => cell.kind !== "stable" || (lines.gained?.length || lines.lost?.length || 0) < 10)
      .slice(0, 40);
    if (!cells.length) return;
    try {
      for (const { kind, pair } of cells) {
        const styleDef = CONTACT_DELTA_STYLES[kind];
        const lociA = await this.residueLoci(structure, pair[0] + 1);
        const lociB = await this.residueLoci(structure, pair[1] + 1);
        const result = await this.plugin.managers.structure.measurement.addDistance(lociA, lociB, {
          customText: "",
          lineParams: {
            linesColor: parseInt(styleDef.color.slice(1), 16),
            linesSize: kind === "stable" ? 0.035 : 0.07,
            dashLength: kind === "lost" ? 0.12 : 0.2,
          },
          visualParams: { visuals: ["lines"] },
        });
        for (const selector of [result?.representation, result?.selection]) {
          if (selector?.ref) this._contactLineRefs.push(selector.ref);
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
      ipa: [clamp(n * 0.25), clamp(n * 0.25) + 1, clamp(n * 0.75), clamp(n * 0.75) + 1],
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
    const label = active.length && residues.length ? `${active.join(" + ")} · residues ${residues.slice(0, 8).join(", ")}${residues.length > 8 ? "…" : ""}` : "";
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
  async load({ resetCamera = true } = {}) {
    const loadSeq = ++this._loadSeq;
    const isCurrent = () => this._mounted && loadSeq === this._loadSeq;
    try {
      this.setState({ mode: "loading" });
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
        // Full Mol* UI: viewport tools (reset camera, axes, fullscreen,
        // screenshot, settings) + zoom/rotate, like the AlphaFold Server viewer.
        this.plugin = await withTimeout(createPluginUI({
          target: this.host,
          spec: {
            ...defaultSpec,
            layout: { initial: { isExpanded: false, showControls: false } },
            config: [
              ...(defaultSpec.config || []),
              [PluginConfig.Viewport.ShowExpand, true],
              [PluginConfig.Viewport.ShowControls, true],
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
      if (resetCamera && this.plugin.canvas3d) this.plugin.canvas3d.requestCameraReset();
      if (isCurrent()) this.setState({ mode: "molstar" });
    } catch (err) {
      console.info("Mol* unavailable", err);
      if (isCurrent()) this.setState({ mode: "error" });
    }
  }
  render() {
    const colorLegend = residueColorLegend(this.props.lensModel?.residueColors);
    return h("div", { "data-testid": "mol-playfield", "data-color-mode": this.props.colorMode || "plddt", style: st("position:absolute;inset:0;background:radial-gradient(circle at 48% 44%,#101a30,#050812 62%,#03040a);transition:background .25s ease;") },
      h("div", { ref: (el) => (this.host = el), className: "molstar-dark-host", style: st(`position:absolute;inset:0;background:#050812;visibility:${this.state.mode === "molstar" ? "visible" : "hidden"};`) }),
      this.state.lensLabel ? h("div", { "data-testid": "mol-lens-annotation", style: st("position:absolute;left:12px;top:12px;z-index:5;max-width:70%;padding:6px 9px;border-radius:8px;background:rgba(10,6,18,.78);border:1px solid rgba(61,255,168,.38);color:#bfffe5;font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.4px;pointer-events:none;") }, "MOL* LENS · ", this.state.lensLabel) : null,
      colorLegend ? h("div", { "data-testid": "mol-residue-color-legend", style: st("position:absolute;right:12px;bottom:12px;z-index:5;width:220px;padding:8px 10px;border-radius:8px;background:rgba(10,6,18,.82);border:1px solid rgba(255,255,255,.16);color:#d9d2ef;font-family:'JetBrains Mono',monospace;font-size:9px;pointer-events:none;") },
        h("div", { style: st("margin-bottom:6px;letter-spacing:.5px;") }, colorLegend.title),
        h("div", { style: st(`height:7px;border-radius:4px;background:linear-gradient(90deg,${colorLegend.lowColor},${colorLegend.highColor});`) }),
        h("div", { style: st("display:flex;justify-content:space-between;margin-top:4px;color:#9d8fd6;") }, h("span", null, colorLegend.min), h("span", null, colorLegend.max))) : null,
      this.state.mode !== "molstar" ? h("div", { style: st("position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:'JetBrains Mono',monospace;font-size:12px;color:#6f6298;") }, this.state.mode === "error" ? "Mol* failed to load this structure" : this.state.mode === "empty" ? (this.props.emptyLabel || "Run a fold to see real recycle frames") : "Loading Mol*…") : null);
  }
}

export default MolPlayfield;
