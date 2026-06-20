import { createElement as h } from "react";

export default function RecycleTimeline({
  values,
  currentIndex = 0,
  colors,
  xLabel = (index) => String(index),
  rmsdValues = [],
  width = 300,
  height = 80,
  styleHeight = "80px",
  pad = { l: 30, r: 8, t: 8, b: 22 },
  yTicks = [0, 25, 50, 75, 100],
  xTicks = null,
}) {
  const C = colors;
  const arr = Array.isArray(values) && values.length ? values : [0];
  const segs = Math.max(1, arr.length - 1);
  const cw = width - pad.l - pad.r;
  const ch = height - pad.t - pad.b;
  const px = (i) => pad.l + (i / segs) * cw;
  const py = (v) => pad.t + ch - (v / 100) * ch;
  const finiteRmsd = rmsdValues.filter((value) => typeof value === "number" && Number.isFinite(value));
  const rmsdMax = finiteRmsd.length ? Math.max(...finiteRmsd, 0.01) : 1;
  const pyRmsd = (value) => pad.t + ch - (value / rmsdMax) * ch;
  const labels = xTicks || arr.map((_, index) => ({ key: index, x: px(index), text: xLabel(index) }));

  return h("svg", { viewBox: `0 0 ${width} ${height}`, style: { width: "100%", height: styleHeight } },
    yTicks.map((v) => h("line", { key: "gy" + v, x1: pad.l, y1: py(v), x2: width - pad.r, y2: py(v), stroke: C.bg3, strokeWidth: 1 })),
    yTicks.filter((v) => v > 0 && v < 100).map((v) => h("text", { key: "yl" + v, x: pad.l - 4, y: py(v) + 4, textAnchor: "end", fontSize: 8, fontFamily: "'JetBrains Mono',monospace", fill: C.dim }, v)),
    labels.map((label) => h("text", { key: "xl" + label.key, x: label.x, y: height - 2, textAnchor: "middle", fontSize: 8, fontFamily: "'JetBrains Mono',monospace", fill: C.dim }, label.text)),
    h("line", { x1: pad.l, y1: pad.t, x2: pad.l, y2: pad.t + ch, stroke: C.borderHi, strokeWidth: 1 }),
    h("line", { x1: pad.l, y1: pad.t + ch, x2: width - pad.r, y2: pad.t + ch, stroke: C.borderHi, strokeWidth: 1 }),
    h("polygon", { points: [...arr.map((v, i) => `${px(i)},${py(v)}`), `${px(arr.length - 1)},${py(0)}`, `${px(0)},${py(0)}`].join(" "), fill: C.green + "18" }),
    h("polyline", { points: arr.map((v, i) => `${px(i)},${py(v)}`).join(" "), fill: "none", stroke: C.green, strokeWidth: 2.2 }),
    finiteRmsd.length ? h("polyline", { points: rmsdValues.map((v, i) => typeof v === "number" ? `${px(i)},${pyRmsd(v)}` : null).filter(Boolean).join(" "), fill: "none", stroke: C.pink, strokeWidth: 1.8, strokeDasharray: "4 3" }) : null,
    finiteRmsd.length ? h("text", { x: width - pad.r, y: pad.t + 7, textAnchor: "end", fontSize: 7.5, fontFamily: "'JetBrains Mono',monospace", fill: C.pink }, `Δ RMSD max ${rmsdMax.toFixed(2)} Å`) : null,
    arr.map((v, i) => h("circle", { key: "d" + i, cx: px(i), cy: py(v), r: i === currentIndex ? 5 : 3, fill: i === currentIndex ? C.amber : C.green, stroke: i === currentIndex ? "#08060f" : "none", strokeWidth: 2 })));
}
