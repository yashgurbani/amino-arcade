import test from "node:test";
import assert from "node:assert/strict";
import {
  exportWatermarkContext,
  withCifExportWatermark,
  withJsonExportWatermark,
  withPdbExportWatermark,
} from "./exportMetadata.js";

test("exportWatermarkContext preserves the recycle honesty warning", () => {
  const context = exportWatermarkContext({
    sequence: "ACDE",
    engine: "localcolabfold",
    model: { rank: 2, model_id: "rank_002", seed: 7 },
    frameLabel: "Recycle 4",
  });

  assert.equal(context.sequence_length, 4);
  assert.equal(context.engine, "localcolabfold");
  assert.equal(context.selected_model.rank, 2);
  assert.equal(context.frame, "Recycle 4");
  assert.equal(context.not_a_physical_folding_pathway, true);
  assert.match(context.text, /not a physical folding pathway/i);
});

test("JSON exports add machine-readable watermark metadata without dropping payload", () => {
  const exported = withJsonExportWatermark({ pae: [[0, 1]] }, { engine: "educational-simulator" });

  assert.deepEqual(exported.pae, [[0, 1]]);
  assert.equal(exported.export_watermark.engine, "educational-simulator");
  assert.equal(exported.export_watermark.research_and_education_only, true);
});

test("structure exports add visible REMARK/comment watermarks", () => {
  const pdb = withPdbExportWatermark("ATOM      1  CA  ALA A   1      0.000   0.000   0.000", {
    engine: "localcolabfold",
    frameLabel: "final",
  });
  const cif = withCifExportWatermark("data_model\n#", { engine: "localcolabfold", frameLabel: "final" });

  assert.match(pdb, /^REMARK 950 Amino Arcade/);
  assert.match(pdb, /Not a physical folding pathway/);
  assert.match(cif, /^# Export watermark: Amino Arcade/);
  assert.match(cif, /Engine: localcolabfold; frame: final/);
});
