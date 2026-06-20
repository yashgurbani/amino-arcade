// Curated Amino Arcade targets. Kept outside App.jsx so biological examples,
// MSA mode, and success/lesson expectations remain auditable data.
//
// Ordering is success-first by design (handoff C.2): a first-timer should SEE a
// confident fold and watch a lens light up before meeting the honest GFP limit
// last. Each target carries a one-line `notice` (what to watch for in its lens).
//
// NOTE: Amylase (#4) and Carbonic anhydrase (#5) are new targets - their demo
// cache must be regenerated with scripts/cache_arcade_examples.py before the
// zero-install "run fold" works for them. The Mol* preview (RCSB by pdb id)
// works immediately. GFP/Myoglobin/Lysozyme/Hemoglobin caches still match by
// sequence hash, so reordering does not affect them.

// GFP (1EMA); the single chromophore residue (X) is folded as Tyr.
export const GFP_SEQ =
  "MSKGEELFTGVVPILVELDGDVNGHKFSVSGEGEGDATYGKLTLKFICTTGKLPVPWPTLVTTFYVQCFSRYPDHMKRHDFFKSAMPEGYVQERTIFFKDDGNYKTRAEVKFEGDTLVNRIELKGIDFKEDGNILGHKLEYNYNSHNVYIMADKQKNGIKVNFKIRHNIEDGSVQLADHYQQNTPIGDGPVLLPDNHYLSTQSALSKDPNEKRDHMVLLEFVTAAGITHGMDELYK";
export const MYO_SEQ =
  "VLSEGEWQLVLHVWAKVEADVAGHGQDILIRLFKSHPETLEKFDRFKHLKTEAEMKASEDLKKHGVTVLTALGAILKKKGHHEAELKPLAQSHATKHKIPIKYLEFISEAIIHVLHSRHPGDFGADAQGAMNKALELFRKDIAAKYKELGYQG";
export const LYZ_SEQ =
  "MNIFEMLRIDEGLRLKIYKATEGYYTIGIGHLLTKSPSLNAAKSELDKAIGRNTNGVITKDEAEKLFNQDVDAAVRGILRNAKLKPVYDSLDAVRRAALINMVFQMGETGVAGFTNSLRMLQQKRWDEAAVNLAKSRWYNQTPNRAKRVITTFRTGTWDAYKNL";
export const TIM_SEQ =
  "APSRKFFVGGNWKMNGRKQSLGELIGTLNAAKVPADTEVVCAPPTAYIDFARQKLDPKIAVAAQNCYKVTNGAFTGEISPGMIKDCGATWVVLGHSERRHVFGESDELIGQKVAHALAEGLGVIACIGEKLDEREAGITEKVVFEQTKVIADNVKDWSKVVLAYEPVWAIGTGKTATPQQAQEVHEKLRGWLKSNVSDAVAQSTRIIYGGSVTGATCKELASQPDVDGFLVGGASLKPEFVDIINAKQ";
export const HBA_SEQ =
  "VLSPADKTNVKAAWGKVGAHAGEYGAEALERMFLSFPTTKTYFPHFDLSHGSAQVKGHGKKVADALTNAVAHVDDMPNALSALSDLHAHKLRVDPVNFKLLSHCLLVTLAAHLPAEFTPAVHASLDKFLASVSTVLTSKYR";
// Human salivary alpha-amylase, mature chain from PDB 1SMD (496 aa).
export const AMY_SEQ =
  "QYSSNTQQGRTSIVHLFEWRWVDIALECERYLAPKGFGGVQVSPPNENVAIHNPFRPWWERYQPVSYKLCTRSGNEDEFRNMVTRCNNVGVRIYVDAVINHMCGNAVSAGTSSTCGSYFNPGSRDFPAVPYSGWDFNDGKCKTGSGDIENYNDATQVRDCRLSGLLDLALGKDYVRSKIAEYMNHLIDIGVAGFRIDASKHMWPGDIKAILDKLHNLNSNWFPEGSKPFIYQEVIDLGGEPIKSSDYFGNGRVTEFKYGAKLGTVIRKWNGEKMSYLKNWGEGWGFMPSDRALVFVDNHDNQRGHGAGGASILTFWDARLYKMAVGFMLAHPYGFTRVMSSYRWPRYFENGKDVNDWVGPPNDNGVTKEVTINPDTTCGNDWVCEHRWRQIRNMVNFRNVVDGQPFTNWYDNGSNQVAFGRGNRGFIVFNNDDWTFSLTLQTGLPAGTYCDVISGDKINGNCTGIKIYVSDDGKAHFSISNSAEDPFIAIHAESKL";
