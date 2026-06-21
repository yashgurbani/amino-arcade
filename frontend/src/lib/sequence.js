export function cleanSequence(sequence) {
  return String(sequence || "").toUpperCase().replace(/[^A-Z]/g, "");
}

export function meanOf(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function minOf(values) {
  return values && values.length ? Math.min(...values) : 0;
}

export function maxOf(values) {
  return values && values.length ? Math.max(...values) : 0;
}

export function slug(value) {
  return String(value || "amino-arcade").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "amino-arcade";
}

export function pdbToCif(pdb, name = "amino_arcade_model") {
  const rows = String(pdb || "").split(/\r?\n/).filter((line) => line.startsWith("ATOM") || line.startsWith("HETATM"));
  const header = [
    `data_${slug(name).replace(/-/g, "_")}`,
    "#",
    "loop_",
    "_atom_site.group_PDB",
    "_atom_site.id",
    "_atom_site.type_symbol",
    "_atom_site.label_atom_id",
    "_atom_site.label_comp_id",
    "_atom_site.label_asym_id",
    "_atom_site.label_seq_id",
    "_atom_site.Cartn_x",
    "_atom_site.Cartn_y",
    "_atom_site.Cartn_z",
    "_atom_site.B_iso_or_equiv",
  ];
  const atoms = rows.map((line, index) => {
    const group = line.slice(0, 6).trim() || "ATOM";
    const atom = line.slice(12, 16).trim() || "?";
    const comp = line.slice(17, 20).trim() || "UNK";
    const chain = line.slice(21, 22).trim() || "A";
    const seq = Number.parseInt(line.slice(22, 26).trim(), 10) || index + 1;
    const x = Number.parseFloat(line.slice(30, 38).trim()) || 0;
    const y = Number.parseFloat(line.slice(38, 46).trim()) || 0;
    const z = Number.parseFloat(line.slice(46, 54).trim()) || 0;
    const b = Number.parseFloat(line.slice(60, 66).trim()) || 0;
    const element = (line.slice(76, 78).trim() || atom[0] || "C").toUpperCase();
    return `${group} ${index + 1} ${element} ${atom} ${comp} ${chain} ${seq} ${x.toFixed(3)} ${y.toFixed(3)} ${z.toFixed(3)} ${b.toFixed(2)}`;
  });
  return [...header, ...atoms, "#"].join("\n");
}

export function parsePdbAtoms(pdb) {
  return String(pdb || "").split(/\r?\n/).filter((line) => line.startsWith("ATOM") || line.startsWith("HETATM")).map((line, index) => ({
    atom_index: index + 1,
    atom_name: line.slice(12, 16).trim(),
    residue_name: line.slice(17, 20).trim(),
    chain_id: line.slice(21, 22).trim() || "A",
    residue_id: Number.parseInt(line.slice(22, 26).trim(), 10) || index + 1,
    plddt: Number.parseFloat(line.slice(60, 66).trim()) || null,
  }));
}
