// Curated Amino Arcade targets. Kept outside App.jsx so biological examples,
// MSA mode, and success/lesson expectations remain auditable data.

// GFP (1EMA); the single chromophore residue (X) is folded as Tyr.
export const GFP_SEQ =
  "MSKGEELFTGVVPILVELDGDVNGHKFSVSGEGEGDATYGKLTLKFICTTGKLPVPWPTLVTTFYVQCFSRYPDHMKRHDFFKSAMPEGYVQERTIFFKDDGNYKTRAEVKFEGDTLVNRIELKGIDFKEDGNILGHKLEYNYNSHNVYIMADKQKNGIKVNFKIRHNIEDGSVQLADHYQQNTPIGDGPVLLPDNHYLSTQSALSKDPNEKRDHMVLLEFVTAAGITHGMDELYK";
export const MYO_SEQ =
  "VLSEGEWQLVLHVWAKVEADVAGHGQDILIRLFKSHPETLEKFDRFKHLKTEAEMKASEDLKKHGVTVLTALGAILKKKGHHEAELKPLAQSHATKHKIPIKYLEFISEAIIHVLHSRHPGDFGADAQGAMNKALELFRKDIAAKYKELGYQG";
export const LYZ_SEQ =
  "MNIFEMLRIDEGLRLKIYKATEGYYTIGIGHLLTKSPSLNAAKSELDKAIGRNTNGVITKDEAEKLFNQDVDAAVRGILRNAKLKPVYDSLDAVRRAALINMVFQMGETGVAGFTNSLRMLQQKRWDEAAVNLAKSRWYNQTPNRAKRVITTFRTGTWDAYKNL";
export const HBA_SEQ =
  "VLSPADKTNVKAAWGKVGAHAGEYGAEALERMFLSFPTTKTYFPHFDLSHGSAQVKGHGKKVADALTNAVAHVDDMPNALSALSDLHAHKLRVDPVNFKLLSHCLLVTLAAHLPAEFTPAVHASLDKFLASVSTVLTSKYR";
export const INS_SEQ = "MALWMRLLPLLALLALWGPDPAAAFVNQHLCGSHLVEALYLVCGERGFFYTPKTRREAEDLQVGQVELGGGPGAGSLQPLALEGSLQKRGIVEQCCTSICSLYQLENYCN";
export const COL_SEQ = "GPP".repeat(256);

export function arcadeTargets() {
  return [
    { n: "1", name: "Insulin", full: "Hormone · blood-sugar control", seed: 3, seq: INS_SEQ, pdb: "4INS", concept: "coevolution", tag: "Coevolution", msaMode: "mmseqs2_uniref_env", expectation: "success",
      blurb: "The hormone that controls blood sugar — injected daily by millions of people with diabetes. This run folds the full human preproinsulin sequence so the inferred chain is the actual biological precursor, not the tiny B-chain proxy." },
    { n: "2", name: "GFP", full: 'Green Fluorescent Protein · the lab "highlighter"', seed: 9, seq: GFP_SEQ, pdb: "1EMA", concept: "triangle", tag: "Triangle Updates", msaMode: "single_sequence", expectation: "lesson",
      blurb: "The jellyfish protein that glows green — the workhorse marker of modern biology. Its β-barrel cage only closes if every pairwise distance stays mutually consistent. (236 residues — a longer run.)" },
    { n: "3", name: "Myoglobin", full: "Oxygen storage in muscle · the red in meat", seed: 14, seq: MYO_SEQ, pdb: "1MBN", concept: "ipa", tag: "Invariant Point Attention", msaMode: "mmseqs2_uniref_env", expectation: "success",
      blurb: "Stores oxygen in your muscles and gives red meat its color. An all-α-helix bundle — a compact rigid body whose internal geometry reads the same no matter how you rotate it in space." },
    { n: "4", name: "Collagen-like chain", full: "Skin · tendon · bone · gelatin motif", seed: 20, seq: COL_SEQ, pdb: "1BKV", concept: "fape", tag: "FAPE & Chirality", msaMode: "mmseqs2_uniref_env", expectation: "lesson",
      blurb: "The most abundant protein family in your body — skin, tendons, bone, and gelatin. Full collagen chains are roughly thousand-residue, multi-chain systems, so this folds a 768-residue collagen-like GPP chain: the largest raised-limit target proven on this workstation so far. It preserves the handedness/FAPE lesson without pretending to be native triple-helix collagen." },
    { n: "5", name: "Lysozyme", full: "Tears · saliva · egg white", seed: 27, seq: LYZ_SEQ, pdb: "253L", concept: "recycling", tag: "Recycling", msaMode: "mmseqs2_uniref_env", expectation: "success",
      blurb: "A natural antibacterial enzyme in your tears, saliva and egg white — also used as a food preservative. A textbook small protein that folds to a single stable fixed point. (T4 lysozyme.)" },
    { n: "6", name: "Hemoglobin", full: "Oxygen transport · the red in blood", seed: 33, seq: HBA_SEQ, pdb: "2HHB", concept: "all", tag: "All five lenses", msaMode: "mmseqs2_uniref_env", expectation: "success",
      blurb: "Carries oxygen in your red blood cells and gives blood its color; its defects cause anemia and sickle-cell disease. A grand tour — every lens switched on at once. (Folding the α chain.)" },
  ];
}
