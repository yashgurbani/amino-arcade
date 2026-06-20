import test from "node:test";
import assert from "node:assert/strict";
import { arcadeTargets, COL_SEQ, GFP_SEQ } from "./targets.js";

test("arcadeTargets exports six curated targets with unique ids", () => {
  const targets = arcadeTargets();
  assert.equal(targets.length, 6);
  assert.equal(new Set(targets.map((target) => target.n)).size, 6);
  assert.ok(targets.every((target) => target.seq && target.pdb && target.concept && target.msaMode && target.expectation));
});

test("GFP remains the explicit single-sequence lesson target", () => {
  const gfp = arcadeTargets().find((target) => target.name === "GFP");
  assert.equal(gfp.seq, GFP_SEQ);
  assert.equal(gfp.msaMode, "single_sequence");
  assert.equal(gfp.expectation, "lesson");
});

test("large collagen-like target preserves the raised-limit teaching sequence", () => {
  const collagen = arcadeTargets().find((target) => target.name === "Collagen-like chain");
  assert.equal(collagen.seq, COL_SEQ);
  assert.equal(collagen.seq.length, 768);
  assert.equal(collagen.msaMode, "single_sequence");
  assert.equal(collagen.expectation, "lesson");
});
