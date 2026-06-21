// Curated Amino Arcade targets. Kept outside App.jsx so biological examples,
// MSA mode, and success/lesson expectations remain auditable data.
//
// Ordered top-to-bottom by the live-lens sequence (coevolution, triangle, IPA,
// FAPE, recycling), with the all-lenses grand tour last. Each target carries a
// one-line `notice` (what to watch for in its lens).
//
// NOTE: new targets need their demo cache regenerated with
// scripts/cache_arcade_examples.py before the zero-install "Fold" works for them;
// the Mol* preview (RCSB by pdb id) works immediately. Caches match by sequence
// hash, so reordering does not affect them.

export const GFP_SEQ =
  "MSKGEELFTGVVPILVELDGDVNGHKFSVSGEGEGDATYGKLTLKFICTTGKLPVPWPTLVTTFYVQCFSRYPDHMKRHDFFKSAMPEGYVQERTIFFKDDGNYKTRAEVKFEGDTLVNRIELKGIDFKEDGNILGHKLEYNYNSHNVYIMADKQKNGIKVNFKIRHNIEDGSVQLADHYQQNTPIGDGPVLLPDNHYLSTQSALSKDPNEKRDHMVLLEFVTAAGITHGMDELYK";
export const MYO_SEQ =
  "VLSEGEWQLVLHVWAKVEADVAGHGQDILIRLFKSHPETLEKFDRFKHLKTEAEMKASEDLKKHGVTVLTALGAILKKKGHHEAELKPLAQSHATKHKIPIKYLEFISEAIIHVLHSRHPGDFGADAQGAMNKALELFRKDIAAKYKELGYQG";
export const PGK_SEQ =
  "MSLSSKLSVQDLDLKDKRVFIRVDFNVPLDGKKITSNQRIVAALPTIKYVLEHHPRYVVLASHLGRPNGERNEKYSLAPVAKELQSLLGKDVTFLNDCVGPEVEAAVKASAPGSVILLENLRYHIEEEGSRKVDGQKVKASKEDVQKFRHELSSLADVYINDAFGTAHRAHSSMVGFDLPQRAAGFLLEKELKYFGKALENPTRPFLAILGGAKVADKIQLIDNLLDKVDSIIIGGGMAFTFKKVLENTEIGDSIFDKAVGPEIAKLMEKAKAKGVEVVLPVDFIIADAFSASANTKTVTDKEGIPAGWQGLDNGPESRKLFAATVAKATVILWNGPPGVFEFEKFAAGTKALLDEVVKSSAAGNTVIIGGGDTATVAKKYGVTDKISHVSTGGGASLELLEGKELPGVAFLSEKK";
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
    { n: "1", name: "Salivary amylase", full: "The enzyme in your spit that digests starch", seed: 3, seq: AMY_SEQ, pdb: "1SMD", concept: "coevolution", tag: "Coevolution", msaMode: "mmseqs2_uniref_env", expectation: "success",
      notice: "The deep MSA's correlated mutations pin distant residues together - coevolution building the cleft that splits starch (why chewed bread turns sweet).",
      blurb: "A large salivary enzyme that cuts starch into sugars. Its deep evolutionary family gives the model many paired mutations to compare, making it a clean example of coevolution turning distant sequence positions into a 3D contact network." },
    { n: "2", name: "GFP", full: "Green Fluorescent Protein - the lab highlighter", seed: 9, seq: GFP_SEQ, pdb: "1EMA", concept: "triangle", tag: "Triangle Updates", msaMode: "single_sequence", expectation: "lesson",
      notice: "The honest limit: no MSA -> no coevolution signal -> confidence stays low. The beta-barrel only closes if every pairwise distance stays mutually consistent.",
      blurb: "The glowing jellyfish protein that became biology's standard highlighter. Here it is intentionally run without evolutionary search, so the barrel struggles: a useful failure case for seeing why pair tables need real signal, not just neural guesswork." },
    { n: "3", name: "Myoglobin", full: "Oxygen storage in muscle - the red in meat", seed: 14, seq: MYO_SEQ, pdb: "1MBN", concept: "ipa", tag: "Invariant Point Attention", msaMode: "mmseqs2_uniref_env", expectation: "success",
      notice: "Rotate it - the helix bundle reads the same from every angle. That frame-independence is what Invariant Point Attention captures.",
      blurb: "A compact oxygen-storage protein from muscle. Its tight helical bundle is ideal for IPA: the important geometry is internal to the protein, so the readout should stay stable while you rotate the whole scene." },
    { n: "4", name: "Carbonic anhydrase", full: "CO2 in blood & lungs - the fizz on your tongue", seed: 20, seq: CA2_SEQ, pdb: "1CA2", concept: "fape", tag: "FAPE & Chirality", msaMode: "mmseqs2_uniref_env", expectation: "success",
      notice: "Per-residue color shows how far each atom travels to its final pose - the rigid beta-core stays put while loops move. Note the right-handed helices (chirality).",
      blurb: "A fast enzyme that helps shuttle carbon dioxide through blood and lungs. The rigid beta core and mobile loops make a good FAPE lesson: local frames expose wrong-handed geometry that plain distance checks can miss." },
    { n: "5", name: "Phosphoglycerate kinase", full: "Glycolysis - making ATP from sugar", seed: 27, seq: PGK_SEQ, pdb: "3PGK", concept: "recycling", tag: "Recycling", msaMode: "mmseqs2_uniref_env", expectation: "success",
      notice: "MSA intentionally subsampled to 16:32 so recycling has visible work to do. Watch mean pLDDT climb ~15 points and aligned RMSD fall from >3 A; this is representational refinement, not physical folding time.",
      blurb: "A two-domain glycolysis enzyme that makes ATP handling phosphate transfer. This cache deliberately starts from a shallow MSA so recycling has visible work to do: confidence rises sharply as the domains settle into their final relative placement." },
    { n: "6", name: "Hemoglobin", full: "Oxygen transport - the red in blood", seed: 33, seq: HBA_SEQ, pdb: "2HHB", concept: "all", tag: "All five lenses", msaMode: "mmseqs2_uniref_env", expectation: "success",
      notice: "Every lens at once: a confident blue core, recycles converging, coevolved contacts snapping in. The alpha-chain that carries your oxygen.",
      blurb: "The oxygen-carrying protein that gives blood its color. This alpha-chain example is the synthesis view: confidence, contacts, local geometry, chirality, and recycling are all visible on one familiar fold." },
  ];
}
