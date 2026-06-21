import test from "node:test";
import assert from "node:assert/strict";
import { trackballAnimateForLenses } from "./molstarTrackball.js";

test("explicit target spin includes the camera-space axis Mol* requires", () => {
  assert.deepEqual(trackballAnimateForLenses(["ipa"], true), {
    name: "spin",
    params: { speed: 0.18, axis: [0, -1, 0] },
  });
});

test("IPA lens alone does not force Mol* trackball animation", () => {
  assert.deepEqual(trackballAnimateForLenses(["ipa"]), { name: "off", params: {} });
});

test("non-spinning targets leave Mol* trackball animation off", () => {
  assert.deepEqual(trackballAnimateForLenses(["recycling"], false), { name: "off", params: {} });
});
