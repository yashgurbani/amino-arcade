import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const manifestUrl = new URL("../../public/demo-cache/manifest.json", import.meta.url);

test("demo cache result URLs resolve under the Vite base path", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));

  assert.ok(manifest.results.length > 0);
  for (const result of manifest.results) {
    assert.match(result.url, /^demo-cache\/.+\.json$/);
  }
});
