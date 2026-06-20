import { createElement as h } from "react";
import { st } from "../lib/viewer";

export default function ResultInspector({
  colors,
  summary,
  result,
  report,
  model,
  hasReal,
  hasPae,
  engine,
  cacheKey,
  hasResultSeq,
  plddtColor,
  onDownload,
}) {
  const C = colors;
  const metric = (label, value, color = C.hi) => h("div", { style: st("padding:10px 11px;border-radius:9px;background:#0a0612;border:1px solid #2c2350;min-width:0;") },
    h("div", { style: st("font-family:'JetBrains Mono',monospace;font-size:8.5px;letter-spacing:1px;color:#7a6aa8;margin-bottom:5px;") }, label),
    h("div", { style: st(`font-family:'JetBrains Mono',monospace;font-weight:800;font-size:16px;color:${color};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`) }, value ?? "N/A"));
  const dl = (label, kind, disabled = false) => h("button", {
    onClick: () => !disabled && onDownload(kind),
    disabled,
    style: st(`padding:8px 10px;border-radius:8px;border:1px solid ${disabled ? C.border : "#4a3d72"};background:${disabled ? "#130f28" : "#0a0612"};color:${disabled ? C.dim : C.hi};font-family:'JetBrains Mono',monospace;font-weight:700;font-size:10px;letter-spacing:.4px;cursor:${disabled ? "default" : "pointer"};`),
  }, label);
  const entities = [["Protein", "supported", C.green], ["RNA / DNA", "AF3 only", C.amber], ["Ligand", "AF3 only", C.amber], ["Ion", "AF3 only", C.amber], ["PTM / mods", "AF3 only", C.amber]];
  return h("div", { style: st("margin-top:16px;display:grid;grid-template-columns:1.15fr .85fr;gap:14px;") },
    h("div", { style: st("display:flex;flex-direction:column;gap:12px;min-width:0;") },
      h("div", { style: st("display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;") },
        metric("pLDDT mean", summary.plddt_mean, plddtColor(summary.plddt_mean || 0)),
        metric("pTM", summary.ptm, C.dim),
        metric("ipTM", summary.iptm, C.dim),
        metric("disordered fraction", summary.fraction_disordered, C.amber),
        metric("chain count", summary.chain_count, C.cyan),
        metric("clash flag", summary.has_clash ? "YES" : "NO", summary.has_clash ? C.danger : C.green)),
      h("div", { style: st("padding:12px;border-radius:10px;background:#0a0612;border:1px solid #2c2350;") },
        h("div", { style: st("font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:1.5px;color:#7a6aa8;margin-bottom:10px;") }, "ENTITY SUPPORT"),
        h("div", { style: st("display:flex;flex-wrap:wrap;gap:7px;") }, entities.map(([name, state, color]) => h("span", { key: name, style: st(`display:inline-flex;gap:6px;align-items:center;padding:6px 8px;border-radius:999px;border:1px solid ${color}55;background:${color}14;font-family:'JetBrains Mono',monospace;font-size:10px;color:${color};`) }, name, h("span", { style: st("color:#9d8fd6;") }, state)))),
        h("p", { style: st("margin:10px 0 0;font-size:12px;line-height:1.45;color:#9d8fd6;") }, "This local backend is AF2-family protein inference. AlphaFold Server’s 8AW3-style protein+RNA+ion scene requires AF3; this app labels those entities instead of pretending they were inferred here.")),
      h("div", { style: st("padding:12px;border-radius:10px;background:rgba(255,170,60,.07);border:1px solid rgba(255,170,60,.25);font-size:12px;line-height:1.5;color:#e0cfa6;") },
        h("span", { style: st("font-family:'JetBrains Mono',monospace;color:#ffb347;font-size:10px;") }, "GUARDRAIL ▸ "), "Research/education only. Not for clinical use. Ranking score and chain-interface metrics are marked N/A unless the engine actually returns them.")),
    h("div", { style: st("display:flex;flex-direction:column;gap:12px;min-width:0;") },
      h("div", { style: st("padding:12px;border-radius:10px;background:#0a0612;border:1px solid #2c2350;") },
        h("div", { style: st("font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:1.5px;color:#7a6aa8;margin-bottom:10px;") }, "DOWNLOADS"),
        h("div", { style: st("display:grid;grid-template-columns:1fr 1fr;gap:8px;") },
          dl("PDB", "pdb", !hasReal),
          dl("mmCIF", "cif", !hasReal),
          dl("PAE JSON", "pae", !hasPae),
          dl("summary JSON", "summary", !hasReal),
          dl("full-data JSON", "full", !hasReal),
          dl("job request", "request", !hasResultSeq))),
      h("div", { style: st("padding:12px;border-radius:10px;background:#0a0612;border:1px solid #2c2350;font-family:'JetBrains Mono',monospace;font-size:10.5px;line-height:1.65;color:#cabbf0;") },
        h("div", { style: st("color:#7a6aa8;letter-spacing:1px;margin-bottom:7px;") }, "RUN METADATA"),
        h("div", null, "engine: ", h("span", { style: st("color:#ffb347;") }, result.engine || engine)),
        h("div", null, "selected model: ", h("span", { style: st("color:#3dffa8;") }, model ? `rank_${String(model.rank || 1).padStart(3, "0")} · ${model.model_id || "model"}` : "N/A")),
        h("div", null, "cache key: ", h("span", { style: st("color:#9d8fd6;") }, report.cache_key || cacheKey || "N/A")),
        h("div", null, "frames: ", h("span", { style: st("color:#2fd6ff;") }, String(summary.frame_count || report.artifact_summary?.frame_count || 0))),
        h("div", null, "PAE: ", h("span", { style: st("color:#3dffa8;") }, hasPae ? "available" : "not returned")))));
}
