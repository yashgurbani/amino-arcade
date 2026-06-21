import { Component, createElement as h } from "react";
import "molstar/build/viewer/molstar.css";
import "./App.css";
import { arcadeTargets as curatedArcadeTargets } from "./data/targets";
import {
  cancelPredictionJob,
  createPredictionJob,
  fetchCapabilities,
  fetchPredictionJob,
  fetchPredictionJobs,
  fetchPredictionLogs,
  fetchPredictionReport,
  fetchPredictionResult,
  fetchPhysicsStatus,
  fetchDemoResultForSequence,
  isDemoCacheEnabled,
  runLocalRelaxation,
} from "./lib/api";
import { computeLensModel, lensContactLines, lensMetrics as computeLensMetrics } from "./lib/lensModel";
import { convergenceSeries, isLowConfidence } from "./lib/recycleMetrics";
import { computeEnsembleMetrics } from "./lib/ensembleMetrics";
import { cleanSequence, maxOf, meanOf, minOf, parsePdbAtoms, pdbToCif, slug } from "./lib/sequence";
import { truthLabels } from "./lib/truthLabels";
import { withCifExportWatermark, withJsonExportWatermark, withPdbExportWatermark } from "./lib/exportMetadata";
import { st } from "./lib/viewer";
import MolPlayfield from "./components/MolPlayfield";
import ContactDeltaMap from "./components/ContactDeltaMap";
import EnsemblePanel from "./components/EnsemblePanel";
import LensRail from "./components/LensRail";
import TourOverlay from "./components/TourOverlay";
import { glossary, equationDeck } from "./data/paperGrounding";
import PaePanel from "./components/PaePanel";
import PhysicsModePanel from "./components/PhysicsModePanel";
import RecycleTimeline from "./components/RecycleTimeline";
import ResultInspector from "./components/ResultInspector";

// ---------------------------------------------------------------------------
// Amino Arcade — faithful port of the Claude Design prototype
// (Amino Arcade.dc.html) onto the real LocalColabFold + Mol* backend.
//
// What is preserved from the prototype:
//   - the arcade cockpit chrome, palette, and JetBrains Mono visual language
//   - all five interactive concept scenes (coevolution / triangle / IPA /
//     FAPE / recycling), the transparent score popup and backend-info popup
//   - the stylized SVG ribbon used as a teaching preview before a real fold
//
// What is wired to the backend (per CLAUDECODE_BACKEND_HANDOFF.md):
//   - a single Mol* playfield (no STRUCTURE/ARCADE toggle) that loads real
//     LocalColabFold recycle PDB frames once a fold completes
//   - the six named arcade proteins are real, foldable amino-acid sequences
//   - live readouts (pLDDT / contact / score / trajectory) derive from the
//     active real frame when one exists, otherwise from the teaching model
// ---------------------------------------------------------------------------

// Inline CSS string -> React style object (lets us reuse the prototype's
// exact style strings verbatim instead of re-typing them as objects).
function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

class App extends Component {
  C = {
    bg0: "#0a0612", bg1: "#150f30", bg2: "#1d1640", bg3: "#271d54",
    border: "#2c2350", borderHi: "#4a3d72",
    hi: "#f3f0ff", mid: "#9d8fd6", dim: "#6f6298",
    coev: "#2fd6ff", tri: "#3dffa8", ipa: "#b06bff", fape: "#ff4fd8", rec: "#ffb347",
    green: "#3dffa8", cyan: "#2fd6ff", magenta: "#ff4fd8", amber: "#ffb347", purple: "#b06bff", danger: "#ff5a6a",
  };

  state = {
    view: "stage",
    custom: { seq: "NLYIQWLKDGGPSSGRPPPS", t: 0, running: false, done: false, logs: [], elapsed: 0 },
    target: 0, frame: 5, rot: 0.6, rotX: -0.18, spin: true, hoverRes: null, colorMode: "ss", selectedPae: null,
    overlays: { coevolution: false, triangle: false, ipa: false, fape: false, recycling: false },
    reflected: false, mapMode: "contact",
    expanded: null, showScore: false, showInfo: false,
    coev: { view: "cov", guess: null }, tri: this.initTri(), ipa: { thetaG: 0, naive: false }, fape: { reflected: false, naive: false }, rec: this.initRec(),
    // backend
    engine: "localcolabfold", capabilities: [], result: null, resultSeq: null,
    job: null, loading: false, error: "", archiveJobs: [], report: null, realIndex: 0, realPlaying: false, selectedModel: 0, runLog: [], jobPopupOpen: false, pendingSeq: "", lastRun: null,
    inspectorTab: "result", tourOpen: false, molFull: false, physicsStatus: null, physicsRunning: false, physicsResult: null, physicsError: "",
  };

  componentDidMount() {
    this._spin = setInterval(() => { if (this.state.view === "stage" && this.state.spin && !this._drag && !this.hasReal()) this.setState((s) => ({ rot: s.rot + 0.04 })); }, 70);
    fetchCapabilities()
      .then((items) => {
        const list = Array.isArray(items) ? items : items.engines || items.capabilities || [];
        const available = list.filter((item) => item.available !== false);
        const preferred = available.find((item) => item.id === "localcolabfold") || available.find((item) => item.id === "educational-simulator") || available[0];
        this.setState({ capabilities: list, engine: preferred ? preferred.id : "educational-simulator", physicsStatus: items.physics || null });
      })
      .catch(() => undefined);
    fetchPhysicsStatus()
      .then((physicsStatus) => this.setState({ physicsStatus }))
      .catch((err) => this.setState({ physicsError: err.message || "Physics status unavailable." }));
    this.refreshArchive();
  }
  componentWillUnmount() {
    clearInterval(this._spin); clearInterval(this._triT); clearInterval(this._recT); clearInterval(this._playT); clearInterval(this._foldT);
  }

  // ---------- real backend ----------
  resultModels() {
    const r = this.state.result;
    if (Array.isArray(r?.models) && r.models.length) return r.models;
    if (Array.isArray(r?.frames) && r.frames.length) {
      return [{ rank: 1, model_id: "rank_001", mean_plddt: meanOf(r.plddt || []), ptm: r.ptm ?? null, iptm: r.iptm ?? null, pae: r.pae, frames: r.frames, final_pdb: r.pdb, plddt: r.plddt }];
    }
    return [];
  }
  activeModel() {
    const models = this.resultModels();
    if (!models.length) return null;
    return models[Math.max(0, Math.min(this.state.selectedModel || 0, models.length - 1))];
  }
  hasReal(seq) {
    const r = this.state.result;
    const expected = seq || (this.state.view === "stage" ? this.arcadeTargets()[this.state.target]?.seq : this.state.custom.seq);
    const model = this.activeModel();
    const frames = model?.frames || r?.frames;
    return !!(r && Array.isArray(frames) && frames.length && (!expected || this.state.resultSeq === cleanSequence(expected)));
  }
  realFrames() {
    const model = this.activeModel();
    const frames = model?.frames || this.state.result?.frames || [];
    if (!this.hasReal()) return [];
    return frames.map((f, i) => ({
      ...f,
      index: f.index ?? i,
      label: f.label || (i === 0 ? "Recycle 0" : `Recycle ${i}`),
      plddt: Array.isArray(f.plddt) && f.plddt.length ? f.plddt : [],
      ca: Array.isArray(f.ca) && f.ca.length ? f.ca : [],
      observables: f.observables || {},
    }));
  }
  expectedResultSeq() {
    const expected = this.state.view === "stage" ? this.arcadeTargets()[this.state.target]?.seq : this.state.custom.seq;
    return expected ? cleanSequence(expected) : "";
  }
  realActive() {
    if (this.state.resultSeq !== this.expectedResultSeq()) return null;
    const fr = this.realFrames();
    if (!fr.length) return null;
    return fr[Math.min(this.state.realIndex, fr.length - 1)];
  }
  analysisActive() {
    const a = this.activeAnalysis();
    if (!a || !a.available || !Array.isArray(a.frames) || !a.frames.length) return null;
    return a.frames[Math.min(this.state.realIndex, a.frames.length - 1)] || null;
  }
  activeAnalysis() {
    const r = this.state.result;
    const model = this.activeModel();
    return (model && model.analysis) || (r && r.analysis) || null;
  }
  referenceCa() {
    const fr = this.realFrames();
    if (!fr.length) return null;
    const last = fr[fr.length - 1];
    return Array.isArray(last.ca) && last.ca.length ? last.ca : null;
  }

  async refreshArchive() {
    try { const data = await fetchPredictionJobs(); const jobs = Array.isArray(data) ? data : data.recent_jobs || data.jobs || []; this.setState({ archiveJobs: Array.isArray(jobs) ? jobs : [] }); }
    catch { this.setState({ archiveJobs: [] }); }
  }

  engineForRun() {
    const list = this.state.capabilities.length ? this.state.capabilities : [{ id: "educational-simulator", available: true }];
    const current = list.find((item) => item.id === this.state.engine);
    if (current && current.available !== false) return current.id;
    const fallback = list.find((item) => item.id === "educational-simulator" && item.available !== false) || list.find((item) => item.available !== false);
    return fallback ? fallback.id : "educational-simulator";
  }

  addRunLog(fiy, t, x, c) {
    const entry = { t, x, c };
    this.setState((s) => {
      const next = { runLog: [...(s.runLog || []), entry].slice(-80) };
      if (fiy) next.custom = { ...s.custom, logs: [...(s.custom.logs || []), entry].slice(-80) };
      return next;
    });
  }

  terminalLines() {
    const job = this.state.job;
    const defaults = [
      { t: "··", x: "READY backend status console", c: this.C.mid },
      { t: "··", x: `ENGINE ${this.state.engine}`, c: this.C.dim },
      { t: "··", x: "RUN FOLD to stream job status and backend logs", c: this.C.dim },
    ];
    const lines = (this.state.runLog && this.state.runLog.length ? this.state.runLog : defaults).slice(-9);
    if (job && job.status) return [...lines, { t: "JOB", x: `${job.id ? String(job.id).slice(0, 8) : "pending"} · ${String(job.status).toUpperCase()}`, c: job.status === "failed" ? this.C.danger : job.status === "succeeded" ? this.C.green : this.C.cyan }].slice(-10);
    return lines;
  }

  renderTerminal(title = "ENGINE TERMINAL") {
    const C = this.C;
    return h("div", { "data-testid": "fold-terminal", style: st("flex:none;padding:12px 14px;border-top:1px solid #2c2350;background:linear-gradient(180deg,rgba(10,6,18,.74),rgba(8,6,18,.96));") },
      h("div", { style: st("display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;") },
        h("span", { style: st("font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:1px;color:#7a6aa8;") }, title),
        h("span", { style: st(`font-family:'JetBrains Mono',monospace;font-size:9px;color:${this.state.loading ? C.cyan : this.state.error ? C.danger : C.green};`) }, this.state.loading ? "STREAMING" : this.state.error ? "ERROR" : "READY")),
      h("div", { style: st("max-height:116px;overflow:auto;border-radius:8px;border:1px solid #2c2350;background:#070510;padding:8px 9px;font-family:'JetBrains Mono',monospace;font-size:10.5px;line-height:1.55;") },
        this.terminalLines().map((line, i) => h("div", { key: i, style: st("display:flex;gap:8px;align-items:flex-start;") },
          h("span", { style: st("flex:none;width:32px;color:#4a3d72;") }, line.t),
          h("span", { style: st(`color:${line.c || C.mid};white-space:pre-wrap;`) }, line.x)))));
  }

  runOptions(engine, sequence = "") {
    if (engine !== "localcolabfold") return {};
    const length = cleanSequence(sequence).length;
    const target = this.arcadeTargets().find((item) => cleanSequence(item.seq) === cleanSequence(sequence));
    const options = length && length <= 500 ? { num_recycle: 8, num_models: 1 } : { num_recycle: 4, num_models: 1 };
    if (target?.msaMode) options.msa_mode = target.msaMode;
    return options;
  }

  jobProgress() {
    if (this.state.job?.status === "succeeded") return 100;
    if (this.state.job?.status === "failed" || this.state.error) return Math.max(1, Math.round((this.state.custom.t || 0.2) * 100));
    return this.state.result ? 100 : 0;
  }
  jobElapsedLabel() {
    const seconds = Math.max(0, Math.round(this.state.custom.elapsed || 0));
    const minutes = Math.floor(seconds / 60);
    const rest = String(seconds % 60).padStart(2, "0");
    return `${minutes}:${rest}`;
  }

