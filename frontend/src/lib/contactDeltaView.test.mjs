import test from "node:test";
import assert from "node:assert/strict";
import { contactDeltaCounts, contactDeltaExtent, normalizeContactLines, visibleContactDeltaCells } from "./contactDeltaView.js";

test("normalizeContactLines accepts arrays and keys, deduping per bucket", () => {
  const lines = normalizeContactLines({
    gained: [[10, 2], "2-10", [4, 9]],
    lost: [[3, 12], [12, 3], [1, 1], [-1, 5]],
    stable: ["6-20"],
  });
  assert.deepEqual(lines.gained, [[2, 10], [4, 9]]);
  assert.deepEqual(lines.lost, [[3, 12]]);
  assert.deepEqual(lines.stable, [[6, 20]]);
});

test("contactDeltaCounts exposes gained/lost/stable and total different", () => {
  const counts = contactDeltaCounts({ gained: [[1, 9], [2, 12]], lost: [[4, 14]], stable: [[6, 18]] });
  assert.deepEqual(counts, { gained: 2, lost: 1, stable: 1, different: 3 });
});

test("visibleContactDeltaCells caps stable contacts but keeps changed contacts", () => {
  const cells = visibleContactDeltaCells({
    stable: [[1, 8], [2, 9], [3, 10]],
    gained: [[4, 11]],
    lost: [[5, 12]],
  }, { stableLimit: 1 });
  assert.deepEqual(cells.map((cell) => cell.kind), ["stable", "gained", "lost"]);
  assert.deepEqual(cells.map((cell) => cell.pair), [[1, 8], [4, 11], [5, 12]]);
});

test("contactDeltaExtent falls back to sequence length and expands for visible pairs", () => {
  assert.equal(contactDeltaExtent(null, 42), 42);
  assert.equal(contactDeltaExtent({ gained: [[2, 50]] }, 20), 51);
});
