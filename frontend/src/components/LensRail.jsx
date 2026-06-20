import { createElement as h } from "react";
import { st } from "../lib/viewer";

export default function LensRail({ colors, lensIds, defs, overlays, lensState, lensMetric, chips, onToggle, onExpand }) {
  const C = colors;
  return {
    rail: h("aside", { style: st("grid-row:1 / span 2;border-right:1px solid #2c2350;display:flex;flex-direction:column;min-height:0;background:linear-gradient(180deg,#150f30,#0e0a22);") },
      h("div", { style: st("flex:none;padding:16px 16px 8px;") },
        h("div", { style: st("font-family:'JetBrains Mono',monospace;font-weight:700;letter-spacing:2px;font-size:11px;color:#9d8fd6;") }, "LIVE LENSES"),
        h("div", { style: st("font-size:11px;color:#6f6298;margin-top:5px;line-height:1.45;") }, "Toggle a concept to project it onto the structure. Hit ⤢ to open the full interactive scene.")),
      h("div", { style: st("flex:1;overflow-y:auto;padding:8px 12px 14px;display:flex;flex-direction:column;gap:11px;") },
        lensIds.map((id) => {
          const on = overlays[id], col = defs[id].color;
          return h("div", { key: id, style: st(`display:flex;flex-direction:column;gap:6px;padding:11px 11px 9px;border-radius:12px;border:1px solid ${on ? col : C.border};background:${on ? col + "14" : C.bg2};box-shadow:${on ? "0 0 16px " + col + "44" : "none"};`) },
            h("button", { onClick: () => onToggle(id), style: st("display:flex;align-items:center;gap:9px;background:none;border:none;cursor:pointer;padding:0;") },
              h("span", { style: st(`width:13px;height:13px;border-radius:50%;flex:none;background:${on ? col : "#0a0612"};border:2px solid ${col};box-shadow:${on ? "0 0 10px " + col : "none"};`) }),
              h("span", { style: st(`flex:1;text-align:left;font-family:'JetBrains Mono',monospace;font-weight:700;font-size:12.5px;color:${on ? C.hi : C.mid};`) }, defs[id].name),
              h("span", { style: st(`font-family:'JetBrains Mono',monospace;font-size:10px;color:${col};`) }, lensState[id])),
            h("div", { style: st("display:flex;align-items:center;justify-content:space-between;padding:0 4px;") },
              h("span", { style: st("font-family:'JetBrains Mono',monospace;font-size:11px;color:#8a7cba;") }, lensMetric[id]),
              h("button", { onClick: () => onExpand(id), title: "open full scene", style: st(`background:none;border:none;color:${col};font-size:13px;cursor:pointer;padding:2px 4px;`) }, "⤢")));
        }))),
    chips: h("div", { style: st("position:absolute;top:14px;left:14px;z-index:6;display:flex;flex-direction:column;gap:6px;pointer-events:auto;") },
      chips.map((chip, index) => h("button", { key: index, onClick: () => onExpand(chip.id), title: `Open ${chip.label} lens overlay`, style: st(`display:flex;align-items:center;gap:8px;padding:5px 10px;border-radius:7px;background:rgba(10,14,26,.82);border:1px solid ${chip.color};cursor:pointer;text-align:left;`) },
        h("span", { style: st(`width:7px;height:7px;border-radius:50%;background:${chip.color};box-shadow:0 0 7px ${chip.color};`) }),
        h("span", { style: st("font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:.5px;color:#aeb8d0;") }, chip.label),
        h("span", { style: st(`font-family:'JetBrains Mono',monospace;font-size:10.5px;font-weight:700;color:${chip.color};`) }, chip.value)))),
  };
}