// Human carbonic anhydrase II (UniProt P00918, 260 aa).
export const CA2_SEQ =
  "MSHHWGYGKHNGPEHWHKDFPIAKGERQSPVDIDTHTAKYDPSLKPLSVSYDQATSLRILNNGHAFNVEFDDSQDKAVLKGGPLDGTYRLIQFHFHWGSLDGQGSEHTVDKKKYAAELHLVHWNTKYGDFGKAVQQPDGLAVLGIFLKVGSAKPGLQKVVDVLDSIKTKGKSADFTNFDPRGLLPESLDYWTYPGSLTTPPLLECVTWIVLKEPISVSSEQVLKFRKLNFNGEGEPEELMVDNWRPAQPLKNRQIKASFK";

export function arcadeTargets() {
  return [
    { n: "1", name: "Myoglobin", full: "Oxygen storage in muscle - the red in meat", seed: 14, seq: MYO_SEQ, pdb: "1MBN", concept: "ipa", tag: "Invariant Point Attention", msaMode: "mmseqs2_uniref_env", expectation: "success",
      notice: "Rotate it - the helix bundle reads the same from every angle. That frame-independence is what Invariant Point Attention captures.",
      blurb: "Stores oxygen in your muscles and gives red meat its color. An all-alpha-helix bundle - a compact rigid body whose internal geometry reads the same no matter how you rotate it in space." },
    { n: "2", name: "Hemoglobin", full: "Oxygen transport - the red in blood", seed: 33, seq: HBA_SEQ, pdb: "2HHB", concept: "all", tag: "All five lenses", msaMode: "mmseqs2_uniref_env", expectation: "success",
      notice: "Every lens at once: a confident blue core, recycles converging, coevolved contacts snapping in. The alpha-chain that carries your oxygen.",
      blurb: "Carries oxygen in your red blood cells and gives blood its color; its defects cause anemia and sickle-cell disease. A grand tour - every lens switched on at once. (Folding the alpha chain.)" },
    { n: "3", name: "Triosephosphate isomerase", full: "How your cells extract energy from sugar", seed: 27, seq: TIM_SEQ, pdb: "1HTI", concept: "recycling", tag: "Recycling", msaMode: "mmseqs2_uniref_env", expectation: "success",
      notice: "Watch mean pLDDT climb and aligned RMSD fall as the eight-stranded barrel settles over recycles. This is representational refinement, not physical folding time.",
      blurb: "A core engine of glycolysis - how your cells extract energy from sugar. Its eight-stranded TIM barrel showed the largest measured recycle gain of the tested Goldilocks candidates (+6.29 mean pLDDT, 1.21 A aligned movement to the final frame)." },
    { n: "4", name: "Salivary amylase", full: "The enzyme in your spit that digests starch", seed: 3, seq: AMY_SEQ, pdb: "1SMD", concept: "coevolution", tag: "Coevolution", msaMode: "mmseqs2_uniref_env", expectation: "success",
      notice: "The deep MSA's correlated mutations pin distant residues together - coevolution building the cleft that splits starch (why chewed bread turns sweet).",
      blurb: "The enzyme in your saliva that breaks starch into sugar - the reason bread tastes sweet the longer you chew it. A large, well-folding enzyme with a deep evolutionary family, so the coevolution signal is strong. (Mature human salivary alpha-amylase, 496 aa.)" },
    { n: "5", name: "Carbonic anhydrase", full: "CO2 in blood & lungs - the fizz on your tongue", seed: 20, seq: CA2_SEQ, pdb: "1CA2", concept: "fape", tag: "FAPE & Chirality", msaMode: "mmseqs2_uniref_env", expectation: "success",
      notice: "Per-residue color shows how far each atom travels to its final pose - the rigid beta-core stays put while loops move. Note the right-handed helices (chirality).",
      blurb: "One of the fastest enzymes known - it manages carbon dioxide in your blood and lungs and gives carbonated drinks their bite on your tongue. A confident alpha/beta fold: a rigid beta-sheet core with mobile loops, ideal for watching per-residue displacement and handedness. (Human carbonic anhydrase II, 260 aa.)" },
    { n: "6", name: "GFP", full: "Green Fluorescent Protein - the lab highlighter", seed: 9, seq: GFP_SEQ, pdb: "1EMA", concept: "triangle", tag: "Triangle Updates", msaMode: "single_sequence", expectation: "lesson",
      notice: "The honest limit, saved for last: no MSA -> no coevolution signal -> confidence stays low. The beta-barrel only closes if every pairwise distance stays mutually consistent.",
      blurb: "The jellyfish protein that glows green - the workhorse marker of modern biology. Run with NO MSA on purpose: watch confidence stay low to learn why the multiple-sequence alignment is the engine of the whole method. (236 residues.)" },
  ];
}
