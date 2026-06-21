import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { kabsch, applyTransform, superpose, rmsd, kabschRmsd } from "./superpose.js";

const here = dirname(fileURLToPath(import.meta.url));

function rotZ(theta) {
  const c = Math.cos(theta), s = Math.sin(theta);
  return [[c, -s, 0], [s, c, 0], [0, 0, 1]];
}
function apply(R, p) {
  return [
    R[0][0] * p[0] + R[0][1] * p[1] + R[0][2] * p[2],
    R[1][0] * p[0] + R[1][1] * p[1] + R[1][2] * p[2],
    R[2][0] * p[0] + R[2][1] * p[1] + R[2][2] * p[2],
  ];
}
function randomStructure(n, seed) {
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff - 0.5; };
  const pts = [];
  let cur = [0, 0, 0];
  for (let i = 0; i < n; i += 1) {
    cur = [cur[0] + rnd() * 4, cur[1] + rnd() * 4, cur[2] + rnd() * 4];
    pts.push(cur.slice());
  }
  return pts;
}

test("kabsch recovers a pure rotation+translation (aligned RMSD ~ 0)", () => {
  const p = randomStructure(50, 7);
  const R = rotZ(0.9);
  const moved = p.map((q) => { const r = apply(R, q); return [r[0] + 12, r[1] - 4, r[2] + 7]; });
  assert.ok(rmsd(moved, p) > 5, "raw RMSD should be large (tumbling)");
  assert.ok(kabschRmsd(moved, p) < 1e-6, "aligned RMSD should vanish");
});

test("superpose then rmsd equals kabschRmsd", () => {
  const a = randomStructure(40, 3);
  const b = randomStructure(40, 9);
  assert.ok(Math.abs(rmsd(superpose(a, b), b) - kabschRmsd(a, b)) < 1e-9);
});

test("applyTransform composes with kabsch", () => {
  const a = randomStructure(30, 2);
  const b = randomStructure(30, 5);
  const t = kabsch(a, b);
  const aligned = applyTransform(a, t);
  assert.ok(rmsd(aligned, b) <= rmsd(a, b) + 1e-9, "alignment never increases RMSD");
});

test("reproduces the real GFP raw-vs-aligned RMSD gap", () => {
  const jobPath = resolve(here, "../../../prediction-cache/jobs/94e52501-0d98-40be-b21e-44f2bd377cf8.json");
  let data;
  try { data = JSON.parse(readFileSync(jobPath, "utf8")); } catch { return; }
  const frames = data.result.frames.map((f) => f.ca);
  const final = frames[frames.length - 1];
  // frame 0: large raw RMSD, much smaller after alignment (the "spin" illusion)
  const raw0 = rmsd(frames[0], final);
  const aln0 = kabschRmsd(frames[0], final);
  assert.ok(raw0 > 20, `expected raw RMSD>20, got ${raw0.toFixed(2)}`);
  assert.ok(aln0 < raw0 - 3, `expected alignment to remove >3A tumbling, raw=${raw0.toFixed(2)} aln=${aln0.toFixed(2)}`);
  // final aligns to itself at ~0
  assert.ok(kabschRmsd(final, final) < 1e-6);
});

import { transformPdb, superposePdbToReference } from "./superpose.js";

const SAMPLE_PDB = [
  "ATOM      1  N   MET A   1      10.000  10.000  10.000  1.00 50.00           N",
  "ATOM      2  CA  MET A   1      11.000  10.000  10.000  1.00 60.00           C",
  "ATOM      3  CA  GLY A   2      14.800  10.000  10.000  1.00 70.00           C",
  "END",
].join("\n");

test("transformPdb rewrites coordinates in fixed columns", () => {
  const id = { rotation: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], translation: [5, 0, 0] };
  const out = transformPdb(SAMPLE_PDB, id);
  assert.match(out.split("\n")[0], /15\.000/);
  assert.equal(out.split("\n")[0].length, SAMPLE_PDB.split("\n")[0].length);
  assert.equal(out.split("\n")[3], "END");
});

test("superposePdbToReference aligns onto a translated reference", () => {
  const refCa = [[1, 0, 0], [4.8, 0, 0]]; // same internal geometry, shifted frame
  const out = superposePdbToReference(SAMPLE_PDB, refCa);
  const cas = out.split("\n").filter((l) => l.slice(12, 16).trim() === "CA")
    .map((l) => [parseFloat(l.slice(30, 38)), parseFloat(l.slice(38, 46)), parseFloat(l.slice(46, 54))]);
  assert.ok(Math.hypot(cas[0][0] - 1, cas[0][1], cas[0][2]) < 1e-3);
  assert.ok(Math.hypot(cas[1][0] - 4.8, cas[1][1], cas[1][2]) < 1e-3);
});

test("superposePdbToReference is a no-op on shape mismatch", () => {
  assert.equal(superposePdbToReference(SAMPLE_PDB, [[0, 0, 0]]), SAMPLE_PDB);
});
