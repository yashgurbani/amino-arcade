import test from "node:test";
import assert from "node:assert/strict";
import { colorForPlddt, groupResidueColors, residueColorLegend } from "./lensColors.js";

test("pLDDT uses the documented AlphaFold-style confidence bands", () => {
  assert.equal(colorForPlddt(95), "#1f6feb");
  assert.equal(colorForPlddt(75), "#25c7d9");
  assert.equal(colorForPlddt(55), "#f4e409");
  assert.equal(colorForPlddt(25), "#f28c28");
});

test("displacement colors retain 1-based residue identity and bounded layer count", () => {
  const groups = groupResidueColors({ mode: "displacement", units: "A", values: [0, 1, 2, 3, 4, 5] }, { bins: 3 });
  assert.ok(groups.length <= 3);
  assert.deepEqual(groups.flatMap((group) => group.residues).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);
});

test("displacement legend reports the real unamplified Angstrom range", () => {
  assert.deepEqual(residueColorLegend({ mode: "displacement", units: "A", values: [0, 1.234, 3.456] }), {
    title: "Cα displacement to final (aligned)",
    min: "0 Å",
    max: "3.46 Å",
    lowColor: "#3dffa8",
    highColor: "#ff4d6d",
  });
});

test("displacement colors can use a trajectory-wide maximum for cross-frame comparability", () => {
  const frameA = groupResidueColors({ mode: "displacement", units: "A", values: [2], maxValue: 4 }, { bins: 5 });
  const frameB = groupResidueColors({ mode: "displacement", units: "A", values: [2, 4], maxValue: 4 }, { bins: 5 });
  assert.equal(frameA[0].color, frameB.find((group) => group.residues.includes(1)).color);
});

test("unsupported or empty channels do not create misleading overlays", () => {
  assert.deepEqual(groupResidueColors(null), []);
  assert.deepEqual(groupResidueColors({ mode: "unknown", values: [1] }), []);
  assert.equal(residueColorLegend({ mode: "unknown", values: [1] }), null);
});
