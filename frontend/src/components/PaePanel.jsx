import { createElement as h } from "react";
import { st } from "../lib/viewer";

export default function PaePanel({ pae, selected = null, colors, onSelect, onPreview }) {
  const C = colors;
  const n = pae.length;
  let max = 1;
  for (const row of pae) {
    if (!Array.isArray(row)) continue;
    for (const raw of row) {
      const value = Number(raw) || 0;
      if (value > max) max = value;
    }
  }
  const rects = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < pae[i].length; j += 1) {
      const value = Number(pae[i][j]) || 0;
      const scaled = Math.min(1, value / max);
      const isSelected = selected && (selected.source === "pae" || selected.source === "pae-preview") && selected.i === i && selected.j === j;
      rects.push(h("rect", {
        key: `${i}_${j}`,
        x: j * 5,
        y: i * 5,
        width: 4.4,
        height: 4.4,
        fill: `hsl(${205 - scaled * 60} 85% ${(68 - scaled * 34).toFixed(0)}%)`,
        stroke: isSelected ? C.amber : "none",
        strokeWidth: isSelected ? 1.4 : 0,
        onMouseEnter: () => onPreview && onPreview({ i, j, value, source: "pae-preview" }),
        onMouseLeave: () => onPreview && onPreview(null),
        onClick: () => onSelect && onSelect({ i, j, value, source: "pae" }),
      }));
    }
  }

  return h("div", { style: st("display:flex;flex-direction:column;align-items:center;gap:8px;") },
    h("svg", { "aria-label": "Real predicted aligned error matrix", role: "img", viewBox: `0 0 ${n * 5} ${n * 5}`, style: { width: "min(190px, 100%)", aspectRatio: "1 / 1", background: C.bg0, borderRadius: "8px", border: `1px solid ${C.border}`, cursor: "crosshair" } }, rects),
    h("div", { style: st("width:min(190px,100%);font-family:'JetBrains Mono',monospace;font-size:10px;line-height:1.45;color:#9d8fd6;overflow-wrap:anywhere;") }, selected && (selected.source === "pae" || selected.source === "pae-preview")
      ? h("span", null, `PAE(${selected.i + 1},${selected.j + 1}): expected error in residue ${selected.j + 1}'s position when aligned on residue ${selected.i + 1} = `, h("span", { style: st("color:#2fd6ff;") }, `${Number(selected.value).toFixed(2)} Å`), selected.source === "pae-preview" ? " · preview" : " · highlighted in Mol*")
      : "Hover a PAE cell to preview; click to pin both residues in the 3D view."));
}
