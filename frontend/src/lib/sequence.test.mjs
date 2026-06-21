import test from "node:test";
import assert from "node:assert/strict";
import { cleanSequence, maxOf, meanOf, minOf, parsePdbAtoms, pdbToCif, slug } from "./sequence.js";

const pdb = `HEADER    TEST
ATOM      1  CA  GLY A   7       1.250   2.500   3.750  1.00 88.50           C
HETATM    2  O   HOH B   8       4.000   5.000   6.000  1.00 12.00           O
END`;

test("cleanSequence keeps uppercase amino-acid-like letters only", () => {
  assert.equal(cleanSequence(" acd-ef\n123 "), "ACDEF");
});

test("numeric summaries degrade gracefully", () => {
  assert.equal(meanOf([1, 2, 3]), 2);
  assert.equal(meanOf([]), 0);
  assert.equal(minOf([4, -1, 2]), -1);
  assert.equal(minOf([]), 0);
  assert.equal(maxOf([4, -1, 2]), 4);
  assert.equal(maxOf(null), 0);
});

test("slug creates stable filesystem-friendly names", () => {
  assert.equal(slug("Amino Arcade: GFP!"), "amino-arcade-gfp");
  assert.equal(slug("!!!"), "amino-arcade");
});

test("pdbToCif converts atom rows and normalizes data block", () => {
  const cif = pdbToCif(pdb, "GFP run");
  assert.match(cif, /^data_gfp_run/);
  assert.match(cif, /ATOM 1 C CA GLY A 7 1\.250 2\.500 3\.750 88\.50/);
  assert.match(cif, /HETATM 2 O O HOH B 8 4\.000 5\.000 6\.000 12\.00/);
});

test("parsePdbAtoms returns compact metadata without coordinates", () => {
  const atoms = parsePdbAtoms(pdb);
  assert.deepEqual(atoms[0], {
    atom_index: 1,
    atom_name: "CA",
    residue_name: "GLY",
    chain_id: "A",
    residue_id: 7,
    plddt: 88.5,
  });
});
