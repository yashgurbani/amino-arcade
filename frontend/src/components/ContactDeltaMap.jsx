import { createElement as h } from "react";
import { CONTACT_DELTA_STYLES, contactDeltaCounts, contactDeltaExtent, visibleContactDeltaCells } from "../lib/contactDeltaView";
import { st } from "../lib/viewer";

export default function ContactDeltaMap({ lines, residueCount = 0, selectedPair = null, onSelectPair, colors, labels }) {
  const C = colors || {};
  const n = contactDeltaExtent(lines, residueCount);
  const counts = contactDeltaCounts(lines);
  const cell = n > 100 ? 3.2 : 4.4;
  const pitch = n > 100 ? 4 : 5;
  const cells = visibleContactDeltaCells(lines, { stableLimit: 180 });
  const selectedKey = selectedPair ? `${Math.min(selectedPair.i, selectedPair.j)}-${Math.max(selectedPair.i, selectedPair.j)}` : "";

  if (!n || !cells.length) {
    return h("div", {
      "data-testid": "contact-delta-map",
      style: st("width:190px;min-height:190px;border-radius:8px;border:1px solid #2c2350;background:#08060f;display:flex;align-items:center;justify-content:center;text-align:center;padding:12px;font-size:10px;line-height:1.45;color:#9d8fd6;"),
    }, "No long-range Cα contact changes are available for this frame.");
  }

  const rects = [];
  for (const { kind, pair } of cells) {
    const styleDef = CONTACT_DELTA_STYLES[kind];
    for (const [i, j] of [pair, [pair[1], pair[0]]]) {
      const key = `${Math.min(i, j)}-${Math.max(i, j)}`;
      const selected = selectedKey === key;
      rects.push(h("rect", {
        key: `${kind}-${i}-${j}`,
        x: j * pitch,
        y: i * pitch,
        width: cell,
        height: cell,
        rx: 0.6,
        fill: styleDef.color,
        opacity: selected ? 1 : styleDef.opacity,
        stroke: selected ? (C.amber || "#ffb347") : "none",
        strokeWidth: selected ? 1.4 : 0,
        onClick: () => onSelectPair && onSelectPair({ i: pair[0], j: pair[1], kind }),
      }));
    }
  }

  const legend = ["gained", "lost", "stable"].map((kind) => {
    const styleDef = CONTACT_DELTA_STYLES[kind];
    const label = labels?.[kind] || styleDef.label;
    return h("span", { key: kind, style: st("display:flex;align-items:center;gap:5px;") },
      h("span", { style: { width: 8, height: 8, borderRadius: 2, background: styleDef.color, opacity: styleDef.opacity } }),
      h("span", null, `${label}: ${counts[kind]}`));
  });

  return h("div", { "data-testid": "contact-delta-map", style: st("display:flex;flex-direction:column;align-items:center;gap:8px;") },
    h("svg", {
      "aria-label": "Real contact delta map",
      role: "img",
      viewBox: `0 0 ${n * pitch} ${n * pitch}`,
      style: { width: "190px", height: "190px", background: C.bg0 || "#08060f", borderRadius: "8px", border: `1px solid ${C.border || "#2c2350"}`, cursor: "crosshair" },
    }, rects),
    h("div", { style: st("width:190px;display:flex;flex-wrap:wrap;gap:7px 10px;font-family:'JetBrains Mono',monospace;font-size:8.5px;line-height:1.35;color:#cabbf0;") }, legend),
    h("div", { style: st("width:190px;font-family:'JetBrains Mono',monospace;font-size:9px;line-height:1.35;color:#9d8fd6;") },
      `${labels?.different || "Different from final"}: ${counts.different}. Stable contacts are dimmed so gained/lost changes stay visible.`));
}
