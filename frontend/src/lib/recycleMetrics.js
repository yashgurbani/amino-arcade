// Thin consumer + formatters over the backend `result.analysis` object
// (backend/analysis.py -> build_analysis). Keeps all display formatting in one
// place so components never re-derive metric strings. Pure + framework-free.

export function isAnalysisAvailable(analysis) {
  return !!(analysis && analysis.available && Array.isArray(analysis.frames) && analysis.frames.length);
}

export function frameAnalysis(analysis, index) {
  if (!isAnalysisAvailable(analysis)) return null;
  return analysis.frames[index] ?? null;
}

// Series for the recycling-convergence chart: aligned RMSD to previous frame
// (the honest "how much did this recycle change" signal) + pLDDT trajectory.
export function convergenceSeries(analysis) {
  if (!isAnalysisAvailable(analysis)) return [];
  return analysis.frames.map((f) => ({
    index: f.recycle_index,
    label: f.label,
    rmsdToPrevious: f.rmsd_to_previous_a,
    rmsdToReference: f.rmsd_to_reference_a,
    meanPlddt: f.mean_plddt,
    deltaPlddt: f.delta_mean_plddt,
    contactJaccard: f.contact_delta_to_reference ? f.contact_delta_to_reference.jaccard : null,
  }));
}

// True when the prediction is weak enough to warrant the low-confidence lesson
// card (mean pLDDT below the caution band, or most residues below it).
export function isLowConfidence(entry, { meanThreshold = 70, fractionThreshold = 0.5 } = {}) {
  if (!entry) return false;
  if (typeof entry.mean_plddt === "number" && entry.mean_plddt < meanThreshold) return true;
  if (typeof entry.fraction_below_70 === "number" && entry.fraction_below_70 > fractionThreshold) return true;
  return false;
}

export function fmtA(value, digits = 2) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(digits)} A` : "--";
}

export function fmtDelta(value, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}`;
}

export function fmtPct(fraction, digits = 0) {
  return typeof fraction === "number" && Number.isFinite(fraction)
    ? `${(fraction * 100).toFixed(digits)}%`
    : "--";
}
