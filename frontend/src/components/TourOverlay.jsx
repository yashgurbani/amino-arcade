// Guided "necessity-first" tour — the narrative spine that ties the six lenses
// into the paper's Fig. 1 pipeline and states the central frame out loud:
// AlphaFold does not physically fold; it infers geometry from evolution.
//
// Two layouts: a right-docked rail (structure stays visible on the left, lit by
// the active lens) and a full-screen SLIDE mode (⛶) for seminar use - which the
// Evoformer step opens automatically, then shrinks back to refocus the protein.
// Pure UI over grounded data (conceptDefs + paperGrounding).

import { createElement as h, useState, useEffect } from "react";
import EvoformerDiagram from "./EvoformerDiagram";
import MsaBridge from "./MsaBridge";

const mono = "'JetBrains Mono', monospace";

function buildSteps(defs, glossary, equationDeck) {
  const g = (term) => (glossary.find((x) => x.term === term) || {}).definition || "";
  const eq = (label) => equationDeck.find((x) => x.label === label) || {};
  const lev = eq("Levinthal count");
  const rec = eq("Recycling");
  return [
    { tag: "FRAME", focus: null, color: "#e8e3ff", title: "AlphaFold doesn't fold — it infers",
      body: `The old mental model — try every shape until one fits (${lev.expression}) — is hopeless: a chain has astronomically many conformations. AlphaFold sidesteps this entirely. It never simulates a folding trajectory. It reads evolutionary signal and predicts the final geometry directly. Hold onto that as you go: nothing here is a movie of a protein folding in time.`,
      why: "If not by searching shapes, then how does a sequence become a structure?", cite: lev.note },
    { tag: "INPUT", focus: "coevolution", color: defs.coevolution.color, render: "msa", title: "Read evolution: sequence → MSA → coevolution",
      body: `${g("MSA")} When two positions mutate in a correlated way across millions of years, they are usually in contact. This evolutionary echo — not physics — is the raw signal AlphaFold exploits. (Lit on the structure now: amylase, a deep-family enzyme.)`,
      why: defs.coevolution.q, boundary: defs.coevolution.boundary, cite: defs.coevolution.paper },
    { tag: "ENGINE", focus: null, color: defs.triangle.color, title: "The engine: the Evoformer",
      body: `${g("Evoformer")} It couples the MSA representation with a ${g("Pair representation").toLowerCase()} The lenses you toggle on the structure are windows onto pieces of this trunk — here is the whole machine in one picture:`,
      render: "evoformer", cite: "Fig. 1; Supplement §1.6" },
    { tag: "GEOMETRY", focus: "triangle", focusPdb: "1CA2", color: defs.triangle.color, title: "Geometric consistency: triangle updates",
      body: "A table of pairwise distances is not yet a shape. To collapse into one 3D structure, the distances must agree with each other — if i is near j and j is near k, then i and k cannot be arbitrarily far. The Evoformer enforces this with triangle operations. (Lit now on carbonic anhydrase, a confident β-sheet protein whose sheet only closes when every pairwise distance is mutually consistent.)",
      why: defs.triangle.q, boundary: defs.triangle.boundary, cite: defs.triangle.paper },
    { tag: "INVARIANCE", focus: "ipa", color: defs.ipa.color, title: "No privileged orientation: IPA",
      body: g("Invariant Point Attention") + " A protein floating in a cell has no 'up' and no origin; the model's reasoning about geometry must give the same answer however you rotate or translate the whole thing. (Lit on the structure: myoglobin, a rigid helical bundle.)",
      why: defs.ipa.q, boundary: defs.ipa.boundary, cite: defs.ipa.paper },
    { tag: "LOSS", focus: "fape", color: defs.fape.color, title: "The right error: FAPE & chirality",
      body: g("FAPE") + " Crucially it is measured in residue-local frames, so it punishes a mirror-image (wrong-handed) structure that a plain distance metric would call perfect. Biology is chiral; the loss has to know that.",
      why: defs.fape.q, boundary: defs.fape.boundary, cite: defs.fape.paper },
    { tag: "REFINE", focus: "recycling", color: defs.recycling.color, title: "Refinement, not a movie: recycling",
      body: `${g("Recycling")} ${rec.note} The recycles you can actually watch are the model sharpening its own representation pass by pass — for an easy target it is nearly done after one pass, which is why the motion looks small. It is iteration, never folding kinetics.`,
      why: defs.recycling.q, boundary: defs.recycling.boundary, cite: defs.recycling.paper },
    { tag: "CONFIDENCE", focus: "all", color: "#2fd6ff", title: "The model grades itself: pLDDT & PAE",
      body: `${g("pLDDT")} ${g("PAE")} These are the model's calibrated estimate of where it is and isn't sure — the single most useful output for a working scientist. Read it; don't trust the structure blindly.`,
      why: "Can a prediction tell you which parts to believe?", cite: "Fig. 2; Supplement §1.9.6" },
    { tag: "LIMIT", focus: "triangle", color: "#ffb347", title: "The honest limit: no MSA, no fold",
      body: "Strip the evolutionary input away and AlphaFold has almost nothing to work with — confidence collapses and the structure never settles (the GFP single-sequence example, lit now). That failure is the clearest proof of the whole thesis: the multiple-sequence alignment is the engine, not the network alone.",
      why: "What happens when you remove the evolution the method depends on?", cite: "Extended Data Fig. 5" },
  ];
}

