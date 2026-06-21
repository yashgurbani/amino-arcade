export function key(i, j) {
  return i < j ? `${i}-${j}` : `${j}-${i}`;
}

export function invertMatrix(matrix) {
  const n = matrix.length;
  const work = matrix.map((row, i) => [
    ...row.map(Number),
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) {
      if (Math.abs(work[r][col]) > Math.abs(work[pivot][col])) pivot = r;
    }
    [work[col], work[pivot]] = [work[pivot], work[col]];
    const divisor = work[col][col] || 1e-9;
    for (let j = 0; j < 2 * n; j += 1) work[col][j] /= divisor;
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const factor = work[r][col];
      for (let j = 0; j < 2 * n; j += 1) work[r][j] -= factor * work[col][j];
    }
  }

  return work.map((row) => row.slice(n));
}

export function coevolutionMatrices(strength = 0.52) {
  const n = 6;
  const contacts = new Set([key(0, 1), key(1, 2), key(2, 3), key(4, 5)]);
  const precision = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1.35 : 0))
  );
  contacts.forEach((contact) => {
    const [i, j] = contact.split("-").map(Number);
    precision[i][j] = -strength;
    precision[j][i] = -strength;
  });
  const covariance = invertMatrix(precision);
  const partial = precision.map((row, i) => row.map((v, j) => (i === j ? 0 : -v)));
  let indirect = [0, 2];
  let best = 0;
  covariance.forEach((row, i) => {
    row.forEach((value, j) => {
      if (i >= j || contacts.has(key(i, j))) return;
      if (Math.abs(value) > best) {
        best = Math.abs(value);
        indirect = [i, j];
      }
    });
  });
  return { contacts, covariance, partial, indirect };
}

export function trianglePoints(dij, dik, dkj) {
  const width = 340;
  const height = 230;
  const origin = [54, 176];
  const scale = 42;
  const i = origin;
  const k = [origin[0] + dik * scale, origin[1]];
  const denom = 2 * dik || 1e-9;
  const a = (dik * dik - dkj * dkj + dij * dij) / denom;
  const h2 = dij * dij - a * a;
  const realizable = h2 >= -1e-6 && dij + dkj >= dik && dij + dik >= dkj && dik + dkj >= dij;
  const h = Math.sqrt(Math.max(0, h2));
  const j = [origin[0] + a * scale, origin[1] - h * scale];
  const violation = Math.max(0, dik - dij - dkj, dij - dik - dkj, dkj - dij - dik);
  return { width, height, i, j, k, realizable, violation };
}

export function rotate([x, y], theta) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [c * x - s * y, s * x + c * y];
}

export function add([x, y], [a, b]) {
  return [x + a, y + b];
}

export function sub([x, y], [a, b]) {
  return [x - a, y - b];
}

export function norm([x, y]) {
  return Math.hypot(x, y);
}

export function ipaState({ globalRotation, tx, ty, relativePose }) {
  const frameI = { origin: [-1.1, -0.2], angle: 0.15 };
  const frameJ = { origin: [1.1, 0.35], angle: relativePose };
  const qLocal = [0.72, 0.28];
  const kLocal = [-0.58, 0.48];
  const localToWorld = (frame, point) => add(frame.origin, rotate(point, frame.angle));
  const applyGlobal = (point) => add(rotate(point, globalRotation), [tx, ty]);
  const qBase = localToWorld(frameI, qLocal);
  const kBase = localToWorld(frameJ, kLocal);
  const q = applyGlobal(qBase);
  const k = applyGlobal(kBase);
  const invariantDistance = norm(sub(qBase, kBase));
  const displayedDistance = norm(sub(q, k));
  return { frameI, frameJ, q, k, qBase, kBase, invariantDistance, displayedDistance };
}

export function fapeState(reflected = false, phase = 0) {
  const truePoints = Array.from({ length: 8 }, (_, i) => {
    const x = -2.1 + i * 0.62;
    const y = Math.sin(i * 0.85 + phase) * 0.42;
    return [x, y];
  });
  const predicted = truePoints.map(([x, y]) => [x + 0.25, (reflected ? -y : y) + 0.12]);
  const errors = truePoints.map((point, index) => Math.min(1.5, norm(sub(point, predicted[index]))));
  const meanError = errors.reduce((sum, value) => sum + value, 0) / errors.length;
  return { truePoints, predicted, errors, meanError };
}

export function recyclingFrames(steps = 7, hard = false) {
  return Array.from({ length: steps }, (_, step) => {
    const t = step / Math.max(1, steps - 1);
    const midpoint = hard ? 0.65 : 0.32;
    const confidence = 45 + 50 / (1 + Math.exp(-10 * (t - midpoint)));
    const violation = Math.max(0.05, 1 - t * (hard ? 0.72 : 0.9));
    const points = Array.from({ length: 24 }, (_, i) => {
      const angle = i * 0.42;
      const target = [Math.cos(angle) * (1.1 + 0.015 * i), Math.sin(angle) * 0.9 + i * 0.015];
      const noisy = [Math.cos(i * 1.7) * 1.9, Math.sin(i * 1.23) * 1.25];
      return [
        noisy[0] * (1 - t) + target[0] * t,
        noisy[1] * (1 - t) + target[1] * t,
      ];
    });
    return {
      step,
      confidence: Math.round(confidence * 10) / 10,
      violation: Math.round(violation * 100) / 100,
      points,
    };
  });
}

export function parsePdbAtoms(pdb) {
  if (!pdb) return [];
  return pdb
    .split(/\r?\n/)
    .filter((line) => line.startsWith("ATOM"))
    .map((line) => ({
      atom: line.slice(12, 16).trim(),
      residue: Number.parseInt(line.slice(22, 26).trim(), 10),
      x: Number.parseFloat(line.slice(30, 38)),
      y: Number.parseFloat(line.slice(38, 46)),
      z: Number.parseFloat(line.slice(46, 54)),
      plddt: Number.parseFloat(line.slice(60, 66)),
    }))
    .filter((atom) => Number.isFinite(atom.x) && Number.isFinite(atom.y) && Number.isFinite(atom.z));
}

export function confidenceColor(score) {
  if (score >= 90) return "#22d3ee";
  if (score >= 70) return "#34d399";
  if (score >= 50) return "#fbbf24";
  return "#fb7185";
}
