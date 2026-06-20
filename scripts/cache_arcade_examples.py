#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
from copy import deepcopy
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.job_queue import cache_path, load_cached_prediction, normalize_options, save_cached_prediction  # noqa: E402
from backend.adapters import predict_with_engine  # noqa: E402
from backend.sanity_gate import evaluate_sanity_gate  # noqa: E402


ROOT = Path(__file__).resolve().parents[1]
DEMO_DIR = ROOT / "frontend" / "public" / "demo-cache"


def _targets() -> list[dict[str, Any]]:
    script = (
        "import { arcadeTargets } from './frontend/src/data/targets.js'; "
        "console.log(JSON.stringify(arcadeTargets().map(t=>({"
        "n:t.n,name:t.name,full:t.full,seq:t.seq,pdb:t.pdb,concept:t.concept,"
        "msaMode:t.msaMode,expectation:t.expectation,tag:t.tag,blurb:t.blurb"
        "}))))"
    )
    raw = subprocess.check_output(["node", "--input-type=module", "-e", script], cwd=ROOT, text=True)
    return json.loads(raw)


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _demo_payload(result: dict[str, Any], target: dict[str, Any], verdict: dict[str, Any]) -> dict[str, Any]:
    payload = deepcopy(result)
    payload.setdefault("meta", {})
    payload["meta"]["demo_cached"] = True
    payload["meta"]["target"] = {
        "n": target["n"],
        "name": target["name"],
        "pdb": target["pdb"],
        "expectation": target["expectation"],
        "msa_mode": target["msaMode"],
    }
    payload["sanity_gate"] = verdict
    return payload


def _write_demo_result(target: dict[str, Any], result: dict[str, Any], verdict: dict[str, Any]) -> dict[str, Any]:
    DEMO_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{target['n']}-{target['name'].lower().replace(' ', '-')}.json"
    path = DEMO_DIR / filename
    payload = _demo_payload(result, target, verdict)
    path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    return {
        "target": target["n"],
        "name": target["name"],
        "url": f"/demo-cache/{filename}",
        "sequence_sha256": _sha256(target["seq"]),
        "msa_mode": target["msaMode"],
        "expectation": target["expectation"],
        "cache_key": result.get("cache_key"),
        "passed_gate": verdict.get("passed"),
        "best_mean_plddt": verdict.get("best_mean_plddt"),
        "bytes": path.stat().st_size,
    }


