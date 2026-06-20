// Single source of truth for how the UI talks about recycles, pLDDT, PAE, and
// physics. No component should invent its own wording (HANDOFF_PEDAGOGY..., 8.1).
// Copy adapted from the GPT-5.5 Pro audit, Section 5.

export const truthLabels = {
  recycleBadge: "AF2 RECYCLE SNAPSHOTS · INFERENCE REFINEMENT",
  recycleTooltip:
    "Each frame is a real LocalColabFold recycle PDB. The sequence shows how the " +
    "neural network refines its structure prediction. It is not a movie of atoms " +
    "folding in water.",

  superposeNote:
    "Frames are rigidly superposed on the final recycle (alignment only). " +
    "No motion has been added, interpolated, or amplified.",

  lowConfidenceTitle: "LOW-CONFIDENCE PREDICTION - LEARN FROM IT",
  lowConfidenceBody:
    "Large parts of this model have low pLDDT. That does not mean the app failed; " +
    "it means the predictor is uncertain for this sequence and setup. Inspect PAE, " +
    "contact changes, model spread, and low-confidence regions before trusting the " +
    "structure. Single-sequence runs (no MSA) are especially weak - the network " +
    "loses the coevolutionary signal it normally folds from.",
  plddtBands:
    "pLDDT below 70 suggests caution. pLDDT below 50 often marks regions where the " +
    "local structure may be unreliable or intrinsically flexible/disordered.",

  whyNotFolding:
    "Why doesn't this look like a protein folding from a string? Because these " +
    "frames are not physical time. AlphaFold/LocalColabFold starts from learned " +
    "sequence, MSA, and geometry representations and iteratively refines a predicted " +
    "structure. Recycles may move atoms only slightly, and pLDDT may change only a " +
    "few points. That subtlety is the lesson: this view shows inference convergence " +
    "and uncertainty, not a natural folding pathway through solvent.",

  metricLabels: {
    meanPlddt: "MEAN pLDDT",
    displayConfidence: "DISPLAY CONFIDENCE", // replaces the misleading "FOLD SCORE" on real runs
    deltaPlddt: "ΔpLDDT vs prev",
    rmsdToFinal: "RMSD to final",
    rmsdToPrev: "Δ to prev recycle",
    contactConvergence: "contact convergence",
    lowConfFraction: "low-confidence fraction",
    caFape: "Cα-FAPE (approx)",
  },

  contactDeltaLabels: {
    now: "CONTACTS NOW",
    gained: "GAINED SINCE PREVIOUS RECYCLE",
    lost: "LOST SINCE PREVIOUS RECYCLE",
    stable: "STABLE TO FINAL RECYCLE",
    different: "DIFFERENT FROM FINAL RECYCLE",
  },

  paeLine:
    "PAE - expected residue-position error after aligning on another residue; " +
    "useful for domain placement, not a measured motion trajectory.",

  exportWatermarkRecycle:
    "Amino Arcade · AlphaFold/LocalColabFold inference-refinement snapshots · not a physical folding pathway",

  // Per-lens one-line honesty boundaries (kept in sync with App.jsx lens defs).
  lensBoundary: {
    coevolution: "Contacts are read from predicted coordinates; AF2 learns a pair representation rather than inverting DCA.",
    triangle: "Shows output geometry sanity (clashes, bond lengths). True triangle consistency lives in the pair table / distogram, not the final coordinates.",
    ipa: "Global pose carries no structural information; IPA is built to ignore exactly the rotation we remove here.",
    fape: "Cα-frame approximation to the final recycle - not the all-atom, all-frames clamped FAPE loss from the paper.",
    recycling: "Representational iteration toward a fixed point - never folding kinetics.",
    confidence: "pLDDT is per-residue confidence; PAE is relative-placement confidence. Neither is thermodynamics or folding probability.",
  },
};

export default truthLabels;
