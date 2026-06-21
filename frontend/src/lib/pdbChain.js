export function filterPdbByChain(pdbText, chainId, options = {}) {
  const text = String(pdbText || "");
  const wanted = String(chainId || "").trim();
  if (!wanted) return text;

  const includeHetatm = options.includeHetatm === true;
  const lines = text.split(/\r?\n/);
  const out = [];
  let keptCoordinates = 0;

  for (const line of lines) {
    const record = line.slice(0, 6).trim();
    const atomLike = record === "ATOM" || record === "ANISOU" || record === "TER" || record === "HETATM";
    if (atomLike) {
      if (line[21] !== wanted) continue;
      if (record === "HETATM" && !includeHetatm) continue;
      out.push(line);
      if (record === "ATOM" || record === "HETATM") keptCoordinates += 1;
      continue;
    }

    if (record === "SEQRES") {
      if (line[11] === wanted) out.push(line);
      continue;
    }

    // CONECT records often refer to hetero atoms/cofactors that we intentionally
    // strip from protein-only previews; dangling bonds can confuse parsers.
    if (record === "CONECT") continue;

    out.push(line);
  }

  // If the requested chain is absent, fall back to the original PDB instead of
  // handing Mol* an empty structure.
  if (keptCoordinates === 0) return text;
  if (!out.some((line) => line.trim() === "END")) out.push("END");
  return out.join("\n");
}
