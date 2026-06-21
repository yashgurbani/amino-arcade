// MSA -> contact -> 3D bridge (TEACHING SCHEMATIC, illustrative alignment).
//
// The "click" for the whole method: two alignment columns that mutate TOGETHER
// across evolution (compensatory charge swaps here) must be touching in 3D.
// AlphaFold reads that covariation out of millions of sequences. This shows the
// causal chain the lenses otherwise leave implicit: evolution -> contact -> fold.

import { createElement as h } from "react";

const mono = "'JetBrains Mono', monospace";
// 8 sequences x 12 columns. Columns 3 and 9 (0-based 2 and 8) co-vary: whenever
// one is positive (K/R) the other is negative (E/D) - a compensatory pair.
const ROWS = [
  "ALKGVFETASLV", "ALEGVFKTASLV", "ALKGIFETATLV", "ALEGVFKSASLV",
  "ALKGVYETASLI", "ALEGVFKTASLV", "ALRGVFDTASLV", "ALDGVFRTASLV",
];
const COL_A = 2;
const COL_B = 8;

export default function MsaBridge({ colors } = {}) {
  const cyan = (colors && colors.coev) || "#2fd6ff";
  const cell = 26;
  const ox = 60;
  const oy = 70;
  const cells = [];
  ROWS.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      const lit = c === COL_A || c === COL_B;
      cells.push(h("rect", { key: `bg-${r}-${c}`, x: ox + c * cell, y: oy + r * cell, width: cell - 2, height: cell - 2, rx: 3, fill: lit ? `${cyan}26` : "rgba(120,110,170,.10)", stroke: lit ? cyan : "transparent", strokeWidth: lit ? 1 : 0 }));
      cells.push(h("text", { key: `t-${r}-${c}`, x: ox + c * cell + (cell - 2) / 2, y: oy + r * cell + 17, textAnchor: "middle", fontFamily: mono, fontSize: 13, fontWeight: lit ? 800 : 500, fill: lit ? cyan : "#7d76a8" }, ch));
    });
  });
  const ax = ox + COL_A * cell + (cell - 2) / 2;
  const bx = ox + COL_B * cell + (cell - 2) / 2;
  const arcY = oy - 14;
  return h("div", { "data-testid": "msa-bridge", style: { width: "100%" } },
    h("svg", { viewBox: "0 0 460 340", width: "100%", role: "img", "aria-label": "MSA coevolution to 3D contact", style: { display: "block" } },
      h("defs", null, h("marker", { id: "msa-arrow", markerWidth: 9, markerHeight: 9, refX: 6, refY: 3, orient: "auto", markerUnits: "strokeWidth" }, h("path", { d: "M0,0 L7,3 L0,6 Z", fill: cyan }))),
      h("text", { x: 16, y: 22, fontFamily: mono, fontSize: 12, fontWeight: 800, fill: "#e8e3ff" }, "Why evolution knows the fold"),
      h("text", { x: 16, y: 37, fontFamily: mono, fontSize: 8, fill: cyan }, "TEACHING SCHEMATIC · illustrative alignment of 8 homologous sequences"),
      // column markers + arc joining the two co-varying columns
      h("path", { d: `M${ax},${arcY} Q${(ax + bx) / 2},${arcY - 34} ${bx},${arcY}`, fill: "none", stroke: cyan, strokeWidth: 1.6, markerEnd: "url(#msa-arrow)" }),
      h("text", { x: (ax + bx) / 2, y: arcY - 30, textAnchor: "middle", fontFamily: mono, fontSize: 9, fontWeight: 700, fill: cyan }, "they mutate together"),
      ...cells,
      h("text", { x: ox, y: oy + ROWS.length * cell + 20, fontFamily: mono, fontSize: 9.5, fill: "#cabbf0" }, "Columns 3 & 9 swap charge in lock-step (K↔E, R↔D):"),
      h("text", { x: ox, y: oy + ROWS.length * cell + 34, fontFamily: mono, fontSize: 9.5, fill: "#cabbf0" }, "a compensatory pair. Positions that co-vary like this are"),
      h("text", { x: ox, y: oy + ROWS.length * cell + 48, fontFamily: mono, fontSize: 9.5, fill: "#cabbf0" }, "almost always touching in 3D — so:"),
      // mini 3D contact
      h("circle", { cx: 150, cy: oy + ROWS.length * cell + 78, r: 7, fill: cyan }),
      h("circle", { cx: 250, cy: oy + ROWS.length * cell + 78, r: 7, fill: cyan }),
      h("line", { x1: 157, y1: oy + ROWS.length * cell + 78, x2: 243, y2: oy + ROWS.length * cell + 78, stroke: cyan, strokeWidth: 2, strokeDasharray: "4 3" }),
      h("text", { x: 200, y: oy + ROWS.length * cell + 66, textAnchor: "middle", fontFamily: mono, fontSize: 9, fill: cyan }, "contact in 3D"),
      h("text", { x: 16, y: 332, fontFamily: mono, fontSize: 8.5, fill: "#9d8fd6" }, "AlphaFold reads this covariation across millions of sequences — that is the signal, not physics.")));
}
