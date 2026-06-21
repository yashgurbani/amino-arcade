import test from "node:test";
import assert from "node:assert/strict";
import { arcadeTargets, libraryTargets, GFP_SEQ, AMY_SEQ, CA2_SEQ, PGK_SEQ, ADK_SEQ, LYZ_SEQ, CAM_SEQ, RAS_SEQ, UBQ_SEQ, VIL_SEQ, TIM_SEQ, SYN_SEQ, PRP_SEQ, P53_SEQ, HIV_SEQ } from "./targets.js";

test("arcadeTargets exports six curated targets with unique ids", () => {
  const targets = arcadeTargets();
  assert.equal(targets.length, 6);
  assert.equal(new Set(targets.map((target) => target.n)).size, 6);
  assert.ok(targets.every((t) => t.seq && t.pdb && t.pdbChain && t.concept && t.msaMode && t.expectation));
  assert.ok(targets.every((t) => t.predictionScope && t.omittedContext));
});

test("every target carries a non-empty notice (what-to-watch line)", () => {
  assert.ok(arcadeTargets().every((t) => typeof t.notice === "string" && t.notice.length > 0));
});

test("targets are ordered top-to-bottom by the live-lens sequence", () => {
  const order = arcadeTargets().map((t) => t.concept);
  assert.deepEqual(order, ["coevolution", "triangle", "ipa", "fape", "recycling", "all"]);
});

test("GFP remains the explicit single-sequence lesson target", () => {
  const gfp = arcadeTargets().find((t) => t.name === "GFP");
  assert.equal(gfp.seq, GFP_SEQ);
  assert.equal(gfp.msaMode, "single_sequence");
  assert.equal(gfp.expectation, "lesson");
});

test("recycling lens uses the measured Goldilocks winner", () => {
  const recycling = arcadeTargets().find((t) => t.concept === "recycling");
  assert.equal(recycling.name, "Phosphoglycerate kinase");
  assert.equal(recycling.seq, PGK_SEQ);
  assert.equal(recycling.pdb, "3PGK");
  assert.match(recycling.notice, /intentionally subsampled to 16:32/i);
});

test("all-lenses target is a chain-scoped kinase, not a multimer/cofactor preview", () => {
  const all = arcadeTargets().find((t) => t.concept === "all");
  assert.equal(all.name, "Adenylate kinase");
  assert.equal(all.seq, ADK_SEQ);
  assert.equal(all.seq.length, 214);
  assert.equal(all.pdb, "4AKE");
  assert.equal(all.pdbChain, "A");
  assert.match(all.omittedContext, /chain B/i);
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

test("libraryTargets are preview-first references with full metadata", () => {
  const lib = libraryTargets();
  assert.equal(lib.length, 10);
  assert.equal(new Set(lib.map((t) => t.n)).size, 10);
  assert.ok(lib.every((t) => t.library === true));
  assert.ok(lib.every((t) => t.seq && t.pdb && t.pdbChain && t.predictionScope && t.omittedContext && t.notice && t.blurb && t.learningOutcome));
});

test("libraryTargets reuse existing lens concepts so overlays/colors resolve", () => {
  const lensConcepts = new Set(["coevolution", "triangle", "ipa", "fape", "recycling"]);
  assert.ok(libraryTargets().every((t) => lensConcepts.has(t.concept)));
});

test("library sequences match verified RCSB chain-A lengths", () => {
  const byPdb = Object.fromEntries(libraryTargets().map((t) => [t.pdb, t]));
  assert.equal(byPdb["1LYZ"].seq, LYZ_SEQ);
  assert.equal(byPdb["1LYZ"].seq.length, 129);
  assert.equal(byPdb["1CLL"].seq, CAM_SEQ);
  assert.equal(byPdb["1CLL"].seq.length, 148);
  assert.equal(byPdb["5P21"].seq, RAS_SEQ);
  assert.equal(byPdb["5P21"].seq.length, 166);
  assert.equal(byPdb["1UBQ"].seq, UBQ_SEQ);
  assert.equal(byPdb["1UBQ"].seq.length, 76);
  assert.equal(byPdb["1VII"].seq, VIL_SEQ);
  assert.equal(byPdb["1VII"].seq.length, 36);
  assert.equal(byPdb["1TIM"].seq, TIM_SEQ);
  assert.equal(byPdb["1TIM"].seq.length, 247);
  assert.equal(byPdb["1XQ8"].seq, SYN_SEQ);
  assert.equal(byPdb["1XQ8"].seq.length, 140);
  assert.equal(byPdb["1QLX"].seq, PRP_SEQ);
  assert.equal(byPdb["1QLX"].seq.length, 210);
  assert.equal(byPdb["1TUP"].seq, P53_SEQ);
  assert.equal(byPdb["1TUP"].seq.length, 219);
  assert.equal(byPdb["1HSG"].seq, HIV_SEQ);
  assert.equal(byPdb["1HSG"].seq.length, 99);
});

test("curated set is unchanged at six targets despite the library", () => {
  assert.equal(arcadeTargets().length, 6);
});
