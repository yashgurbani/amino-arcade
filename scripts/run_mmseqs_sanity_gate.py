#!/usr/bin/env python3
"""Live MMseqs2 sanity-gate runner (SCAFFOLD - needs a configured backend + LocalColabFold).

Starts a real localcolabfold job with msa_mode=mmseqs2_uniref_env, polls to
completion, fetches the result, and judges it with backend.sanity_gate. Writes a
JSON report under work/sanity-gate/ (git-ignored).

The judgment logic is DONE and tested (backend/sanity_gate.py + test_sanity_gate.py).
Before running on a configured machine:
  - confirm the API base URL and request schema match the running backend,
  - confirm LOCALCOLABFOLD_BIN is set and a long real run is acceptable,
  - tune per-target thresholds/baselines (e.g. GFP single-seq ceiling ~26),
  - decide whether to cache a small fixture from a successful run.

Do NOT auto-run long GPU jobs in CI. This is an operator tool.

Usage:
  python scripts/run_mmseqs_sanity_gate.py --base-url http://127.0.0.1:8011 \
      --sequence MSKGEELFTG... --baseline 26 --threshold 70
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.sanity_gate import evaluate_sanity_gate  # noqa: E402

GFP = ("MSKGEELFTGVVPILVELDGDVNGHKFSVSGEGEGDATYGKLTLKFICTTGKLPVPWPTLVTTFYVQCFSRYPDHMKRHD"
       "FFKSAMPEGYVQERTIFFKDDGNYKTRAEVKFEGDTLVNRIELKGIDFKEDGNILGHKLEYNYNSHNVYIMADKQKNGIK"
       "VNFKIRHNIEDGSVQLADHYQQNTPIGDGPVLLPDNHYLSTQSALSKDPNEKRDHMVLLEFVTAAGITHGMDELYK")


def _post(url: str, payload: dict) -> dict:
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(req, timeout=60) as r:  # noqa: S310
        return json.loads(r.read().decode())


def _get(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=60) as r:  # noqa: S310
        return json.loads(r.read().decode())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default="http://127.0.0.1:8011")
    ap.add_argument("--sequence", default=GFP)
    ap.add_argument("--msa-mode", default="mmseqs2_uniref_env")
    ap.add_argument("--baseline", type=float, default=26.0, help="single-sequence mean pLDDT ceiling")
    ap.add_argument("--threshold", type=float, default=70.0)
    ap.add_argument("--poll-seconds", type=int, default=20)
    ap.add_argument("--timeout-seconds", type=int, default=7200)
    args = ap.parse_args()

    base = args.base_url.rstrip("/")
    job = _post(f"{base}/api/predict/jobs", {
        "sequence": args.sequence,
        "engine": "localcolabfold",
        "num_recycle": 8,
        "num_models": 1,
        "msa_mode": args.msa_mode,
    })
    job_id = (job.get("job") or {}).get("id") or job.get("id")
    if not job_id:
        print("Could not read job id from response:", job); return 2
    print(f"started job {job_id}; polling every {args.poll_seconds}s ...")

    deadline = time.time() + args.timeout_seconds
    status = "running"
    while time.time() < deadline:
        time.sleep(args.poll_seconds)
        snap = _get(f"{base}/api/predict/jobs/{job_id}")
        status = (snap.get("job") or snap).get("status", "running")
        print("  status:", status)
        if status in ("succeeded", "failed", "error"):
            break
    if status != "succeeded":
        print(f"job did not succeed (status={status})"); return 3

    result = _get(f"{base}/api/predict/jobs/{job_id}/result")
    result = result.get("result", result)
    verdict = evaluate_sanity_gate(
        result, plddt_threshold=args.threshold, baseline_ceiling=args.baseline,
        expected_msa_mode=args.msa_mode,
    )
    out_dir = Path(__file__).resolve().parents[1] / "work" / "sanity-gate"
    out_dir.mkdir(parents=True, exist_ok=True)
    report = out_dir / f"gate_{job_id}.json"
    report.write_text(json.dumps({"job_id": job_id, "verdict": verdict}, indent=2), encoding="utf-8")
    print("\n" + verdict["summary"])
    for c in verdict["checks"]:
        mark = "PASS" if c["passed"] else ("?" if c.get("indeterminate") else "FAIL")
        print(f"  [{mark}] {c['name']}: {c['detail']}")
    print(f"\nreport: {report}")
    return 0 if verdict["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