export default function TourOverlay({ open, onClose, conceptDefs, glossary, equationDeck, colors, onFocusLens }) {
  const [i, setI] = useState(0);
  const [userBig, setUserBig] = useState(null); // null = follow step default
  const steps = buildSteps(conceptDefs, glossary || [], equationDeck || []);
  const idx = Math.max(0, Math.min(i, steps.length - 1));
  const focus = steps[idx].focus;
  const focusPdb = steps[idx].focusPdb || null;
  useEffect(() => { if (open && onFocusLens) onFocusLens(focus, focusPdb); }, [idx, open, focus, focusPdb, onFocusLens]);
  if (!open) return null;
  const s = steps[idx];
  // The Evoformer step defaults to a full-screen slide; other steps to the dock.
  // userBig overrides per step; navigating clears the override (goto).
  const big = userBig === null ? (s.render === "evoformer" || s.render === "msa") : userBig;
  const goto = (k) => { setUserBig(null); setI(k); };
  const C = colors || {};
  const scale = big ? 1.25 : 1;
  const px = (v) => `${Math.round(v * scale)}px`;
  const label = (k, color) => h("div", { style: { fontFamily: mono, fontSize: 8.5, letterSpacing: "1.4px", color: color || "#9d8fd6", marginBottom: 4, marginTop: 12 } }, k);

  const content = [
    h("div", { key: "hd", style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 } },
      h("div", { style: { display: "flex", alignItems: "center", gap: 9 } },
        h("span", { style: { fontFamily: mono, fontSize: 9, fontWeight: 800, letterSpacing: "1.4px", color: s.color, padding: "3px 8px", borderRadius: 6, border: `1px solid ${s.color}`, background: `${s.color}18` } }, s.tag),
        h("span", { style: { fontFamily: mono, fontSize: 10, color: "#7a6aa8" } }, `STEP ${idx + 1} / ${steps.length}`)),
      h("div", { style: { display: "flex", alignItems: "center", gap: 6 } },
        h("button", { key: "big", onClick: () => setUserBig(!big), title: big ? "Shrink to side panel (refocus the protein)" : "Full-screen slide (for presenting)", style: { background: "none", border: "none", color: "#9d8fd6", fontSize: 15, cursor: "pointer", lineHeight: 1 } }, big ? "⤢" : "⛶"),
        h("button", { key: "x", onClick: onClose, "aria-label": "Close tour", style: { background: "none", border: "none", color: "#9d8fd6", fontSize: 18, cursor: "pointer", lineHeight: 1 } }, "✕"))),
    s.focus ? h("div", { key: "cue", style: { fontFamily: mono, fontSize: 8.5, color: s.color, marginBottom: 8, opacity: 0.9 } }, "◉ lens lit on the structure behind →") : null,
    h("div", { key: "ti", style: { fontFamily: mono, fontWeight: 800, fontSize: px(16.5), color: "#f3f0ff", lineHeight: 1.25, marginBottom: 9 } }, s.title),
    h("div", { key: "bd", style: { fontSize: px(12.5), lineHeight: 1.55, color: "#cabbf0" } }, s.body),
    s.render === "evoformer" ? h("div", { key: "evo", style: { marginTop: 12, borderRadius: 12, border: "1px solid #2c2350", background: "#0a0716", padding: 8 } }, h(EvoformerDiagram, { colors: { coev: C.coev, tri: C.tri, ipa: C.ipa, fape: C.fape, rec: C.rec } })) : null,
    s.render === "msa" ? h("div", { key: "msa", style: { marginTop: 12, borderRadius: 12, border: "1px solid #2c2350", background: "#0a0716", padding: 8 } }, h(MsaBridge, { colors: { coev: C.coev } })) : null,
    s.why ? h("div", { key: "wy" }, label("THE QUESTION", s.color), h("div", { style: { fontSize: px(12), lineHeight: 1.5, color: "#e8e3ff", fontStyle: "italic" } }, s.why)) : null,
    s.boundary ? h("div", { key: "bo" }, label("HONEST BOUNDARY", "#ffb347"), h("div", { style: { fontSize: px(11), lineHeight: 1.5, color: "#d9b98a" } }, s.boundary)) : null,
    s.cite ? h("div", { key: "ci" }, label("PAPER", "#7a6aa8"), h("div", { style: { fontSize: px(10.5), color: "#9d8fd6", fontFamily: mono } }, s.cite)) : null,
    h("div", { key: "dots", style: { display: "flex", gap: 5, justifyContent: "center", margin: "16px 0 12px", flexWrap: "wrap" } },
      steps.map((_, k) => h("button", { key: k, "aria-label": `Go to step ${k + 1}`, onClick: () => goto(k), style: { width: k === idx ? 20 : 8, height: 8, borderRadius: 4, border: "none", cursor: "pointer", background: k === idx ? s.color : "#3a2f63", transition: "all .2s" } }))),
    h("div", { key: "nav", style: { display: "flex", justifyContent: "space-between", gap: 10 } },
      h("button", { onClick: () => goto(Math.max(0, idx - 1)), disabled: idx === 0, style: { flex: 1, height: 38, borderRadius: 10, border: "1px solid #4a3d72", background: idx === 0 ? "#0a0612" : "#1d1640", color: idx === 0 ? "#4a3d72" : "#cabbf0", fontFamily: mono, fontWeight: 700, fontSize: 11.5, cursor: idx === 0 ? "default" : "pointer" } }, "◀ BACK"),
      idx === steps.length - 1
        ? h("button", { onClick: onClose, style: { flex: 1, height: 38, borderRadius: 10, border: "none", background: "linear-gradient(135deg,#3dffa8,#2fd6ff)", color: "#08060f", fontFamily: mono, fontWeight: 800, fontSize: 11.5, cursor: "pointer" } }, "EXPLORE FREELY →")
        : h("button", { onClick: () => goto(Math.min(steps.length - 1, idx + 1)), style: { flex: 1, height: 38, borderRadius: 10, border: "none", background: `linear-gradient(135deg,${s.color},#2fd6ff)`, color: "#08060f", fontFamily: mono, fontWeight: 800, fontSize: 11.5, cursor: "pointer" } }, "NEXT ▶")),
  ];

  const panelBase = { zIndex: 50, background: "linear-gradient(180deg,#150f30,#0c0820)", overflowY: "auto" };
  if (big) {
    const slide = { ...panelBase, position: "relative", width: "min(1040px,94vw)", maxHeight: "92vh", borderRadius: 16, border: `1px solid ${s.color}`, boxShadow: `0 0 70px ${s.color}44`, padding: "30px 40px" };
    return h("div", { "data-testid": "tour-overlay", style: { position: "fixed", inset: 0, zIndex: 50, background: "rgba(4,3,10,.9)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 } },
      h("div", { style: slide }, ...content));
  }
  const dock = { ...panelBase, position: "fixed", top: 0, right: 0, height: "100vh", width: "min(384px,94vw)", borderLeft: `1px solid ${s.color}`, boxShadow: "-18px 0 60px rgba(0,0,0,.5)", padding: "18px 20px" };
  return h("div", { "data-testid": "tour-overlay", style: dock }, ...content);
}
