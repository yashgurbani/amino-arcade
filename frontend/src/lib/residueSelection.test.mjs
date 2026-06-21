import test from "node:test";
import assert from "node:assert/strict";
import { describePaeSelection, nextViewerSelection, paeSelection, residueRefFromIndex, selectionResidueNumbers } from "./residueSelection.js";

test("residueRefFromIndex maps zero-based matrix indices to chain-aware residue refs", () => {
  assert.deepEqual(residueRefFromIndex(4, { chain: "B", length: 10, role: "partner" }), {
    chain: "B",
    resno: 5,
    index: 4,
    role: "partner",
  });
  assert.equal(residueRefFromIndex(99, { chain: "A", length: 10 }).resno, 10);
});

test("paeSelection records anchor and partner residues distinctly", () => {
  const selection = paeSelection(2, 8, { value: 12.345, chain: "A", length: 20 });
  assert.equal(selection.i, 2);
  assert.equal(selection.j, 8);
  assert.deepEqual(selectionResidueNumbers(selection), [3, 9]);
  assert.match(describePaeSelection(selection), /PAE\(3,9\)/);
  assert.match(describePaeSelection(selection), /12\.35 A/);
});

test("nextViewerSelection turns two residue clicks into a pair", () => {
  const first = nextViewerSelection(null, 7, { chain: "C", length: 30 });
  assert.equal(first.source, "viewer");
  assert.deepEqual(selectionResidueNumbers(first), [7]);
  const second = nextViewerSelection(first, 14, { chain: "C", length: 30 });
  assert.equal(second.i, 6);
  assert.equal(second.j, 13);
  assert.deepEqual(second.residues.map((ref) => `${ref.role}:${ref.chain}:${ref.resno}`), ["anchor:C:7", "partner:C:14"]);
});
