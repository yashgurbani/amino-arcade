import test from "node:test";
import assert from "node:assert/strict";
import { arcadeTargets, GFP_SEQ, AMY_SEQ, CA2_SEQ, TIM_SEQ } from "./targets.js";

test("arcadeTargets exports six curated targets with unique ids", () => {
  const targets = arcadeTargets();
  assert.equal(targets.length, 6);
  assert.equal(new Set(targets.map((target) => target.n)).size, 6);
  assert.ok(targets.every((t) => t.seq && t.pdb && t.concept && t.msaMode && t.expectation));
});

test("every target carries a non-empty notice (what-to-watch line)", () => {
  assert.ok(arcadeTargets().every((t) => typeof t.notice === "string" && t.notice.length > 0));
});

test("ordering is success-first: first target is a success, GFP lesson is last", () => {
  const targets = arcadeTargets();
  assert.equal(targets[0].expectation, "success");
  assert.equal(targets[targets.length - 1].name, "GFP");
});

test("GFP remains the explicit single-sequence lesson target", () => {
  const gfp = arcadeTargets().find((t) => t.name === "GFP");
  assert.equal(gfp.seq, GFP_SEQ);
  assert.equal(gfp.msaMode, "single_sequence");
  assert.equal(gfp.expectation, "lesson");
});

test("recycling lens uses the measured Goldilocks winner", () => {
  const recycling = arcadeTargets().find((t) => t.concept === "recycling");
  assert.equal(recycling.name, "Triosephosphate isomerase");
  assert.equal(recycling.seq, TIM_SEQ);
  assert.equal(recycling.pdb, "1HTI");
});

test("new coevolution/FAPE swaps fold within the 768-residue bound", () => {
  const targets = arcadeTargets();
  const amylase = targets.find((t) => t.seq === AMY_SEQ);
  const ca = targets.find((t) => t.seq === CA2_SEQ);
  assert.equal(amylase.concept, "coevolution");
  assert.equal(ca.concept, "fape");
  assert.equal(amylase.seq.length, 496);
  assert.equal(ca.seq.length, 260);
});
