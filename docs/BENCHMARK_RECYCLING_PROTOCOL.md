# Recycling benchmark protocol (run-ready, needs GPU)

Goal: find ONE example where recycling does visibly dramatic work (pLDDT climb
>= 8-10 points, aligned RMSD-to-final starting > 2 A and decaying monotonically),
to anchor the **recycling lens only**. The other five examples stay optimized for
their own learning outcome (do NOT chase drama there). Adopted from Codex's
recommendation, with rigor and an honesty guardrail added.

## The real lever: MSA depth, not protein choice
A deep MSA makes AlphaFold confident at recycle 0, so there is nothing to watch
climb. Thinning the MSA makes recycle 0 uncertain -> bigger, more visible climb.
Sweep two depths per target:
- `--max-msa 32:64`  (max_seq:max_extra_seq)
- `--max-msa 16:32`  (shallower; expect a larger climb but watch the floor)

## HONESTY GUARDRAIL (non-negotiable)
Thinning the MSA to manufacture drama is the same move we rejected for insulin
unless it is labeled. If a thinned-MSA run is adopted, the target's `notice` and
blurb MUST say so, e.g. "MSA intentionally subsampled to 16:32 so recycling has
visible work to do; with a full MSA this protein converges in one pass." Never
present a handicapped run as typical behavior.

## Candidates (multidomain / hinge motion = best recycling odds; daily-life)
| Protein | ~aa | PDB | Daily-life hook | Why it should climb |
|---|---|---|---|---|
| Phosphoglycerate kinase (PGK) | 415 | 3PGK | glycolysis / ATP | classic two-domain hinge enzyme |
| Creatine kinase | 380 | 1U6R | muscle energy buffer | dimeric, two-domain monomer |
| Pyruvate kinase | 530 | 1PKN | final step of glycolysis | three domains, large interfaces |
| Transferrin (N-lobe ok) | ~330/679 | 1A8E | iron transport in blood | bilobed clamshell, big hinge |
| Hsp70 (NBD or SBD) | ~380/~510 | 1DKX | the cellular chaperone | multidomain, allosteric motion |

Start with PGK and transferrin N-lobe (cleanest two-lobe hinges), then the others.

## Procedure (per target, per depth)
1. Fold with localcolabfold + mmseqs2, `--num-recycle 8`, save recycles.
2. Repeat with **two seeds** (e.g. 0 and 1); a real effect reproduces across both.
3. Run `backend/analysis.py` to emit per-recycle `analysis.frames[]`.
4. Record: frames[0].mean_plddt, max(mean_plddt), the climb (delta), and the
   `rmsd_to_reference_a` series (should start > 2 A and fall monotonically).

## Acceptance criteria (adopt only if ALL hold, on BOTH seeds)
- Final mean pLDDT >= 80 (honest success, passes the sanity gate).
- pLDDT climb (max - R0) >= 8 (TIM was +6.29; beat it clearly).
- Aligned RMSD-to-final starts > 2 A and decays monotonically (allow one tiny
  non-monotonic bump < 0.3 A; TIM had a small bump).
- Confident domain interface in the final model (no domains flying apart).
- Reproduces across the two seeds (climb within ~1 pLDDT point).

## Adoption
Pick the single best climber. If it is a thinned-MSA run, apply the honesty
guardrail label. Then add `<NAME>_SEQ` to targets.js and put it in the recycling
slot (currently TIM, 1HTI); keep six targets; update targets.test.mjs's
"recycling lens uses the measured Goldilocks winner" assert. Regenerate the cache
with scripts/cache_arcade_examples.py. Keep TIM documented as the prior winner.

## My recommendation
This is worth at most one short pass (PGK + transferrin, two seeds). If neither
clears +8 with a clean decay, KEEP TIM and stop - the marginal drama is not worth
a large campaign, and the higher-leverage work (narrative spine, Evoformer
diagram) is already in. Do not let this lens's polish block the whole project's "why".

## Execution results (2026-06-20)

Executed with LocalColabFold 1.6.1 on the verified WSL2 RTX 5060 path: one
`alphafold2_ptm` model, eight recycles, saved recycle frames, and seeds 0 and 1.

| Candidate | MSA | Seed | pLDDT climb | R0 RMSD-to-final | Largest RMSD bump | Final pLDDT | pTM |
|---|---:|---:|---:|---:|---:|---:|---:|
| PGK | 32:64 | 0 | +3.88 | 0.88 A | 0.03 A | 95.18 | 0.90 |
| PGK | 32:64 | 1 | +3.50 | 0.73 A | 0.04 A | 95.12 | 0.90 |
| **PGK** | **16:32** | **0** | **+15.91** | **4.70 A** | **0.19 A** | **94.33** | **0.89** |
| **PGK** | **16:32** | **1** | **+14.65** | **3.17 A** | **0.15 A** | **94.22** | **0.89** |
| Transferrin N-lobe | 32:64 | 0 | +3.34 | 2.88 A | 0.00 A | 93.74 | 0.88 |
| Transferrin N-lobe | 32:64 | 1 | +6.04 | 2.65 A | 0.00 A | 93.72 | 0.88 |
| Transferrin N-lobe | 16:32 | 0 | +19.54 | 4.40 A | 0.07 A | 93.12 | 0.88 |
| Transferrin N-lobe | 16:32 | 1 | +22.28 | 4.02 A | 0.06 A | 91.37 | 0.87 |

### Decision

Adopt PGK at 16:32. It clears the dramatic climb, movement, smoothness, final
confidence, and interface screens on both seeds. Mean cross-domain PAE was
6.72/6.73 A. Its climb spread is 1.26 points, accepted as within the protocol's
approximate one-point reproducibility tolerance. Transferrin is visually more
dramatic but its 2.74-point seed spread is less controlled.

The target copy explicitly discloses the 16:32 MSA subsampling. TIM remains the
prior unthinned-MSA winner (+6.29) in `GOLDILOCKS_RECYCLING_TARGETS.md`.
