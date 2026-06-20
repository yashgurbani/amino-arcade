#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.adapters import predict_with_engine  # noqa: E402
from backend.job_queue import normalize_options  # noqa: E402


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "work" / "goldilocks-recycling"

CANDIDATES: dict[str, dict[str, Any]] = {
    "phosphoglycerate-kinase": {
        "name": "Phosphoglycerate kinase",
        "source": "RCSB 3PGK chain A (S. cerevisiae; leading unresolved residue restored as Met)",
        "pdb": "3PGK",
        "sequence": "MSLSSKLSVQDLDLKDKRVFIRVDFNVPLDGKKITSNQRIVAALPTIKYVLEHHPRYVVLASHLGRPNGERNEKYSLAPVAKELQSLLGKDVTFLNDCVGPEVEAAVKASAPGSVILLENLRYHIEEEGSRKVDGQKVKASKEDVQKFRHELSSLADVYINDAFGTAHRAHSSMVGFDLPQRAAGFLLEKELKYFGKALENPTRPFLAILGGAKVADKIQLIDNLLDKVDSIIIGGGMAFTFKKVLENTEIGDSIFDKAVGPEIAKLMEKAKAKGVEVVLPVDFIIADAFSASANTKTVTDKEGIPAGWQGLDNGPESRKLFAATVAKATVILWNGPPGVFEFEKFAAGTKALLDEVVKSSAAGNTVIIGGGDTATVAKKYGVTDKISHVSTGGGASLELLEGKELPGVAFLSEKK",
        "domains": [[list(range(1, 186))], [list(range(186, 416))]],
    },
    "transferrin-n-lobe": {
        "name": "Transferrin N-lobe",
        "source": "RCSB 1A8E chain A (human serum transferrin N-lobe)",
        "pdb": "1A8E",
        "sequence": "DKTVRWCAVSEHEATKCQSFRDHMKSVIPSDGPSVACVKKASYLDCIRAIAANEADAVTLDAGLVYDAYLAPNNLKPVVAEFYGSKEDPQTFYYAVAVVKKDSGFQMNQLRGKKSCHTGLGRSAGWNIPIGLLYCDLPEPRKPLEKAVANFFSGSCAPCADGTDFPQLCQLCPGCGCSTLNQYFGYSGAFKCLKDGAGDVAFVKHSTIFENLANKADRDQYELLCLDNTRKPVDEYKDCHLAQVPSHTVVARSMGGKEDLIWELLNQAQEHFGKDKSKEFQLFSSPHGKDLLFKDSAHGFLKVPPRMDAKMYLGYEYVTAIRNLREGTC",
        "domains": [[list(range(1, 90)), list(range(244, 330))], [list(range(90, 244))]],
    },
}


def flatten(parts: list[list[int]]) -> list[int]:
    return [residue for part in parts for residue in part]


def mean_cross_domain_pae(pae: Any, domains: list[list[list[int]]]) -> float | None:
    if not isinstance(pae, list) or len(domains) != 2:
        return None
    left, right = flatten(domains[0]), flatten(domains[1])
    values = []
    for i in left:
        for j in right:
            try:
                values.extend((float(pae[i - 1][j - 1]), float(pae[j - 1][i - 1])))
            except (IndexError, TypeError, ValueError):
                return None
    return round(sum(values) / len(values), 2) if values else None


def summarize_model(slug: str, candidate: dict[str, Any], depth: str, model: dict[str, Any]) -> dict[str, Any]:
    frames = (model.get("analysis") or {}).get("frames", [])
    plddt = [frame.get("mean_plddt") for frame in frames if frame.get("mean_plddt") is not None]
    rmsd = [frame.get("rmsd_to_reference_a") for frame in frames if frame.get("rmsd_to_reference_a") is not None]
    bumps = [round(b - a, 3) for a, b in zip(rmsd, rmsd[1:]) if b > a]
    climb = round(max(plddt) - plddt[0], 2) if plddt else None
    final_plddt = plddt[-1] if plddt else model.get("mean_plddt")
    interface_pae = mean_cross_domain_pae(model.get("pae"), candidate["domains"])
    return {
        "slug": slug,
        "name": candidate["name"],
        "pdb": candidate["pdb"],
        "source": candidate["source"],
        "length": len(candidate["sequence"]),
        "max_msa": depth,
        "seed": model.get("seed"),
        "rank": model.get("rank"),
        "frame_count": len(frames),
        "mean_plddt_by_recycle": plddt,
        "rmsd_to_final_a_by_recycle": rmsd,
        "plddt_climb": climb,
        "initial_rmsd_to_final_a": rmsd[0] if rmsd else None,
        "largest_rmsd_bump_a": max(bumps, default=0.0),
        "final_mean_plddt": final_plddt,
        "ptm": model.get("ptm"),
        "mean_cross_domain_pae_a": interface_pae,
        "passes_per_seed_numeric_gate": bool(
            final_plddt is not None
            and final_plddt >= 80
            and climb is not None
            and climb >= 8
            and rmsd
            and rmsd[0] > 2
            and max(bumps, default=0.0) < 0.3
        ),
    }


