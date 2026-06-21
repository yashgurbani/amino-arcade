// Evoformer teaching diagram (TEACHING SCHEMATIC — not LocalColabFold output).
// A static, clearly-labeled illustration of the AlphaFold2 trunk described in
// Jumper et al. 2021 (Fig. 1 / Supplement §1.6): how the MSA representation and
// the pair representation talk to each other via attention + triangle updates,
// feed the structure module (IPA), and recycle. This is the "unseen engine" the
// six lenses sit around; it cannot be extracted from a LocalColabFold run, so it
// is drawn from the paper for intuition only — never narrated as a live trace.

import { createElement as h } from "react";

const PALETTE = { coev: "#2fd6ff", tri: "#3dffa8", ipa: "#b06bff", fape: "#ff4fd8", rec: "#ffb347", ink: "#e8e3ff", dim: "#9d8fd6", panel: "#140e2e", panelEdge: "#3a2f63" };
const mono = "'JetBrains Mono', monospace";

function box(x, y, w, height, stroke, label, sub) {
  return h("g", { key: `${label}-${x}` },
    h("rect", { x, y, width: w, height, rx: 10, fill: "rgba(20,14,46,.85)", stroke, strokeWidth: 1.4 }),
    h("text", { x: x + w / 2, y: y + 18, textAnchor: "middle", fontFamily: mono, fontSize: 11, fontWeight: 700, fill: stroke }, label),
    sub ? h("text", { x: x + w / 2, y: y + 33, textAnchor: "middle", fontFamily: mono, fontSize: 8.5, fill: PALETTE.dim }, sub) : null);
}

function grid(ox, oy, cols, rows, cell, color) {
  const cells = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const lit = (r === 1 && c >= 0) || (c === 2);
      cells.push(h("rect", { key: `${ox}-${r}-${c}`, x: ox + c * cell, y: oy + r * cell, width: cell - 1.5, height: cell - 1.5, rx: 1.5, fill: lit ? color : "rgba(120,110,170,.20)", opacity: lit ? 0.85 : 1 }));
    }
  }
  return cells;
}

export default function EvoformerDiagram({ colors } = {}) {
  const C = { ...PALETTE, ...(colors || {}) };
  return h("div", { "data-testid": "evoformer-diagram", style: { width: "100%" } },
    h("svg", { viewBox: "0 0 720 430", width: "100%", role: "img", "aria-label": "Schematic of the AlphaFold2 Evoformer trunk", style: { display: "block" } },
      h("defs", null,
        h("marker", { id: "evo-arrow", markerWidth: 9, markerHeight: 9, refX: 7, refY: 3, orient: "auto", markerUnits: "strokeWidth" },
          h("path", { d: "M0,0 L7,3 L0,6 Z", fill: C.dim }))),

      // banner
      h("text", { x: 16, y: 22, fontFamily: mono, fontSize: 12, fontWeight: 800, fill: C.ink }, "THE EVOFORMER — the engine the lenses sit around"),
      h("text", { x: 16, y: 38, fontFamily: mono, fontSize: 8.5, fill: C.rec }, "TEACHING SCHEMATIC · Jumper et al. 2021, Fig. 1 / Supp. §1.6 · not computed by LocalColabFold"),

      // INPUT: sequence -> MSA
      box(16, 60, 150, 44, C.coev, "1 · SEQUENCE → MSA", "search evolution"),
      ...grid(28, 120, 9, 5, 13, C.coev),
      h("text", { x: 28, y: 196, fontFamily: mono, fontSize: 8.5, fill: C.dim }, "MSA repr. (sequences × residues)"),
      h("text", { x: 28, y: 210, fontFamily: mono, fontSize: 8, fill: C.coev }, "row attn ↔  ·  column attn ↕"),

      // arrow MSA -> pair (outer product)
      h("line", { x1: 175, y1: 150, x2: 250, y2: 150, stroke: C.dim, strokeWidth: 1.4, markerEnd: "url(#evo-arrow)" }),
      h("text", { x: 213, y: 142, textAnchor: "middle", fontFamily: mono, fontSize: 8, fill: C.dim }, "outer"),
      h("text", { x: 213, y: 162, textAnchor: "middle", fontFamily: mono, fontSize: 8, fill: C.dim }, "product"),

      // PAIR representation + triangle
      box(255, 60, 200, 44, C.tri, "2 · PAIR REPRESENTATION", "residue × residue table"),
      ...grid(300, 120, 7, 7, 13, C.tri),
      // triangle motif over the pair grid (i, j, k consistency)
      h("polygon", { points: "313,133 392,159 326,198", fill: "none", stroke: C.tri, strokeWidth: 1.6, opacity: 0.9 }),
      h("text", { x: 305, y: 130, fontFamily: mono, fontSize: 9, fill: C.tri }, "i"),
      h("text", { x: 396, y: 159, fontFamily: mono, fontSize: 9, fill: C.tri }, "j"),
      h("text", { x: 318, y: 210, fontFamily: mono, fontSize: 9, fill: C.tri }, "k"),
      h("text", { x: 300, y: 226, fontFamily: mono, fontSize: 8.5, fill: C.dim }, "triangle attention / multiplicative update"),
      h("text", { x: 300, y: 239, fontFamily: mono, fontSize: 8, fill: C.dim }, "d(i,j) must stay consistent with d(i,k)+d(k,j)"),

      // arrow pair -> structure module
      h("line", { x1: 462, y1: 150, x2: 532, y2: 150, stroke: C.dim, strokeWidth: 1.4, markerEnd: "url(#evo-arrow)" }),

      // STRUCTURE MODULE (IPA) -> 3D
      box(537, 60, 168, 44, C.ipa, "3 · STRUCTURE MODULE", "IPA · SE(3)-invariant"),
      h("path", { d: "M560,140 q14,-26 28,0 q14,26 28,0 q14,-26 28,0", fill: "none", stroke: C.ipa, strokeWidth: 3, strokeLinecap: "round" }),
      h("circle", { cx: 560, cy: 140, r: 3.4, fill: C.fape }),
      h("circle", { cx: 644, cy: 140, r: 3.4, fill: C.fape }),
      h("text", { x: 548, y: 196, fontFamily: mono, fontSize: 8.5, fill: C.dim }, "3D coordinates (residue frames)"),
      h("text", { x: 548, y: 210, fontFamily: mono, fontSize: 8, fill: C.fape }, "trained against FAPE (chirality-aware)"),

      // recycling loop (output back to input)
      h("path", { d: "M621,235 q0,70 -300,70 q-230,0 -230,-55 l0,-18", fill: "none", stroke: C.rec, strokeWidth: 1.6, strokeDasharray: "5 4", markerEnd: "url(#evo-arrow)" }),
      h("text", { x: 360, y: 322, textAnchor: "middle", fontFamily: mono, fontSize: 9, fontWeight: 700, fill: C.rec }, "4 · RECYCLING ×N — feed outputs back in (representational refinement, NOT folding time)"),

      // honesty footer
      h("text", { x: 16, y: 360, fontFamily: mono, fontSize: 8.5, fill: C.dim }, "Confidence (pLDDT/PAE) is the model's own calibrated self-estimate of the result — read it, don't trust it blindly."),
      h("text", { x: 16, y: 376, fontFamily: mono, fontSize: 8.5, fill: C.ink }, "Key idea: AlphaFold replaces physical folding with learned geometric inference over evolutionary signal."),
      h("text", { x: 16, y: 392, fontFamily: mono, fontSize: 8, fill: C.rec }, "What you cannot see in any LocalColabFold run: the attention activations inside this trunk. That is why this panel is schematic.")));
}
