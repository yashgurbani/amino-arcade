import { createElement as h } from "react";
import { st } from "../lib/viewer";

export default function PaePanel({ pae, selected = null, colors, onSelect }) {
  const C = colors;
  const n = pae.length;
  const max = Math.max(1, ...pae.flat().map((value) => Number(value) || 0));
  const rects = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < pae[i].length; j += 1) {
      const value = Number(pae[i][j]) || 0;
      const scaled = Math.min(1, value / max);
      const isSelected = selected && selected.source === "pae" && selected.i === i && selected.j === j;
      rects.push(h("rect", {
        key: `${i}_${j}`,
        x: j * 5,
        y: i * 5,
        width: 4.4,
        height: 4.4,
        fill: `hsl(${205 - scaled * 60} 85% ${(68 - scaled * 34).toFixed(0)}%)`,
        stroke: isSelected ? C.amber : "none",
        strokeWidth: isSelected ? 1.4 : 0,
        onClick: () => onSelect && onSelect({ i, j, value, source: "pae" }),
      }));
    }
  }

  return h("div", { style: st("display:flex;flex-direction:column;align-items:center;gap:8px;") },
    h("svg", { "aria-label": "Real predicted aligned error matrix", role: "img", viewBox: `0 0 ${n * 5} ${n * 5}`, style: { width: "190px", height: "190px", background: C.bg0, borderRadius: "8px", border: `1px solid ${C.border}`, cursor: "crosshair" } }, rects),
    h("div", { style: st("width:190px;font-family:'JetBrains Mono',monospace;font-size:9.5px;line-height:1.45;color:#9d8fd6;") }, selected && selected.source === "pae"
      ? h("span", null, "PAE cell ", h("span", { style: st("color:#ffb347;") }, `${selected.i + 1}↔${selected.j + 1}`), " · ", h("span", { style: st("color:#2fd6ff;") }, `${Number(selected.value).toFixed(2)} Å`), " · highlighted in Mol*")
      : "Click a PAE cell to pin both residues in the 3D view."));
}
