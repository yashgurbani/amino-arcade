import { createElement as h } from "react";
import { st } from "../lib/viewer";

export default function ArcadeHeader({
  colors: C,
  state,
  targets,
  defs,
  mono,
  guardrailLabel,
  guardrailTitle,
  onSetView,
  onOpenLibrary,
  onSelectTarget,
  onOpenTour,
  onOpenInfo,
  onTogglePresentationMode,
}) {
  return h("header", { style: st("flex:none;height:48px;display:flex;align-items:center;gap:12px;padding:0 14px;background:linear-gradient(180deg,#1c1640,#140e2c);border-bottom:1px solid #322757;z-index:30;min-width:0;") },
    h("div", { style: st("display:flex;align-items:center;gap:9px;padding:6px 12px;border-radius:8px;background:#0a0612;border:1px solid #4a3d72;background-image:radial-gradient(circle,rgba(255,170,60,.12) 1px,transparent 1px);background-size:4px 4px;") },
      h("div", { style: st("font-family:'JetBrains Mono',monospace;font-weight:900;letter-spacing:2.2px;font-size:16px;color:#ffb347;text-shadow:0 0 12px rgba(255,170,60,.85);animation:aa-flick 4s infinite;line-height:1;white-space:nowrap;") }, "AMINO ARCADE")),
    h("div", { style: st("display:flex;background:#0a0612;border:1px solid #4a3d72;border-radius:8px;padding:3px;gap:3px;") },
      h("button", { onClick: () => onSetView("stage"), title: "Curated teaching targets", style: st(`padding:6px 10px;border-radius:6px;border:none;cursor:pointer;font-family:${mono};font-weight:700;font-size:10.5px;letter-spacing:.8px;background:${state.view === "stage" ? "linear-gradient(135deg,#3dffa8,#2fd6ff)" : "transparent"};color:${state.view === "stage" ? "#08060f" : C.mid};`) }, "ARCADE"),
      h("button", { onClick: () => onSetView("custom"), title: "Fold It Yourself sequence mode", style: st(`padding:6px 10px;border-radius:6px;border:none;cursor:pointer;font-family:${mono};font-weight:700;font-size:10.5px;letter-spacing:.8px;background:${state.view === "custom" ? "linear-gradient(135deg,#b06bff,#ff4fd8)" : "transparent"};color:${state.view === "custom" ? "#08060f" : C.mid};`) }, "FIY"),
      h("button", { onClick: onOpenLibrary, title: "Browse the full protein library", style: st(`padding:6px 10px;border-radius:6px;border:none;cursor:pointer;font-family:${mono};font-weight:700;font-size:10.5px;letter-spacing:.8px;background:${state.libraryOpen ? "linear-gradient(135deg,#ffb347,#2fd6ff)" : "transparent"};color:${state.libraryOpen ? "#08060f" : C.mid};`) }, "LIBRARY")),
    state.view === "stage" ? h("div", { style: st("display:flex;gap:5px;align-items:center;overflow-x:auto;max-width:34vw;min-width:0;") },
      targets.map((target, i) => (target.library ? null : ((lensColor) => h("button", {
        key: i,
        onClick: () => onSelectTarget(i),
        title: `${target.name} - ${target.tag}`,
        style: st(`flex:none;width:28px;height:28px;border-radius:8px;cursor:pointer;font-family:${mono};font-weight:900;font-size:11px;letter-spacing:0;border:1px solid ${state.target === i ? lensColor : C.border};background:${state.target === i ? lensColor + "26" : "#0a0612"};color:${state.target === i ? lensColor : C.mid};box-shadow:${state.target === i ? "0 0 10px " + lensColor + "66" : "none"};`),
      }, target.n))(target.concept === "all" ? C.amber : defs[target.concept].color)))) : null,
    h("div", { style: st("flex:1;") }),
    h("button", { onClick: onOpenTour, title: "Guided tour and protein basics", style: st("display:flex;align-items:center;gap:7px;padding:6px 10px;border-radius:8px;background:#0a0612;border:1px solid #3dffa8;cursor:pointer;white-space:nowrap;") }, h("span", { style: st("font-family:'JetBrains Mono',monospace;font-size:8.5px;letter-spacing:1.2px;color:#3dffa8;") }, "▶ TOUR")),
    h("button", {
      onClick: onTogglePresentationMode,
      title: "Toggle presentation mode for smoother screen sharing (P)",
      style: st(`display:flex;align-items:center;gap:7px;padding:6px 10px;border-radius:8px;background:${state.presentationMode ? "linear-gradient(135deg,#2fd6ff,#3dffa8)" : "#0a0612"};border:1px solid ${state.presentationMode ? "#3dffa8" : "#4a3d72"};cursor:pointer;white-space:nowrap;color:${state.presentationMode ? "#08060f" : C.mid};font-family:${mono};font-weight:800;font-size:8.8px;letter-spacing:1.1px;`),
    }, state.presentationMode ? "PRES ON" : "PRES"),
    h("div", { title: guardrailTitle, style: st("display:flex;align-items:center;gap:6px;padding:6px 9px;border-radius:8px;background:#0a0612;border:1px solid #2c2350;font-family:'JetBrains Mono',monospace;font-size:8.8px;color:#9d8fd6;white-space:nowrap;") },
      h("span", { style: st(`width:7px;height:7px;border-radius:50%;background:${state.loading ? C.cyan : C.green};box-shadow:0 0 8px ${state.loading ? C.cyan : C.green};`) }),
      h("span", null, `${state.engine} · ${guardrailLabel}`)),
    h("button", { onClick: onOpenInfo, title: "result inspector, downloads, and backend specifics", style: st("width:32px;height:32px;border-radius:8px;background:#0a0612;border:1px solid #4a3d72;color:#9d8fd6;font-family:'JetBrains Mono',monospace;font-size:14px;cursor:pointer;") }, "ⓘ"));
}
