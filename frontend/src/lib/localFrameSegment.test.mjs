import test from "node:test";
import assert from "node:assert/strict";
import { localFrameSegmentForLength } from "./localFrameSegment.js";

test("local-frame IPA segment is contiguous and includes the picked myoglobin patch", () => {
  assert.deepEqual(localFrameSegmentForLength(153), [69, 70, 71, 72, 73, 74]);
});

test("local-frame IPA segment stays bounded for short proteins", () => {
  assert.deepEqual(localFrameSegmentForLength(3), [1, 2, 3]);
});
