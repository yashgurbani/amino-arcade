import { truthLabels } from "./truthLabels.js";

function cleanLine(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function exportWatermarkContext({ sequence, engine, model, frameLabel } = {}) {
  return {
    text: truthLabels.exportWatermarkRecycle,
    sequence_length: cleanLine(sequence).length || null,
    engine: cleanLine(engine) || null,
    selected_model: model
      ? {
          rank: model.rank ?? null,
          model_id: model.model_id ?? null,
          seed: model.seed ?? null,
        }
      : null,
    frame: cleanLine(frameLabel) || null,
    not_a_physical_folding_pathway: true,
    research_and_education_only: true,
  };
}

export function withJsonExportWatermark(payload, context = {}) {
  return {
    export_watermark: exportWatermarkContext(context),
    ...payload,
  };
}

export function withPdbExportWatermark(pdb, context = {}) {
  const watermark = exportWatermarkContext(context);
  const lines = [
    `REMARK 950 ${watermark.text}`,
    `REMARK 950 Engine: ${watermark.engine || "unknown"}; frame: ${watermark.frame || "unknown"}`,
    "REMARK 950 Research/education only. Not a physical folding pathway.",
  ];
  const body = String(pdb || "").replace(/^\s+/, "");
  return `${lines.join("\n")}\n${body}`;
}

export function withCifExportWatermark(cif, context = {}) {
  const watermark = exportWatermarkContext(context);
  const lines = [
    `# Export watermark: ${watermark.text}`,
    `# Engine: ${watermark.engine || "unknown"}; frame: ${watermark.frame || "unknown"}`,
    "# Research/education only. Not a physical folding pathway.",
  ];
  const body = String(cif || "").replace(/^\s+/, "");
  return `${lines.join("\n")}\n${body}`;
}