def evaluate_reproducibility(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    evaluations = []
    keys = sorted({(row["slug"], row["max_msa"]) for row in rows})
    for slug, depth in keys:
        group = [row for row in rows if row["slug"] == slug and row["max_msa"] == depth]
        climbs = [row["plddt_climb"] for row in group if row["plddt_climb"] is not None]
        evaluations.append(
            {
                "slug": slug,
                "max_msa": depth,
                "seed_count": len(group),
                "climb_spread": round(max(climbs) - min(climbs), 2) if climbs else None,
                "mean_cross_domain_pae_a": [row["mean_cross_domain_pae_a"] for row in group],
                "passes_protocol_numeric_gate": bool(
                    len(group) >= 2
                    and all(row["passes_per_seed_numeric_gate"] for row in group)
                    and max(climbs) - min(climbs) <= 1.5
                    and all(
                        row["mean_cross_domain_pae_a"] is not None and row["mean_cross_domain_pae_a"] <= 10
                        for row in group
                    )
                ),
                "interface_review": "Review final-model PAE and structure visually; mean cross-domain PAE is recorded as a screening aid, not a complete interface test.",
            }
        )
    return evaluations


def write_summary(settings: dict[str, Any], rows: list[dict[str, Any]]) -> Path:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output = OUTPUT_DIR / "protocol-summary.json"
    payload = {"settings": settings, "results": rows, "evaluations": evaluate_reproducibility(rows)}
    output.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return output


def main() -> int:
    parser = argparse.ArgumentParser(description="Execute docs/BENCHMARK_RECYCLING_PROTOCOL.md.")
    parser.add_argument("targets", nargs="*", choices=CANDIDATES, default=list(CANDIDATES))
    parser.add_argument("--depths", nargs="+", default=["32:64", "16:32"])
    parser.add_argument("--num-seeds", type=int, default=2)
    args = parser.parse_args()

    os.environ.update(
        {
            "LOCALCOLABFOLD_BIN": str(ROOT / "scripts" / "colabfold_batch_wsl.cmd"),
            "LOCALCOLABFOLD_MODEL_TYPE": "alphafold2_ptm",
            "LOCALCOLABFOLD_NUM_MODELS": "1",
            "LOCALCOLABFOLD_NUM_RECYCLE": "8",
            "LOCALCOLABFOLD_NUM_SEEDS": str(args.num_seeds),
            "LOCALCOLABFOLD_RANDOM_SEED": "0",
            "LOCALCOLABFOLD_OVERWRITE": "1",
            "LOCALCOLABFOLD_DISABLE_UNIFIED_MEMORY": "1",
            "AF_COMPANION_REAL_TIMEOUT_SECONDS": "7200",
            "AF_COMPANION_MAX_SEQUENCE": "768",
            "AF_COMPANION_VRAM_BUDGET_MIB": "7000",
        }
    )

    import backend.adapters as adapters
    import backend.guardrails as guardrails

    adapters.REAL_TIMEOUT_SECONDS = 7200
    guardrails.DEFAULT_MAX_SEQUENCE = 768
    guardrails.DEFAULT_BUDGET_MIB = 7000
    options = normalize_options({"num_recycle": 8, "num_models": 1, "msa_mode": "mmseqs2_uniref_env"})
    settings = {**options, "max_msa_depths": args.depths, "num_seeds": args.num_seeds, "random_seed": 0}
    summaries: list[dict[str, Any]] = []
    for slug in args.targets:
        candidate = CANDIDATES[slug]
        for depth in args.depths:
            os.environ["LOCALCOLABFOLD_MAX_MSA"] = depth
            print(f"== {candidate['name']} ({len(candidate['sequence'])} aa), max-msa {depth}, {args.num_seeds} seeds ==", flush=True)
            result = predict_with_engine(candidate["sequence"], "localcolabfold", options=options, log_callback=print)
            models = result.get("models") or []
            if len(models) < args.num_seeds:
                raise RuntimeError(f"Expected {args.num_seeds} seed models, received {len(models)}")
            for model in models:
                summary = summarize_model(slug, candidate, depth, model)
                summaries.append(summary)
                print(json.dumps(summary, indent=2), flush=True)
            output = write_summary(settings, summaries)
            print(f"checkpoint: {output}", flush=True)

    output = write_summary(settings, summaries)
    print(json.dumps(evaluate_reproducibility(summaries), indent=2))
    print(f"summary: {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
