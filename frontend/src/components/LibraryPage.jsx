import { createElement as h } from "react";
import { st } from "../lib/viewer";

// Full-screen browsable protein library: the curated five-lens tour and the
// preview-first reference library, each card carrying a learning outcome.
//
// Props:
//   colors  - app palette (C)
//   defs    - concept defs (for per-lens color)
//   targets - combined arcadeTargets() list (curated first, then library)
//   onOpen  - (index) => void, open a target by its index in `targets`
//   onClose - () => void

const MONO = "'JetBrains Mono',monospace";

export default function LibraryPage({ colors, defs, targets, onOpen, onClose }) {
  const C = colors;
  const lensColor = (t) => (t.concept === "all" ? C.amber : (defs[t.concept] ? defs[t.concept].color : C.cyan));
  const card = (t, idx) => {
    const lc = lensColor(t);
    const badge = t.library ? t.n : t.n.replace(/^L/, "");
    return h("button", { key: idx, onClick: () => onOpen(idx), style: st(`text-align:left;display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:9px;border:1px solid ${C.border};background:#0c0820;cursor:pointer;min-height:126px;overflow:hidden;`) },
      h("div", { style: st("display:flex;align-items:flex-start;gap:9px;min-width:0;") },
        h("div", { style: st(`width:28px;height:28px;flex:none;border-radius:7px;display:flex;align-items:center;justify-content:center;background:${lc}1a;border:1px solid ${lc};font-family:${MONO};font-weight:900;font-size:11px;color:${lc};`) }, badge),
        h("div", { style: st("min-width:0;") },
          h("div", { style: st(`font-family:${MONO};font-weight:800;font-size:12.5px;color:${C.hi};line-height:1.2;`) }, t.name),
          h("div", { style: st(`font-family:${MONO};font-size:8.5px;letter-spacing:.4px;color:${lc};margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`) }, `${t.pdb} · ${t.seq.length} aa · ${t.tag}`))),
      h("div", { style: st("font-size:10.5px;line-height:1.42;color:#c4bce0;flex:1;overflow:hidden;") }, t.learningOutcome || t.notice),
      h("div", { style: st(`font-family:${MONO};font-size:8.5px;letter-spacing:.8px;color:${lc};`) }, "VIEW →"));
  };
  const sectionLabel = (txt) => h("div", { style: st(`font-family:${MONO};font-size:9.5px;letter-spacing:1.4px;color:#7a6aa8;margin:4px 2px 9px;`) }, txt);
  const grid = (children) => h("div", { style: st("display:grid;grid-template-columns:repeat(auto-fill,minmax(214px,1fr));gap:10px;margin-bottom:18px;") }, children);
  return h("div", { style: st("position:fixed;inset:0;z-index:55;background:rgba(6,4,15,.94);backdrop-filter:blur(6px);display:flex;flex-direction:column;padding:20px 24px;overflow-y:auto;") },
    h("div", { style: st("display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px;gap:16px;") },
      h("div", null,
        h("div", { style: st(`font-family:${MONO};font-weight:900;letter-spacing:2.2px;font-size:16px;color:#ffb347;`) }, "PROTEIN LIBRARY"),
        h("div", { style: st("font-size:10.5px;color:#9d8fd6;margin-top:4px;max-width:620px;line-height:1.45;") }, "Click a card to open it in the arcade. Reference-library folds are preview-first; cached demo folds load when available.")),
      h("button", { onClick: onClose, title: "Close library", style: st("width:34px;height:34px;flex:none;border-radius:9px;background:#0a0612;border:1px solid #4a3d72;color:#cabbf0;cursor:pointer;font-size:15px;") }, "✕")),
    sectionLabel("THE FIVE-LENS TOUR"),
    grid(targets.map((t, i) => (t.library ? null : card(t, i)))),
    sectionLabel("REFERENCE LIBRARY · PREVIEW-FIRST"),
    grid(targets.map((t, i) => (t.library ? card(t, i) : null))));
}
