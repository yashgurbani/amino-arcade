// Shared viewer/style helpers used by App and MolPlayfield.
// Extracted from App.jsx during the component split (no behavior change).

// LRU cache for parsed style objects — eliminates repeated string parsing
// in render(). The cache holds up to 600 entries; styles are immutable so
// returning the same object is safe and lets React skip style diffing.
const _stCache = new Map();
const _ST_MAX = 600;

function st(str) {
  const cached = _stCache.get(str);
  if (cached !== undefined) return cached;

  const out = {};
  String(str)
    .split(";")
    .forEach((rule) => {
      const i = rule.indexOf(":");
      if (i < 0) return;
      let k = rule.slice(0, i).trim();
      const v = rule.slice(i + 1).trim();
      if (!k || v === "") return;
      if (!k.startsWith("--")) k = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      out[k] = v;
    });

  if (_stCache.size >= _ST_MAX) _stCache.clear();
  _stCache.set(str, out);
  return out;
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
}

function fallbackPdb(sequence = "ACDEFGHIKLMNPQRSTVWY", label = "AMINO ARCADE FALLBACK") {
  const seq = String(sequence || "ACDEFGHIKLMNPQRSTVWY").replace(/[^A-Z]/g, "") || "ACDEFGHIKLMNPQRSTVWY";
  const aa3 = { A: "ALA", C: "CYS", D: "ASP", E: "GLU", F: "PHE", G: "GLY", H: "HIS", I: "ILE", K: "LYS", L: "LEU", M: "MET", N: "ASN", P: "PRO", Q: "GLN", R: "ARG", S: "SER", T: "THR", V: "VAL", W: "TRP", Y: "TYR" };
  const lines = [`HEADER    ${label}`];
  let atom = 1;
  for (let i = 0; i < Math.min(seq.length, 80); i += 1) {
    const residue = aa3[seq[i]] || "GLY";
    const turn = i * 0.72;
    const layer = Math.floor(i / 18);
    const x = Math.cos(turn) * (7.5 + layer * 1.2) + Math.sin(i * 0.19) * 1.8;
    const y = Math.sin(turn) * (6.2 + layer * 0.9) + (layer - 1.5) * 4.2;
    const z = (i % 18) * 0.72 - 6.2 + Math.sin(i * 0.41) * 1.5;
    [["N", x - 1.2, y, z], ["CA", x, y + 0.6, z], ["C", x + 1.4, y, z + 0.2], ["O", x + 2.1, y - 0.8, z + 0.3]].forEach(([name, ax, ay, az]) => {
      const b = Math.max(35, 90 - i * 0.45);
      lines.push(`ATOM  ${String(atom).padStart(5)} ${String(name).padEnd(4)} ${residue} A${String(i + 1).padStart(4)}    ${ax.toFixed(3).padStart(8)}${ay.toFixed(3).padStart(8)}${az.toFixed(3).padStart(8)}  1.00${b.toFixed(2).padStart(6)}           ${name[0]}`);
      atom += 1;
    });
  }
  lines.push("TER", "END");
  return lines.join("\n");
}

export { st, withTimeout, fallbackPdb };
