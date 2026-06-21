import { createElement as h } from "react";
import { st } from "../lib/viewer";

function fmt(value) {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(2)} Å` : "N/A";
}

export default function EnsemblePanel({ colors, metrics, selectedModel = 0 }) {
  if (!metrics?.available) return null;
  const C = colors;
  const maxRmsd = Math.max(0.001, metrics.max_pairwise_rmsd_a || 0.001);
  const maxSpread = Math.max(0.001, metrics.max_spread_a || 0.001);

  return h("div", {
    "data-testid": "ensemble-panel",
    style: st("flex:none;padding:13px 16px;border-bottom:1px solid #2c2350;background:rgba(47,214,255,.045);"),
  },
    h("div", { style: st("display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:9px;") },
      h("div", null,
        h("div", { style: st("font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:1px;color:#7a6aa8;") }, "ENSEMBLE DISAGREEMENT"),
        h("div", { style: st("margin-top:3px;font-size:10.5px;line-height:1.35;color:#8a7cba;") }, "rigidly aligned ranked models; spread is uncertainty, not motion")),
      h("span", { style: st("font-family:'JetBrains Mono',monospace;font-size:10px;color:#2fd6ff;white-space:nowrap;") }, `${metrics.model_count} models · ${metrics.residue_count} aa`)),
    h("div", { style: st("display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;") },
      h("div", { style: st("padding:8px 9px;border-radius:8px;background:#0a0612;border:1px solid #2c2350;") },
        h("div", { style: st("font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.9px;color:#7a6aa8;") }, "MAX PAIR RMSD"),
        h("div", { style: st(`margin-top:3px;font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:800;color:${C.cyan};`) }, fmt(metrics.max_pairwise_rmsd_a))),
      h("div", { style: st("padding:8px 9px;border-radius:8px;background:#0a0612;border:1px solid #2c2350;") },
        h("div", { style: st("font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.9px;color:#7a6aa8;") }, "MAX RES SPREAD"),
        h("div", { style: st(`margin-top:3px;font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:800;color:${C.amber};`) }, fmt(metrics.max_spread_a)))),
    h("div", { style: st("display:grid;grid-template-columns:repeat(auto-fit,minmax(28px,1fr));gap:3px;margin-bottom:10px;") },
      metrics.pairwise.map((row, i) => row.map((cell, j) => {
        const selected = i === selectedModel || j === selectedModel;
        const opacity = i === j ? 0.14 : 0.2 + 0.7 * Math.min(1, cell.rmsd_a / maxRmsd);
        return h("div", {
          key: `${i}-${j}`,
          title: i === j ? `rank ${cell.rank_i}` : `rank ${cell.rank_i} vs ${cell.rank_j}: ${fmt(cell.rmsd_a)}`,
          style: st(`height:24px;border-radius:5px;background:${i === j ? C.bg3 : C.cyan};opacity:${opacity};border:1px solid ${selected ? C.green : "transparent"};font-family:'JetBrains Mono',monospace;font-size:8px;color:#061018;display:flex;align-items:center;justify-content:center;font-weight:800;`),
        }, i === j ? "—" : cell.rmsd_a.toFixed(1));
      }))),
    h("div", { style: st("display:flex;flex-direction:column;gap:5px;") },
      metrics.top_spread_residues.slice(0, 5).map((entry) => h("div", { key: entry.residue, style: st("display:grid;grid-template-columns:52px 1fr 58px;gap:8px;align-items:center;font-family:'JetBrains Mono',monospace;font-size:9px;color:#cabbf0;") },
        h("span", { style: st("color:#9d8fd6;") }, `res ${entry.residue}`),
        h("span", { style: st("height:7px;border-radius:4px;background:#0a0612;overflow:hidden;border:1px solid #2c2350;") },
          h("span", { style: st(`display:block;height:100%;width:${Math.max(4, (entry.spread_a / maxSpread) * 100)}%;background:linear-gradient(90deg,#2fd6ff,#ffb347);`) })),
        h("span", { style: st("text-align:right;color:#f3f0ff;") }, fmt(entry.spread_a))))),
    h("div", { style: st("margin-top:8px;font-size:10px;line-height:1.4;color:#7a6aa8;") }, metrics.note));
}
