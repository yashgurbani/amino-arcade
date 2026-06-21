import { kabschRmsd, superpose } from "./superpose.js";

function finalCaTrace(model) {
  const frames = Array.isArray(model?.frames) ? model.frames : [];
  for (let i = frames.length - 1; i >= 0; i -= 1) {
    const ca = frames[i]?.ca;
    if (Array.isArray(ca) && ca.length) return ca;
  }
  return [];
}

function finitePoint(point) {
  return Array.isArray(point) && point.length >= 3 && point.every((value) => Number.isFinite(Number(value)));
}

function normalizeTrace(trace) {
  return Array.isArray(trace)
    ? trace.map((point) => point.map(Number)).filter(finitePoint)
    : [];
}

export function computeEnsembleMetrics(models, { topK = 8 } = {}) {
  const traces = (Array.isArray(models) ? models : [])
    .map((model, index) => ({
      model,
      index,
      ca: normalizeTrace(finalCaTrace(model)),
    }))
    .filter((entry) => entry.ca.length);

  if (traces.length < 2) {
    return { available: false, reason: "need at least two ranked models with C-alpha traces" };
  }

  const length = Math.min(...traces.map((entry) => entry.ca.length));
  if (length < 1) {
    return { available: false, reason: "model traces have no shared residues" };
  }

  const trimmed = traces.map((entry) => ({
    ...entry,
    ca: entry.ca.slice(0, length),
  }));
  const reference = trimmed[0].ca;
  const aligned = trimmed.map((entry, index) => (index === 0 ? reference : superpose(entry.ca, reference)));

  const pairwise = trimmed.map((a, i) => trimmed.map((b, j) => ({
    i,
    j,
    rank_i: a.model?.rank ?? i + 1,
    rank_j: b.model?.rank ?? j + 1,
    rmsd_a: i === j ? 0 : Number(kabschRmsd(a.ca, b.ca).toFixed(3)),
  })));

  const perResidueSpread = [];
  for (let residue = 0; residue < length; residue += 1) {
    const points = aligned.map((trace) => trace[residue]);
    const centroid = [0, 1, 2].map((axis) => points.reduce((sum, point) => sum + point[axis], 0) / points.length);
    const sumSq = points.reduce((sum, point) => {
      const dx = point[0] - centroid[0];
      const dy = point[1] - centroid[1];
      const dz = point[2] - centroid[2];
      return sum + dx * dx + dy * dy + dz * dz;
    }, 0);
    perResidueSpread.push({
      residue: residue + 1,
      spread_a: Number(Math.sqrt(sumSq / points.length).toFixed(3)),
    });
  }

  const maxSpread = Math.max(...perResidueSpread.map((entry) => entry.spread_a));
  const meanSpread = perResidueSpread.reduce((sum, entry) => sum + entry.spread_a, 0) / perResidueSpread.length;
  const pairValues = pairwise.flat().filter((entry) => entry.i < entry.j).map((entry) => entry.rmsd_a);
  const maxPairwiseRmsd = Math.max(...pairValues);

  return {
    available: true,
    model_count: trimmed.length,
    residue_count: length,
    reference_rank: trimmed[0].model?.rank ?? 1,
    pairwise,
    per_residue_spread: perResidueSpread,
    top_spread_residues: [...perResidueSpread].sort((a, b) => b.spread_a - a.spread_a).slice(0, topK),
    mean_spread_a: Number(meanSpread.toFixed(3)),
    max_spread_a: Number(maxSpread.toFixed(3)),
    max_pairwise_rmsd_a: Number(maxPairwiseRmsd.toFixed(3)),
    note: "Models are rigidly aligned before spread is measured. This shows prediction disagreement, not physical motion.",
  };
}
