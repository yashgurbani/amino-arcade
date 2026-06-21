import test from "node:test";
import assert from "node:assert/strict";
import { isAnalysisAvailable, frameAnalysis, convergenceSeries, isLowConfidence, fmtA, fmtDelta, fmtPct } from "./recycleMetrics.js";

const analysis = {
  available: true,
  frames: [
    { recycle_index: 0, label: "Recycle 0", rmsd_to_previous_a: null, rmsd_to_reference_a: 17.58, mean_plddt: 25.6, delta_mean_plddt: null, fraction_below_70: 0.98, contact_delta_to_reference: { jaccard: 0.62 } },
    { recycle_index: 1, label: "Recycle 1", rmsd_to_previous_a: 14.43, rmsd_to_reference_a: 10.53, mean_plddt: 25.2, delta_mean_plddt: -0.4, fraction_below_70: 0.97, contact_delta_to_reference: { jaccard: 0.7 } },
  ],
};

test("availability + frame access", () => {
  assert.equal(isAnalysisAvailable(analysis), true);
  assert.equal(isAnalysisAvailable({ available: false }), false);
  assert.equal(frameAnalysis(analysis, 1).mean_plddt, 25.2);
  assert.equal(frameAnalysis(analysis, 9), null);
});

test("convergence series maps fields", () => {
  const s = convergenceSeries(analysis);
  assert.equal(s.length, 2);
  assert.equal(s[1].rmsdToPrevious, 14.43);
  assert.equal(s[1].deltaPlddt, -0.4);
  assert.equal(s[0].contactJaccard, 0.62);
});

test("low-confidence detection (the GFP lesson)", () => {
  assert.equal(isLowConfidence(analysis.frames[0]), true);
  assert.equal(isLowConfidence({ mean_plddt: 92, fraction_below_70: 0.05 }), false);
});

test("formatters degrade gracefully", () => {
  assert.equal(fmtA(3.456), "3.46 A");
  assert.equal(fmtA(null), "--");
  assert.equal(fmtDelta(0.4), "+0.40");
  assert.equal(fmtDelta(-0.4), "-0.40");
  assert.equal(fmtPct(0.98), "98%");
  assert.equal(fmtPct(null), "--");
});
