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
from backend.job_queue import normalize_options, save_cached_prediction  # noqa: E402


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "work" / "goldilocks-recycling"

CANDIDATES = {
    "alcohol-dehydrogenase": {
        "name": "Alcohol dehydrogenase",
        "uniprot": "P07327/P00325",
        "sequence": "STAGKVIKCKAAVLWELKKPFSIEEVEVAPPKAHEVRIKMVAVGICGTDDHVVSGTMVTPLPVILGHEAAGIVESVGEGVTTVKPGDKVIPLAIPQCGKCRICKNPESNYCLKNDVSNPQGTLQDGTSRFTCRRKPIHHFLGISTFSQYTVVDENAVAKIDAASPLEKVCLIGCGFSTGYGSAVNVAKVTPGSTCAVFGLGGVGLSAIMGCKAAGAARIIAVDINKDKFAKAKELGATECINPQDYKKPIQEVLKEMTDGGVDFSFEVIGRLDTMMASLLCCHEACGTSVIVGVPPDSQNLSMNPMLLLTGRTWKGAILGGFKSKECVPKLVADFMAKKFSLDALITHVLPFEKINEGFDLLHSGKSIRTILMF",
    },
    "triosephosphate-isomerase": {
        "name": "Triosephosphate isomerase",
        "uniprot": "P60174",
        "sequence": "APSRKFFVGGNWKMNGRKQSLGELIGTLNAAKVPADTEVVCAPPTAYIDFARQKLDPKIAVAAQNCYKVTNGAFTGEISPGMIKDCGATWVVLGHSERRHVFGESDELIGQKVAHALAEGLGVIACIGEKLDEREAGITEKVVFEQTKVIADNVKDWSKVVLAYEPVWAIGTGKTATPQQAQEVHEKLRGWLKSNVSDAVAQSTRIIYGGSVTGATCKELASQPDVDGFLVGGASLKPEFVDIINAKQ",
    },
    "glucokinase": {
        "name": "Glucokinase",
        "uniprot": "P35557",
        "sequence": "MLDDRARMEAAKKEKVEQILAEFQLQEEDLKKVMRRMQKEMDRGLRLETHEEASVKMLPTYVRSTPEGSEVGDFLSLDLGGTNFRVMLVKVGEGEEGQWSVKTKHQMYSIPEDAMTGTAEMLFDYISECISDFLDKHQMKHKKLPLGFTFSFPVRHEDIDKGILLNWTKGFKASGAEGNNVVGLLRDAIKRRGDFEMDVVAMVNDTVATMISCYYEDHQCEVGMIVGTGCNACYMEEMQNVELVEGDEGRMCVNTEWGAFGDSGELDEFLLEYDRLVDESSANPGQQLYEKLIGGKYMELVRLVLLRLVDENLLFHGEASEQLRTRGAFETRFVSQVESDTGDRKQIYNILSTLGLRPSTTDCDIVRRACESVSTRAAHMCSAGLAGVINRMRESRSEDVMRITVGVDGSVYKLHPSFKERFHASVRRLTPSCEITFIESEEGSGRGAALVSAVACKKACMLGQ",
    },
}


def summarize(slug: str, candidate: dict[str, str], result: dict[str, Any]) -> dict[str, Any]:
    model = min(result.get("models", []), key=lambda item: item.get("rank", 1_000_000))
    frames = (model.get("analysis") or result.get("analysis") or {}).get("frames", [])
    plddt = [frame.get("mean_plddt") for frame in frames if frame.get("mean_plddt") is not None]
    rmsd = [frame.get("rmsd_to_reference_a") for frame in frames if frame.get("rmsd_to_reference_a") is not None]
    return {
        "slug": slug,
        "name": candidate["name"],
        "uniprot": candidate["uniprot"],
        "length": len(candidate["sequence"]),
        "frame_count": len(frames),
        "mean_plddt_by_recycle": plddt,
        "rmsd_to_final_a_by_recycle": rmsd,
        "plddt_climb": round(max(plddt) - plddt[0], 2) if plddt else None,
        "initial_rmsd_to_final_a": rmsd[0] if rmsd else None,
        "rmsd_monotonic_nonincreasing": all(a >= b for a, b in zip(rmsd, rmsd[1:])),
        "final_mean_plddt": plddt[-1] if plddt else model.get("mean_plddt"),
        "cache_key": result.get("cache_key"),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Benchmark the Goldilocks recycling candidates with LocalColabFold.")
    parser.add_argument("targets", nargs="*", choices=CANDIDATES, default=list(CANDIDATES))
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    os.environ.update(
        {
            "LOCALCOLABFOLD_BIN": str(ROOT / "scripts" / "colabfold_batch_wsl.cmd"),
            "LOCALCOLABFOLD_MODEL_TYPE": "alphafold2_ptm",
            "LOCALCOLABFOLD_NUM_MODELS": "1",
            "LOCALCOLABFOLD_NUM_RECYCLE": "8",
            "LOCALCOLABFOLD_MAX_MSA": "32:64",
            "LOCALCOLABFOLD_OVERWRITE": "1" if args.force else "0",
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
    summaries = []
    for slug in args.targets:
        candidate = CANDIDATES[slug]
        print(f"== {candidate['name']} ({len(candidate['sequence'])} aa) ==", flush=True)
        result = predict_with_engine(candidate["sequence"], "localcolabfold", options=options, log_callback=print)
        result = save_cached_prediction(candidate["sequence"], "localcolabfold", result, options)
        summary = summarize(slug, candidate, result)
        summaries.append(summary)
        print(json.dumps(summary, indent=2), flush=True)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output = OUTPUT_DIR / "summary.json"
    output.write_text(json.dumps({"settings": options, "results": summaries}, indent=2), encoding="utf-8")
    print(f"summary: {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
