import { createElement as h, useState } from "react";
import { proteinBasicsSteps } from "../data/proteinBasics";
import { st } from "../lib/viewer";

// Self-contained "Protein Basics" onboarding overlay. Eight steps from amino
// acids to "what AlphaFold predicts and does not". Lifted out of App.jsx so the
// beginner path is auditable and easy to extend. State (step index) is local.
//
// Props: open (bool), onClose (fn), colors (palette), onOpenLibrary (fn, optional).

const MONO = "'JetBrains Mono',monospace";

// Small inline diagrams keyed by step. Each returns an <svg>. Colors are passed
// in so the art tracks the app palette.
function diagram(id, C) {
  const svg = (children) => h("svg", { width: 200, height: 120, viewBox: "0 0 200 120", fill: "none" }, children);
  if (id === "residue") {
    return svg([
      h("line", { key: "b", x1: 20, y1: 70, x2: 180, y2: 70, stroke: C.mid, strokeWidth: 2 }),
      h("circle", { key: "n", cx: 60, cy: 70, r: 9, fill: C.cyan }),
      h("circle", { key: "ca", cx: 100, cy: 70, r: 9, fill: C.hi }),
      h("circle", { key: "c", cx: 140, cy: 70, r: 9, fill: C.magenta }),
      h("line", { key: "r", x1: 100, y1: 61, x2: 100, y2: 30, stroke: C.green, strokeWidth: 2 }),
      h("circle", { key: "rg", cx: 100, cy: 24, r: 9, fill: C.green }),
      h("text", { key: "t1", x: 60, y: 92, fill: C.dim, fontSize: 9, fontFamily: MONO, textAnchor: "middle" }, "N"),
      h("text", { key: "t2", x: 100, y: 92, fill: C.dim, fontSize: 9, fontFamily: MONO, textAnchor: "middle" }, "Cα"),
      h("text", { key: "t3", x: 140, y: 92, fill: C.dim, fontSize: 9, fontFamily: MONO, textAnchor: "middle" }, "C=O"),
      h("text", { key: "t4", x: 118, y: 28, fill: C.green, fontSize: 9, fontFamily: MONO }, "R")]);
  }
  if (id === "backbone") {
    const pts = Array.from({ length: 7 }, (_, i) => [24 + i * 26, i % 2 ? 50 : 76]);
    return svg([
      h("polyline", { key: "p", points: pts.map((p) => p.join(",")).join(" "), stroke: C.cyan, strokeWidth: 2.5, fill: "none" }),
      ...pts.map((p, i) => h("circle", { key: i, cx: p[0], cy: p[1], r: 5, fill: i === 0 ? C.green : i === pts.length - 1 ? C.magenta : C.hi })),
      h("text", { key: "n", x: 24, y: 96, fill: C.green, fontSize: 9, fontFamily: MONO, textAnchor: "middle" }, "N-term"),
      h("text", { key: "c", x: 180, y: 40, fill: C.magenta, fontSize: 9, fontFamily: MONO, textAnchor: "middle" }, "C-term")]);
  }
  if (id === "sidechains") {
    const cols = [[C.amber, "oily"], [C.cyan, "polar"], [C.magenta, "charged"]];
    return svg(cols.map((c, i) => [
      h("circle", { key: "c" + i, cx: 45 + i * 55, cy: 50, r: 16, fill: c[0] + "33", stroke: c[0], strokeWidth: 2 }),
      h("text", { key: "t" + i, x: 45 + i * 55, y: 88, fill: c[0], fontSize: 9, fontFamily: MONO, textAnchor: "middle" }, c[1]),
    ]));
  }
  if (id === "secondary") {
    return svg([
      h("path", { key: "helix", d: "M30 30 q12 14 0 28 q-12 14 0 28 q12 14 0 28", stroke: C.green, strokeWidth: 3, fill: "none" }),
      h("text", { key: "h", x: 30, y: 110, fill: C.green, fontSize: 9, fontFamily: MONO, textAnchor: "middle" }, "α-helix"),
      ...[0, 1, 2].map((i) => h("path", { key: "s" + i, d: `M${120 + i * 18} 28 L${120 + i * 18} 86`, stroke: C.cyan, strokeWidth: 3, markerEnd: "" })),
      h("text", { key: "s", x: 138, y: 110, fill: C.cyan, fontSize: 9, fontFamily: MONO, textAnchor: "middle" }, "β-sheet")]);
  }
  if (id === "tertiary") {
    return svg([
      h("path", { key: "f", d: "M30 80 C 50 20 90 20 100 60 S 150 100 170 40", stroke: C.cyan, strokeWidth: 3, fill: "none" }),
      h("circle", { key: "a", cx: 100, cy: 60, r: 26, fill: "none", stroke: C.amber, strokeDasharray: "4 4", strokeWidth: 1.5 }),
      h("text", { key: "t", x: 100, y: 108, fill: C.dim, fontSize: 9, fontFamily: MONO, textAnchor: "middle" }, "tertiary fold + pocket")]);
  }
  if (id === "function") {
    return svg([
      h("path", { key: "p", d: "M40 30 C 20 60 20 70 40 90 L 90 90 C 80 70 80 50 90 30 Z", fill: C.cyan + "22", stroke: C.cyan, strokeWidth: 2 }),
      h("circle", { key: "l", cx: 70, cy: 60, r: 10, fill: C.amber }),
      h("text", { key: "t", x: 110, y: 64, fill: C.hi, fontSize: 10, fontFamily: MONO }, "shape → binds")]);
  }
  if (id === "funnel") {
    return svg([
      h("path", { key: "f", d: "M30 24 L 170 24 L 110 96 L 90 96 Z", fill: C.cyan + "1a", stroke: C.cyan, strokeWidth: 1.5 }),
      h("circle", { key: "b", cx: 100, cy: 92, r: 6, fill: C.green }),
      h("text", { key: "t", x: 100, y: 114, fill: C.dim, fontSize: 9, fontFamily: MONO, textAnchor: "middle" }, "energy funnel → native")]);
  }
  // af
  return svg([
    h("rect", { key: "in", x: 16, y: 50, width: 54, height: 20, rx: 4, fill: C.bg2, stroke: C.cyan }),
    h("text", { key: "it", x: 43, y: 64, fill: C.cyan, fontSize: 9, fontFamily: MONO, textAnchor: "middle" }, "sequence"),
    h("path", { key: "ar", d: "M74 60 L 104 60", stroke: C.mid, strokeWidth: 2, markerEnd: "" }),
    h("polygon", { key: "arh", points: "104,55 114,60 104,65", fill: C.mid }),
    h("rect", { key: "out", x: 118, y: 46, width: 66, height: 28, rx: 4, fill: C.green + "1a", stroke: C.green }),
    h("text", { key: "ot", x: 151, y: 58, fill: C.green, fontSize: 9, fontFamily: MONO, textAnchor: "middle" }, "coords +"),
    h("text", { key: "ot2", x: 151, y: 69, fill: C.green, fontSize: 9, fontFamily: MONO, textAnchor: "middle" }, "confidence")]);
}