  finalPdb() {
    const active = this.realActive();
    const model = this.activeModel();
    return active?.pdb || model?.final_pdb || this.state.result?.pdb || "";
  }
  confidenceSummary() {
    const model = this.activeModel();
    const values = this.realPlddt() || this.state.result?.plddt || [];
    const pae = this.realPae();
    const frames = this.realFrames();
    const low = values.filter((v) => Number(v) < 50).length;
    const chains = parsePdbAtoms(this.finalPdb()).reduce((set, atom) => set.add(atom.chain_id || "A"), new Set());
    const ptm = Number(model?.ptm);
    const iptm = Number(model?.iptm);
    const meanPlddt = Number(model?.mean_plddt ?? meanOf(values));
    return {
      plddt_mean: Number(meanPlddt.toFixed(2)) || null,
      plddt_min: Number(minOf(values).toFixed(2)) || null,
      plddt_max: Number(maxOf(values).toFixed(2)) || null,
      ptm: Number.isFinite(ptm) ? Number(ptm.toFixed(3)) : null,
      iptm: Number.isFinite(iptm) ? Number(iptm.toFixed(3)) : null,
      ranking_score: Number.isFinite(ptm) && Number.isFinite(iptm) ? Number((0.8 * iptm + 0.2 * ptm).toFixed(3)) : (Number.isFinite(meanPlddt) ? Number(meanPlddt.toFixed(2)) : null),
      fraction_disordered: values.length ? Number((low / values.length).toFixed(3)) : null,
      has_clash: false,
      chain_count: Math.max(1, chains.size || 1),
      chain_ptm: {},
      chain_iptm: {},
      chain_pair_iptm: {},
      chain_pair_pae_min: pae ? { "A:A": Number(minOf(pae.flat()).toFixed(3)) } : {},
      frame_count: frames.length,
      note: "LocalColabFold/AF2-family output does not provide AF3 ranking_score, ipTM chain-pair metrics, ligands, ions, DNA/RNA, or chemical modifications.",
    };
  }
  fullDataExport() {
    const pdb = this.finalPdb();
    const atoms = parsePdbAtoms(pdb);
    const pae = this.realPae();
    const tokens = [...new Map(atoms.map((atom) => [`${atom.chain_id}:${atom.residue_id}`, atom])).values()];
    return {
      format: "amino-arcade-full-data-v1",
      sequence: this.state.resultSeq,
      engine: this.state.result?.engine || this.state.job?.engine || this.state.engine,
      provenance: this.state.result?.provenance || null,
      selected_model: this.activeModel() ? { rank: this.activeModel().rank, model_id: this.activeModel().model_id, seed: this.activeModel().seed } : null,
      summary_confidences: this.confidenceSummary(),
      atom_chain_ids: atoms.map((atom) => atom.chain_id),
      atom_plddts: atoms.map((atom) => atom.plddt),
      token_chain_ids: tokens.map((atom) => atom.chain_id),
      token_res_ids: tokens.map((atom) => atom.residue_id),
      pae,
      contact_probs: this.contactProximityScore(),
      limitations: ["AF3 multimolecule entities are not inferred by the local AF2-family backend.", "PAE/contact arrays are exported when available from LocalColabFold artifacts."],
    };
  }
  contactProximityScore() {
    const frame = this.realActive();
    const ca = frame?.ca || [];
    if (!ca.length) return null;
    return ca.map((a, i) => ca.map((b, j) => {
      if (i === j) return 1;
      const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      return Number(Math.max(0, Math.min(1, (10 - d) / 8)).toFixed(3));
    }));
  }
  jobRequestExport() {
    return {
      sequence: this.state.resultSeq || this.state.pendingSeq,
      engine: this.state.result?.engine || this.state.job?.engine || this.state.engine,
      options: this.state.job?.options || this.runOptions(this.state.engine, this.state.resultSeq || this.state.pendingSeq),
      guardrail: this.state.result?.meta?.guardrail || null,
      created_by: "Amino Arcade local companion",
      not_for_clinical_use: true,
    };
  }
  exportContext() {
    const model = this.activeModel();
    const active = this.realActive();
    return {
      sequence: this.state.resultSeq || this.state.pendingSeq,
      engine: this.state.result?.engine || this.state.job?.engine || this.state.engine,
      model,
      frameLabel: active?.label || (model ? "final model" : "current teaching frame"),
    };
  }
  renderModelSelector() {
    const C = this.C;
    const models = this.resultModels();
    if (models.length < 2) return null;
    const selected = Math.max(0, Math.min(this.state.selectedModel || 0, models.length - 1));
    const ensemble = computeEnsembleMetrics(models);
    return h("div", { style: st("flex:none;padding:13px 16px;border-bottom:1px solid #2c2350;background:rgba(10,6,18,.28);") },
      h("div", { style: st("display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:9px;") },
        h("div", null,
          h("div", { style: st("font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:1px;color:#7a6aa8;") }, "RANKED MODELS"),
          h("div", { style: st("margin-top:3px;font-size:10.5px;line-height:1.35;color:#8a7cba;") }, "ranked by predicted confidence (pLDDT/pTM)")),
        h("span", { style: st("font-family:'JetBrains Mono',monospace;font-size:10px;color:#3dffa8;white-space:nowrap;") }, `${models.length} predictions`)),
      h("div", { style: st("display:grid;grid-template-columns:repeat(auto-fit,minmax(76px,1fr));gap:7px;") },
        models.slice(0, 5).map((model, i) => {
          const active = i === selected;
          const mean = Number(model.mean_plddt ?? meanOf(model.plddt || []));
          const ptm = Number(model.ptm);
          const iptm = Number(model.iptm);
          const sub = Number.isFinite(iptm) && Number.isFinite(ptm) ? `ipTM ${iptm.toFixed(2)}` : Number.isFinite(ptm) ? `pTM ${ptm.toFixed(2)}` : model.model_id || "";
          return h("button", {
            key: model.rank || i,
            onClick: () => this.setState({ selectedModel: i, realIndex: 0, selectedPae: null }),
            title: "Select prediction rank " + (model.rank || i + 1),
            style: st(`min-width:0;text-align:left;padding:8px 9px;border-radius:9px;border:1px solid ${active ? C.green : C.borderHi};background:${active ? "rgba(61,255,168,.14)" : "#0a0612"};box-shadow:${active ? "0 0 14px rgba(61,255,168,.25)" : "none"};cursor:pointer;font-family:'JetBrains Mono',monospace;`)
          },
            h("div", { style: st(`font-size:10px;font-weight:800;letter-spacing:.6px;color:${active ? C.green : C.hi};`) }, `RANK ${model.rank || i + 1}`),
            h("div", { style: st(`margin-top:3px;font-size:15px;font-weight:800;color:${this.plddt(mean || 0)};`) }, Number.isFinite(mean) ? mean.toFixed(1) : "N/A"),
            h("div", { style: st("margin-top:2px;font-size:8.5px;color:#8a7cba;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;") }, sub));
        })),
      h(EnsemblePanel, { colors: C, metrics: ensemble, selectedModel: selected }));
  }
  downloadText(filename, content, type = "text/plain") {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  downloadArtifact(kind) {
    const base = slug(this.state.resultSeq || this.state.pendingSeq || "amino-arcade-fold");
    const context = this.exportContext();
    if (kind === "pdb") return this.downloadText(`${base}.pdb`, withPdbExportWatermark(this.finalPdb(), context), "chemical/x-pdb");
    if (kind === "cif") return this.downloadText(`${base}.cif`, withCifExportWatermark(pdbToCif(this.finalPdb(), base), context), "chemical/x-cif");
    if (kind === "pae") return this.downloadText(`${base}_pae.json`, JSON.stringify(withJsonExportWatermark({ pae: this.realPae() }, context), null, 2), "application/json");
    if (kind === "summary") return this.downloadText(`${base}_summary_confidences.json`, JSON.stringify(withJsonExportWatermark(this.confidenceSummary(), context), null, 2), "application/json");
    if (kind === "full") return this.downloadText(`${base}_full_data.json`, JSON.stringify(withJsonExportWatermark(this.fullDataExport(), context), null, 2), "application/json");
    if (kind === "request") return this.downloadText(`${base}_job_request.json`, JSON.stringify(withJsonExportWatermark(this.jobRequestExport(), context), null, 2), "application/json");
    return undefined;
  }

  async runPhysicsRelaxation() {
    const pdb = this.finalPdb();
    if (!pdb) {
      this.setState({ physicsError: "No PDB coordinates are loaded for local relaxation." });
      return;
    }
    this.setState({ physicsRunning: true, physicsError: "", physicsResult: null });
    try {
      const result = await runLocalRelaxation(pdb, 200);
      this.setState({ physicsRunning: false, physicsResult: result, physicsError: "" });
    } catch (err) {
      this.setState({ physicsRunning: false, physicsError: err.message || "Local relaxation failed." });
    }
  }

  renderJobPopup() {
    const C = this.C, st2 = this.state, job = st2.job;
    if (!st2.loading && !st2.error) return null;
    const progress = this.jobProgress();
    const running = st2.loading && !st2.error;
    const status = st2.error ? "ERROR" : st2.loading ? "RUNNING" : job?.status ? String(job.status).toUpperCase() : "READY";
    const options = job?.options || this.runOptions(st2.engine, st2.pendingSeq || st2.resultSeq);
    return h("div", { "data-testid": "job-popup", style: st("height:100%;display:grid;grid-template-columns:230px minmax(0,1fr) 290px;gap:14px;padding:12px 16px;background:linear-gradient(180deg,rgba(19,16,42,.98),rgba(7,5,16,.99));border-top:1px solid #4a3d72;box-shadow:0 -18px 60px rgba(0,0,0,.35);") },
      h("div", { style: st("display:flex;flex-direction:column;gap:9px;min-width:0;") },
        h("div", { style: st("display:flex;align-items:center;gap:10px;") },
          h("span", { style: st(`width:9px;height:9px;border-radius:50%;background:${st2.error ? C.danger : st2.loading ? C.cyan : C.green};box-shadow:0 0 12px ${st2.error ? C.danger : st2.loading ? C.cyan : C.green};flex:none;`) }),
          h("span", { style: st("font-family:'JetBrains Mono',monospace;font-weight:800;font-size:11px;letter-spacing:1px;color:#9d8fd6;") }, `JOB ${status}`),
          h("span", { style: st(`margin-left:auto;font-family:'JetBrains Mono',monospace;font-size:10px;color:${running ? C.cyan : C.green};`) }, running ? `elapsed ${this.jobElapsedLabel()}` : `${progress}%`)),
        h("div", { style: st("height:7px;background:#0a0612;border:1px solid rgba(74,61,114,.55);border-radius:5px;overflow:hidden;") },
          running
            ? h("div", { style: st("height:100%;width:46%;background:linear-gradient(90deg,transparent,#3dffa8,#2fd6ff,#b06bff,transparent);animation:aa-job-stripe 1.25s linear infinite;") })
            : h("div", { style: st(`height:100%;width:${progress}%;background:linear-gradient(90deg,#3dffa8,#2fd6ff,#b06bff);transition:width .18s linear;`) })),
        st2.error && st2.lastRun ? h("button", { onClick: () => this.runFold(st2.lastRun.seq, st2.lastRun.fiy), style: st("height:36px;border-radius:9px;border:1px solid #3dffa8;background:rgba(61,255,168,.12);color:#bfffe5;font-family:'JetBrains Mono',monospace;font-weight:800;font-size:11px;letter-spacing:.7px;cursor:pointer;") }, "RETRY SAME SETTINGS") :
          h("button", { onClick: () => this.cancelJob(), disabled: !st2.loading || !job?.id, style: st(`height:36px;border-radius:9px;border:1px solid ${st2.loading && job?.id ? "#ff5a6a" : C.border};background:${st2.loading && job?.id ? "rgba(255,90,106,.14)" : C.bg3};color:${st2.loading && job?.id ? "#ffb3bd" : C.mid};font-family:'JetBrains Mono',monospace;font-weight:800;font-size:11px;letter-spacing:.7px;cursor:${st2.loading && job?.id ? "pointer" : "default"};`) }, "CANCEL JOB")),
      h("div", { style: st("min-width:0;display:flex;") }, this.renderTerminal("LIVE JOB TERMINAL")),
      h("div", { style: st("border-radius:10px;border:1px solid #2c2350;background:#0a0612;padding:12px;font-family:'JetBrains Mono',monospace;font-size:10.5px;line-height:1.65;color:#cabbf0;overflow:hidden;") },
        h("div", { style: st("color:#7a6aa8;letter-spacing:1px;margin-bottom:7px;") }, "RUN CONTRACT"),
        h("div", null, "sequence: ", h("span", { style: st("color:#3dffa8;") }, `${st2.pendingSeq || st2.resultSeq || "pending"}`)),
        h("div", null, "length: ", h("span", { style: st("color:#2fd6ff;") }, String((st2.pendingSeq || st2.resultSeq || "").length || "pending"))),
        h("div", null, "model: ", h("span", { style: st("color:#ffb347;") }, job?.engine || st2.engine)),
        h("div", null, "recycles requested: ", h("span", { style: st("color:#b06bff;") }, String(options.num_recycle || "server env"))),
        h("div", null, "models requested: ", h("span", { style: st("color:#3dffa8;") }, String(options.num_models || "server env"))),
        h("div", null, "MSA mode: ", h("span", { style: st("color:#2fd6ff;") }, options.msa_mode || "server default")),
        h("div", null, "cache key: ", h("span", { style: st("color:#9d8fd6;") }, job?.cache_key || "pending"))));
  }

  async runFold(seq, fiy) {
    if (this.state.loading) return;
    const cleaned = (seq || "").toUpperCase().replace(/[^A-Z]/g, "");
    if (cleaned.length < 4) { this.setState({ error: "Enter a sequence of at least 4 residues." }); return; }
    const requestedEngine = this.state.engine;
    const engine = this.engineForRun();
    const runOptions = this.runOptions(engine, cleaned);
    clearInterval(this._foldT);
    clearInterval(this._playT);
    this._playT = null;
    const initialLogs = [
      ...(requestedEngine !== engine ? [{ t: "!!", x: `${requestedEngine} unavailable; falling back to ${engine}`, c: this.C.amber }] : []),
      { t: "00.0", x: `queued ${engine} · ${cleaned.length} residues`, c: this.C.cyan },
    ];
    this.setState((s) => ({
      loading: true,
      error: "",
      result: null,
      resultSeq: null,
      pendingSeq: cleaned,
      lastRun: { seq: cleaned, fiy },
      realIndex: 0,
      realPlaying: false,
      selectedModel: 0,
      report: null,
      runLog: initialLogs,
      job: { id: null, status: "queued", engine, options: runOptions },
      jobPopupOpen: true,
      custom: fiy ? { ...s.custom, running: true, done: false, t: 0, elapsed: 0, logs: initialLogs } : s.custom,
    }));
    // gentle progress animation while the (possibly multi-minute) job runs
    this._foldT = setInterval(() => { this.setState((s) => ({ custom: { ...s.custom, t: Math.min(0.95, s.custom.t + 0.01), elapsed: s.custom.elapsed + 0.25 } })); }, 250);
    try {
      if (isDemoCacheEnabled()) {
        this.addRunLog(fiy, "DEMO", "loading bundled LocalColabFold result", this.C.cyan);
        try {
          const res = await fetchDemoResultForSequence(cleaned);
          clearInterval(this._foldT);
          const demoJob = { id: `demo-${res.meta?.target?.n || "cache"}`, status: "succeeded", engine: res.engine || "localcolabfold", options: res.meta?.options || runOptions, cache_key: res.cache_key };
          this.setState({ result: res, resultSeq: cleaned, pendingSeq: "", report: null, realIndex: 0, realPlaying: false, selectedModel: 0, loading: false, jobPopupOpen: false, job: demoJob }, () => {
            if ((res.frames || []).length > 1) this.playReal(true);
          });
          this.addRunLog(fiy, "✓", `demo fold loaded · ${res.frames?.length || 0} recycle frames`, this.C.green);
          if (fiy) this.setState((s) => ({ custom: { ...s.custom, running: false, done: true, t: 1 } }));
          return;
        } catch (demoErr) {
          this.addRunLog(fiy, "DEMO", `${demoErr.message}; running backend instead`, this.C.amber);
        }
      }
      const created = await createPredictionJob(cleaned, engine, runOptions);
      this.setState({ job: created });
      this.addRunLog(fiy, "JOB", `created ${created.id} · ${created.status}`, this.C.cyan);
      let current = created;
      const maxPolls = engine === "localcolabfold" ? 2000 : 160;
      let lastLogLen = 0;
      for (let p = 0; p < maxPolls; p += 1) {
        await wait(engine === "localcolabfold" ? 1200 : 450);
        current = await fetchPredictionJob(created.id);
        this.setState({ job: current });
        if (p === 0 || p % 10 === 0 || ["succeeded", "failed", "cancelled"].includes(current.status)) this.addRunLog(fiy, "STAT", `${engine} · ${String(current.status).toUpperCase()}`, this.C.mid);
        try {
          const ld = await fetchPredictionLogs(created.id);
          const lines = ld.logs || [];
          if (lines.length > lastLogLen) {
            const fresh = lines.slice(lastLogLen);
            lastLogLen = lines.length;
            fresh.forEach((x) => this.addRunLog(fiy, "··", String(x), this.C.mid));
          }
        } catch { /* ignore log poll errors */ }
        if (["succeeded", "failed", "cancelled"].includes(current.status)) break;
      }
      if (current.status !== "succeeded") throw new Error(current.message || `job ${current.status}`);
      const [res, rep] = await Promise.all([
        fetchPredictionResult(created.id),
        fetchPredictionReport(created.id).catch(() => null),
      ]);
      clearInterval(this._foldT);
      this.setState({ result: res, resultSeq: cleaned, pendingSeq: "", report: rep, realIndex: 0, realPlaying: false, selectedModel: 0, loading: false, jobPopupOpen: false }, () => {
        if ((res.frames || []).length > 1) this.playReal(true);
      });
      this.addRunLog(fiy, "✓", `fold complete · ${res.frames?.length || 0} recycle frames`, this.C.green);
      if (fiy) this.setState((s) => ({ custom: { ...s.custom, running: false, done: true, t: 1 } }));
      this.refreshArchive();
    } catch (err) {
      clearInterval(this._foldT);
      this.setState({ error: err.message, loading: false, pendingSeq: "", job: this.state.job ? { ...this.state.job, status: "failed", message: err.message } : null });
      this.addRunLog(fiy, "!!", `error: ${err.message}`, this.C.danger);
      if (fiy) this.setState((s) => ({ custom: { ...s.custom, running: false } }));
    }
  }
  async cancelJob() { const j = this.state.job; if (!j?.id) return; await cancelPredictionJob(j.id).catch(() => undefined); clearInterval(this._foldT); this.setState((s) => ({ loading: false, custom: { ...s.custom, running: false } })); }
  stopRealPlayback() {
    clearInterval(this._playT);
    this._playT = null;
    this._playDir = 1;
    if (this.state.realPlaying) this.setState({ realPlaying: false });
  }
  playReal(reset = false) {
    clearInterval(this._playT);
    const n = this.realFrames().length; if (n < 2) return;
    this._playDir = 1;
    this.setState((s) => ({ realIndex: reset ? 0 : Math.min(s.realIndex, n - 1), realPlaying: true }));
    this._playT = setInterval(() => {
      this.setState((s) => {
        const latest = this.realFrames().length;
        if (latest < 2) { clearInterval(this._playT); this._playT = null; return { realPlaying: false }; }
        let next = s.realIndex + 1;
        if (next >= latest) next = 0; // forward-only: settle to final, then restart at recycle 0
        return { realIndex: Math.max(0, Math.min(latest - 1, next)), realPlaying: true };
      });
    }, 900);
  }
  toggleRealPlayback() {
    if (this._playT) this.stopRealPlayback();
    else this.playReal();
  }

  // ---------- math ----------
  matInv(A) { const n = A.length, M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
    for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; [M[c], M[p]] = [M[p], M[c]];
      const d = M[c][c]; for (let j = 0; j < 2 * n; j++) M[c][j] /= d; for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; } }
    return M.map((r) => r.slice(n)); }
  divColor(v) { const m = Math.min(1, Math.abs(v)); const hue = v >= 0 ? 170 : 330; const l = (0.18 + 0.55 * m).toFixed(3); const c = (0.01 + 0.18 * m).toFixed(3); return `oklch(${l} ${c} ${hue})`; }
  plddt(v) { if (v > 90) return "#1f6feb"; if (v > 70) return "#25c7d9"; if (v > 50) return "#f4e409"; return "#f28c28"; }
  plddtBand(v) { if (v > 90) return "Very high"; if (v > 70) return "Confident"; if (v > 50) return "Low"; return "Very low"; }
  ssColor(s) { return s === "H" ? "#e64980" : s === "E" ? "#f4b400" : "#9aa6b8"; }
  ssName(s) { return s === "H" ? "α-helix" : s === "E" ? "β-strand" : "loop"; }
  resColor(pl, ss) { return this.state.colorMode === "ss" ? this.ssColor(ss) : this.plddt(pl); }
  _hex(hx) { return [parseInt(hx.slice(1, 3), 16), parseInt(hx.slice(3, 5), 16), parseInt(hx.slice(5, 7), 16)]; }
  _mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  _css(c) { return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`; }

  // ---------- coevolution ----------
  coevData() { const n = 6, contacts = [[0, 2], [2, 4], [1, 3], [3, 5]];
    const J = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 2.2 : 0)));
    contacts.forEach(([a, b]) => { J[a][b] = J[b][a] = -0.9; });
    const cov = this.matInv(J);
    const corr = (M) => M.map((row, i) => row.map((v, j) => (i === j ? 1 : v / Math.sqrt(M[i][i] * M[j][j]))));
    const corrCov = corr(cov), corrPrec = J.map((row, i) => row.map((v, j) => (i === j ? 1 : -v / Math.sqrt(J[i][i] * J[j][j]))));
    const isC = (i, j) => contacts.some(([a, b]) => (a === i && b === j) || (a === j && b === i));
    let trap = null, best = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (!isC(i, j) && Math.abs(corrCov[i][j]) > best) { best = Math.abs(corrCov[i][j]); trap = [i, j]; }
    return { n, contacts, corrCov, corrPrec, isC, trap }; }
  coevGuess(i, j) { this.setState((s) => ({ coev: { ...s.coev, guess: [i, j] } })); }

  // ---------- triangle ----------
  initTri() { const n = 7, pts = Array.from({ length: n }, (_, i) => { const a = (i / n) * 2 * Math.PI; return [Math.cos(a) * 5, Math.sin(a) * 5]; });
    const trueD = pts.map((p) => pts.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1]))); const D = trueD.map((r) => r.slice());
    [[0, 3], [1, 4], [2, 5], [0, 4]].forEach(([a, b]) => { D[a][b] = D[b][a] = trueD[a][b] * 1.75; });
    return { n, pts, D, history: [this.triMax(D).v], playing: false, breakIt: false, step: 0 }; }
  triMax(D) { let m = 0, tri = null; const n = D.length; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) for (let k = 0; k < n; k++) if (k !== i && k !== j) { const v = D[i][j] - (D[i][k] + D[k][j]); if (v > m) { m = v; tri = [i, k, j]; } } return { v: m, tri }; }
  triStep() { this.setState((s) => { if (s.tri.breakIt) return { tri: { ...s.tri, history: [...s.tri.history, s.tri.history[s.tri.history.length - 1]] } };
    const D = s.tri.D.map((r) => r.slice()), n = s.tri.n; for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (D[i][k] + D[k][j] < D[i][j]) D[i][j] = D[i][k] + D[k][j];
    return { tri: { ...s.tri, D, history: [...s.tri.history, this.triMax(D).v], step: s.tri.step + 1 } }; }); }
  triPlay() { if (this.state.tri.playing) { clearInterval(this._triT); this.setState((s) => ({ tri: { ...s.tri, playing: false } })); }
    else { this.setState((s) => ({ tri: { ...s.tri, playing: true } })); this._triT = setInterval(() => { if (this.triMax(this.state.tri.D).v < 0.001) { clearInterval(this._triT); this.setState((s) => ({ tri: { ...s.tri, playing: false } })); } else this.triStep(); }, 420); } }
  triReset() { clearInterval(this._triT); this.setState((s) => ({ tri: { ...this.initTri(), breakIt: s.tri.breakIt } })); }
  triBreak() { this.setState((s) => ({ tri: { ...s.tri, breakIt: !s.tri.breakIt } })); }

  // ---------- IPA ----------
  ipaData() { const s = this.state.ipa, d2r = Math.PI / 180;
    const R = (a) => [[Math.cos(a), -Math.sin(a)], [Math.sin(a), Math.cos(a)]], ap = (M, v) => [M[0][0] * v[0] + M[0][1] * v[1], M[1][0] * v[0] + M[1][1] * v[1]], add = (a, b) => [a[0] + b[0], a[1] + b[1]];
    const t1 = [-3.2, 1], t2 = [3, -1.2], a1 = 30 * d2r, a2 = -55 * d2r, p1 = [1.6, 0.5], p2 = [-1.1, 1.1];
    const q0 = add(ap(R(a1), p1), t1), k0 = add(ap(R(a2), p2), t2), d0 = Math.hypot(q0[0] - k0[0], q0[1] - k0[1]);
    const ag = s.thetaG * d2r, tg = [1.8, 1.4], T = (p) => add(ap(R(ag), p), tg);
    const q1 = T(q0), k1 = T(k0), d1 = Math.hypot(q1[0] - k1[0], q1[1] - k1[1]);
    return { q0, k0, q1, k1, d0, d1, residual: Math.abs(d1 - d0), naiveShift: Math.hypot(q1[0] - q0[0], q1[1] - q0[1]),
      t1: T(t1), t2: T(t2), o1: T(add(ap(R(a1), [1.4, 0]), t1)), o2: T(add(ap(R(a2), [1.4, 0]), t2)) }; }
  ipaSet(v) { this.setState((s) => ({ ipa: { ...s.ipa, thetaG: v } })); }
  ipaBreak() { this.setState((s) => ({ ipa: { ...s.ipa, naive: !s.ipa.naive } })); }

  // ---------- FAPE ----------
  fapeTgt() { return [[-4, -2.2], [-3, -0.2], [-2, 1.4], [-0.4, 2], [1.1, 2.2], [2.6, 1.3], [3.3, -0.2], [3, -1.8], [1.7, -2.6]]; }
  fapeData() { const tgt = this.fapeTgt(), refl = this.state.fape.reflected, pred = refl ? tgt.map((p) => [-p[0], p[1]]) : tgt.map((p) => [p[0], p[1]]); const n = tgt.length, clamp = 4;
    const frameErr = (A, B) => { let sum = 0, cnt = 0; for (let i = 0; i < n - 1; i++) { const mk = (P) => { const o = P[i], dx = P[i + 1][0] - o[0], dy = P[i + 1][1] - o[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L; return P.map((p) => { const rx = p[0] - o[0], ry = p[1] - o[1]; return [rx * ux + ry * uy, -rx * uy + ry * ux]; }); };
        const la = mk(A), lb = mk(B); for (let j = 0; j < n; j++) { sum += Math.min(clamp, Math.hypot(la[j][0] - lb[j][0], la[j][1] - lb[j][1])); cnt++; } } return sum / cnt; };
    let ds = 0, dc = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const a = Math.hypot(pred[i][0] - pred[j][0], pred[i][1] - pred[j][1]), b = Math.hypot(tgt[i][0] - tgt[j][0], tgt[i][1] - tgt[j][1]); ds += (a - b) * (a - b); dc++; }
    return { tgt, pred, fape: frameErr(pred, tgt), fapeAligned: frameErr(tgt, tgt), distRmsd: Math.sqrt(ds / dc), refl }; }
  fapeReflect() { this.setState((s) => ({ fape: { ...s.fape, reflected: !s.fape.reflected } })); }
  fapeBreak() { this.setState((s) => ({ fape: { ...s.fape, naive: !s.fape.naive } })); }

  // ---------- recycling ----------
  initRec() { return { x: 0, target: 1, gain: 0.6, cycle: 0, history: [1], deltaHist: [], playing: false, breakIt: false }; }
  recShape(x) { const n = 12, A = [], B = []; for (let i = 0; i < n; i++) { const t = i / (n - 1); A.push([-5 + t * 10, Math.sin(t * Math.PI * 3) * 0.6]); const a = t * Math.PI * 4; B.push([Math.cos(a) * (1 + t * 2.5), Math.sin(a) * (1 + t * 2.5)]); } return A.map((p, i) => [p[0] + (B[i][0] - p[0]) * x, p[1] + (B[i][1] - p[1]) * x]); }
  recStep() { this.setState((s) => { const g = s.rec.breakIt ? 1.85 : s.rec.gain, nx = s.rec.x + g * (s.rec.target - s.rec.x), delta = Math.abs(nx - s.rec.x);
    return { rec: { ...s.rec, x: nx, cycle: s.rec.cycle + 1, history: [...s.rec.history, nx], deltaHist: [...s.rec.deltaHist, delta] } }; }); }
  recPlay() { if (this.state.rec.playing) { clearInterval(this._recT); this.setState((s) => ({ rec: { ...s.rec, playing: false } })); }
    else { this.setState((s) => ({ rec: { ...s.rec, playing: true } })); this._recT = setInterval(() => { const r = this.state.rec, lastD = r.deltaHist[r.deltaHist.length - 1]; if (r.cycle > 8 || (lastD !== undefined && lastD < 0.005 && !r.breakIt)) { clearInterval(this._recT); this.setState((s) => ({ rec: { ...s.rec, playing: false } })); } else this.recStep(); }, 480); } }
  recReset() { clearInterval(this._recT); this.setState((s) => ({ rec: { ...this.initRec(), gain: s.rec.gain, breakIt: s.rec.breakIt } })); }
  recBreak() { this.setState((s) => ({ rec: { ...s.rec, breakIt: !s.rec.breakIt } })); }
  recGain(v) { this.setState((s) => ({ rec: { ...s.rec, gain: v } })); }
  recDelta(fr) { return [1, 0.4, 0.16, 0.064, 0.026, 0.01][fr]; }

  // ---------- structure / trajectory (teaching model) ----------
  seqSeed(s) { let hh = 2166136261; for (let i = 0; i < (s || "").length; i++) { hh ^= s.charCodeAt(i); hh = Math.imul(hh, 16777619); } return hh >>> 0; }
  rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
  genTrace(seed) {
    if (this._traceCache && this._traceCache.seed === seed) return this._traceCache.v;
    const rand = this.rng((seed || 1) >>> 0);
    const norm = (v) => { const L = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / L, v[1] / L, v[2] / L]; };
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const rotAx = (v, ax, a) => { const c = Math.cos(a), s = Math.sin(a), d = ax[0] * v[0] + ax[1] * v[1] + ax[2] * v[2], cr = cross(ax, v);
      return [v[0] * c + cr[0] * s + ax[0] * d * (1 - c), v[1] * c + cr[1] * s + ax[1] * d * (1 - c), v[2] * c + cr[2] * s + ax[2] * d * (1 - c)]; };
    const plan = [], target = 44 + Math.floor(rand() * 12); let total = 0, tgl = Math.floor(rand() * 2);
    while (total < target) { const t = (tgl++ % 2) ? "E" : "H", len = t === "H" ? 7 + Math.floor(rand() * 6) : 4 + Math.floor(rand() * 4);
      plan.push({ t, len }); total += len; const lp = 2 + Math.floor(rand() * 3); plan.push({ t: "C", len: lp }); total += lp; }
    let pos = [0, 0, 0], dir = [1, 0, 0], up = [0, 1, 0];
    const fc = [], ss = [], plF = [];
    plan.forEach((el, ei) => { const term = ei < 2 || ei > plan.length - 3;
      if (el.t === "H") { const ax = norm(dir); const side = norm(cross(ax, up)); const rise = 1.55, radius = 2.3, turn = (100 * Math.PI) / 180;
        for (let i = 0; i < el.len; i++) { const o = rotAx(side, ax, i * turn);
          fc.push([pos[0] + ax[0] * i * rise + o[0] * radius, pos[1] + ax[1] * i * rise + o[1] * radius, pos[2] + ax[2] * i * rise + o[2] * radius]);
          ss.push("H"); plF.push(term ? 72 + rand() * 12 : 89 + rand() * 8); }
        pos = [pos[0] + ax[0] * el.len * rise, pos[1] + ax[1] * el.len * rise, pos[2] + ax[2] * el.len * rise];
      } else if (el.t === "E") { const step = 3.35;
        for (let i = 0; i < el.len; i++) { const zz = i % 2 ? 1 : -1, side = norm(cross(dir, up));
          fc.push([pos[0] + dir[0] * i * step + side[0] * zz * 0.5, pos[1] + dir[1] * i * step + side[1] * zz * 0.5, pos[2] + dir[2] * i * step + side[2] * zz * 0.5]);
          ss.push("E"); plF.push(term ? 68 + rand() * 12 : 80 + rand() * 13); }
        pos = [pos[0] + dir[0] * el.len * step, pos[1] + dir[1] * el.len * step, pos[2] + dir[2] * el.len * step];
      } else { const step = 2.7, ax = norm(cross(dir, up).map((v) => v + (rand() - 0.5) * 0.5)), tot = ((110 + rand() * 90) * Math.PI) / 180;
        for (let i = 0; i < el.len; i++) { dir = norm(rotAx(dir, ax, tot / el.len)); pos = [pos[0] + dir[0] * step, pos[1] + dir[1] * step, pos[2] + dir[2] * step];
          fc.push(pos.slice()); ss.push("C"); plF.push(term ? 48 + rand() * 16 : 62 + rand() * 16); }
        up = norm(rotAx(up, dir, (rand() - 0.5) * 1.1)); }
    });
    const N = fc.length, c = [0, 1, 2].map((d) => fc.reduce((a, p) => a + p[d], 0) / N), cc = fc.map((p) => [p[0] - c[0], p[1] - c[1], p[2] - c[2]]);
    let mr = 0; cc.forEach((p) => (mr = Math.max(mr, Math.hypot(p[0], p[1], p[2])))); const scl = 10.5 / (mr || 1);
    const sc2 = cc.map((p) => [p[0] * scl, p[1] * scl, p[2] * scl]), ext = sc2.map((p, i) => [(i - (N - 1) / 2) * 0.62, 0, 0]);
    const v = { fc: sc2, ext, plF, ss, N }; this._traceCache = { seed, v }; return v; }
  frameDataT(t, seed) { const { fc, ext, plF, ss, N } = this.genTrace(seed); t = Math.max(0, Math.min(1, t));
    const coords = fc.map((p, i) => [ext[i][0] + (p[0] - ext[i][0]) * t, ext[i][1] + (p[1] - ext[i][1]) * t, ext[i][2] + (p[2] - ext[i][2]) * t]);
    const pl = plF.map((v) => 42 + (v - 42) * t), meanP = pl.reduce((a, b) => a + b, 0) / N;
    return { coords, pl, ss, meanP, triViol: (1 - t) * 9.4, clashes: Math.round((1 - t) * 11), fape: (1 - t) * 4.6 + 0.18, N, t }; }
  frameData(idx) { return this.frameDataT(idx / 5, 0); }
  scoreAtT(t, seed) { const f = this.frameDataT(t, seed), mp = f.meanP / 100, tri = 1 - Math.min(1, f.triViol / 9.4), chir = 1, clash = Math.min(1, f.clashes / 11); return Math.max(0, Math.round((0.42 * mp + 0.3 * tri + 0.18 * chir - 0.1 * clash) * 100)); }
  scoreAt(idx) { return this.scoreAtT(idx / 5, 0); }
  ovText(key, x, y, str, col) { return h("text", { key, x, y, textAnchor: "middle", fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", fill: col, stroke: "#08060f", strokeWidth: 5, paintOrder: "stroke", style: { paintOrder: "stroke" } }, str); }

  // ---------- interaction (teaching SVG viewer) ----------
  molDown(e) { this._drag = { x: e.clientX, y: e.clientY, moved: false }; }
  molMove(e) { if (this._drag) { const dx = e.clientX - this._drag.x, dy = e.clientY - this._drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) this._drag.moved = true; this._drag.x = e.clientX; this._drag.y = e.clientY;
      this.setState((s) => ({ rot: s.rot + dx * 0.012, rotX: Math.max(-1.3, Math.min(1.3, s.rotX + dy * 0.012)) })); return; }
    this.molHover(e); }
  molHover(e) { const A = this._atomScreen; if (!A || !A.length) return; const r = e.currentTarget.getBoundingClientRect(), W = 600, Hh = 520;
    const vx = ((e.clientX - r.left) / r.width) * W, vy = ((e.clientY - r.top) / r.height) * Hh; let best = -1, bd = 16 * 16;
    for (const a of A) { const d = (a.x - vx) * (a.x - vx) + (a.y - vy) * (a.y - vy); if (d < bd) { bd = d; best = a.i; } }
    if (best !== this.state.hoverRes) this.setState({ hoverRes: best >= 0 ? best : null }); }
  molUp() { if (this._drag && !this._drag.moved && this.state.view === "stage" && !this.hasReal()) this.stepFwd(); this._drag = null; }
  setView(v) { this.setState({ view: v }); }
  setSeq(s) { this.setState((st2) => ({ custom: { ...st2.custom, seq: cleanSequence(s).slice(0, 768), done: false }, selectedModel: 0, selectedPae: null })); }
  resetCustom() { clearInterval(this._foldT); clearInterval(this._playT); this._playT = null; this.setState((st2) => ({ custom: { ...st2.custom, t: 0, running: false, done: false, elapsed: 0, logs: [] }, result: null, realPlaying: false, selectedModel: 0, selectedPae: null })); }
  fillSeq(s) { if (this.state.custom.running) return; clearInterval(this._playT); this._playT = null; this.setState((st2) => ({ custom: { ...st2.custom, seq: s, t: 0, done: false, logs: [] }, result: null, realPlaying: false, selectedModel: 0, selectedPae: null })); }
  stepFwd() { if (!this.hasReal()) return; this.setState((s) => ({ realIndex: (s.realIndex + 1) % this.realFrames().length })); }
  stepBack() { if (!this.hasReal()) return; const n = this.realFrames().length; this.setState((s) => ({ realIndex: (s.realIndex + n - 1) % n })); }
  setFrame(i) { if (this.hasReal()) { this.setState({ realIndex: i }); return; } this.setState({ frame: i }); }
  togglePlay() {
    if (this.hasReal()) { this.toggleRealPlayback(); return; }
    if (this._playT) { clearInterval(this._playT); this._playT = null; this.forceUpdate(); return; }
    if (this.state.frame === 5) this.setState({ frame: 0 });
    this._playT = setInterval(() => { if (this.state.frame >= 5) { clearInterval(this._playT); this._playT = null; this.forceUpdate(); } else this.setState((s) => ({ frame: s.frame + 1 })); }, 560); this.forceUpdate(); }
  toggleOverlay(id) { this.setState((s) => ({ overlays: { ...s.overlays, [id]: !s.overlays[id] } })); }

  // ---------- scene helpers ----------
  pill(label, active, on, col) { const C = this.C; return h("button", { onClick: on, style: { padding: "7px 13px", borderRadius: "7px", cursor: "pointer", fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", letterSpacing: ".5px", border: "1px solid " + (active ? col || C.cyan : C.border), background: active ? (col || C.cyan) + "22" : C.bg2, color: active ? col || C.cyan : C.mid } }, label); }
  ctrlBtn(label, on, col) { const C = this.C; return h("button", { onClick: on, style: { padding: "9px 15px", borderRadius: "8px", cursor: "pointer", fontFamily: "'JetBrains Mono',monospace", fontSize: "12px", fontWeight: 700, letterSpacing: ".5px", border: "1px solid " + (col || C.green), background: (col || C.green) + "1f", color: col || C.green } }, label); }
  readout(label, val, col) { const C = this.C; return h("div", { style: { flex: "1", minWidth: "120px", padding: "12px 14px", borderRadius: "9px", background: C.bg1, border: "1px solid " + C.border } },
    h("div", { style: { fontFamily: "'JetBrains Mono',monospace", fontSize: "9.5px", letterSpacing: "1px", color: C.dim } }, label),
    h("div", { style: { fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: "22px", marginTop: "4px", color: col || C.hi } }, val)); }
  breakToggle(on, active) { const C = this.C; return h("button", { onClick: on, style: { display: "flex", alignItems: "center", gap: "8px", padding: "9px 14px", borderRadius: "8px", cursor: "pointer", border: "1px solid " + (active ? C.danger : C.borderHi), background: active ? C.danger + "1f" : C.bg2 } },
    h("span", { style: { fontSize: "14px" } }, active ? "💥" : "🔧"),
    h("span", { style: { fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", letterSpacing: ".5px", color: active ? C.danger : C.mid } }, active ? "BROKEN — WATCH IT FAIL" : "BREAK IT")); }
  sparkline(arr, w, hgt, col) { const C = this.C; if (!arr.length) return null; const mx = Math.max(...arr, 0.001);
    return h("svg", { width: w, height: hgt, style: { display: "block" } },
      h("polyline", { points: arr.map((v, i) => `${(i / Math.max(1, arr.length - 1)) * w},${hgt - (v / mx) * hgt}`).join(" "), fill: "none", stroke: col || C.cyan, strokeWidth: 2 }),
      arr.map((v, i) => h("circle", { key: i, cx: (i / Math.max(1, arr.length - 1)) * w, cy: hgt - (v / mx) * hgt, r: 2.2, fill: col || C.cyan }))); }

  renderScene(id) { if (id === "coevolution") return this.sceneCoev(); if (id === "triangle") return this.sceneTri(); if (id === "ipa") return this.sceneIpa(); if (id === "fape") return this.sceneFape(); if (id === "recycling") return this.sceneRec(); }

  sceneCoev() { const C = this.C, d = this.coevData(), s = this.state.coev, M = s.view === "cov" ? d.corrCov : d.corrPrec, cells = [];
    for (let i = 0; i < d.n; i++) for (let j = 0; j < d.n; j++) { const v = M[i][j], sel = s.guess && ((s.guess[0] === i && s.guess[1] === j) || (s.guess[0] === j && s.guess[1] === i)), trap = d.trap && ((d.trap[0] === i && d.trap[1] === j) || (d.trap[0] === j && d.trap[1] === i));
      cells.push(h("button", { key: i + "_" + j, onClick: () => i !== j && this.coevGuess(i, j), style: { aspectRatio: "1", borderRadius: "4px", cursor: i === j ? "default" : "pointer", position: "relative", border: sel ? "2px solid " + C.cyan : "1px solid " + C.bg0, background: i === j ? C.bg3 : this.divColor(v) } },
        trap && s.view === "cov" ? h("span", { style: { position: "absolute", inset: "1px", border: "2px dashed " + C.amber, borderRadius: "3px" } }) : null)); }
    const sg = s.guess, gC = sg ? d.corrCov[sg[0]][sg[1]] : 0, gP = sg ? d.corrPrec[sg[0]][sg[1]] : 0, isC = sg ? d.isC(sg[0], sg[1]) : false;
    return h("div", { style: { display: "flex", gap: "26px", flexWrap: "wrap" } },
      h("div", { style: { flex: "none" } },
        h("div", { style: { display: "flex", gap: "8px", marginBottom: "12px" } }, this.pill("COVARIANCE Cᵢⱼ", s.view === "cov", () => this.setState((st2) => ({ coev: { ...st2.coev, view: "cov" } })), C.green), this.pill("PRECISION (C⁻¹)", s.view === "precision", () => this.setState((st2) => ({ coev: { ...st2.coev, view: "precision" } })), C.magenta)),
        h("div", { style: { display: "grid", gridTemplateColumns: "repeat(6,46px)", gap: "4px" } }, cells),
        h("div", { style: { marginTop: "10px", fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", color: C.dim, lineHeight: 1.6, maxWidth: "320px" } }, s.view === "cov" ? "▦ Dense — indirect correlations bleed through chains. Dashed amber = trap pair (strong Cᵢⱼ, NOT a contact)." : "▦ Sparse — the inverse explains away indirect paths. Off-diagonal signal = direct contact.")),
      h("div", { style: { flex: "1", minWidth: "260px", display: "flex", flexDirection: "column", gap: "12px" } },
        h("div", { style: { padding: "14px", borderRadius: "10px", background: C.bg1, border: "1px solid " + C.border } },
          h("div", { style: { fontFamily: "'JetBrains Mono',monospace", fontSize: "10px", letterSpacing: "1px", color: C.dim } }, "SELECTED PAIR"),
          sg ? h("div", { style: { marginTop: "8px" } }, h("div", { style: { fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: "18px" } }, `residue ${sg[0]} ⟷ ${sg[1]}`),
            h("div", { style: { display: "flex", gap: "18px", marginTop: "10px" } }, h("div", null, h("div", { style: { fontFamily: "'JetBrains Mono',monospace", fontSize: "10px", color: C.dim } }, "COVARIANCE"), h("div", { style: { fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: "17px", color: C.green } }, gC.toFixed(2))), h("div", null, h("div", { style: { fontFamily: "'JetBrains Mono',monospace", fontSize: "10px", color: C.dim } }, "PRECISION"), h("div", { style: { fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: "17px", color: C.magenta } }, gP.toFixed(2)))),
            h("div", { style: { marginTop: "12px", padding: "10px 12px", borderRadius: "8px", background: (isC ? C.green : C.danger) + "18", border: "1px solid " + (isC ? C.green : C.danger) + "55", fontFamily: "'JetBrains Mono',monospace", fontSize: "12px", color: isC ? C.green : C.danger } }, isC ? "✓ TRUE CONTACT — strong in precision matrix." : "✗ NOT A CONTACT — precision ≈ 0. Covariance is transitive (indirect)."))
            : h("div", { style: { marginTop: "8px", fontSize: "13px", color: C.mid } }, "Click any off-diagonal cell to test whether that residue pair is a real contact.")),
        h("div", { style: { padding: "12px 14px", borderRadius: "10px", background: "rgba(255,170,60,.08)", border: "1px solid rgba(255,170,60,.25)", fontSize: "13px", lineHeight: 1.55, color: "#e0cfa6" } }, h("span", { style: { fontFamily: "'JetBrains Mono',monospace", color: C.amber, fontSize: "11px" } }, "BREAK IT ▸ "), "Trust the strongest COVARIANCE cell and you pick the dashed trap pair — it only correlates because it routes through a shared contact. The inverse fixes it.")));
  }

  sceneTri() { const C = this.C, t = this.state.tri, mm = this.triMax(t.D), mx = mm.v, ok = mx < 0.001, n = t.D.length, cells = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const inTri = mm.tri && mm.tri.includes(i) && mm.tri.includes(j) && i !== j;
      cells.push(h("div", { key: i + "_" + j, style: { aspectRatio: "1", borderRadius: "3px", background: i === j ? C.bg3 : this.divColor(t.D[i][j] / 12), border: inTri ? "2px solid " + C.danger : "1px solid " + C.bg0 } })); }
    const tri = mm.tri || [0, 1, 2], P = [t.pts[tri[0]], t.pts[tri[1]], t.pts[tri[2]]], pj = (p) => [90 + p[0] * 8, 90 - p[1] * 8];
    return h("div", { style: { display: "flex", gap: "26px", flexWrap: "wrap" } },
      h("div", { style: { flex: "none" } }, h("div", { style: { fontFamily: "'JetBrains Mono',monospace", fontSize: "10px", letterSpacing: "1px", color: C.dim, marginBottom: "8px" } }, "PAIR-DISTANCE MATRIX Dᵢⱼ"),
        h("div", { style: { display: "grid", gridTemplateColumns: `repeat(${n},38px)`, gap: "4px" } }, cells),
        h("div", { style: { marginTop: "12px", display: "flex", gap: "8px", flexWrap: "wrap" } }, this.ctrlBtn("▸ STEP", () => this.triStep(), C.green), this.ctrlBtn(t.playing ? "❚❚ PAUSE" : "▶ AUTO-RELAX", () => this.triPlay(), C.cyan), this.ctrlBtn("↺ RESET", () => this.triReset(), C.mid)),
        h("div", { style: { marginTop: "10px" } }, this.breakToggle(() => this.triBreak(), t.breakIt))),
      h("div", { style: { flex: "1", minWidth: "260px", display: "flex", flexDirection: "column", gap: "12px" } },
        h("div", { style: { display: "flex", gap: "12px" } }, this.readout("MAX △ VIOLATION", mx.toFixed(2), ok ? C.green : C.danger),
          h("div", { style: { flex: "none", padding: "12px 14px", borderRadius: "9px", background: C.bg1, border: "1px solid " + (ok ? C.green : C.border), display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" } }, h("div", { style: { fontFamily: "'JetBrains Mono',monospace", fontSize: "9.5px", letterSpacing: "1px", color: C.dim } }, "REALIZABLE?"), h("div", { style: { fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: "16px", marginTop: "4px", color: ok ? C.green : C.danger } }, ok ? "✓ YES" : "✗ NO"))),
        h("div", { style: { padding: "14px", borderRadius: "10px", background: C.bg1, border: "1px solid " + C.border } }, h("div", { style: { fontFamily: "'JetBrains Mono',monospace", fontSize: "10px", letterSpacing: "1px", color: C.dim, marginBottom: "8px" } }, "VIOLATION OVER STEPS"), this.sparkline(t.history, 280, 60, ok ? C.green : C.cyan)),
        h("div", { style: { padding: "14px", borderRadius: "10px", background: C.bg1, border: "1px solid " + C.border } }, h("div", { style: { fontFamily: "'JetBrains Mono',monospace", fontSize: "10px", letterSpacing: "1px", color: C.dim, marginBottom: "8px" } }, "MOST-VIOLATED TRIPLE"),
          h("svg", { width: 180, height: 130 }, h("line", { x1: pj(P[0])[0], y1: pj(P[0])[1], x2: pj(P[1])[0], y2: pj(P[1])[1], stroke: C.borderHi, strokeWidth: 2 }), h("line", { x1: pj(P[1])[0], y1: pj(P[1])[1], x2: pj(P[2])[0], y2: pj(P[2])[1], stroke: C.borderHi, strokeWidth: 2 }), h("line", { x1: pj(P[0])[0], y1: pj(P[0])[1], x2: pj(P[2])[0], y2: pj(P[2])[1], stroke: ok ? C.green : C.danger, strokeWidth: 3, strokeDasharray: ok ? "0" : "5 4" }), P.map((p, i) => h("circle", { key: i, cx: pj(p)[0], cy: pj(p)[1], r: 6, fill: C.cyan }))))));
  }

  sceneIpa() { const C = this.C, d = this.ipaData(), s = this.state.ipa, naive = s.naive, W = 460, H = 300, ox = W / 2, oy = H / 2, sc = 18, pj = (p) => [ox + p[0] * sc, oy - p[1] * sc];
    const axis = (o, tip, col) => { const O = pj(o), T = pj(tip); return h("g", null, h("line", { x1: O[0], y1: O[1], x2: T[0], y2: T[1], stroke: col, strokeWidth: 2.5 }), h("circle", { cx: O[0], cy: O[1], r: 4, fill: col })); };
    const inv = d.residual < 1e-6;
    return h("div", { style: { display: "flex", gap: "26px", flexWrap: "wrap" } },
      h("div", { style: { flex: "none" } },
        h("svg", { width: W, height: H, style: { background: C.bg0, borderRadius: "10px", border: "1px solid " + C.border } },
          h("line", { x1: 0, y1: oy, x2: W, y2: oy, stroke: C.bg2, strokeWidth: 1 }), h("line", { x1: ox, y1: 0, x2: ox, y2: H, stroke: C.bg2, strokeWidth: 1 }),
          h("line", { x1: pj(d.q0)[0], y1: pj(d.q0)[1], x2: pj(d.k0)[0], y2: pj(d.k0)[1], stroke: C.borderHi, strokeWidth: 1.5, strokeDasharray: "4 4" }),
          h("circle", { cx: pj(d.q0)[0], cy: pj(d.q0)[1], r: 5, fill: "none", stroke: C.cyan, strokeWidth: 1.5 }), h("circle", { cx: pj(d.k0)[0], cy: pj(d.k0)[1], r: 5, fill: "none", stroke: C.magenta, strokeWidth: 1.5 }),
          axis(d.t1, d.o1, C.cyan), axis(d.t2, d.o2, C.magenta),
          h("line", { x1: pj(d.q1)[0], y1: pj(d.q1)[1], x2: pj(d.k1)[0], y2: pj(d.k1)[1], stroke: C.green, strokeWidth: 2.5 }),
          h("circle", { cx: pj(d.q1)[0], cy: pj(d.q1)[1], r: 6, fill: C.cyan }), h("circle", { cx: pj(d.k1)[0], cy: pj(d.k1)[1], r: 6, fill: C.magenta }),
          h("text", { x: (pj(d.q1)[0] + pj(d.k1)[0]) / 2, y: (pj(d.q1)[1] + pj(d.k1)[1]) / 2 - 8, fill: C.green, fontSize: 12, fontFamily: "'JetBrains Mono',monospace", textAnchor: "middle" }, "d=" + d.d1.toFixed(3))),
        h("div", { style: { marginTop: "14px" } }, h("div", { style: { fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", color: C.mid, marginBottom: "6px" } }, `GLOBAL TRANSFORM  θ = ${s.thetaG}°`), h("input", { type: "range", min: -180, max: 180, value: s.thetaG, onChange: (e) => this.ipaSet(parseInt(e.target.value, 10)), style: { width: "100%", accentColor: C.purple } })),
        h("div", { style: { marginTop: "10px" } }, this.breakToggle(() => this.ipaBreak(), naive))),
      h("div", { style: { flex: "1", minWidth: "240px", display: "flex", flexDirection: "column", gap: "12px" } },
        this.readout("QUERY–KEY DISTANCE", d.d1.toFixed(4), C.green),
        this.readout("INVARIANCE RESIDUAL |d−d₀|", d.residual.toExponential(1), inv ? C.green : C.danger),
        naive ? this.readout("NAÏVE: ABSOLUTE-COORD SHIFT", d.naiveShift.toFixed(2), C.danger) : null,
        h("div", { style: { padding: "12px 14px", borderRadius: "10px", background: C.bg1, border: "1px solid " + C.border, fontSize: "13px", lineHeight: 1.55, color: C.mid } },
          naive ? h("span", null, h("span", { style: { color: C.danger, fontFamily: "'JetBrains Mono',monospace", fontSize: "11px" } }, "BROKEN ▸ "), "A model reading absolute coordinates sees inputs move by ", d.naiveShift.toFixed(1), " units — not invariant. IPA reads points in residue-local frames, so the distance never changes.") : h("span", null, "Drag θ through a full turn. Query–key distance is constant to ~1e-15: invariance is built into the geometry, not learned."))));
  }

  sceneFape() { const C = this.C, d = this.fapeData(), W = 460, H = 300, ox = W / 2, oy = H / 2, sc = 26, pj = (p) => [ox + p[0] * sc, oy - p[1] * sc];
    const path = (P, col, dash) => h("polyline", { points: P.map((p) => pj(p).join(",")).join(" "), fill: "none", stroke: col, strokeWidth: dash ? 2 : 3, strokeDasharray: dash ? "5 4" : "0", strokeLinejoin: "round", strokeLinecap: "round" });
    const worse = d.fape > d.fapeAligned + 0.01;
    return h("div", { style: { display: "flex", gap: "26px", flexWrap: "wrap" } },
      h("div", { style: { flex: "none" } }, h("svg", { width: W, height: H, style: { background: C.bg0, borderRadius: "10px", border: "1px solid " + C.border } },
          path(d.tgt, C.borderHi, true), d.tgt.map((p, i) => h("circle", { key: "t" + i, cx: pj(p)[0], cy: pj(p)[1], r: 3, fill: C.dim })),
          path(d.pred, d.refl ? C.danger : C.green, false), d.pred.map((p, i) => h("circle", { key: "p" + i, cx: pj(p)[0], cy: pj(p)[1], r: 4, fill: d.refl ? C.danger : C.green })),
          h("text", { x: 14, y: 24, fill: C.dim, fontSize: 11, fontFamily: "'JetBrains Mono',monospace" }, "— — target (ghost)"), h("text", { x: 14, y: 42, fill: d.refl ? C.danger : C.green, fontSize: 11, fontFamily: "'JetBrains Mono',monospace" }, d.refl ? "predicted (REFLECTED)" : "predicted (aligned)")),
        h("div", { style: { marginTop: "14px" } }, this.ctrlBtn(d.refl ? "↩ UN-REFLECT" : "⇄ REFLECT STRUCTURE", () => this.fapeReflect(), d.refl ? C.green : C.magenta))),
      h("div", { style: { flex: "1", minWidth: "240px", display: "flex", flexDirection: "column", gap: "12px" } },
        h("div", { style: { display: "flex", gap: "12px" } }, this.readout("FAPE (local frames)", d.fape.toFixed(2), worse ? C.danger : C.green), this.readout("DISTANCE-ONLY RMSD", d.distRmsd.toFixed(2), C.amber)),
        h("div", { style: { padding: "12px 14px", borderRadius: "10px", background: (worse ? C.danger : C.green) + "14", border: "1px solid " + (worse ? C.danger : C.green) + "44", fontSize: "13px", lineHeight: 1.55, color: worse ? "#ffb3a6" : "#a9efcf" } },
          worse ? h("span", null, h("strong", null, "FAPE caught it."), " The reflected fold preserves every pairwise distance (RMSD ≈ ", d.distRmsd.toFixed(1), ") — a distance metric is fooled. In residue-local frames the handedness is wrong, so FAPE jumps. Biology is chiral.") : h("span", null, "Aligned: FAPE ≈ 0, distances match. Hit REFLECT — distances stay equal but FAPE jumps."))));
  }

  sceneRec() { const C = this.C, r = this.state.rec, shape = this.recShape(Math.max(0, Math.min(1.15, r.x))), W = 300, H = 240, ox = W / 2, oy = H / 2, sc = 15, pj = (p) => [ox + p[0] * sc, oy - p[1] * sc];
    const lastD = r.deltaHist.length ? r.deltaHist[r.deltaHist.length - 1] : 1, conv = lastD < 0.01 && r.cycle > 0 && !r.breakIt;
    return h("div", { style: { display: "flex", gap: "26px", flexWrap: "wrap" } },
      h("div", { style: { flex: "none" } }, h("svg", { width: W, height: H, style: { background: C.bg0, borderRadius: "10px", border: "1px solid " + C.border } }, h("polyline", { points: shape.map((p) => pj(p).join(",")).join(" "), fill: "none", stroke: conv ? C.green : C.cyan, strokeWidth: 3, strokeLinejoin: "round", strokeLinecap: "round" }), shape.map((p, i) => h("circle", { key: i, cx: pj(p)[0], cy: pj(p)[1], r: 3.5, fill: conv ? C.green : C.cyan }))),
        h("div", { style: { marginTop: "14px", display: "flex", gap: "8px", flexWrap: "wrap" } }, this.ctrlBtn("▸ CYCLE", () => this.recStep(), C.green), this.ctrlBtn(r.playing ? "❚❚" : "▶ RUN", () => this.recPlay(), C.cyan), this.ctrlBtn("↺", () => this.recReset(), C.mid)),
        h("div", { style: { marginTop: "12px" } }, h("div", { style: { fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", color: C.mid, marginBottom: "6px" } }, `UPDATE GAIN  α = ${r.breakIt ? "1.85 (locked)" : r.gain.toFixed(2)}`), h("input", { type: "range", min: 0.2, max: 1.5, step: 0.05, value: r.gain, disabled: r.breakIt, onChange: (e) => this.recGain(parseFloat(e.target.value)), style: { width: "240px", accentColor: C.amber } })),
        h("div", { style: { marginTop: "10px" } }, this.breakToggle(() => this.recBreak(), r.breakIt))),
      h("div", { style: { flex: "1", minWidth: "240px", display: "flex", flexDirection: "column", gap: "12px" } },
        h("div", { style: { display: "flex", gap: "12px" } }, this.readout("CYCLE", String(r.cycle), C.hi), this.readout("Δ STRUCTURE", lastD.toFixed(3), conv ? C.green : r.breakIt ? C.danger : C.cyan)),
        h("div", { style: { padding: "14px", borderRadius: "10px", background: C.bg1, border: "1px solid " + C.border } }, h("div", { style: { fontFamily: "'JetBrains Mono',monospace", fontSize: "10px", letterSpacing: "1px", color: C.dim, marginBottom: "8px" } }, "Δ PER CYCLE"), this.sparkline(r.deltaHist.length ? r.deltaHist : [1], 250, 56, r.breakIt ? C.danger : C.cyan)),
        conv ? h("div", { style: { padding: "12px 14px", borderRadius: "10px", background: C.green + "14", border: "1px solid " + C.green + "44", fontFamily: "'JetBrains Mono',monospace", fontSize: "12px", color: C.green } }, "✓ FIXED POINT REACHED (Δ < δ)") : null,
        h("div", { style: { padding: "12px 14px", borderRadius: "10px", background: "rgba(255,170,60,.1)", border: "1px solid rgba(255,170,60,.3)", fontSize: "13px", lineHeight: 1.55, color: "#e0cfa6" } }, h("span", { style: { fontFamily: "'JetBrains Mono',monospace", color: C.amber, fontSize: "11px" } }, "HONESTY ▸ "), "Representational iteration converging to a fixed point — ", h("strong", null, "NOT"), " a movie of folding in time. Late convergence is a confidence signal, not a kinetic pathway."),
        r.breakIt ? h("div", { style: { padding: "12px 14px", borderRadius: "10px", background: C.danger + "14", border: "1px solid " + C.danger + "44", fontSize: "13px", color: "#ffb3a6", lineHeight: 1.5 } }, h("span", { style: { fontFamily: "'JetBrains Mono',monospace", fontSize: "11px" } }, "BROKEN ▸ "), "α > 1 overshoots — the iteration oscillates and never settles. Stable refinement needs a contraction.") : null));
  }

  // ---------- teaching SVG viewer + overlays ----------
  renderViewer() { const st2 = this.state, custom = st2.view === "custom", seed = custom ? this.seqSeed(st2.custom.seq) : this.stageSeed(), t = custom ? st2.custom.t : st2.frame / 5, f = this.frameDataT(t, seed), mono = "'JetBrains Mono',monospace";
    const W = 600, Hh = 520, cx = W / 2, cy = Hh / 2, sc = 24, ry = st2.rot, rx = st2.rotX;
    const rot = (p) => { const x = p[0] * (st2.reflected ? -1 : 1), y = p[1], z = p[2];
      const x1 = x * Math.cos(ry) + z * Math.sin(ry), z1 = -x * Math.sin(ry) + z * Math.cos(ry);
      const y2 = y * Math.cos(rx) - z1 * Math.sin(rx), z2 = y * Math.sin(rx) + z1 * Math.cos(rx);
      return [x1, y2, z2]; };
    const proj = (r) => { const k = 340 / (340 + r[2] * sc); return { x: cx + r[0] * sc * k, y: cy - r[1] * sc * k, z: r[2], k }; };
    const R = f.coords.map(rot), ss = f.ss, N = R.length;
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], adv = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], nlen = (a) => Math.hypot(a[0], a[1], a[2]), norm = (a) => { const L = nlen(a) || 1; return [a[0] / L, a[1] / L, a[2] / L]; };
    const cr = (p0, p1, p2, p3, tt) => { const t2 = tt * tt, t3 = t2 * tt; return [0, 1, 2].map((d) => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * tt + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)); };
    const tan = R.map((p, i) => norm(sub(R[Math.min(N - 1, i + 1)], R[Math.max(0, i - 1)])));
    const side = [];
    for (let i = 0; i < N; i++) { const a = sub(R[i], R[Math.max(0, i - 1)]), b = sub(R[Math.min(N - 1, i + 1)], R[i]);
      let s = cross(cross(a, b), tan[i]);
      if (nlen(s) < 1e-3) s = side[i - 1] ? side[i - 1].slice() : (Math.abs(tan[i][1]) < 0.9 ? cross(tan[i], [0, 1, 0]) : cross(tan[i], [1, 0, 0]));
      s = norm(s);
      if (i > 0 && ss[i] !== "H" && dot(s, side[i - 1]) < 0) s = scl(s, -1);
      side.push(s); }
    const SUB = 10, samp = [];
    for (let i = 0; i < N - 1; i++) { const i0 = Math.max(0, i - 1), i2 = Math.min(N - 1, i + 1), i3 = Math.min(N - 1, i + 2), endE = ss[i] === "E" && (i + 1 >= N || ss[i + 1] !== "E");
      for (let sP = 0; sP < SUB; sP++) { const tt = sP / SUB, p = cr(R[i0], R[i], R[i2], R[i3], tt), sv = norm(cr(side[i0], side[i], side[i2], side[i3], tt));
        const hw = ss[i] === "H" ? 1.55 : ss[i] === "E" ? (endE ? 2.3 * (1 - tt) + 0.05 : 1.75) : 0;
        samp.push({ p, sv, hw, pl: f.pl[i] + (f.pl[i + 1] - f.pl[i]) * tt, tp: ss[i] }); } }
    samp.push({ p: R[N - 1], sv: side[N - 1], hw: ss[N - 1] === "C" ? 0 : 1.0, pl: f.pl[N - 1], tp: ss[N - 1] });
    const M = samp.length, tg = samp.map((s, i) => norm(sub(samp[Math.min(M - 1, i + 1)].p, samp[Math.max(0, i - 1)].p)));
    const zs = samp.map((s) => s.p[2]), zmin = Math.min(...zs), zmax = Math.max(...zs), zr = zmax - zmin || 1, nf = (z) => 1 - (z - zmin) / zr;
    const light = norm([-0.32, 0.52, 0.8]), deep = [10, 15, 30];
    const shade = (rgb, lam, n) => { const s = 0.46 + 0.6 * lam; const c = [Math.min(255, rgb[0] * s), Math.min(255, rgb[1] * s), Math.min(255, rgb[2] * s)]; return this._mix(deep, c, 0.34 + 0.66 * n); };
    const prims = [];
    for (let i = 0; i < M - 1; i++) { const A = samp[i], B = samp[i + 1], z = (A.p[2] + B.p[2]) / 2, n = nf(z), pl = A.pl, ssCol = this._hex(this.resColor(pl, A.tp));
      if (A.hw < 0.06 || A.tp === "C" || B.tp === "C") { const a = proj(A.p), b = proj(B.p), col = shade(ssCol, 0.95, n), w = Math.max(2.6, 1.5 * sc * ((a.k + b.k) / 2) * 0.34);
        prims.push({ z, el: h("line", { key: "c" + i, x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: this._css(col), strokeWidth: w, strokeLinecap: "round" }) });
      } else { const eAL = adv(A.p, scl(A.sv, A.hw)), eAR = sub(A.p, scl(A.sv, A.hw)), eBL = adv(B.p, scl(B.sv, B.hw)), eBR = sub(B.p, scl(B.sv, B.hw));
        const PA = proj(eAL), PB = proj(eAR), PC = proj(eBR), PD = proj(eBL), fn = norm(cross(tg[i], A.sv)), lam = Math.abs(dot(fn, light));
        const col = shade(ssCol, lam, n), edge = this._css(this._mix(ssCol, [8, 11, 22], 0.55));
        prims.push({ z, el: h("polygon", { key: "q" + i, points: `${PA.x.toFixed(1)},${PA.y.toFixed(1)} ${PB.x.toFixed(1)},${PB.y.toFixed(1)} ${PC.x.toFixed(1)},${PC.y.toFixed(1)} ${PD.x.toFixed(1)},${PD.y.toFixed(1)}`, fill: this._css(col), stroke: edge, strokeWidth: 0.5, strokeLinejoin: "round" }) }); } }
    prims.sort((a, b) => b.z - a.z);
    const els = prims.map((p) => p.el);
    const atoms = R.map((r, i) => ({ ...proj(r), pl: f.pl[i], i, ss: ss[i] }));
    this._atomScreen = atoms;
    const P = atoms;
    const OV = { coev: "#37d6ff", amber: "#ffb347", tri: "#3dffa8", ipa: "#c08bff", fape: "#ff5fd0", rec: "#ffb347" };
    const ov = [], ovl = custom ? {} : st2.overlays;
    if (ovl.coevolution) { const pairs = [[4, 27], [8, 24], [12, 21], [2, 16]], trap = [4, 21];
      pairs.forEach(([a, b], n) => { if (P[a] && P[b]) ov.push(h("line", { key: "cv" + n, x1: P[a].x, y1: P[a].y, x2: P[b].x, y2: P[b].y, stroke: OV.coev, strokeWidth: 3.2, opacity: 0.5 + 0.5 * f.t, strokeLinecap: "round" })); });
      if (P[trap[0]] && P[trap[1]]) ov.push(h("line", { key: "cvt", x1: P[trap[0]].x, y1: P[trap[0]].y, x2: P[trap[1]].x, y2: P[trap[1]].y, stroke: OV.amber, strokeWidth: 2.2, strokeDasharray: "6 4", opacity: 0.85 }));
      pairs.forEach(([a, b]) => [a, b].forEach((idx) => { if (P[idx]) ov.push(h("circle", { key: "cvn" + a + "_" + b + "_" + idx, cx: P[idx].x, cy: P[idx].y, r: 5.5, fill: "#ffffff", stroke: OV.coev, strokeWidth: 3 })); })); }
    if (ovl.triangle) { const tr = [5, 18, 28]; if (tr.every((i) => P[i])) { ov.push(h("polygon", { key: "trp", points: tr.map((i) => P[i].x + "," + P[i].y).join(" "), fill: OV.tri + "33", stroke: OV.tri, strokeWidth: 3, opacity: 0.95 })); tr.forEach((i) => ov.push(h("circle", { key: "trn" + i, cx: P[i].x, cy: P[i].y, r: 6, fill: OV.tri, stroke: "#ffffff", strokeWidth: 1.6 }))); } }
    if (ovl.ipa) { [6, 26].forEach((i) => { if (!P[i] || !P[i + 1]) return; const dx = P[i + 1].x - P[i].x, dy = P[i + 1].y - P[i].y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, ax = 24;
      ov.push(h("line", { key: "ipx" + i, x1: P[i].x, y1: P[i].y, x2: P[i].x + ux * ax, y2: P[i].y + uy * ax, stroke: OV.ipa, strokeWidth: 3.6 }));
      ov.push(h("line", { key: "ipy" + i, x1: P[i].x, y1: P[i].y, x2: P[i].x - uy * ax, y2: P[i].y + ux * ax, stroke: "#b388f5", strokeWidth: 3 }));
      ov.push(h("circle", { key: "ipo" + i, cx: P[i].x, cy: P[i].y, r: 5, fill: OV.ipa, stroke: "#ffffff", strokeWidth: 1.6 })); }); }
    if (ovl.fape) { const c = P[16] || P[0]; if (c) { ov.push(h("circle", { key: "fpc", cx: c.x, cy: c.y, r: 17, fill: "none", stroke: OV.fape, strokeWidth: 3, strokeDasharray: st2.reflected ? "5 4" : "0" })); ov.push(this.ovText("fpt", c.x, c.y - 25, st2.reflected ? "MIRROR — wrong hand" : "L-handed", OV.fape)); } }
    if (ovl.recycling) { ov.push(h("circle", { key: "rcr", cx: cx, cy: cy, r: 152, fill: "none", stroke: OV.rec, strokeWidth: 1.8, strokeDasharray: "8 8", opacity: 0.6 })); ov.push(this.ovText("rct", cx, cy + 186, `CYCLE ${st2.frame}/5   Δ ${this.recDelta(st2.frame).toFixed(3)}`, OV.rec)); }
    const hr = st2.hoverRes; const hov = [];
    if (hr != null && P[hr]) { const a = P[hr], aa3 = ["Ala", "Arg", "Asn", "Asp", "Cys", "Gln", "Glu", "Gly", "His", "Ile", "Leu", "Lys", "Met", "Phe", "Pro", "Ser", "Thr", "Trp", "Tyr", "Val"];
      const seqstr = custom ? st2.custom.seq : ""; const letter = seqstr && seqstr[hr] ? seqstr[hr] : ""; const name = aa3[(this.stageSeed() * 7 + hr * 13) % 20], plv = f.pl[hr], col = this.plddt(plv);
      hov.push(h("circle", { key: "hvo", cx: a.x, cy: a.y, r: 8.5, fill: "none", stroke: "#ffffff", strokeWidth: 2.5 }));
      hov.push(h("circle", { key: "hvi", cx: a.x, cy: a.y, r: 4.5, fill: col }));
      const lx = Math.min(W - 156, a.x + 13), ly = Math.max(40, a.y - 12);
      hov.push(h("rect", { key: "hvb", x: lx, y: ly - 31, width: 150, height: 44, rx: 7, fill: "rgba(20,20,28,0.94)", stroke: col, strokeWidth: 1.3 }));
      hov.push(h("text", { key: "hvt1", x: lx + 10, y: ly - 14, fontSize: 12, fontWeight: 700, fontFamily: mono, fill: "#ffffff" }, `${name} ${hr + 1}${letter ? " · " + letter : ""}`));
      hov.push(h("text", { key: "hvt2", x: lx + 10, y: ly + 2, fontSize: 9.5, fontFamily: mono, fill: "#aeb6c8" }, `${this.ssName(f.ss[hr])} · pLDDT`));
      hov.push(h("text", { key: "hvt3", x: lx + 140, y: ly + 2, fontSize: 11, fontWeight: 700, fontFamily: mono, fill: col, textAnchor: "end" }, plv.toFixed(0))); }
    return h("svg", { viewBox: `0 0 ${W} ${Hh}`, style: { width: "100%", height: "100%", maxHeight: "100%", cursor: this._drag ? "grabbing" : hr != null ? "pointer" : "grab", touchAction: "none" }, onPointerDown: (e) => this.molDown(e), onPointerMove: (e) => this.molMove(e), onPointerUp: () => this.molUp(), onPointerLeave: () => { this._drag = null; this.setState({ hoverRes: null }); } },
      h("defs", null,
        h("radialGradient", { id: "aaFloor", cx: "0.5", cy: "0.5", r: "0.5" }, h("stop", { offset: "0%", stopColor: "#000000", stopOpacity: 0.4 }), h("stop", { offset: "100%", stopColor: "#000000", stopOpacity: 0 })),
        h("filter", { id: "aaGlow", x: "-30%", y: "-30%", width: "160%", height: "160%" }, h("feDropShadow", { dx: 0, dy: 7, stdDeviation: 9, floodColor: "#000000", floodOpacity: 0.5 })),
        h("filter", { id: "ovg", x: "-50%", y: "-50%", width: "200%", height: "200%" }, h("feGaussianBlur", { stdDeviation: 2.4, result: "b" }), h("feMerge", null, h("feMergeNode", { in: "b" }), h("feMergeNode", { in: "SourceGraphic" })))),
      h("ellipse", { cx: cx, cy: Hh - 58, rx: 150, ry: 26, fill: "url(#aaFloor)" }),
      h("g", { filter: "url(#aaGlow)" }, els),
      h("g", { filter: "url(#ovg)" }, ov),
      hov);
  }

  // ---------- readouts (teaching model + real-frame overrides) ----------
  realPlddt() { const a = this.realActive(); return a && a.plddt && a.plddt.length ? a.plddt : null; }
  realPae() {
    const pae = this.activeModel()?.pae || (this.state.result && this.state.result.pae);
    if (!Array.isArray(pae) || !pae.length || !Array.isArray(pae[0])) return null;
    return pae;
  }
  realContactLines() {
    const a = this.realActive();
    const ref = this.referenceCa();
    if (!a?.ca?.length || !ref?.length) return null;
    return lensContactLines(a.ca, ref);
  }
  renderPlddtBars() {
    const real = this.realPlddt();
    const vals = real || this.frameDataT(this.state.frame / 5, this.stageSeed()).pl;
    const n = vals.length || 1;
    return h("svg", { viewBox: `0 0 ${n * 6} 42`, style: { width: "100%", height: "42px" } }, vals.map((v, i) => h("rect", { key: i, x: i * 6, y: 42 - (v / 100) * 42, width: 5, height: (v / 100) * 42, fill: this.plddt(v), rx: 1 })));
  }
  renderMap() { const C = this.C, st2 = this.state;
    const contactLines = this.realContactLines();
    if (st2.mapMode === "delta" && contactLines) {
      const selected = st2.selectedPae && st2.selectedPae.source === "contact-delta" ? st2.selectedPae : null;
      return h(ContactDeltaMap, {
        lines: contactLines,
        residueCount: this.realActive()?.ca?.length || 0,
        selectedPair: selected,
        colors: C,
        labels: truthLabels.contactDeltaLabels,
        onSelectPair: ({ i, j, kind }) => this.setState({ selectedPae: { i, j, value: kind, source: "contact-delta" } }),
      });
    }
    const realPae = this.realPae();
    if (st2.mapMode === "pae" && realPae) {
      return h(PaePanel, {
        pae: realPae,
        selected: st2.selectedPae,
        colors: C,
        onSelect: (cell) => this.setState({ selectedPae: cell }),
      });
    }
    const a = this.realActive();
    if (a && a.ca && a.ca.length) { const ca = a.ca, n = ca.length, rects = [], cell = Math.max(2, 5 - 0.6);
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const d = Math.hypot(ca[i][0] - ca[j][0], ca[i][1] - ca[j][1], ca[i][2] - ca[j][2]); if (d < 8) { const op = Math.min(1, (8 - d) / 8 + 0.2); [[i, j], [j, i]].forEach(([p, q]) => { const sel = st2.selectedPae && st2.selectedPae.i === p && st2.selectedPae.j === q; rects.push(h("rect", { key: p + "_" + q, x: q * 5, y: p * 5, width: cell, height: cell, fill: C.coev, opacity: op, rx: 0.6, stroke: sel ? C.amber : "none", strokeWidth: sel ? 1.3 : 0, onClick: () => this.setState({ selectedPae: { i: p, j: q, value: d, source: "contact" } }) })); }); } }
      return h("svg", { "aria-label": "Real C-alpha contact map", viewBox: `0 0 ${n * 5} ${n * 5}`, style: { width: "190px", height: "190px", background: C.bg0, borderRadius: "8px", border: "1px solid " + C.border, cursor: "crosshair" } }, rects); }
    const f = this.frameDataT(st2.frame / 5, this.stageSeed()), n = f.N, rects = [];
    if (st2.mapMode === "contact") { for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const d = Math.hypot(f.coords[i][0] - f.coords[j][0], f.coords[i][1] - f.coords[j][1], f.coords[i][2] - f.coords[j][2]); if (d < 5.5) { const op = Math.min(1, (5.5 - d) / 5.5 + 0.25); [[i, j], [j, i]].forEach(([a2, b]) => rects.push(h("rect", { key: a2 + "_" + b, x: b * 5, y: a2 * 5, width: 4.4, height: 4.4, fill: C.coev, opacity: op, rx: 0.6 }))); } } }
    else { for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = Math.min(1, Math.abs(i - j) / n + (1 - f.t) * 0.4); rects.push(h("rect", { key: i + "_" + j, x: j * 5, y: i * 5, width: 4.4, height: 4.4, fill: `hsl(145 62% ${(34 + v * 54).toFixed(0)}%)` })); } }
    return h("svg", { "aria-label": st2.mapMode === "contact" ? "Teaching contact map" : "Teaching PAE-style confidence map", viewBox: `0 0 ${n * 5} ${n * 5}`, style: { width: "190px", height: "190px", background: C.bg0, borderRadius: "8px", border: "1px solid " + C.border } }, rects); }
  setColorMode() { this.setState((s) => ({ colorMode: s.colorMode === "plddt" ? "ss" : "plddt" })); }
  resetCam() { this.setState({ rot: 0.6, rotX: -0.18 }); }
  renderTraj() { const C = this.C;
    let arr, rmsdArr = [], cur, xLab;
    if (this.hasReal()) {
      const series = convergenceSeries(this.activeAnalysis());
      const fr = this.realFrames();
      arr = series.length ? series.map((entry) => entry.meanPlddt ?? 0) : fr.map((f) => Math.round(meanOf(f.plddt && f.plddt.length ? f.plddt : [0])));
      rmsdArr = series.map((entry) => entry.rmsdToPrevious);
      cur = this.state.realIndex;
      xLab = (i) => (i === 0 ? "init" : "R" + i);
    }
    else { const sd = this.stageSeed(); arr = [0, 1, 2, 3, 4, 5].map((i) => this.scoreAtT(i / 5, sd)); cur = this.state.frame; xLab = (i) => (i === 0 ? "init" : "R" + i); }
    return h(RecycleTimeline, { values: arr, currentIndex: cur, colors: C, xLabel: xLab, rmsdValues: rmsdArr });
  }

  renderCustomTraj() { const C = this.C, st2 = this.state, cseed = this.seqSeed(st2.custom.seq), t = st2.custom.t;
    const steps = 20, arr = Array.from({ length: steps + 1 }, (_, i) => this.scoreAtT(Math.min(t, i / steps), cseed));
    const width = 268, pad = { l: 28, r: 6, t: 6, b: 18 }, cw = width - pad.l - pad.r;
    const xTicks = [0, 0.25, 0.5, 0.75, 1].map((v) => ({ key: v, x: pad.l + v * cw, text: (v * 100).toFixed(0) + "%" }));
    return h(RecycleTimeline, { values: arr, currentIndex: t > 0 ? arr.length - 1 : -1, colors: C, width, height: 72, styleHeight: "72px", pad, yTicks: [0, 50, 100], xTicks });
  }
  renderCustomBars() { const st2 = this.state; const real = this.realPlddt(); const vals = real || this.frameDataT(st2.custom.t, this.seqSeed(st2.custom.seq)).pl; const n = vals.length || 1;
    return h("svg", { viewBox: `0 0 ${n * 6} 42`, style: { width: "100%", height: "42px" } }, vals.map((v, i) => h("rect", { key: i, x: i * 6, y: 42 - (v / 100) * 42, width: 5, height: (v / 100) * 42, fill: this.plddt(v), rx: 1 }))); }
  renderCustomMap() { return this.renderMap(); }

  conceptDefs() { return {
    coevolution: { name: "Coevolution", color: this.C.coev, q: "Two residues mutate together across evolution — does that mean they touch?", boundary: "A 6×6 planted-contact matrix is fully inspectable; AF2 learns a pair representation rather than inverting DCA.", paper: "Fig. 1; Supplement §2", read: "In the matrix, switch covariance -> precision: indirect echoes fade, true contacts stay. Lit residues are coevolving partners that sit close in 3D." },
    triangle: { name: "Triangle Updates", color: this.C.tri, q: "Can you edit residue–residue distances independently of each other?", boundary: "We relax explicit distances; the Evoformer operates on learned pair features.", paper: "p.586; Supplement §1.6", read: "Edit one distance and watch the max triangle violation spike red - a pair table cannot become a 3D shape until every triple is consistent." },
    ipa: { name: "Invariant Point Attention", color: this.C.ipa, q: "If you rotate and translate the whole protein, should the model's read of its geometry change?", boundary: "Two frames, two points — real IPA mixes scalar+point+pair-bias attention over many points.", paper: "Fig. 3; Algorithm 22", read: "Rotate the whole scene: the naive readout changes, the IPA readout does not. Geometry judged in residue-local frames is pose-independent." },
    fape: { name: "FAPE & Chirality", color: this.C.fape, q: "If a predicted structure matches all distances, is it correct?", boundary: "A 2D chain illustrates the failure; real FAPE is over all atoms in all frames, with a clamp.", paper: "p.587; Supplement §1.9.2", read: "Hit REFLECT: the distances stay identical (a distance metric is fooled) but FAPE jumps, because the handedness flipped. Biology is chiral." },
    recycling: { name: "Recycling", color: this.C.rec, q: "Is the iteration you watch a movie of a protein folding in time?", boundary: "The trajectory is representational iteration — never narrate it as folding kinetics.", paper: "p.585; Algorithm 2", read: "Step the recycles: the shape moves toward a fixed point and stops changing. This is representational iteration, not folding in time." } }; }

  arcadeTargets() { return curatedArcadeTargets(); }
  selectTarget(i) { const t = this.arcadeTargets()[i], ov = { coevolution: false, triangle: false, ipa: false, fape: false, recycling: false };
    if (t.concept === "all") Object.keys(ov).forEach((k) => (ov[k] = true)); else ov[t.concept] = true;
    clearInterval(this._playT); this._playT = null;
    this.setState({ target: i, overlays: ov, result: null, realIndex: 0, realPlaying: false, selectedModel: 0, selectedPae: null, frame: 5 }); }
  // Stable handler (class field) so the tour's effect deps don't churn. Selects
  // the example protein that best demonstrates a lens, switching its overlay on.
  focusLens = (concept, pdb) => {
    if (!concept && !pdb) return;
    const targets = this.arcadeTargets();
    const idx = pdb ? targets.findIndex((t) => t.pdb === pdb) : targets.findIndex((t) => t.concept === concept);
    if (idx < 0) return;
    if (idx !== this.state.target) this.selectTarget(idx);
    // Force the requested lens overlay on, decoupled from the target's own
    // concept, so e.g. the triangle lens can be demonstrated on a confident
    // beta-sheet protein rather than the no-MSA GFP failure.
    if (concept && concept !== "all") {
      const ov = { coevolution: false, triangle: false, ipa: false, fape: false, recycling: false };
      ov[concept] = true;
      this.setState({ overlays: ov });
    }
  };
  stageSeed() { return this.arcadeTargets()[this.state.target].seed; }

  renderResultInspector(hasReal) {
    const C = this.C, summary = this.confidenceSummary(), result = this.state.result || {}, report = this.state.report || {};
    const model = this.activeModel();
    return h(ResultInspector, {
      colors: C,
      summary,
      result,
      report,
      model,
      hasReal,
      hasPae: !!this.realPae(),
      engine: this.state.engine,
      cacheKey: this.state.job?.cache_key,
      hasResultSeq: !!this.state.resultSeq,
      plddtColor: (value) => this.plddt(value),
      onDownload: (kind) => this.downloadArtifact(kind),
    });
  }

  render() {
    const C = this.C, st2 = this.state, mono = "'JetBrains Mono',monospace", defs = this.conceptDefs();
    const tg = this.arcadeTargets();
    const curT = tg[st2.target];
    const curConceptColor = curT.concept === "all" ? C.amber : defs[curT.concept].color;
    const hasReal = this.hasReal(), realA = this.realActive(), activeModel = this.activeModel();
    const realFrames = this.realFrames();

    const f = this.frameDataT(st2.frame / 5, this.stageSeed()), fp = this.fapeData();
    const meanP = hasReal && this.realPlddt() ? meanOf(this.realPlddt()) : f.meanP;
    const legend = st2.colorMode === "ss"
      ? { title: "SECONDARY STRUCTURE", items: [{ color: "#e64980", label: "α-helix", w: "14px" }, { color: "#f4b400", label: "β-strand", w: "14px" }, { color: "#9aa6b8", label: "loop", w: "14px" }] }
      : { title: "MODEL CONFIDENCE · pLDDT", items: [{ color: "#1f6feb", label: "Very high", w: "9px" }, { color: "#25c7d9", label: "Confident", w: "9px" }, { color: "#f4e409", label: "Low", w: "9px" }, { color: "#f28c28", label: "Very low", w: "9px" }] };

    const lensIds = ["coevolution", "triangle", "ipa", "fape", "recycling"];
    // Real, computed lens metrics when a real run exists; otherwise the
    // teaching-model placeholders. (Audit: never show synthetic "residual < 1e-12"
    // or a hardcoded FAPE for real LocalColabFold output.)
    const realLensEntry = hasReal ? this.analysisActive() : null;
    const lensMetric = realLensEntry ? computeLensMetrics(realLensEntry) : { coevolution: `${Math.round(4 * f.t)}/4 contacts formed`, triangle: `△ violation ${f.triViol.toFixed(1)}`, ipa: `residual < 1e-12`, fape: `FAPE ${(st2.reflected ? 3.6 : 0.18).toFixed(2)}${st2.reflected ? " (mirror!)" : ""}`, recycling: `cycle ${st2.frame}/5 · Δ ${this.recDelta(st2.frame).toFixed(3)}` };
    const lensState = { coevolution: "contacts", triangle: "pair-table", ipa: "SE(3)", fape: "chirality", recycling: "fixed-pt" };

    const activeLensIds = lensIds.filter((id) => st2.overlays[id]);
    const chips = activeLensIds.map((id) => ({ id, label: defs[id].name, color: defs[id].color, value: lensMetric[id].split("·")[0].trim() }));
    const lensRail = LensRail({
      colors: C,
      lensIds,
      defs,
      overlays: st2.overlays,
      lensState,
      lensMetric,
      chips,
      onToggle: (id) => this.toggleOverlay(id),
      onExpand: (id) => this.setState({ expanded: id }),
      notice: curT.notice,
      noticeColor: curConceptColor,
    });
    const realLensModel = realLensEntry ? computeLensModel({
      entry: realLensEntry,
      ca: realA?.ca,
      referenceCa: this.referenceCa(),
      plddt: realA?.plddt,
      activeLenses: st2.colorMode === "plddt" ? [...activeLensIds, "confidence"] : activeLensIds,
    }) : null;
    const showLowConfidenceLesson = isLowConfidence(realLensEntry);
    const realGeometry = realLensEntry?.geometry || {};
    const liveTriangle = hasReal ? (realGeometry.bond_outliers ?? 0) : f.triViol;
    const liveClashes = hasReal ? (realGeometry.clashes ?? 0) : f.clashes;
    const liveFape = hasReal ? realLensEntry?.fape_to_reference_a : (st2.reflected ? 3.6 : fp.fape);
    const alignedRmsd = hasReal ? realLensEntry?.rmsd_to_reference_a : null;
    const deltaPlddt = hasReal ? realLensEntry?.delta_mean_plddt : null;
    const mapTabs = [
      { id: "contact", label: "CONTACT" },
      { id: "pae", label: "PAE", disabled: hasReal && !this.realPae() },
      ...(this.realContactLines() ? [{ id: "delta", label: "Δ CONTACTS" }] : []),
    ];

    const mp = f.meanP / 100, triT = 1 - Math.min(1, f.triViol / 9.4), clash = Math.min(1, f.clashes / 11);
    const scoreParts = [{ label: "mean pLDDT", weight: "×0.42", value: (mp * 100).toFixed(0), pct: mp * 100 + "%", color: "#65CBF3" }, { label: "1 − △ violation", weight: "×0.30", value: triT.toFixed(2), pct: triT * 100 + "%", color: C.green }, { label: "chirality OK", weight: "×0.18", value: "1", pct: "100%", color: C.purple }, { label: "clashes (penalty)", weight: "−0.10", value: "−" + clash.toFixed(2), pct: clash * 100 + "%", color: C.danger }];

    const frameLabelsSyn = ["Init (extended)", "Recycle 1", "Recycle 2", "Recycle 3", "Recycle 4", "Recycle 5 (final)"];
    const frameLabel = hasReal && realA ? `${activeModel && this.resultModels().length > 1 ? `Rank ${activeModel.rank || st2.selectedModel + 1} · ` : ""}${realA.label}` : frameLabelsSyn[st2.frame];
    const ticks = hasReal
      ? realFrames.map((fr, i) => ({ label: fr.label, onClick: () => this.setFrame(i), active: i <= st2.realIndex }))
      : Array.from({ length: 6 }, (_, i) => ({ label: frameLabelsSyn[i], onClick: () => this.setFrame(i), active: i <= st2.frame }));

    const exp = st2.expanded, ed = exp ? defs[exp] : null;
    const dmd = `padding:10px 11px;border-radius:9px;background:#0a0612;border:1px solid ${C.border};background-image:radial-gradient(circle,rgba(255,255,255,.04) 1px,transparent 1px);background-size:4px 4px;`;
    const flip = `flex:none;width:46px;height:46px;border-radius:11px;background:${C.bg3};border:1px solid ${C.borderHi};color:${C.hi};font-size:15px;cursor:pointer;`;

    const cf = st2.custom, cseed = this.seqSeed(cf.seq), cdat = this.frameDataT(cf.t, cseed), cscore = this.scoreAtT(cf.t, cseed);
    const cMeanP = hasReal && this.realPlddt() && st2.view === "custom" ? meanOf(this.realPlddt()) : cdat.meanP;
    const examples = [{ name: "Ubiquitin", s: "MQIFVKTLTGKTITLEVEPSDTIENVKAKIQDKEGIPPDQQRLIFAGKQLEDGR" }, { name: "Trp-cage", s: "NLYIQWLKDGGPSSGRPPPS" }, { name: "Villin", s: "LSDEDFKAVFGMTRSAFANLPLWKQQNLKKEKGLF" }].map((e) => ({ name: e.name, onClick: () => this.fillSeq(e.s) }));
    const stageLabel = cf.running ? "◔ FOLDING…" : cf.done ? "✓ FOLD COMPLETE" : cf.t > 0 ? "PAUSED" : "EXTENDED CHAIN — PRESS RUN";

    const engines = st2.capabilities.length ? st2.capabilities : [{ id: "localcolabfold", label: "LocalColabFold", available: true }, { id: "educational-simulator", label: "Educational simulator", available: true }];


    return h("div", { style: st("position:fixed;inset:0;display:flex;flex-direction:column;font-family:'Roboto',sans-serif;background:radial-gradient(circle at 50% -10%,#1a1438,#0b0820 55%,#070510);color:#f3f0ff;overflow:hidden;"), className: "arcade-shell" },

      h("header", { style: st("flex:none;height:54px;display:flex;align-items:center;gap:18px;padding:0 20px;background:linear-gradient(180deg,#1c1640,#140e2c);border-bottom:1px solid #322757;z-index:30;") },
        h("div", { style: st("display:flex;align-items:center;gap:11px;padding:7px 16px;border-radius:9px;background:#0a0612;border:1px solid #4a3d72;background-image:radial-gradient(circle,rgba(255,170,60,.12) 1px,transparent 1px);background-size:4px 4px;") },
          h("div", { style: st("font-family:'JetBrains Mono',monospace;font-weight:900;letter-spacing:2.6px;font-size:18px;color:#ffb347;text-shadow:0 0 12px rgba(255,170,60,.85);animation:aa-flick 4s infinite;line-height:1;") }, "AMINO ARCADE")),
        h("div", { style: st("margin-left:6px;display:flex;background:#0a0612;border:1px solid #4a3d72;border-radius:9px;padding:4px;gap:4px;") },
          h("button", { onClick: () => this.setView("stage"), title: "Curated teaching targets", style: st(`padding:7px 13px;border-radius:7px;border:none;cursor:pointer;font-family:${mono};font-weight:700;font-size:11.5px;letter-spacing:1px;background:${st2.view === "stage" ? "linear-gradient(135deg,#3dffa8,#2fd6ff)" : "transparent"};color:${st2.view === "stage" ? "#08060f" : C.mid};`) }, "◉ ARCADE"),
          h("button", { onClick: () => this.setView("custom"), title: "Fold It Yourself sequence mode", style: st(`padding:7px 13px;border-radius:7px;border:none;cursor:pointer;font-family:${mono};font-weight:700;font-size:11.5px;letter-spacing:1px;background:${st2.view === "custom" ? "linear-gradient(135deg,#b06bff,#ff4fd8)" : "transparent"};color:${st2.view === "custom" ? "#08060f" : C.mid};`) }, "FIY")),
        st2.view === "stage" ? h("div", { style: st("margin-left:4px;display:flex;gap:7px;") }, tg.map((t, i) => h("button", { key: i, onClick: () => this.selectTarget(i), style: st(`width:30px;height:30px;border-radius:8px;cursor:pointer;font-family:${mono};font-weight:800;font-size:13px;border:1px solid ${st2.target === i ? C.cyan : C.border};background:${st2.target === i ? "rgba(47,214,255,.18)" : "#0a0612"};color:${st2.target === i ? C.cyan : C.mid};box-shadow:${st2.target === i ? "0 0 12px rgba(47,214,255,.4)" : "none"};`) }, t.n))) : null,
        h("div", { style: st("flex:1;") }),
        h("button", { onClick: () => this.setState({ tourOpen: true }), title: "Guided tour: how AlphaFold turns a sequence into a structure (and what it is NOT)", style: st("display:flex;align-items:center;gap:8px;padding:7px 13px;border-radius:9px;background:#0a0612;border:1px solid #3dffa8;cursor:pointer;") }, h("span", { style: st("font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:1.5px;color:#3dffa8;") }, "▶ GUIDED TOUR")),
        h("div", { title: "Active backend and local guardrail", style: st("display:flex;align-items:center;gap:7px;padding:7px 11px;border-radius:9px;background:#0a0612;border:1px solid #2c2350;font-family:'JetBrains Mono',monospace;font-size:9.5px;color:#9d8fd6;") },
          h("span", { style: st(`width:7px;height:7px;border-radius:50%;background:${st2.loading ? C.cyan : C.green};box-shadow:0 0 8px ${st2.loading ? C.cyan : C.green};`) }),
          h("span", null, `${st2.engine} · 768aa cap`)),
        h("button", { onClick: () => this.setState({ showInfo: true }), title: "result inspector, downloads, and backend specifics", style: st("width:38px;height:38px;border-radius:9px;background:#0a0612;border:1px solid #4a3d72;color:#9d8fd6;font-family:'JetBrains Mono',monospace;font-size:15px;cursor:pointer;") }, "ⓘ")),

      h(TourOverlay, { open: st2.tourOpen, onClose: () => this.setState({ tourOpen: false }), conceptDefs: defs, glossary, equationDeck, colors: C, onFocusLens: this.focusLens }),

      st2.view === "stage" ? h("div", { style: st("flex:1;display:flex;flex-direction:column;min-height:0;") },
        h("div", { style: st("flex:none;display:flex;align-items:center;gap:18px;padding:11px 22px;background:#100c24;border-bottom:1px solid #2c2350;") },
          h("div", { style: st("display:flex;align-items:center;gap:12px;flex:none;") },
            h("div", { style: st(`width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-family:'JetBrains Mono',monospace;font-weight:800;font-size:16px;background:${curConceptColor}1a;border:1px solid ${curConceptColor};color:${curConceptColor};`) }, curT.n),
            h("div", { style: st("line-height:1.2;") },
              h("div", { style: st("font-family:'JetBrains Mono',monospace;font-weight:700;font-size:15px;color:#f3f0ff;") }, curT.name),
              h("div", { style: st("font-size:10.5px;color:#7a6aa8;margin-top:2px;") }, curT.full))),
          h("div", { style: st("flex:1;font-size:12.5px;color:#cabbf0;line-height:1.45;") }, curT.blurb),
          h("div", { style: st(`flex:none;display:flex;align-items:center;gap:8px;padding:7px 13px;border-radius:9px;background:${curConceptColor}1a;border:1px solid ${curConceptColor};`) },
            h("span", { style: st("font-family:'JetBrains Mono',monospace;font-size:8.5px;letter-spacing:1.5px;color:#9d8fd6;") }, "LENS"),
            h("span", { style: st(`font-family:'JetBrains Mono',monospace;font-weight:700;font-size:11px;color:${curConceptColor};`) }, curT.tag))),

        h("main", { style: st(`flex:1;display:grid;grid-template-columns:252px 1fr 350px;grid-template-rows:minmax(0,1fr) ${st2.loading || st2.error ? "168px" : "92px"};min-height:0;`) },

          lensRail.rail,

          h("section", { style: st(st2.molFull ? "position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;overflow:hidden;background:radial-gradient(circle at 50% 42%,#101a30,#070b16);" : "grid-column:2;grid-row:1;position:relative;display:flex;align-items:center;justify-content:center;min-height:0;min-width:0;overflow:hidden;background:radial-gradient(circle at 50% 42%,#101a30,#070b16);") },
            lensRail.chips,
            h("button", { onClick: () => this.setState((s2) => ({ molFull: !s2.molFull })), title: st2.molFull ? "Exit fullscreen" : "Fullscreen the structure viewport", style: st("position:absolute;top:14px;right:14px;z-index:8;width:30px;height:30px;border-radius:8px;background:rgba(10,14,26,.86);border:1px solid #25304a;color:#9d8fd6;cursor:pointer;font-size:13px;line-height:1;") }, st2.molFull ? "✕" : "⛶"),
            h(MolPlayfield, { pdb: realA && realA.pdb, referenceCa: this.referenceCa(), frameCa: realA && realA.ca, pdbId: !realA ? curT.pdb : undefined, pdbChain: curT.pdbChain, includePreviewHetatm: curT.includePreviewHetatm, defaultSpin: curT.defaultSpin, fallbackSequence: curT.seq, frame: realA, lens: curT.concept, activeLenses: activeLensIds, lensModel: realLensModel, frames: hasReal ? realFrames : null, frameIndex: st2.realIndex, selectedResidues: st2.selectedPae ? [st2.selectedPae.i + 1, st2.selectedPae.j + 1] : [], reflected: st2.reflected, colorMode: st2.colorMode }),
            h("div", { style: st("position:absolute;bottom:14px;left:14px;z-index:6;padding:8px 11px;border-radius:8px;background:rgba(10,14,26,.82);border:1px solid #25304a;") },
              h("div", { style: st("display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:6px;") },
                h("div", { style: st("font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:1.5px;color:#7a85a0;") }, legend.title),
                h("button", { onClick: () => this.setColorMode(), title: "Toggle structure coloring between secondary structure and per-residue confidence", style: st("padding:2px 6px;border-radius:5px;background:#17132b;border:1px solid #4a3d72;color:#cabbf0;font-family:'JetBrains Mono',monospace;font-size:8px;cursor:pointer;") }, st2.colorMode === "ss" ? "SHOW pLDDT" : "SHOW SS")),
              h("div", { style: st("display:flex;align-items:center;gap:10px;") }, legend.items.map((L, i) => h("div", { key: i, style: st("display:flex;align-items:center;gap:5px;") }, h("span", { style: st(`width:${L.w};height:8px;border-radius:2px;background:${L.color};`) }), h("span", { style: st("font-family:'JetBrains Mono',monospace;font-size:9px;color:#c4ccde;") }, L.label))))),
            null),

          h("aside", { style: st("grid-row:1;border-left:1px solid #2c2350;display:flex;flex-direction:column;min-height:0;background:linear-gradient(180deg,#150f30,#0e0a22);overflow-y:auto;") },
            h("div", { style: st("flex:none;padding:16px;border-bottom:1px solid #2c2350;") },
              h("div", { style: st("font-family:'JetBrains Mono',monospace;font-weight:700;letter-spacing:2px;font-size:11px;color:#9d8fd6;margin-bottom:11px;") }, "LIVE READOUT"),
              h("div", { style: st("display:grid;grid-template-columns:1fr 1fr;gap:9px;") },
                h("div", { style: st(dmd) }, h("div", { style: st("font-family:'JetBrains Mono',monospace;font-size:8.5px;letter-spacing:1px;color:#7a6aa8;") }, "MEAN pLDDT"), h("div", { style: st(`font-family:'JetBrains Mono',monospace;font-weight:800;font-size:21px;color:${this.plddt(meanP)};`) }, hasReal ? meanP.toFixed(1) : meanP.toFixed(0))),
                h("div", { style: st(dmd) }, h("div", { style: st("font-family:'JetBrains Mono',monospace;font-size:8.5px;letter-spacing:1px;color:#7a6aa8;") }, hasReal ? "BOND OUTLIERS" : "△ VIOLATION"), h("div", { style: st("font-family:'JetBrains Mono',monospace;font-weight:800;font-size:21px;color:#3dffa8;") }, hasReal ? String(liveTriangle) : liveTriangle.toFixed(1))),
                h("div", { style: st(dmd) }, h("div", { style: st("font-family:'JetBrains Mono',monospace;font-size:8.5px;letter-spacing:1px;color:#7a6aa8;") }, "CLASHES"), h("div", { style: st("font-family:'JetBrains Mono',monospace;font-weight:800;font-size:21px;color:#ff4fd8;") }, String(liveClashes))),
                h("div", { style: st(dmd) }, h("div", { style: st("font-family:'JetBrains Mono',monospace;font-size:8.5px;letter-spacing:1px;color:#7a6aa8;") }, hasReal ? "Cα-FAPE (Å)" : "FAPE"), h("div", { style: st(`font-family:'JetBrains Mono',monospace;font-weight:800;font-size:21px;color:${st2.reflected ? C.danger : C.amber};`) }, typeof liveFape === "number" ? liveFape.toFixed(2) : "--")), ...(hasReal ? [h("div", { key: "rmsdfinal", style: st(dmd) }, h("div", { style: st("font-family:'JetBrains Mono',monospace;font-size:8.5px;letter-spacing:1px;color:#7a6aa8;") }, "Δ RMSD→FINAL (Å)"), h("div", { style: st("font-family:'JetBrains Mono',monospace;font-weight:800;font-size:21px;color:#37d6ff;") }, typeof alignedRmsd === "number" ? alignedRmsd.toFixed(2) : "--")), h("div", { key: "dplddt", style: st(dmd) }, h("div", { style: st("font-family:'JetBrains Mono',monospace;font-size:8.5px;letter-spacing:1px;color:#7a6aa8;") }, "Δ pLDDT / CYCLE"), h("div", { style: st("font-family:'JetBrains Mono',monospace;font-weight:800;font-size:21px;color:#3dffa8;") }, typeof deltaPlddt === "number" ? (deltaPlddt >= 0 ? "+" : "") + deltaPlddt.toFixed(2) : "--"))] : []))),
            showLowConfidenceLesson ? h("div", { "data-testid": "low-confidence-lesson", style: st("flex:none;margin:12px 16px 0;padding:12px;border-radius:9px;background:rgba(255,179,71,.08);border:1px solid rgba(255,179,71,.45);font-size:10.5px;line-height:1.5;color:#d9d2ef;") },
              h("div", { style: st("font-family:'JetBrains Mono',monospace;font-weight:800;letter-spacing:.8px;color:#ffb347;margin-bottom:6px;") }, truthLabels.lowConfidenceTitle),
              h("div", null, truthLabels.lowConfidenceBody),
              h("div", { style: st("margin-top:6px;color:#9d8fd6;") }, truthLabels.plddtBands)) : null,
            h("div", { "data-testid": "target-scope", style: st("flex:none;margin:12px 16px 0;padding:11px 12px;border-radius:9px;background:rgba(47,214,255,.06);border:1px solid rgba(47,214,255,.28);font-size:10.5px;line-height:1.5;color:#d9d2ef;") },
              h("div", { style: st("font-family:'JetBrains Mono',monospace;font-weight:800;letter-spacing:.9px;color:#2fd6ff;margin-bottom:6px;") }, "WHAT IS BEING FOLDED"),
              h("div", null, curT.predictionScope || `Folded object: ${curT.seq.length} residues from one protein sequence.`),
              h("div", { style: st("margin-top:6px;color:#9d8fd6;") }, curT.omittedContext || `Reference preview: ${curT.pdb}${curT.pdbChain ? ` chain ${curT.pdbChain}` : ""}.`)),
            h("div", { style: st("flex:none;padding:14px 16px;border-bottom:1px solid #2c2350;") },
              h("div", { style: st("font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:1px;color:#7a6aa8;margin-bottom:9px;") }, "PER-RESIDUE pLDDT"), this.renderPlddtBars()),
            this.renderModelSelector(),
            h("div", { style: st("flex:none;padding:14px 16px;border-bottom:1px solid #2c2350;") },
              h("div", { style: st("display:flex;align-items:center;justify-content:space-between;margin-bottom:9px;") },
                h("span", { style: st("font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:1px;color:#7a6aa8;") }, st2.mapMode === "delta" ? "CONTACT DELTA TO FINAL (real)" : st2.mapMode === "contact" ? "CONTACT MAP (live)" : (this.realPae() ? "PREDICTED ALIGNED ERROR (real)" : "PREDICTED ALIGNED ERROR (teaching)")),
                h("div", { role: "tablist", "aria-label": "Map mode", style: st("display:flex;gap:4px;") }, mapTabs.map((tab) => h("button", {
                  key: tab.id,
                  role: "tab",
                  "aria-selected": st2.mapMode === tab.id,
                  disabled: tab.disabled,
                  onClick: () => this.setState({ mapMode: tab.id, selectedPae: null }),
                  style: st(`font-family:'JetBrains Mono',monospace;font-size:8.5px;letter-spacing:.4px;padding:4px 7px;border-radius:6px;background:${st2.mapMode === tab.id ? "#241944" : "#0a0612"};border:1px solid ${st2.mapMode === tab.id ? C.cyan : "#4a3d72"};color:${tab.disabled ? C.dim : "#cabbf0"};cursor:${tab.disabled ? "not-allowed" : "pointer"};`),
                }, tab.label)))),
              h("div", { style: st("display:flex;justify-content:center;") }, this.renderMap())),
            h("div", { style: st("flex:1;padding:14px 16px;min-height:120px;") },
              h("div", { style: st("font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:1px;color:#7a6aa8;margin-bottom:9px;") }, hasReal ? "pLDDT + Δ RMSD OVER RECYCLES" : "SCORE OVER TRAJECTORY"), this.renderTraj())),

          h("footer", { style: st("grid-column:2 / 4;grid-row:2;min-width:0;border-top:1px solid #2c2350;background:linear-gradient(180deg,#150f30,#0e0a22);") },
            st2.loading || st2.error ? this.renderJobPopup() : h("div", { style: st("height:100%;display:flex;align-items:center;gap:14px;padding:0 24px;") },
              hasReal ? h("button", { onClick: () => this.stepBack(), style: st(flip) }, "◀") : null,
              h("button", { onClick: () => this.runFold(curT.seq, false), disabled: st2.loading, style: st(`flex:none;height:46px;padding:0 24px;border-radius:11px;background:${st2.loading ? C.bg3 : "linear-gradient(135deg,#3dffa8,#2fd6ff)"};border:none;color:${st2.loading ? C.mid : "#08060f"};font-family:'JetBrains Mono',monospace;font-weight:800;font-size:13px;letter-spacing:1px;cursor:${st2.loading ? "default" : "pointer"};box-shadow:${st2.loading ? "none" : "0 0 18px rgba(61,255,168,.4)"};`) }, hasReal ? "Re-fold" : "Fold"),
              hasReal ? h("button", { onClick: () => this.stepFwd(), style: st(flip) }, "▶") : null,
              hasReal ? h("button", { onClick: () => this.toggleRealPlayback(), title: "Loop real saved recycle PDB snapshots; this is inference refinement, not physical folding time.", style: st(`flex:none;height:46px;padding:0 13px;border-radius:11px;background:${st2.realPlaying ? "linear-gradient(135deg,#b06bff,#2fd6ff)" : C.bg3};border:1px solid ${st2.realPlaying ? C.cyan : C.borderHi};color:${st2.realPlaying ? "#08060f" : C.hi};font-family:'JetBrains Mono',monospace;font-weight:800;font-size:11px;letter-spacing:.8px;cursor:pointer;`) }, st2.realPlaying ? "Pause" : "Loop") : null,
              activeLensIds.includes("fape") ? h("button", { onClick: () => this.setState((s2) => ({ reflected: !s2.reflected })), title: "Reflect to the mirror image: every distance stays identical, but the handedness flips and FAPE jumps. Biology is chiral.", style: st(`flex:none;height:46px;padding:0 13px;border-radius:11px;background:${st2.reflected ? "linear-gradient(135deg,#ff4fd8,#ffb347)" : C.bg3};border:1px solid ${st2.reflected ? C.magenta : C.borderHi};color:${st2.reflected ? "#08060f" : C.hi};font-family:'JetBrains Mono',monospace;font-weight:800;font-size:11px;letter-spacing:.8px;cursor:pointer;`) }, st2.reflected ? "⇋ Mirrored" : "⇋ Reflect") : null,
              hasReal ? h("button", { onClick: () => this.setFrame(0), style: st(flip.replace(C.hi, C.mid)) }, "↺") : null,
              h("div", { style: st("flex:1;min-width:0;display:flex;flex-direction:column;gap:7px;") },
                h("div", { style: st("display:flex;justify-content:space-between;font-family:'JetBrains Mono',monospace;font-size:10px;color:#8a7cba;") },
                  h("span", null, (hasReal ? "AF2 RECYCLE LOOP · " : "TRAJECTORY · ") + frameLabel),
                  h("span", { style: st("color:#6f6298;") }, hasReal ? `${st2.realIndex + 1} / ${realFrames.length}` : "recycle 1 → 5")),
                hasReal ? h("div", { style: st("font-family:'JetBrains Mono',monospace;font-size:9px;color:#6f6298;line-height:1;") }, "Real LocalColabFold recycle snapshots · inference refinement, not atoms folding in water.") : null,
                h("div", { style: st("display:flex;gap:5px;") }, ticks.map((tk, i) => h("button", { key: i, onClick: tk.onClick, title: tk.label, style: st(`flex:1;height:8px;border-radius:4px;cursor:pointer;border:none;background:${tk.active ? "linear-gradient(90deg,#3dffa8,#2fd6ff)" : C.bg2};`) }))))))))
        : null,

      st2.view === "custom" ? h("main", { style: st("flex:1;display:grid;grid-template-columns:336px 1fr 300px;min-height:0;") },
        h("aside", { style: st("border-right:1px solid #2c2350;display:flex;flex-direction:column;min-height:0;background:linear-gradient(180deg,#150f30,#0e0a22);") },
          h("div", { style: st("flex:none;padding:18px 18px 12px;") },
            h("div", { style: st("font-family:'JetBrains Mono',monospace;font-weight:700;letter-spacing:2px;font-size:11px;color:#9d8fd6;") }, "FIY sequence"),
            h("div", { style: st("font-size:11.5px;color:#6f6298;margin-top:6px;line-height:1.5;") }, "Fold It Yourself: paste a one-letter amino-acid sequence and run the engine. Saved recycle PDBs load into the same Mol* playfield.")),
          h("div", { style: st("flex:none;padding:0 18px;") },
            h("textarea", { "aria-label": "Amino acid sequence", onChange: (e) => this.setSeq(e.target.value), value: cf.seq, spellCheck: false, placeholder: "MKTAYIAKQR...", style: st("width:100%;height:108px;resize:none;border-radius:10px;background:#0a0612;border:1px solid #4a3d72;color:#3dffa8;font-family:'JetBrains Mono',monospace;font-size:13px;letter-spacing:1px;line-height:1.6;padding:11px 12px;outline:none;") }),
            h("div", { style: st("display:flex;justify-content:space-between;margin-top:6px;font-family:'JetBrains Mono',monospace;font-size:10px;color:#6f6298;") }, h("span", null, cf.seq.length + " residues"), h("span", null, cf.seq.length < 6 ? "min 6" : "")),
            h("div", { style: st("display:flex;gap:6px;margin-top:9px;flex-wrap:wrap;") }, examples.map((e, i) => h("button", { key: i, onClick: e.onClick, style: st("padding:5px 10px;border-radius:6px;background:#1d1640;border:1px solid #2c2350;color:#9d8fd6;font-family:'JetBrains Mono',monospace;font-size:10px;cursor:pointer;") }, e.name))),
            h("div", { style: st("margin-top:14px;") },
              h("div", { style: st("display:flex;justify-content:space-between;font-family:'JetBrains Mono',monospace;font-size:10px;color:#8a7cba;margin-bottom:5px;") }, h("span", null, "ENGINE")),
              h("select", { "aria-label": "Prediction engine", value: st2.engine, onChange: (e) => this.setState({ engine: e.target.value }), style: st("width:100%;padding:8px 10px;border-radius:8px;background:#0a0612;border:1px solid #4a3d72;color:#cabbf0;font-family:'JetBrains Mono',monospace;font-size:11px;") }, engines.map((cap) => h("option", { key: cap.id, value: cap.id, disabled: cap.available === false }, (cap.label || cap.id) + (cap.available === false ? " (missing)" : ""))))),
            h("div", { style: st("display:flex;gap:8px;margin-top:14px;") },
              h("button", { onClick: () => this.runFold(cf.seq, true), disabled: cf.running, style: st(`flex:1;padding:11px;border-radius:10px;border:none;cursor:pointer;font-family:${mono};font-weight:800;font-size:13px;letter-spacing:1px;background:${cf.running ? C.bg3 : "linear-gradient(135deg,#3dffa8,#2fd6ff)"};color:${cf.running ? C.mid : "#08060f"};box-shadow:${cf.running ? "none" : "0 0 16px rgba(61,255,168,.35)"};`) }, cf.running ? "Folding…" : cf.done ? "Re-fold" : "Fold"),
              st2.loading ? h("button", { onClick: () => this.cancelJob(), style: st("flex:none;padding:0 14px;border-radius:10px;background:#1d1640;border:1px solid #4a3d72;color:#ff9db0;font-family:'JetBrains Mono',monospace;font-size:11px;cursor:pointer;") }, "CANCEL")
                : h("button", { onClick: () => this.resetCustom(), style: st("flex:none;width:46px;border-radius:10px;background:#1d1640;border:1px solid #4a3d72;color:#9d8fd6;font-size:15px;cursor:pointer;") }, "↺"))),
          h("div", { style: st("flex:none;padding:16px 18px 8px;") },
            h("div", { style: st("display:flex;justify-content:space-between;font-family:'JetBrains Mono',monospace;font-size:10px;color:#8a7cba;margin-bottom:7px;") }, h("span", null, "FOLD PROGRESS"), h("span", { style: st("color:#3dffa8;") }, (cf.t * 100).toFixed(0) + "%")),
            h("div", { style: st("height:8px;border-radius:5px;background:#0a0612;border:1px solid #2c2350;overflow:hidden;") }, h("div", { style: st(`height:100%;width:${(cf.t * 100).toFixed(0)}%;background:linear-gradient(90deg,#3dffa8,#2fd6ff);transition:width .08s linear;`) }))),
          st2.error ? h("div", { style: st("margin:0 18px;padding:9px 11px;border-radius:8px;background:rgba(255,90,106,.12);border:1px solid rgba(255,90,106,.4);color:#ffb3bd;font-family:'JetBrains Mono',monospace;font-size:11px;") }, st2.error) : null,
          h("div", { style: st("flex:1;overflow-y:auto;padding:12px 18px;font-family:'JetBrains Mono',monospace;font-size:11px;line-height:1.7;min-height:0;") },
            h("div", { style: st("font-size:9.5px;letter-spacing:1px;color:#6f6298;margin-bottom:7px;") }, "RUN LOG"),
            (cf.logs.length ? cf.logs : [{ t: "··", x: "READY local backend", c: C.mid }, { t: "··", x: "READY Mol* viewer", c: C.mid }, { t: "··", x: "WAITING sequence", c: C.dim }]).map((l, i) => h("div", { key: i, style: st("display:flex;gap:9px;") }, h("span", { style: st("color:#4a3d72;") }, l.t), h("span", { style: st(`color:${l.c};`) }, l.x)))),
          h("div", { style: st("flex:none;padding:11px 18px;border-top:1px solid #2c2350;display:flex;align-items:center;gap:8px;") },
            h("span", { style: st(`width:8px;height:8px;border-radius:50%;flex:none;background:${cf.running ? C.cyan : cf.done ? C.green : C.mid};box-shadow:0 0 8px ${cf.running ? C.cyan : cf.done ? C.green : C.mid};`) }),
            h("span", { style: st(`font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.5px;color:${cf.running ? C.cyan : cf.done ? C.green : C.mid};`) }, cf.running ? `${st2.engine.toUpperCase()} · RUNNING` : cf.done ? `${st2.engine.toUpperCase()} · DONE` : `${st2.engine.toUpperCase()} · READY`))),

        h("section", { style: st("position:relative;display:flex;align-items:center;justify-content:center;min-height:0;min-width:0;overflow:hidden;background:radial-gradient(circle at 30% 25%,rgba(47,214,255,.10),transparent 45%),radial-gradient(circle at 75% 70%,rgba(255,79,216,.10),transparent 45%),radial-gradient(circle at 50% 50%,#181030,#0a0718);") },
          h("div", { style: st(`position:absolute;top:16px;left:16px;z-index:6;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:1px;color:${cf.done ? C.green : cf.running ? C.cyan : C.mid};`) }, stageLabel),
          hasReal ? h("button", { onClick: () => this.toggleRealPlayback(), title: "Loop real saved recycle PDB snapshots; this is inference refinement, not physical folding time.", style: st(`position:absolute;top:14px;right:14px;z-index:7;padding:8px 11px;border-radius:8px;background:${st2.realPlaying ? "linear-gradient(135deg,#b06bff,#2fd6ff)" : "rgba(10,14,26,.86)"};border:1px solid ${st2.realPlaying ? C.cyan : "#25304a"};color:${st2.realPlaying ? "#08060f" : "#9d8fd6"};font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:800;letter-spacing:.8px;cursor:pointer;`) }, st2.realPlaying ? "Pause" : "Loop") : null,
          h(MolPlayfield, { pdb: realA && realA.pdb, referenceCa: this.referenceCa(), frameCa: realA && realA.ca, frame: realA, fallbackSequence: cf.seq, lens: "recycling", activeLenses: ["recycling"], lensModel: realLensModel, frames: hasReal ? realFrames : null, frameIndex: st2.realIndex, selectedResidues: st2.selectedPae ? [st2.selectedPae.i + 1, st2.selectedPae.j + 1] : [], reflected: st2.reflected, colorMode: st2.colorMode, emptyLabel: "Paste a sequence, then run inference to replace this preview with real recycle PDB frames." }),
          h("div", { style: st("position:absolute;bottom:14px;left:50%;transform:translateX(-50%);z-index:6;font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:1px;color:#6f6298;text-align:center;") }, hasReal ? `REAL RECYCLE SNAPSHOTS ${st2.realIndex + 1}/${realFrames.length} · ${truthLabels.superposeNote}` : "DRAG TO ROTATE")),

        h("aside", { style: st("border-left:1px solid #2c2350;display:flex;flex-direction:column;min-height:0;background:linear-gradient(180deg,#150f30,#0e0a22);overflow-y:auto;") },
          h("div", { style: st("flex:none;padding:16px;border-bottom:1px solid #2c2350;") },
            h("div", { style: st("font-family:'JetBrains Mono',monospace;font-weight:700;letter-spacing:2px;font-size:11px;color:#9d8fd6;margin-bottom:11px;") }, "LIVE READOUT"),
            h("div", { style: st("display:grid;grid-template-columns:1fr 1fr;gap:9px;") },
              h("div", { style: st(dmd) }, h("div", { style: st("font-family:'JetBrains Mono',monospace;font-size:8.5px;letter-spacing:1px;color:#7a6aa8;") }, (hasReal ? "DISPLAY CONFIDENCE" : "FOLD SCORE")), h("div", { style: st("font-family:'JetBrains Mono',monospace;font-weight:800;font-size:21px;color:#ffb347;") }, hasReal ? Math.round(cMeanP) : cscore)),
              h("div", { style: st(dmd) }, h("div", { style: st("font-family:'JetBrains Mono',monospace;font-size:8.5px;letter-spacing:1px;color:#7a6aa8;") }, "MEAN pLDDT"), h("div", { style: st(`font-family:'JetBrains Mono',monospace;font-weight:800;font-size:21px;color:${this.plddt(cMeanP)};`) }, cMeanP.toFixed(0))),
              h("div", { style: st(dmd) }, h("div", { style: st("font-family:'JetBrains Mono',monospace;font-size:8.5px;letter-spacing:1px;color:#7a6aa8;") }, "△ VIOLATION"), h("div", { style: st("font-family:'JetBrains Mono',monospace;font-weight:800;font-size:21px;color:#3dffa8;") }, cdat.triViol.toFixed(1))),
              h("div", { style: st(dmd) }, h("div", { style: st("font-family:'JetBrains Mono',monospace;font-size:8.5px;letter-spacing:1px;color:#7a6aa8;") }, "CLASHES"), h("div", { style: st("font-family:'JetBrains Mono',monospace;font-weight:800;font-size:21px;color:#ff4fd8;") }, String(cdat.clashes))),
              h("div", { style: st(dmd) }, h("div", { style: st("font-family:'JetBrains Mono',monospace;font-size:8.5px;letter-spacing:1px;color:#7a6aa8;") }, "FAPE"), h("div", { style: st(`font-family:'JetBrains Mono',monospace;font-weight:800;font-size:21px;color:${cdat.fape > 2 ? C.danger : C.amber};`) }, cdat.fape.toFixed(2))),
              h("div", { style: st(dmd) }, h("div", { style: st("font-family:'JetBrains Mono',monospace;font-size:8.5px;letter-spacing:1px;color:#7a6aa8;") }, "PROGRESS"), h("div", { style: st("font-family:'JetBrains Mono',monospace;font-weight:800;font-size:21px;color:#9d8fd6;") }, (cf.t * 100).toFixed(0) + "%")))),
          h("div", { style: st("flex:none;padding:14px 16px;border-bottom:1px solid #2c2350;") }, h("div", { style: st("font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:1px;color:#7a6aa8;margin-bottom:9px;") }, "SCORE DURING FOLD"), this.renderCustomTraj()),
          h("div", { style: st("flex:none;padding:14px 16px;border-bottom:1px solid #2c2350;") }, h("div", { style: st("font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:1px;color:#7a6aa8;margin-bottom:9px;") }, "PER-RESIDUE pLDDT"), this.renderCustomBars()),
          this.renderModelSelector(),
          h("div", { style: st("flex:1;padding:14px 16px;min-height:120px;") }, h("div", { style: st("font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:1px;color:#7a6aa8;margin-bottom:9px;") }, "CONTACT MAP (live)"), h("div", { style: st("display:flex;justify-content:center;") }, this.renderCustomMap())),
          this.renderTerminal("BACKEND TERMINAL")))
        : null,

      st2.expanded ? h("div", { onClick: () => this.setState({ expanded: null }), style: st("position:fixed;inset:0;z-index:50;background:rgba(6,4,15,.8);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;padding:24px;") },
        h("div", { onClick: (e) => e.stopPropagation(), style: st(`width:880px;max-width:100%;max-height:90vh;overflow-y:auto;background:#13102a;border:1px solid ${ed.color};border-radius:15px;padding:24px;box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 40px ${ed.color}33;`) },
          h("div", { style: st("display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;") },
            h("div", null, h("div", { style: st(`font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:1px;color:${ed.color};`) }, "FULL SCENE"), h("h2", { style: st("margin:4px 0 0;font-family:'JetBrains Mono',monospace;font-weight:700;font-size:22px;") }, ed.name)),
            h("button", { onClick: () => this.setState({ expanded: null }), style: st("background:none;border:none;color:#9d8fd6;font-size:22px;cursor:pointer;") }, "✕")),
          h("div", { style: st("margin:0 0 12px;padding:6px 11px;border-radius:8px;background:rgba(176,107,255,.10);border:1px solid rgba(176,107,255,.4);font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.4px;color:#c9b6ff;") }, "◆ INTERACTIVE SIMULATION — a teaching toy you can poke. NOT live AlphaFold output."),
          h("p", { style: st("margin:0 0 18px;font-size:14px;line-height:1.5;color:#cabbf0;max-width:740px;") }, h("span", { style: st("font-family:'JetBrains Mono',monospace;font-size:12px;color:#ffb347;") }, "ASK ▸ "), ed.q),
          this.renderScene(st2.expanded),
          ed.read ? h("div", { style: st("margin-top:14px;padding:11px 14px;border-radius:10px;background:rgba(61,255,168,.07);border:1px solid rgba(61,255,168,.3);font-size:12.5px;line-height:1.5;color:#bfeede;") }, h("span", { style: st("font-family:'JetBrains Mono',monospace;font-size:11px;color:#3dffa8;") }, "LOOK FOR ▸ "), ed.read) : null,
          h("div", { style: st("margin-top:18px;padding:13px 15px;border-radius:10px;background:rgba(255,170,60,.07);border:1px solid rgba(255,170,60,.25);font-size:12.5px;line-height:1.55;color:#e0cfa6;") }, h("span", { style: st("font-family:'JetBrains Mono',monospace;font-size:11px;color:#ffb347;") }, "TOY ⟷ REAL ▸ "), ed.boundary, "  ", h("span", { style: st("color:#9d8fd6;") }, "(" + ed.paper + ")")))) : null,

      st2.showScore ? h("div", { onClick: () => this.setState({ showScore: false }), style: st("position:fixed;inset:0;z-index:55;background:rgba(6,4,15,.8);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;padding:24px;") },
        h("div", { onClick: (e) => e.stopPropagation(), style: st("width:540px;max-width:100%;background:#13102a;border:1px solid #4a3d72;border-radius:15px;padding:26px;") },
          h("div", { style: st("display:flex;justify-content:space-between;align-items:center;") }, h("div", { style: st("font-family:'JetBrains Mono',monospace;font-weight:800;letter-spacing:1px;font-size:17px;") }, "FOLD SCORE — TRANSPARENT"), h("button", { onClick: () => this.setState({ showScore: false }), style: st("background:none;border:none;color:#9d8fd6;font-size:20px;cursor:pointer;") }, "✕")),
          h("p", { style: st("margin:8px 0 16px;font-size:13px;color:#9d8fd6;line-height:1.5;") }, "No number without a model — every term is computed from the live trajectory frame."),
          h("div", { style: st("display:flex;flex-direction:column;gap:9px;") }, scoreParts.map((p, i) => h("div", { key: i, style: st("display:flex;align-items:center;gap:12px;") },
            h("span", { style: st("font-family:'JetBrains Mono',monospace;font-size:12px;color:#8a7cba;width:140px;") }, p.label),
            h("span", { style: st("font-family:'JetBrains Mono',monospace;font-size:11px;color:#6f6298;width:46px;") }, p.weight),
            h("div", { style: st("flex:1;height:8px;border-radius:4px;background:#0a0612;overflow:hidden;") }, h("div", { style: st(`height:100%;width:${p.pct};background:${p.color};`) })),
            h("span", { style: st("font-family:'JetBrains Mono',monospace;font-size:12px;color:#f3f0ff;width:54px;text-align:right;") }, p.value)))),
          h("div", { style: st("margin-top:16px;padding:12px;border-radius:9px;background:#0a0612;border:1px solid #2c2350;font-family:'JetBrains Mono',monospace;font-size:11.5px;color:#9d8fd6;line-height:1.6;") }, "score = 0.42·meanPLDDT + 0.30·(1−△viol) + 0.18·chirality − 0.10·clashes"))) : null,

      st2.showInfo ? h("div", { onClick: () => this.setState({ showInfo: false }), style: st("position:fixed;inset:0;z-index:55;background:rgba(6,4,15,.8);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;padding:24px;") },
        h("div", { onClick: (e) => e.stopPropagation(), style: st("width:940px;max-width:100%;max-height:90vh;overflow:auto;background:#13102a;border:1px solid #4a3d72;border-radius:15px;padding:26px;") },
          h("div", { style: st("display:flex;justify-content:space-between;align-items:center;gap:12px;") },
            h("div", { style: st("font-family:'JetBrains Mono',monospace;font-weight:800;letter-spacing:1px;font-size:17px;") }, st2.inspectorTab === "physics" ? "PHYSICS" : "RESULT INSPECTOR"),
            h("div", { role: "tablist", "aria-label": "Inspector tab", style: st("margin-left:auto;display:flex;gap:6px;") },
              [["result", "RESULT"], ["physics", "PHYSICS"]].map(([id, label]) => h("button", {
                key: id,
                role: "tab",
                "aria-selected": st2.inspectorTab === id,
                onClick: () => this.setState({ inspectorTab: id }),
                style: st(`padding:5px 9px;border-radius:7px;background:${st2.inspectorTab === id ? "#241944" : "#0a0612"};border:1px solid ${st2.inspectorTab === id ? C.cyan : "#4a3d72"};color:#cabbf0;font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:800;letter-spacing:.6px;cursor:pointer;`),
              }, label))),
            h("button", { onClick: () => this.setState({ showInfo: false }), style: st("background:none;border:none;color:#9d8fd6;font-size:20px;cursor:pointer;") }, "✕")),
          h("div", { style: st(`margin-top:14px;display:flex;align-items:center;gap:10px;padding:11px 13px;border-radius:9px;background:${hasReal ? "rgba(61,255,168,.08)" : "rgba(255,170,60,.08)"};border:1px solid ${hasReal ? "rgba(61,255,168,.4)" : "rgba(255,170,60,.3)"};`) },
            h("span", { style: st(`font-family:'JetBrains Mono',monospace;font-weight:700;font-size:12px;color:${hasReal ? "#3dffa8" : "#ffb347"};`) }, hasReal ? "● REAL — " + ((st2.result && st2.result.provenance && st2.result.provenance.label) || (st2.result && st2.result.engine) || "LocalColabFold recycle PDBs") : "⚠ TEACHING PREVIEW — NO REAL RUN LOADED")),
          st2.inspectorTab === "physics"
            ? h(PhysicsModePanel, {
              colors: C,
              status: st2.physicsStatus,
              hasReal,
              hasPdb: !!this.finalPdb(),
              running: st2.physicsRunning,
              result: st2.physicsResult,
              error: st2.physicsError,
              onRun: () => this.runPhysicsRelaxation(),
            })
            : h("div", null,
              h("div", { style: st("margin-top:14px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;") },
                h("div", { style: st(dmd) },
                  h("div", { style: st("font-family:'JetBrains Mono',monospace;font-size:8.5px;letter-spacing:1px;color:#7a6aa8;") }, "TARGET"),
                  h("div", { style: st("font-family:'JetBrains Mono',monospace;font-weight:800;font-size:18px;color:#3dffa8;") }, `${curT.seq.length} aa`)),
                h("div", { style: st(dmd) },
                  h("div", { style: st("font-family:'JetBrains Mono',monospace;font-size:8.5px;letter-spacing:1px;color:#7a6aa8;") }, curT.expectation === "lesson" ? "LESSON INPUT" : "MSA MODE"),
                  h("div", { style: st(`font-family:'JetBrains Mono',monospace;font-weight:800;font-size:18px;color:${curT.expectation === "lesson" ? C.amber : C.cyan};`) }, curT.msaMode === "single_sequence" ? "single-seq" : "MMseqs2")),
                h("div", { style: st(dmd) },
                  h("div", { style: st("font-family:'JetBrains Mono',monospace;font-size:8.5px;letter-spacing:1px;color:#7a6aa8;") }, "PDB / LENS"),
                  h("div", { style: st(`font-family:'JetBrains Mono',monospace;font-weight:800;font-size:18px;color:${curConceptColor};`) }, `${curT.pdb} · ${curT.tag}`))),
              h("p", { style: st("margin:14px 0 0;font-size:13.5px;line-height:1.6;color:#cabbf0;") }, hasReal
                ? ((st2.result && st2.result.meta && st2.result.meta.trajectory_note) || "Each frame is a real LocalColabFold recycle PDB parsed as an inference-refinement frame and loaded into Mol*. Recycle frames are model refinement snapshots — not a measured physical folding pathway.")
                : "Until you run a fold, every number comes from the Amino Arcade teaching model, not AlphaFold2 internals. The preview trajectory is representational iteration converging to a fixed point — not a movie of a protein folding in physical time."),
              h("div", { style: st("margin-top:14px;padding:12px 14px;border-radius:9px;background:#0a0612;border:1px solid #2c2350;") },
                h("div", { style: st("font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:1.5px;color:#7a6aa8;margin-bottom:10px;") }, "METRIC GLOSSARY"),
                h("div", { style: st("display:flex;flex-direction:column;gap:7px;font-size:13px;line-height:1.5;") },
                  h("div", null, h("span", { style: st("font-family:'JetBrains Mono',monospace;color:#3dffa8;font-size:11px;") }, "pLDDT"), h("span", { style: st("color:#cabbf0;") }, " — predicted local reliability (0–100), not folding probability or free energy.")),
                  h("div", null, h("span", { style: st("font-family:'JetBrains Mono',monospace;color:#2fd6ff;font-size:11px;") }, "PAE"), h("span", { style: st("color:#cabbf0;") }, " — domain-placement confidence, not Å error on a single atom.")),
                  h("div", null, h("span", { style: st("font-family:'JetBrains Mono',monospace;color:#b06bff;font-size:11px;") }, "TRAJECTORY"), h("span", { style: st("color:#cabbf0;") }, " — labelled recycle steps. Late convergence signals confidence, not kinetics.")),
                  h("div", null, h("span", { style: st("font-family:'JetBrains Mono',monospace;color:#ff4fd8;font-size:11px;") }, "FAPE"), h("span", { style: st("color:#cabbf0;") }, " — frame-aligned point error; catches chirality failures distance-RMSD misses.")))),
              this.renderResultInspector(hasReal),
              h("p", { style: st("margin:12px 0 0;font-size:12px;line-height:1.5;color:#7a6aa8;") }, "A real LocalColabFold run carries ", h("span", { style: st("font-family:'JetBrains Mono',monospace;color:#3dffa8;font-size:11px;") }, 'kind: "real-af2"'), ". Recycle frames are real Mol*-loadable PDB artifacts, not a physical folding path.")))) : null
    );
  }
}

// ---------------------------------------------------------------------------
// Mol* playfield — one plugin instance, reloads when the active PDB changes.
// (Pattern from CLAUDECODE_BACKEND_HANDOFF.md.)
// ---------------------------------------------------------------------------
export default App;
