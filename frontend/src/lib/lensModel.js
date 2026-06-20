// The "brain" of the live lens system.
//
// Given a single recycle frame's real analysis (+ coordinates, pLDDT, PAE) it
// produces (a) honest per-lens metric strings and (b) overlay descriptors the
// Mol* viewer renders. This REPLACES the synthetic placeholders that used to
// live in App.jsx.
//
// Everything here is derived from coordinates LocalColabFold actually produced.
// See HANDOFF_PEDAGOGY_AND_LENSES.md, Part 2.

import { superpose } from "./superpose.js";
import { contactPairs, contactDelta, parseKey } from "./contactMap.js";
import { fmtA, fmtDelta, fmtPct } from "./recycleMetrics.js";

export const LENS_IDS = ["coevolution", "triangle", "ipa", "fape", "recycling", "confidence"];

function perResidueDisplacement(ca, referenceCa) {
  if (!Array.isArray(ca) || !Array.isArray(referenceCa) || ca.length !== referenceCa.length || !ca.length) {
    return null;
  }
  const aligned = superpose(ca, referenceCa);
  return aligned.map((p, i) => {
    const dx = p[0] - referenceCa[i][0];
    const dy = p[1] - referenceCa[i][1];
    const dz = p[2] - referenceCa[i][2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  });
}

// Real per-lens metric strings. `entry` is one element of result.analysis.frames.
export function lensMetrics(entry) {
  if (!entry) {
    return Object.fromEntries(LENS_IDS.map((id) => [id, "--"]));
  }
  const ref = entry.contact_delta_to_reference || {};
  const geom = entry.geometry || {};
  return {
    coevolution: `${ref.gained_count ?? 0} gained / ${ref.lost_count ?? 0} lost vs final · J=${ref.jaccard ?? "--"}`,
    triangle: `${geom.clashes ?? 0} clashes · ${geom.bond_outliers ?? 0} bond outliers`,
    ipa: `aligned RMSD ${fmtA(entry.rmsd_to_reference_a)} (global pose removed)`,
    fape: `Cα-FAPE ${fmtA(entry.fape_to_reference_a)} vs final`,
    recycling:
      entry.rmsd_to_previous_a == null
        ? "first recycle (no previous)"
        : `Δ ${fmtA(entry.rmsd_to_previous_a)} · ΔpLDDT ${fmtDelta(entry.delta_mean_plddt)}`,
    confidence: `mean pLDDT ${entry.mean_plddt ?? "--"} · ${fmtPct(entry.fraction_below_70)} < 70`,
  };
}

// Residue indices (1-based, for Mol* label_seq_id) to highlight for the active
// lenses. Coevolution highlights the endpoints of the most-changed contacts;
// FAPE highlights the highest-displacement residues; PAE selection is merged in
// by the caller.
export function lensHighlightResidues(entry, { ca, referenceCa, activeLenses, topK = 6 } = {}) {
  const active = new Set(activeLenses || []);
  const out = new Set();
  if (active.has("coevolution") && entry && entry.contact_delta_to_reference) {
    for (const key of (entry.contact_delta_to_reference.gained || []).slice(0, topK)) {
      const [i, j] = key; // backend ships gained as [i, j] pairs
      out.add(i + 1);
      out.add(j + 1);
    }
  }
  if (active.has("fape")) {
    const disp = perResidueDisplacement(ca, referenceCa);
    if (disp) {
      disp
        .map((v, i) => [v, i])
        .sort((a, b) => b[0] - a[0])
        .slice(0, topK)
        .forEach(([, i]) => out.add(i + 1));
    }
  }
  return [...out].sort((a, b) => a - b);
}

// Contact lines (gained / lost / stable) for the Coevolution lens, computed from
// the frame's own coordinates against the reference. Returns 0-based [i, j].
export function lensContactLines(ca, referenceCa) {
  if (!Array.isArray(ca) || !Array.isArray(referenceCa)) return null;
  const cur = contactPairs(ca);
  const ref = contactPairs(referenceCa);
  const delta = contactDelta(cur, ref);
  return {
    gained: delta.gained.map(parseKey),
    lost: delta.lost.map(parseKey),
    stable: delta.stable.map(parseKey),
  };
}

// Per-residue color channel for the active lens. FAPE -> displacement-to-final;
// Recycling -> distance still to settle (own ramp); Confidence -> pLDDT. Values
// are real (Angstrom or pLDDT units), never rescaled to fake larger motion.
export function lensResidueColors(entry, { ca, referenceCa, plddt, activeLenses } = {}) {
  const active = new Set(activeLenses || []);
  // Explicit confidence mode (the SHOW pLDDT control) overrides lens gradients.
  if (active.has("confidence") && Array.isArray(plddt) && plddt.length) {
    return { mode: "plddt", units: "pLDDT", values: plddt };
  }
  if (active.has("fape")) {
    const disp = perResidueDisplacement(ca, referenceCa);
    if (disp) {
      return {
        mode: "displacement",
        units: "A",
        values: disp.map((v) => Number(v.toFixed(3))),
        maxValue: Number.isFinite(entry?.max_displacement_overall_a) ? entry.max_displacement_overall_a : undefined,
      };
    }
  }
  // Recycling: colour each residue by how far it still is from its final pose.
  // Step the recycles and the structure visibly COOLS to blue as it converges -
  // the settling, not folding kinetics. Same measurement as FAPE, own colour ramp.
  if (active.has("recycling")) {
    const disp = perResidueDisplacement(ca, referenceCa);
    if (disp) {
      return {
        mode: "recycle",
        units: "A",
        values: disp.map((v) => Number(v.toFixed(3))),
        maxValue: Number.isFinite(entry?.max_displacement_overall_a) ? entry.max_displacement_overall_a : undefined,
      };
    }
  }
  return null;
}

// One call that assembles everything a viewer frame needs.
export function computeLensModel({ entry, ca, referenceCa, plddt, activeLenses }) {
  return {
    metrics: lensMetrics(entry),
    highlightResidues: lensHighlightResidues(entry, { ca, referenceCa, activeLenses }),
    contactLines: (activeLenses || []).includes("coevolution") ? lensContactLines(ca, referenceCa) : null,
    residueColors: lensResidueColors(entry, { ca, referenceCa, plddt, activeLenses }),
  };
}
