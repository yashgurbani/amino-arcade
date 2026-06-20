import test from "node:test";
import assert from "node:assert/strict";
import { contactPairs, contactDelta, contactKey, parseKey } from "./contactMap.js";

test("contactPairs respects threshold and min sequence separation", () => {
  // a straight line spaced 4A apart: only residues >=2 apart AND <=8A contact,
  // but minSep filters out the near-in-sequence ones.
  const ca = Array.from({ length: 10 }, (_, i) => [i * 4, 0, 0]);
  const pairs = contactPairs(ca, 8, 6);
  for (const k of pairs) {
    const [i, j] = parseKey(k);
    assert.ok(j - i >= 6, "respects min sequence separation");
  }
});

test("contactPairs finds a long-range contact", () => {
  const ca = Array.from({ length: 20 }, (_, i) => [i * 4, 0, 0]);
  ca[19] = [4, 0, 0]; // fold residue 19 back next to residue 1
  const pairs = contactPairs(ca, 8, 6);
  assert.ok(pairs.has(contactKey(1, 19)));
});

test("contactDelta self is perfect", () => {
  const ca = Array.from({ length: 20 }, (_, i) => [Math.sin(i), Math.cos(i), i * 0.5]);
  const c = contactPairs(ca);
  const d = contactDelta(c, c);
  assert.equal(d.jaccard, 1);
  assert.equal(d.gained.length, 0);
  assert.equal(d.lost.length, 0);
});

test("contactDelta classifies gained and lost", () => {
  const a = new Set(["1-10", "2-11"]);
  const b = new Set(["2-11", "3-12"]);
  const d = contactDelta(a, b);
  assert.deepEqual(d.gained.sort(), ["1-10"]);
  assert.deepEqual(d.lost.sort(), ["3-12"]);
  assert.deepEqual(d.stable.sort(), ["2-11"]);
  assert.equal(d.jaccard, Number((1 / 3).toFixed(4)));
});
