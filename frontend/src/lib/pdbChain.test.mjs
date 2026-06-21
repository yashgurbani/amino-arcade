import test from "node:test";
import assert from "node:assert/strict";
import { filterPdbByChain } from "./pdbChain.js";

const sample = [
  "HEADER    TEST",
  "SEQRES   1 A    2  ALA GLY",
  "SEQRES   1 B    2  SER THR",
  "ATOM      1  CA  ALA A   1      11.000  12.000  13.000  1.00 10.00           C",
  "HETATM    2 FE   HEM A 201      14.000  15.000  16.000  1.00 10.00          FE",
  "TER       3      ALA A   1",
  "ATOM      4  CA  SER B   1      21.000  22.000  23.000  1.00 10.00           C",
  "HETATM    5 FE   HEM B 201      24.000  25.000  26.000  1.00 10.00          FE",
  "CONECT    2    1",
  "END",
].join("\n");

test("filterPdbByChain keeps only the requested protein chain and strips cofactors by default", () => {
  const filtered = filterPdbByChain(sample, "A");
  assert.match(filtered, /HEADER/);
  assert.match(filtered, /SEQRES   1 A/);
  assert.match(filtered, /ATOM\s+1\s+CA\s+ALA A/);
  assert.match(filtered, /TER\s+3\s+ALA A/);
  assert.doesNotMatch(filtered, /SEQRES   1 B/);
  assert.doesNotMatch(filtered, /SER B/);
  assert.doesNotMatch(filtered, /HETATM/);
  assert.doesNotMatch(filtered, /CONECT/);
});

test("filterPdbByChain can preserve same-chain hetero atoms when explicitly requested", () => {
  const filtered = filterPdbByChain(sample, "A", { includeHetatm: true });
  assert.match(filtered, /HETATM\s+2 FE\s+HEM A/);
  assert.doesNotMatch(filtered, /HEM B/);
});

test("filterPdbByChain falls back to original text when the chain is absent", () => {
  assert.equal(filterPdbByChain(sample, "Z"), sample);
});
