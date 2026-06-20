const DISPLACEMENT_COOL = [61, 255, 168];
const DISPLACEMENT_HOT = [255, 77, 109];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toHex([r, g, b]) {
  return `#${[r, g, b].map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;
}

function mix(a, b, t) {
  return a.map((value, index) => value + (b[index] - value) * t);
}

export function colorForPlddt(value) {
  if (value >= 90) return "#1f6feb";
  if (value >= 70) return "#25c7d9";
  if (value >= 50) return "#f4e409";
  return "#f28c28";
}

export function colorForDisplacement(value, maxValue) {
  const denominator = maxValue > 0 ? maxValue : 1;
  return toHex(mix(DISPLACEMENT_COOL, DISPLACEMENT_HOT, clamp(value / denominator, 0, 1)));
}

// Quantize continuous displacement colors so Mol* receives a small number of
// overpaint layers instead of one state transform per residue.
export function groupResidueColors(channel, { bins = 8 } = {}) {
  if (!channel || !Array.isArray(channel.values) || !channel.values.length) return [];
  const finite = channel.values.filter((value) => Number.isFinite(value));
  if (!finite.length) return [];
  const maxValue = Number.isFinite(channel.maxValue) && channel.maxValue > 0 ? channel.maxValue : Math.max(...finite);
  const groups = new Map();

  channel.values.forEach((value, index) => {
    if (!Number.isFinite(value)) return;
    let color;
    if (channel.mode === "plddt") {
      color = colorForPlddt(value);
    } else if (channel.mode === "displacement") {
      const normalized = maxValue > 0 ? clamp(value / maxValue, 0, 1) : 0;
      const quantized = Math.round(normalized * (bins - 1)) / Math.max(1, bins - 1);
      color = colorForDisplacement(quantized * maxValue, maxValue);
    } else {
      return;
    }
    const residues = groups.get(color) || [];
    residues.push(index + 1);
    groups.set(color, residues);
  });

  return [...groups].map(([color, residues]) => ({ color, residues }));
}

export function residueColorLegend(channel) {
  if (!channel || !Array.isArray(channel.values) || !channel.values.length) return null;
  if (channel.mode === "plddt") {
    return { title: "pLDDT", min: "0", max: "100", lowColor: "#f28c28", highColor: "#1f6feb" };
  }
  if (channel.mode === "displacement") {
    const finite = channel.values.filter((value) => Number.isFinite(value));
    if (!finite.length) return null;
    const maxValue = Math.max(...finite);
    return {
      title: "Cα displacement to final (aligned)",
      min: "0 Å",
      max: `${maxValue.toFixed(2)} Å`,
      lowColor: toHex(DISPLACEMENT_COOL),
      highColor: toHex(DISPLACEMENT_HOT),
    };
  }
  return null;
}
