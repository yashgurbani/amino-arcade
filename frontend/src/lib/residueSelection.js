export function residueRefFromIndex(index, { chain = "A", length = 0, role = "" } = {}) {
  const n = Number.isFinite(length) && length > 0 ? Math.floor(length) : 0;
  const raw = Number.isFinite(index) ? Math.floor(index) : 0;
  const clamped = n ? Math.max(0, Math.min(n - 1, raw)) : Math.max(0, raw);
  return {
    chain: chain || "A",
    resno: clamped + 1,
    index: clamped,
    role,
  };
}

export function paeSelection(i, j, { value = null, source = "pae", chain = "A", length = 0 } = {}) {
  const anchor = residueRefFromIndex(i, { chain, length, role: "anchor" });
  const partner = residueRefFromIndex(j, { chain, length, role: "partner" });
  return {
    i: anchor.index,
    j: partner.index,
    value,
    source,
    residues: [anchor, partner],
  };
}

export function selectionResidueNumbers(selection) {
  if (!selection) return [];
  const refs = Array.isArray(selection.residues)
    ? selection.residues
    : [selection.i, selection.j].filter((value) => Number.isFinite(value)).map((index, roleIndex) => residueRefFromIndex(index, { role: roleIndex ? "partner" : "anchor" }));
  return [...new Set(refs.map((ref) => ref.resno).filter((value) => Number.isFinite(value) && value > 0))];
}

export function nextViewerSelection(previous, resno, { chain = "A", length = 0 } = {}) {
  const current = residueRefFromIndex((Number(resno) || 1) - 1, { chain, length, role: "anchor" });
  const prevRefs = previous?.source === "viewer" && Array.isArray(previous.residues) ? previous.residues : [];
  if (prevRefs.length === 1 && prevRefs[0].resno !== current.resno) {
    return paeSelection(prevRefs[0].resno - 1, current.resno - 1, { source: "viewer", chain, length });
  }
  return {
    i: current.index,
    j: current.index,
    value: null,
    source: "viewer",
    residues: [current],
  };
}

export function describePaeSelection(selection) {
  if (!selection) return "";
  const refs = Array.isArray(selection.residues) ? selection.residues : [];
  const anchor = refs.find((ref) => ref.role === "anchor") || refs[0];
  const partner = refs.find((ref) => ref.role === "partner") || refs[1] || refs[0];
  if (!anchor || !partner) return "";
  const pair = `${anchor.chain}:${anchor.resno} -> ${partner.chain}:${partner.resno}`;
  return Number.isFinite(selection.value)
    ? `PAE(${anchor.resno},${partner.resno}): expected error in residue ${partner.resno}'s position when aligned on residue ${anchor.resno} = ${Number(selection.value).toFixed(2)} A`
    : pair;
}
