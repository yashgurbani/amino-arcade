import test from "node:test";
import assert from "node:assert/strict";
import { coevData, fapeData, ipaData, matInv, recycleShape, triangleMaxViolation } from "./lensMath.js";

test("matInv inverts a small positive matrix", () => {
  const inv = matInv([[2, 0], [0, 4]]);
  assert.equal(inv[0][0], 0.5);
  assert.equal(inv[1][1], 0.25);
});

test("coevolution toy data exposes planted contacts and an indirect trap", () => {
  const data = coevData();
  assert.equal(data.n, 6);
  assert.ok(data.isC(0, 2));
  assert.ok(Array.isArray(data.trap));
});

test("triangle scene detects impossible distances", () => {
  const D = [[0, 10, 2], [10, 0, 2], [2, 2, 0]];
  const max = triangleMaxViolation(D);
  assert.equal(max.v, 6);
  assert.deepEqual(max.tri, [0, 2, 1]);
});

test("IPA data is invariant under global transform", () => {
  const data = ipaData({ thetaG: 75 });
  assert.ok(data.residual < 1e-9);
  assert.ok(data.naiveShift > 0);
});

test("FAPE reflection increases local-frame error", () => {
  assert.equal(fapeData({ reflected: false }).fapeAligned, 0);
  assert.ok(fapeData({ reflected: true }).fape > 0);
});

test("recycle shape returns a stable 12-point trace", () => {
  assert.equal(recycleShape(0.5).length, 12);
});
