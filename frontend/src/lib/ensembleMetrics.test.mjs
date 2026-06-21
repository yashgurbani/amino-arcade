import test from "node:test";
import assert from "node:assert/strict";
import { computeEnsembleMetrics } from "./ensembleMetrics.js";

function model(rank, ca) {
  return {
    rank,
    model_id: `rank_${String(rank).padStart(3, "0")}`,
    frames: [{ label: "final", ca }],
  };
}

test("ensemble metrics ignore global translation and rotation", () => {
  const a = [[0, 0, 0], [1, 0, 0], [0, 1, 0]];
  const b = [[10, 5, -2], [10, 6, -2], [9, 5, -2]];
  const metrics = computeEnsembleMetrics([model(1, a), model(2, b)]);

  assert.equal(metrics.available, true);
  assert.equal(metrics.model_count, 2);
  assert.equal(metrics.max_pairwise_rmsd_a, 0);
  assert.equal(metrics.max_spread_a, 0);
});

test("ensemble metrics rank residues by aligned model disagreement", () => {
  const a = [[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]];
  const b = [[0, 0, 0], [1, 0, 0], [2, 2, 0], [3, 0, 0]];
  const c = [[0, 0, 0], [1, 0, 0], [2, -2, 0], [3, 0, 0]];
  const metrics = computeEnsembleMetrics([model(1, a), model(2, b), model(3, c)], { topK: 2 });

  assert.equal(metrics.available, true);
  assert.equal(metrics.top_spread_residues[0].residue, 3);
  assert.ok(metrics.top_spread_residues[0].spread_a > metrics.top_spread_residues[1].spread_a);
  assert.ok(metrics.max_pairwise_rmsd_a > 0);
});

test("ensemble metrics require at least two models with C-alpha traces", () => {
  const metrics = computeEnsembleMetrics([model(1, [])]);

  assert.equal(metrics.available, false);
  assert.match(metrics.reason, /at least two/);
});