export default function ProteinBasics({ open, onClose, colors, onOpenLibrary }) {
  const C = colors;
  const [step, setStep] = useState(0);
  if (!open) return null;
  const s = proteinBasicsSteps[step];
  const last = step === proteinBasicsSteps.length - 1;
  return h("div", { style: st("position:fixed;inset:0;z-index:58;background:rgba(6,4,15,.94);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:24px;") },
    h("div", { style: st(`width:min(640px,94vw);background:linear-gradient(180deg,#150f30,#0e0a22);border:1px solid #2c2350;border-radius:16px;padding:22px 24px;`) },
      h("div", { style: st("display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;") },
        h("div", { style: st(`font-family:${MONO};font-weight:900;letter-spacing:2.4px;font-size:13px;color:${C.cyan};`) }, "PROTEIN BASICS"),
        h("button", { onClick: onClose, title: "Close", style: st("width:30px;height:30px;border-radius:8px;background:#0a0612;border:1px solid #4a3d72;color:#cabbf0;cursor:pointer;font-size:14px;") }, "✕")),
      h("div", { style: st(`font-family:${MONO};font-size:9px;letter-spacing:1px;color:#7a6aa8;margin-bottom:14px;`) }, `STEP ${step + 1} / ${proteinBasicsSteps.length}`),
      h("div", { style: st("display:flex;gap:18px;align-items:center;flex-wrap:wrap;") },
        h("div", { style: st("flex:none;width:200px;height:120px;display:flex;align-items:center;justify-content:center;background:#0a0612;border:1px solid #2c2350;border-radius:11px;") }, diagram(s.dia, C)),
        h("div", { style: st("flex:1;min-width:240px;") },
          h("div", { style: st(`font-family:${MONO};font-weight:800;font-size:15px;color:${C.hi};margin-bottom:8px;`) }, s.title),
          h("div", { style: st("font-size:12.5px;line-height:1.55;color:#d9d2ef;") }, s.body))),
      h("div", { style: st("display:flex;align-items:center;justify-content:center;gap:6px;margin:18px 0 14px;") },
        proteinBasicsSteps.map((_, i) => h("button", { key: i, onClick: () => setStep(i), "aria-label": `Go to step ${i + 1}`, style: st(`width:${i === step ? "20px" : "8px"};height:8px;border-radius:4px;border:none;cursor:pointer;background:${i === step ? C.cyan : "#3d3463"};transition:width .2s;`) }))),
      h("div", { style: st("display:flex;align-items:center;justify-content:space-between;gap:10px;") },
        h("button", { onClick: () => setStep(Math.max(0, step - 1)), disabled: step === 0, style: st(`padding:9px 16px;border-radius:9px;border:1px solid #4a3d72;background:#0a0612;color:${step === 0 ? "#5a4f80" : "#cabbf0"};font-family:${MONO};font-weight:700;font-size:11px;cursor:${step === 0 ? "default" : "pointer"};`) }, "← Back"),
        last
          ? h("button", { onClick: () => { setStep(0); onClose && onClose(); if (onOpenLibrary) onOpenLibrary(); }, style: st(`padding:9px 18px;border-radius:9px;border:none;background:linear-gradient(135deg,#3dffa8,#2fd6ff);color:#08060f;font-family:${MONO};font-weight:800;font-size:11px;letter-spacing:.5px;cursor:pointer;`) }, onOpenLibrary ? "Browse proteins →" : "Done")
          : h("button", { onClick: () => setStep(Math.min(proteinBasicsSteps.length - 1, step + 1)), style: st(`padding:9px 18px;border-radius:9px;border:none;background:linear-gradient(135deg,#3dffa8,#2fd6ff);color:#08060f;font-family:${MONO};font-weight:800;font-size:11px;letter-spacing:.5px;cursor:pointer;`) }, "Next →"))));
}