def _ensure_environment(args: argparse.Namespace) -> None:
    if args.wsl_gpu and not args.colabfold_bin:
        args.colabfold_bin = str(ROOT / "scripts" / "colabfold_batch_wsl.cmd")
    if args.colabfold_bin:
        os.environ["LOCALCOLABFOLD_BIN"] = str(Path(args.colabfold_bin).resolve())
    if args.data_dir:
        os.environ["LOCALCOLABFOLD_DATA_DIR"] = str(Path(args.data_dir).resolve())
    elif args.wsl_gpu:
        os.environ.pop("LOCALCOLABFOLD_DATA_DIR", None)
        os.environ["LOCALCOLABFOLD_DISABLE_UNIFIED_MEMORY"] = "1"
    if args.cpu:
        os.environ["LOCALCOLABFOLD_CPU"] = "1"
        os.environ["JAX_PLATFORMS"] = "cpu"
        os.environ["CUDA_VISIBLE_DEVICES"] = ""
        os.environ["LOCALCOLABFOLD_DISABLE_UNIFIED_MEMORY"] = "0"
    os.environ["LOCALCOLABFOLD_MODEL_TYPE"] = args.model_type
    os.environ["LOCALCOLABFOLD_NUM_MODELS"] = str(args.num_models)
    os.environ["LOCALCOLABFOLD_NUM_RECYCLE"] = str(args.num_recycle)
    os.environ["LOCALCOLABFOLD_OVERWRITE"] = "1" if args.overwrite_runs else "0"
    os.environ["AF_COMPANION_REAL_TIMEOUT_SECONDS"] = str(args.timeout_seconds)
    os.environ["AF_COMPANION_MAX_SEQUENCE"] = str(args.max_sequence)
    os.environ["AF_COMPANION_VRAM_BUDGET_MIB"] = str(args.vram_budget_mib)
    for env_name, value in {
        "LOCALCOLABFOLD_MAX_MSA": args.max_msa,
        "LOCALCOLABFOLD_MAX_SEQ": args.max_seq,
        "LOCALCOLABFOLD_MAX_EXTRA_SEQ": args.max_extra_seq,
    }.items():
        if value:
            os.environ[env_name] = str(value)
        else:
            os.environ.pop(env_name, None)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run/cache real LocalColabFold results for the six arcade examples.")
    parser.add_argument("--wsl-gpu", action="store_true", help="Use scripts/colabfold_batch_wsl.cmd when no bin is supplied.")
    parser.add_argument("--cpu", action="store_true", help="Force JAX/ColabFold to run on CPU through WSL.")
    parser.add_argument("--colabfold-bin", default="")
    parser.add_argument("--data-dir", default="")
    parser.add_argument("--model-type", default="alphafold2_ptm")
    parser.add_argument("--num-models", type=int, default=1)
    parser.add_argument("--num-recycle", type=int, default=8)
    parser.add_argument("--timeout-seconds", type=int, default=7200)
    parser.add_argument("--max-sequence", type=int, default=768)
    parser.add_argument("--vram-budget-mib", type=int, default=7000)
    parser.add_argument("--max-msa", default="", help="Optional ColabFold --max-msa value, e.g. 128:256 for 8 GB GPUs.")
    parser.add_argument("--max-seq", default="", help="Optional ColabFold --max-seq value.")
    parser.add_argument("--max-extra-seq", default="", help="Optional ColabFold --max-extra-seq value.")
    parser.add_argument("--threshold", type=float, default=70.0)
    parser.add_argument("--baseline", type=float, default=26.0)
    parser.add_argument("--targets", nargs="*", help="Target numbers or names to run. Default: all.")
    parser.add_argument("--force", action="store_true", help="Ignore JSON prediction cache and run again.")
    parser.add_argument("--overwrite-runs", action="store_true", help="Tell LocalColabFold to overwrite run directories.")
    parser.add_argument("--demo-public", action="store_true", help="Write frontend/public/demo-cache fixtures and manifest.")
    args = parser.parse_args()

    _ensure_environment(args)
    wanted = {item.lower() for item in args.targets or []}
    rows: list[dict[str, Any]] = []
    failures = 0

    for target in _targets():
        if wanted and target["n"].lower() not in wanted and target["name"].lower() not in wanted:
            continue
        options = normalize_options({"num_recycle": args.num_recycle, "num_models": args.num_models, "msa_mode": target["msaMode"]})
        path = cache_path(target["seq"], "localcolabfold", options)
        print(f"\n== {target['n']} {target['name']} ({len(target['seq'])} aa, {target['msaMode']}) ==")
        print(f"cache: {path.name}")
        result = None if args.force else load_cached_prediction(target["seq"], "localcolabfold", options)
        if result is None:
            logs: list[str] = []

            def log(line: str) -> None:
                logs.append(line)
                print(f"  {line}", flush=True)

            try:
                result = save_cached_prediction(
                    target["seq"],
                    "localcolabfold",
                    predict_with_engine(target["seq"], "localcolabfold", options=options, log_callback=log),
                    options,
                )
            except Exception as exc:  # noqa: BLE001
                failures += 1
                message = str(exc).encode("ascii", errors="replace").decode("ascii")
                print(f"FAILED {target['name']}: {message}")
                continue
        else:
            print("loaded existing cache")

        verdict = evaluate_sanity_gate(
            result,
            plddt_threshold=args.threshold,
            baseline_ceiling=args.baseline,
            expected_msa_mode=target["msaMode"],
        )
        print(verdict["summary"])
        if not verdict.get("passed"):
            print("gate did not pass; preserving result because lesson targets may be expected failures")
        row = None
        if args.demo_public:
            row = _write_demo_result(target, result, verdict)
            rows.append(row)
            print(f"demo: {row['url']} ({row['bytes']} bytes)")

    if args.demo_public:
        DEMO_DIR.mkdir(parents=True, exist_ok=True)
        manifest = {
            "version": 1,
            "generated_by": "scripts/cache_arcade_examples.py",
            "engine": "localcolabfold",
            "results": rows,
        }
        (DEMO_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        print(f"\nmanifest: {DEMO_DIR / 'manifest.json'}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
