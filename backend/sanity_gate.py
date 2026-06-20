"""MMseqs2 sanity-gate evaluation logic (pure, testable, no HTTP).

The hard part of the Phase 3 "did the MSA actually help?" check is the PASS/FAIL
science, not the polling. This module evaluates a finished prediction `result`
dict and decides whether an MSA-backed run is behaving sanely:

  * best-model mean pLDDT clears a per-target threshold,
  * it improved meaningfully over the single-sequence baseline ceiling,
  * recycle convergence (aligned RMSD-to-previous) trends downward,
  * provenance says localcolabfold + the expected MSA mode.

The live runner (POST a job, poll, fetch result, call this) is scaffolded in
scripts/run_mmseqs_sanity_gate.py - see HANDOFF docs. Keeping the judgment here
means it can be unit-tested against the cached GFP failure without a GPU.
"""

from __future__ import annotations

from typing import Any


def _best_model(result: dict[str, Any]) -> dict[str, Any] | None:
    models = result.get("models")
    if isinstance(models, list) and models:
        # rank 1 first; fall back to max mean_plddt
        ranked = sorted(
            models,
            key=lambda m: (m.get("rank", 1_000_000), -(m.get("mean_plddt") or 0)),
        )
        return ranked[0]
    return None


def _best_mean_plddt(result: dict[str, Any]) -> float | None:
    model = _best_model(result)
    if model and isinstance(model.get("mean_plddt"), (int, float)):
        return float(model["mean_plddt"])
    plddt = result.get("plddt")
    if isinstance(plddt, list) and plddt:
        return round(sum(plddt) / len(plddt), 2)
    return None


def _msa_mode(result: dict[str, Any]) -> str | None:
    for path in (
        ("meta", "options", "msa_mode"),
        ("options", "msa_mode"),
        ("provenance", "metadata", "msa_mode"),
    ):
        node: Any = result
        for key in path:
            node = node.get(key) if isinstance(node, dict) else None
            if node is None:
                break
        if isinstance(node, str) and node:
            return node
    # last resort: scan the recorded command list
    cmd = (((result.get("provenance") or {}).get("metadata") or {}).get("command")) or (
        (result.get("meta") or {}).get("command")
    )
    if isinstance(cmd, list):
        for i, tok in enumerate(cmd):
            if tok == "--msa-mode" and i + 1 < len(cmd):
                return str(cmd[i + 1])
    return None


def _convergence_trend(result: dict[str, Any]) -> tuple[bool | None, str]:
    analysis = result.get("analysis") or {}
    frames = analysis.get("frames") if isinstance(analysis, dict) else None
    if not isinstance(frames, list) or len(frames) < 4:
        return None, "not enough frames to judge convergence"
    deltas = [
        f.get("rmsd_to_previous_a")
        for f in frames
        if isinstance(f.get("rmsd_to_previous_a"), (int, float))
    ]
    if len(deltas) < 3:
        return None, "not enough rmsd-to-previous values"
    third = max(1, len(deltas) // 3)
    first_mean = sum(deltas[:third]) / third
    last_mean = sum(deltas[-third:]) / third
    ok = last_mean <= first_mean  # later recycles should move less, on average
    return ok, f"first-third mean {first_mean:.2f} A vs last-third mean {last_mean:.2f} A"


def evaluate_sanity_gate(
    result: dict[str, Any],
    *,
    plddt_threshold: float = 70.0,
    baseline_ceiling: float | None = None,
    min_improvement: float = 25.0,
    expected_msa_mode: str = "mmseqs2_uniref_env",
    expected_engine: str = "localcolabfold",
) -> dict[str, Any]:
    """Return {passed, checks[], summary} judging an MSA-backed prediction.

    baseline_ceiling: the single-sequence mean pLDDT for this target (e.g. ~26
    for GFP). If provided, require best - baseline >= min_improvement.
    """
    checks: list[dict[str, Any]] = []

    best = _best_mean_plddt(result)
    checks.append({
        "name": "mean_plddt_threshold",
        "passed": best is not None and best >= plddt_threshold,
        "detail": f"best mean pLDDT = {best} (need >= {plddt_threshold})",
    })

    if baseline_ceiling is not None:
        improved = best is not None and (best - baseline_ceiling) >= min_improvement
        checks.append({
            "name": "improvement_over_single_sequence",
            "passed": improved,
            "detail": (
                f"best {best} vs single-seq baseline {baseline_ceiling} "
                f"(need delta >= {min_improvement})"
            ),
        })

    trend_ok, trend_detail = _convergence_trend(result)
    checks.append({
        "name": "recycle_convergence",
        "passed": bool(trend_ok),
        "detail": trend_detail,
        "indeterminate": trend_ok is None,
    })

    engine = result.get("engine") or (result.get("provenance") or {}).get("engine")
    checks.append({
        "name": "engine",
        "passed": engine == expected_engine,
        "detail": f"engine = {engine} (need {expected_engine})",
    })

    msa = _msa_mode(result)
    checks.append({
        "name": "msa_mode",
        "passed": msa == expected_msa_mode,
        "detail": f"msa_mode = {msa} (need {expected_msa_mode})",
    })

    passed = all(c["passed"] for c in checks if not c.get("indeterminate"))
    failed_names = [c["name"] for c in checks if not c["passed"] and not c.get("indeterminate")]
    summary = (
        "SANITY GATE PASSED: MSA-backed run looks healthy."
        if passed
        else f"SANITY GATE FAILED on: {', '.join(failed_names) or 'unknown'}."
    )
    return {"passed": passed, "best_mean_plddt": best, "checks": checks, "summary": summary}
