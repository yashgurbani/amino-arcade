# Goldilocks recycling targets (fold-ready spec)

## Why this exists
All six current examples have deep MSAs, so AlphaFold solves them at **recycle 0**:
mean pLDDT starts ~92-95 and barely climbs, and the aligned drift-to-final is
sub-Angstrom (invisible). To actually *see recycling do work* you need a
"Goldilocks" target: hard enough that recycle 0 is rough, solvable enough that it
improves over iterations. The reliable trick is a **multidomain enzyme** -
recycling has to resolve how the domains pack against each other.

## How to choose (objective criterion)
Fold each candidate, then read the per-recycle analysis (backend/analysis.py
already emits this; it's in the demo-cache JSON under `analysis.frames[]`):

1. **pLDDT climb** = max(mean_plddt) - frames[0].mean_plddt. Want the BIGGEST
   (aim for >= 8-10 points; the current best, hemoglobin, is only +4.5).
2. **Aligned RMSD-to-final decays monotonically** (`rmsd_to_reference_a`:
   large at R0 -> 0 at the end), ideally starting > 2 Angstrom so it's visible.
3. Final mean pLDDT still passes the sanity gate (>= ~80) so it's an honest success.

Keep whichever climbs most. Then point the **recycling** lens at it (replacing
Lysozyme, currently the weakest climber at +1.0).

## Candidates (daily-life relevant, < 768 aa, MSA-foldable)

### 1. Alcohol dehydrogenase  [PRIMARY PICK]
- Daily life: how your body clears alcohol; the basis of the "alcohol flush."
- Why Goldilocks: classic **two-domain** enzyme (catalytic + NAD-binding
  Rossmann domain). Inter-domain packing is exactly what recycling refines.
- 374 aa - PDB 1HSO (human class I ADH, alpha subunit) - UniProt P07327/P00325.
- Sequence:
STAGKVIKCKAAVLWELKKPFSIEEVEVAPPKAHEVRIKMVAVGICGTDDHVVSGTMVTPLPVILGHEAAGIVESVGEGVTTVKPGDKVIPLAIPQCGKCRICKNPESNYCLKNDVSNPQGTLQDGTSRFTCRRKPIHHFLGISTFSQYTVVDENAVAKIDAASPLEKVCLIGCGFSTGYGSAVNVAKVTPGSTCAVFGLGGVGLSAIMGCKAAGAARIIAVDINKDKFAKAKELGATECINPQDYKKPIQEVLKEMTDGGVDFSFEVIGRLDTMMASLLCCHEACGTSVIVGVPPDSQNLSMNPMLLLTGRTWKGAILGGFKSKECVPKLVADFMAKKFSLDALITHVLPFEKINEGFDLLHSGKSIRTILMF

### 2. Triosephosphate isomerase (TIM)  [SMALLER / FASTER ALTERNATE]
- Daily life: a core engine of glycolysis - how you get energy from sugar.
- Why Goldilocks: the canonical (beta/alpha)8 **TIM barrel**; getting the
  8-strand register right can take recycles even with an MSA.
- 248 aa - PDB 1HTI (human) - UniProt P60174.
- Sequence:
APSRKFFVGGNWKMNGRKQSLGELIGTLNAAKVPADTEVVCAPPTAYIDFARQKLDPKIAVAAQNCYKVTNGAFTGEISPGMIKDCGATWVVLGHSERRHVFGESDELIGQKVAHALAEGLGVIACIGEKLDEREAGITEKVVFEQTKVIADNVKDWSKVVLAYEPVWAIGTGKTATPQQAQEVHEKLRGWLKSNVSDAVAQSTRIIYGGSVTGATCKELASQPDVDGFLVGGASLKPEFVDIINAKQ

### 3. Glucokinase (hexokinase IV)  [THIRD OPTION - strongest domain motion]
- Daily life: the glucose sensor that triggers insulin release; mutations cause
  MODY2 diabetes.
- Why Goldilocks: two-lobe **induced-fit** enzyme that clamps around glucose;
  large inter-lobe motion = good recycling odds.
- ~465 aa - PDB 1V4S - UniProt P35557. (Fetch the FASTA when you fold it.)

## Paste-ready targets.js entry (after you pick the winner; example = ADH)
Add `export const ADH_SEQ = "....";` next to the other sequences, then put this
in the recycling slot (replacing the Lysozyme object), keeping six targets:

    { n: "3", name: "Alcohol dehydrogenase", full: "How your body clears alcohol", seed: 27, seq: ADH_SEQ, pdb: "1HSO", concept: "recycling", tag: "Recycling", msaMode: "mmseqs2_uniref_env", expectation: "success",
      notice: "Watch mean pLDDT climb and the structure settle over recycles - the two domains pack together iteration by iteration. THIS is recycling doing visible work.",
      blurb: "The enzyme that breaks down the alcohol you drink. A two-domain enzyme whose lobes have to pack together - so AlphaFold's recycling visibly refines it over several passes instead of nailing it at once." },

Then regenerate the cache: `python scripts/cache_arcade_examples.py`, and update
targets.test.mjs (the GFP-last / six-targets asserts still hold; drop any
Lysozyme-specific assert if present).

## Measured results (2026-06-20)

All candidates used LocalColabFold 1.6.1, `alphafold2_ptm`, one model, eight
recycles, saved recycle frames, `mmseqs2_uniref_env`, and `--max-msa 32:64` on
the verified WSL2 RTX 5060 path.

| Candidate | pLDDT R0 -> max | Climb | RMSD-to-final R0 | Final pLDDT | Strictly monotonic RMSD? |
|---|---:|---:|---:|---:|---|
| Triosephosphate isomerase | 89.40 -> 95.69 | **+6.29** | **1.214 A** | 95.69 | No (0.134 -> 0.147 A at R7) |
| Alcohol dehydrogenase | 89.03 -> 94.36 | +5.33 | 0.995 A | 94.16 | No (small R5 bump) |
| Glucokinase | 89.30 -> 92.13 | +2.83 | 1.173 A | 91.92 | No (small R4/R5 bumps) |

TIM is therefore the measured winner and replaces Lysozyme in target slot 3.
It is a clear improvement over the previous +1.0 example, but it does **not**
meet the aspirational >=8-10 point / >2 A definition of a dramatic Goldilocks
target. The UI copy must not imply that it does.

The reproducible driver is `scripts/benchmark_goldilocks_targets.py`; its
machine-readable output is `work/goldilocks-recycling/summary.json`.

## Next search strategy

Do not optimize all six examples for a large recycling swing. The six-example
portfolio needs distinct teaching outcomes: IPA invariance, an all-lenses
baseline, recycling convergence, coevolution, FAPE/chirality, and the honest
single-sequence failure. A dramatic recycle candidate belongs only in the
recycling slot; the other examples should maximize the evidence required by
their own lens.

For the next recycling screen, prioritize single-chain proteins with 2-3 rigid
domains and uncertain inter-domain packing, while rejecting proteins whose
final model has high inter-domain PAE. Good next families to benchmark are
phosphoglycerate kinase, creatine kinase, pyruvate kinase, serum transferrin,
and Hsp70-family chaperones. Run a small matrix rather than guessing from known
ligand motion:

1. Fold at `--max-msa 32:64` and `16:32`, eight recycles, one model.
2. Require final mean pLDDT >=80 and an acceptably confident domain interface.
3. Rank by pLDDT climb, then initial aligned RMSD-to-final, then smoothness of
   the RMSD decay; retain the per-domain and interface metrics separately.
4. Re-run the winner with two seeds. A one-seed spike is not a stable lesson.
5. Keep the shallow-MSA setting only if it is disclosed in provenance. This is
   a controlled demonstration of recycling under reduced evolutionary context,
   not evidence that the protein is intrinsically difficult to predict.
