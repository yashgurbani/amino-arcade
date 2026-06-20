import { parseKey } from "./contactMap.js";

export const CONTACT_DELTA_STYLES = {
  gained: { label: "Gained", color: "#3dffa8", opacity: 0.95 },
  lost: { label: "Lost", color: "#ff5a6a", opacity: 0.85 },
  stable: { label: "Stable", color: "#2fd6ff", opacity: 0.34 },
};

function normalizePair(pair) {
  if (Array.isArray(pair)) return [Number(pair[0]), Number(pair[1])];
  if (typeof pair === "string") return parseKey(pair);
  return [NaN, NaN];
}

export function normalizeContactLines(lines) {
  const source = lines || {};
  const out = { gained: [], lost: [], stable: [] };
  for (const bucket of Object.keys(out)) {
    const seen = new Set();
    for (const raw of source[bucket] || []) {
      const [a, b] = normalizePair(raw);
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a === b) continue;
      const i = Math.min(a, b);
      const j = Math.max(a, b);
      const key = `${i}-${j}`;
      if (!seen.has(key)) {
        seen.add(key);
        out[bucket].push([i, j]);
      }
    }
  }
  return out;
}

export function contactDeltaCounts(lines) {
  const normalized = normalizeContactLines(lines);
  return {
    gained: normalized.gained.length,
    lost: normalized.lost.length,
    stable: normalized.stable.length,
    different: normalized.gained.length + normalized.lost.length,
  };
}

export function visibleContactDeltaCells(lines, { stableLimit = 160 } = {}) {
  const normalized = normalizeContactLines(lines);
  return [
    ...normalized.stable.slice(0, stableLimit).map((pair) => ({ kind: "stable", pair })),
    ...normalized.gained.map((pair) => ({ kind: "gained", pair })),
    ...normalized.lost.map((pair) => ({ kind: "lost", pair })),
  ];
}

export function contactDeltaExtent(lines, fallbackLength = 0) {
  const normalized = normalizeContactLines(lines);
  let maxIndex = fallbackLength - 1;
  for (const bucket of Object.values(normalized)) {
    for (const [i, j] of bucket) maxIndex = Math.max(maxIndex, i, j);
  }
  return Math.max(0, maxIndex + 1);
}
