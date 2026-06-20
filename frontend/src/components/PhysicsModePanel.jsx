import { createElement as h } from "react";
import { st } from "../lib/viewer";

export default function PhysicsModePanel({
  colors,
  status,
  hasReal,
  hasPdb,
  running,
  result,
  error,
  onRun,
}) {
  const C = colors;
  const available = !!status?.available;
  const disabled = !available || !hasReal || !hasPdb || running;
  const reason = !available
    ? (status?.message || "OpenMM is not available.")
    : !hasReal
      ? "Load a real predicted structure before local relaxation."
      : !hasPdb
        ? "No PDB coordinates are available for relaxation."
        : "Run a short OpenMM minimization on the current predicted structure.";

  const metric = (label, value, color = C.hi) => h("div", { style: st("padding:10px 11px;border-radius:9px;background:#0a0612;border:1px solid #2c2350;") },
    h("div", { style: st("font-family:'JetBrains Mono',monospace;font-size:8.5px;letter-spacing:1px;color:#7a6aa8;margin-bottom:5px;") }, label),
    h("div", { style: st(`font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:800;color:${color};`) }, value));

  return h("div", { "data-testid": "physics-mode-panel", style: st("margin-top:14px;display:grid;grid-template-columns:1fr .9fr;gap:14px;") },
    h("div", { style: st("display:flex;flex-direction:column;gap:12px;") },
      h("div", { style: st(`padding:13px 14px;border-radius:10px;background:${available ? "rgba(61,255,168,.07)" : "rgba(255,179,71,.07)"};border:1px solid ${available ? "rgba(61,255,168,.35)" : "rgba(255,179,71,.35)"};`) },
        h("div", { style: st(`font-family:'JetBrains Mono',monospace;font-weight:800;font-size:12px;letter-spacing:1px;color:${available ? C.green : C.amber};`) }, available ? "PHYSICS READY · LOCAL RELAXATION" : "PHYSICS UNAVAILABLE · LOCAL RELAXATION"),
        h("p", { style: st("margin:8px 0 0;font-size:13px;line-height:1.55;color:#d9d2ef;") },
          "This tab is intentionally separate from AlphaFold inference. OpenMM can locally relax an existing predicted structure; it does not fold a protein from sequence, create a folding movie, or change pLDDT/PAE confidence.")),
      h("div", { style: st("padding:13px 14px;border-radius:10px;background:#0a0612;border:1px solid #2c2350;") },
        h("div", { style: st("font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:1.5px;color:#7a6aa8;margin-bottom:10px;") }, "RUN CONTRACT"),
        h("div", { style: st("font-size:13px;line-height:1.6;color:#cabbf0;") },
          h("div", null, "mode: ", h("span", { style: st("font-family:'JetBrains Mono',monospace;color:#ffb347;font-size:11px;") }, "local relaxation")),
          h("div", null, "input: current PDB coordinates"),
          h("div", null, "output: minimized coordinates + potential energy"),
          h("div", null, "not output: folding trajectory, confidence, thermodynamic stability"))),
      h("button", {
        onClick: () => !disabled && onRun(),
        disabled,
        style: st(`height:42px;border-radius:10px;border:1px solid ${disabled ? C.border : C.green};background:${disabled ? "#130f28" : "rgba(61,255,168,.14)"};color:${disabled ? C.dim : "#bfffe5"};font-family:'JetBrains Mono',monospace;font-weight:800;font-size:11px;letter-spacing:.7px;cursor:${disabled ? "not-allowed" : "pointer"};`),
      }, running ? "RUNNING LOCAL RELAXATION…" : "RUN LOCAL RELAXATION"),
      h("p", { style: st("margin:0;font-size:12px;line-height:1.5;color:#8a7cba;") }, reason),
      error ? h("div", { style: st("padding:10px 11px;border-radius:9px;background:rgba(255,90,106,.08);border:1px solid rgba(255,90,106,.35);font-size:12px;line-height:1.45;color:#ffb3bd;") }, error) : null),
    h("div", { style: st("display:flex;flex-direction:column;gap:10px;") },
      metric("OpenMM", status?.packages?.openmm ? "available" : "missing", status?.packages?.openmm ? C.green : C.amber),
      metric("PDBFixer", status?.packages?.pdbfixer ? "available" : "missing", status?.packages?.pdbfixer ? C.green : C.dim),
      metric("current structure", hasPdb ? "PDB loaded" : "no PDB", hasPdb ? C.cyan : C.amber),
      result ? h("div", { style: st("padding:12px;border-radius:10px;background:#0a0612;border:1px solid #2c2350;font-family:'JetBrains Mono',monospace;font-size:10.5px;line-height:1.7;color:#cabbf0;") },
        h("div", { style: st("color:#7a6aa8;letter-spacing:1px;margin-bottom:7px;") }, "RELAXATION RESULT"),
        h("div", null, "before: ", h("span", { style: st("color:#ffb347;") }, Number(result.energy_before_kj_per_mol).toFixed(1)), " kJ/mol"),
        h("div", null, "after: ", h("span", { style: st("color:#3dffa8;") }, Number(result.energy_after_kj_per_mol).toFixed(1)), " kJ/mol"),
        h("div", null, "iterations: ", h("span", { style: st("color:#2fd6ff;") }, String(result.max_iterations)))) : null));
}
