// Ca contact maps + deltas, mirroring backend/analysis.py constants.
//
// Drives the Coevolution / Contacts lens. The backend `analysis` object ships
// gained/lost contact *lists* and counts, but to draw contact lines in 3D the
// viewer needs the full current contact set, which we recompute from the frame's
// Ca coordinates (already present in the payload). No invented contacts.

export const CONTACT_THRESHOLD_A = 8.0;
export const CONTACT_MIN_SEQ_SEP = 6;

export function contactKey(i, j) {
  return i < j ? `${i}-${j}` : `${j}-${i}`;
}

// Returns a Set of "i-j" keys (i < j) for Ca pairs within `threshold` and at
// least `minSep` apart in sequence.
export function contactPairs(ca, threshold = CONTACT_THRESHOLD_A, minSep = CONTACT_MIN_SEQ_SEP) {
  const out = new Set();
  if (!Array.isArray(ca)) return out;
  const n = ca.length;
  const t2 = threshold * threshold;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + minSep; j < n; j += 1) {
      const dx = ca[i][0] - ca[j][0];
      const dy = ca[i][1] - ca[j][1];
      const dz = ca[i][2] - ca[j][2];
      if (dx * dx + dy * dy + dz * dz <= t2) out.add(contactKey(i, j));
    }
  }
  return out;
}

export function parseKey(key) {
  const [i, j] = key.split("-").map(Number);
  return [i, j];
}

// Compare current contacts to a reference set (Set or array of keys).
export function contactDelta(current, other) {
  const cur = current instanceof Set ? current : new Set(current);
  const oth = other instanceof Set ? other : new Set(other);
  const gained = [];
  const stable = [];
  for (const k of cur) (oth.has(k) ? stable : gained).push(k);
  const lost = [];
  for (const k of oth) if (!cur.has(k)) lost.push(k);
  const unionSize = cur.size + lost.length;
  return {
    gained,
    lost,
    stable,
    jaccard: unionSize ? Number((stable.length / unionSize).toFixed(4)) : 1,
  };
}
