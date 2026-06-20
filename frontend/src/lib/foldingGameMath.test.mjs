import test from "node:test";
import assert from "node:assert/strict";

import { buildTeachingTrajectory, evaluateMissions, scoreFrame, summarizePlddt } from "./foldingGameMath.js";

test("teaching trajectory exposes computed observables for every frame", () => {
  const frames = buildTeachingTrajectory("MGEELFTGVVPILVELDGDVNGHK");
  assert.equal(frames.length, 9);
  for (const frame of frames) {
    assert.ok(frame.observables.covariance.matrix.length > 0);
    assert.equal(typeof frame.observables.triangleViolation, "number");
    assert.equal(typeof frame.observables.ipaInvariantError, "number");
    assert.equal(typeof frame.observables.fape, "number");
    assert.equal(typeof frame.observables.recycleDelta, "number");
  }
});

test("mission progress improves without break-it perturbations", () => {
  const frames = buildTeachingTrajectory("MGEELFTGVVPILVELDGDVNGHK");
  const first = evaluateMissions(frames[0]);
  const last = evaluateMissions(frames.at(-1));
  assert.ok(last.triangle >= first.triangle);
  assert.ok(last.recycling > first.recycling);
  assert.ok(scoreFrame(frames.at(-1)) > scoreFrame(frames[0]));
});

test("break-it perturbations visibly degrade their target objective", () => {
  const normal = buildTeachingTrajectory("MGEELFTGVVPILVELDGDVNGHK").at(-1);
  const brokenTriangle = buildTeachingTrajectory("MGEELFTGVVPILVELDGDVNGHK", { disableTriangle: true }).at(-1);
  const reflected = buildTeachingTrajectory("MGEELFTGVVPILVELDGDVNGHK", { forceReflection: true }).at(-1);
  assert.ok(evaluateMissions(brokenTriangle).triangle < evaluateMissions(normal).triangle);
  assert.ok(evaluateMissions(reflected).fape < evaluateMissions(normal).fape);
});

test("pLDDT summary distinguishes confidence bands", () => {
  const summary = summarizePlddt([95, 88, 72, 61, 45]);
  assert.equal(summary.mean, 72.2);
  assert.equal(summary.high, 1);
  assert.equal(summary.confident, 2);
  assert.equal(summary.low, 2);
});
