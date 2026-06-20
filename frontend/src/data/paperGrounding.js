export const glossary = [
  {
    term: "MSA",
    definition: "A multiple sequence alignment: homologous sequences aligned so each column samples evolutionary variation at one structural position.",
  },
  {
    term: "Pair representation",
    definition: "AlphaFold2's learned residue-by-residue table. It generalizes hand-built coevolution/contact signals into a deep geometric representation.",
  },
  {
    term: "Evoformer",
    definition: "The trunk that couples MSA features and pair features through attention, outer-product updates, and triangle operations.",
  },
  {
    term: "Invariant Point Attention",
    definition: "A structure-module attention operation that uses distances between learned points in residue-local frames, preserving global SE(3) invariance.",
  },
  {
    term: "FAPE",
    definition: "Frame Aligned Point Error. A loss comparing predicted and true atom positions after transforming them into residue-local frames.",
  },
  {
    term: "pLDDT",
    definition: "Predicted local distance difference test. A per-residue confidence estimate, not a folding probability or free energy.",
  },
  {
    term: "PAE",
    definition: "Predicted aligned error. A pairwise estimate of domain placement confidence after aligning on a residue or region.",
  },
  {
    term: "Recycling",
    definition: "Repeatedly feeding model outputs back into the network to refine representations and coordinates toward a learned fixed point.",
  },
];

export const equationDeck = [
  {
    label: "Levinthal count",
    expression: "Omega ~= k^N",
    note: "Brute-force conformational search is the wrong mental model for biological folding.",
  },
  {
    label: "Inverse Potts",
    expression: "P(sigma) proportional exp(sum h_i + sum J_ij)",
    note: "Direct couplings are inferred from sequence statistics rather than observed directly.",
  },
  {
    label: "Mean-field DCA",
    expression: "J_ij ~= -(C^-1)_ij",
    note: "Precision blocks reveal direct statistical couplings more cleanly than raw correlations.",
  },
  {
    label: "Triangle inequality",
    expression: "d_ij <= d_ik + d_kj",
    note: "A pair table must satisfy global geometric constraints to become one 3D structure.",
  },
  {
    label: "SE(3) transform",
    expression: "T(x) = R x + t",
    note: "A protein has no privileged global orientation or origin.",
  },
  {
    label: "Recycling",
    expression: "u_(t+1) = F_theta(u_t, inputs)",
    note: "The iterative process is representational refinement, not a physical time trajectory.",
  },
];

export const sourceMap = {
  paper: "s41586-021-03819-2.pdf",
  supplement: "41586_2021_3819_MOESM1_ESM.pdf",
  companion: "AlphaFold2_Companion_Guide.pdf",
};
