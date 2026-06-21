import test from "node:test";
import assert from "node:assert/strict";

import {
  coevolutionMatrices,
  fapeState,
  ipaState,
  parsePdbAtoms,
  recyclingFrames,
  trianglePoints,
} from "./conceptMath.js";
import { sceneSpecs } from "../data/sceneSpecs.js";
import { equationDeck, glossary } from "../data/paperGrounding.js";

test("scene specs cover the planned companion modules", () => {
  assert.deepEqual(
    sceneSpecs.map((spec) => spec.id),
    ["coevolution", "triangle", "ipa", "fape", "recycling", "results"]
  );
  for (const spec of sceneSpecs) {
    assert.ok(spec.controls.length > 0);
    assert.ok(spec.derivedValues.length > 0);
    assert.equal(spec.camera.mode, "svg-projection");
    assert.ok(spec.references.paper);
    assert.ok(spec.references.supplement);
    assert.ok(spec.references.companion);
  }
});

test("paper guide has glossary and equation grounding", () => {
  assert.ok(glossary.some((item) => item.term === "FAPE"));
  assert.ok(glossary.some((item) => item.term === "pLDDT"));
  assert.ok(equationDeck.some((item) => item.label === "Inverse Potts"));
});

test("coevolution matrices expose covariance and direct coupling views", () => {
  const matrices = coevolutionMatrices(0.5);
  assert.equal(matrices.covariance.length, 6);
  assert.equal(matrices.partial.length, 6);
  assert.equal(matrices.contacts.has("0-1"), true);
  assert.equal(matrices.indirect.length, 2);
});

test("triangle scene detects impossible distances", () => {
  assert.equal(trianglePoints(3, 4, 5).realizable, true);
  const impossible = trianglePoints(1, 6, 1);
  assert.equal(impossible.realizable, false);
  assert.ok(impossible.violation > 0);
});

test("IPA global transform preserves query-key distance", () => {
  const a = ipaState({ globalRotation: 0, tx: 0, ty: 0, relativePose: 0.6 });
  const b = ipaState({ globalRotation: 1.4, tx: 1.2, ty: -0.9, relativePose: 0.6 });
  assert.ok(Math.abs(a.invariantDistance - b.displayedDistance) < 1e-9);
});

test("FAPE reflection increases local-frame error", () => {
  const normal = fapeState(false, 0.2);
  const reflected = fapeState(true, 0.2);
  assert.ok(reflected.meanError > normal.meanError);
});

test("recycling frames increase confidence over steps", () => {
  const frames = recyclingFrames(6, true);
  assert.ok(frames.at(-1).confidence > frames[0].confidence);
  assert.ok(frames.at(-1).violation < frames[0].violation);
});

test("PDB parser reads backbone atoms and confidence", () => {
  const atoms = parsePdbAtoms(
    "ATOM      1  CA  ALA A   1       1.000   2.000   3.000  1.00 88.50           C\nEND\n"
  );
  assert.equal(atoms.length, 1);
  assert.equal(atoms[0].atom, "CA");
  assert.equal(atoms[0].plddt, 88.5);
});
