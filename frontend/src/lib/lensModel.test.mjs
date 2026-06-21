import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { lensMetrics, lensContactLines, lensHighlightResidues, lensResidueColors, computeLensModel, LENS_IDS } from "./lensModel.js";

const here = dirname(fileURLToPath(import.meta.url));

const entry = {
  recycle_index: 1,
  rmsd_to_reference_a: 10.53,
  rmsd_to_previous_a: 14.43,
  fape_to_reference_a: 6.2,
  mean_plddt: 25.2,
  delta_mean_plddt: -0.4,
  fraction_below_70: 0.97,
  geometry: { clashes: 3, bond_outliers: 1 },
  contact_delta_to_reference: { gained_count: 12, lost_count: 5, jaccard: 0.62, gained: [[4, 40], [10, 55]] },
};

test("lensMetrics emits real, non-placeholder strings for every lens", () => {
  const m = lensMetrics(entry);
  for (const id of LENS_IDS) assert.ok(typeof m[id] === "string" && m[id].length);
  assert.match(m.ipa, /aligned RMSD 10\.53 A/);
  assert.match(m.recycling, /14\.43 A/);
  assert.match(m.recycling, /-0\.40/);
  assert.match(m.coevolution, /12 gained/);
  assert.match(m.triangle, /3 clashes/);
  assert.doesNotMatch(m.ipa, /1e-12/); // the old synthetic value is gone
});

test("first recycle has no previous-frame delta", () => {
  const m = lensMetrics({ ...entry, rmsd_to_previous_a: null });
  assert.match(m.recycling, /first recycle/);
});

test("lensHighlightResidues picks contact endpoints for coevolution (1-based)", () => {
  const res = lensHighlightResidues(entry, { activeLenses: ["coevolution"] });
  assert.deepEqual(res, [5, 11, 41, 56]); // 0-based [4,40,10,55] -> +1
});

test("real GFP frame: contact lines + displacement coloring are computed", () => {
  const jobPath = resolve(here, "../../../prediction-cache/jobs/94e52501-0d98-40be-b21e-44f2bd377cf8.json");
  let data;
  try { data = JSON.parse(readFileSync(jobPath, "utf8")); } catch { return; }
  const frames = data.result.frames.map((f) => f.ca);
  const plddt = data.result.frames[0].plddt;
  const ref = frames[frames.length - 1];
  const lines = lensContactLines(frames[0], ref);
  assert.ok(lines.gained.length + lines.lost.length + lines.stable.length > 0, "found real contacts");
  const colors = lensResidueColors(entry, { ca: frames[0], referenceCa: ref, plddt, activeLenses: ["fape"] });
  assert.equal(colors.mode, "displacement");
  assert.equal(colors.values.length, ref.length);
  assert.ok(Math.max(...colors.values) > 1, "real displacement present");

  const model = computeLensModel({ entry, ca: frames[0], referenceCa: ref, plddt, activeLenses: ["coevolution", "fape"] });
  assert.ok(model.contactLines && model.residueColors && Array.isArray(model.highlightResidues));
});

test("confidence lens colors by pLDDT", () => {
  const colors = lensResidueColors(entry, { plddt: [10, 50, 90], activeLenses: ["confidence"] });
  assert.equal(colors.mode, "plddt");
  assert.deepEqual(colors.values, [10, 50, 90]);
});

test("explicit confidence mode overrides active structural lens gradients", () => {
  const colors = lensResidueColors(entry, {
    ca: [[0, 0, 0]],
    referenceCa: [[1, 0, 0]],
    plddt: [91],
    activeLenses: ["recycling", "confidence"],
  });
  assert.deepEqual(colors, { mode: "plddt", units: "pLDDT", values: [91] });
});

test("recycling lens exposes real aligned per-residue distance still to settle", () => {
  const ca = [[0, 0, 0], [1, 0, 0], [2, 0, 0]];
  const referenceCa = [[0, 0, 0], [1, 1, 0], [2, 0, 0]];
  const moving = lensResidueColors({ max_displacement_overall_a: 2 }, { ca, referenceCa, activeLenses: ["recycling"] });
  const settled = lensResidueColors({ max_displacement_overall_a: 2 }, { ca: referenceCa, referenceCa, activeLenses: ["recycling"] });
  assert.equal(moving.mode, "recycle");
  assert.equal(moving.maxValue, 2);
  assert.ok(Math.max(...moving.values) > 0);
  assert.deepEqual(settled.values, [0, 0, 0]);
});
