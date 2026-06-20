#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.adapters import (  # noqa: E402
    _frame_from_pdb,
    _mean_score,
    _pae_from_payload,
    _read_msa_depth,
    _read_pae,
    _score_payload_for_model,
    _score_payload_for_rank,
    _trajectory,
)
from backend.job_queue import normalize_options, save_cached_prediction  # noqa: E402
from backend.pdb_utils import parse_residue_plddt, read_model_groups, read_pdbs, recycle_index  # noqa: E402
from backend.provenance import make_provenance  # noqa: E402
from backend.sanity_gate import evaluate_sanity_gate  # noqa: E402
from scripts.cache_arcade_examples import _sha256, _write_demo_result  # noqa: E402


ROOT = Path(__file__).resolve().parents[1]


def _targets() -> list[dict[str, Any]]:
    script = (
        "import { arcadeTargets } from './frontend/src/data/targets.js'; "
        "console.log(JSON.stringify(arcadeTargets().map(t=>({"
        "n:t.n,name:t.name,seq:t.seq,pdb:t.pdb,msaMode:t.msaMode,expectation:t.expectation"
        "}))))"
    )
    raw = subprocess.check_output(["node", "--input-type=module", "-e", script], cwd=ROOT, text=True)
    return json.loads(raw)


def _target(identifier: str) -> dict[str, Any]:
    wanted = identifier.lower()
    for target in _targets():
        if target["n"].lower() == wanted or target["name"].lower() == wanted:
            return target
    raise SystemExit(f"Unknown target: {identifier}")


def _build_result(target: dict[str, Any], out_dir: Path, options: dict[str, Any], command: list[str]) -> dict[str, Any]:
    model_groups = read_model_groups(out_dir)
    pdb_paths = read_pdbs(out_dir)
    if not model_groups and not pdb_paths:
        raise SystemExit(f"No PDB outputs found under {out_dir}")

    models: list[dict[str, Any]] = []
    for group in model_groups:
        rank = int(group["rank"])
        frame_paths = list(group.get("recycle_frames") or []) or [group["final"]]
        frames = [_frame_from_pdb(path.stem, path.read_text(encoding="utf-8", errors="replace")) for path in frame_paths]
        final_pdb = Path(group["final"]).read_text(encoding="utf-8", errors="replace")
        final_plddt = parse_residue_plddt(final_pdb) or (frames[-1].get("plddt") or [])
        scores = _score_payload_for_rank(out_dir, rank) or _score_payload_for_model(out_dir, group.get("model_id"))
        models.append(
            {
                "rank": rank,
                "model_id": group.get("model_id"),
                "seed": group.get("seed"),
                "mean_plddt": _mean_score(scores.get("plddt"), final_plddt),
                "ptm": scores.get("ptm"),
                "iptm": scores.get("iptm"),
                "pae": _pae_from_payload(scores),
                "frames": frames,
                "final_pdb": final_pdb,
                "plddt": final_plddt,
            }
        )

    if models:
        frames = models[0]["frames"]
        pae = models[0].get("pae")
        has_recycle_frames = any(recycle_index(path) is not None for path in model_groups[0].get("recycle_frames", []))
    else:
        frames = [_frame_from_pdb(path.stem, path.read_text(encoding="utf-8", errors="replace")) for path in pdb_paths]
        pae = _read_pae(out_dir)
        has_recycle_frames = any(recycle_index(path) is not None for path in pdb_paths)

    return _trajectory(
        target["seq"],
        "localcolabfold",
        make_provenance(
            "localcolabfold",
            source=str(out_dir),
            command=command,
            msa_mode=options.get("msa_mode"),
            msa_depth=_read_msa_depth(out_dir),
        ),
        frames,
        {
            "cached": False,
            "run_dir": str(out_dir.parent),
            "command": command,
            "msa_mode": options.get("msa_mode"),
            "msa_depth": _read_msa_depth(out_dir),
            "pae": pae,
            "options": options,
            "trajectory_note": "LocalColabFold recycle PDBs parsed as real inference-refinement frames." if has_recycle_frames else "Endpoint only; no intermediate recycle PDBs were exposed.",
        },
        models=models or None,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Adopt an existing ColabFold output directory into backend/demo caches.")
    parser.add_argument("target")
    parser.add_argument("out_dir", type=Path)
    parser.add_argument("--msa-mode", default=None)
    parser.add_argument("--num-recycle", type=int, default=8)
    parser.add_argument("--num-models", type=int, default=1)
    parser.add_argument("--threshold", type=float, default=70.0)
    parser.add_argument("--baseline", type=float, default=26.0)
    parser.add_argument("--demo-public", action="store_true")
    args = parser.parse_args()

    target = _target(args.target)
    options = normalize_options(
        {
            "num_recycle": args.num_recycle,
            "num_models": args.num_models,
            "msa_mode": args.msa_mode or target["msaMode"],
        }
    )
    command = ["adopted-colabfold-output", str(args.out_dir)]
    result = save_cached_prediction(target["seq"], "localcolabfold", _build_result(target, args.out_dir, options, command), options)
    verdict = evaluate_sanity_gate(
        result,
        plddt_threshold=args.threshold,
        baseline_ceiling=args.baseline,
        expected_msa_mode=options.get("msa_mode") or target["msaMode"],
    )
    print(verdict["summary"])
    print(f"cache_key: {result.get('cache_key')}")
    if args.demo_public:
        row = _write_demo_result(target, result, verdict)
        manifest_path = ROOT / "frontend" / "public" / "demo-cache" / "manifest.json"
        manifest = {"version": 1, "generated_by": "scripts/adopt_colabfold_output.py", "engine": "localcolabfold", "results": []}
        if manifest_path.exists():
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        rows = [item for item in manifest.get("results", []) if item.get("sequence_sha256") != _sha256(target["seq"])]
        rows.append(row)
        manifest["results"] = sorted(rows, key=lambda item: str(item.get("target")))
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        print(f"demo: {row['url']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
