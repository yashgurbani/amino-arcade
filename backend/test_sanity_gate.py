"""Tests for backend.sanity_gate. Run: python backend/test_sanity_gate.py"""
from __future__ import annotations

import json
from pathlib import Path

try:
    from backend.sanity_gate import evaluate_sanity_gate, _msa_mode, _best_mean_plddt
except ModuleNotFoundError:  # pragma: no cover
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from backend.sanity_gate import evaluate_sanity_gate, _msa_mode, _best_mean_plddt

REPO = Path(__file__).resolve().parents[1]
GFP = REPO / "prediction-cache" / "jobs" / "94e52501-0d98-40be-b21e-44f2bd377cf8.json"


def _healthy_result():
    frames = [
        {"recycle_index": i, "rmsd_to_previous_a": d}
        for i, d in enumerate([None, 9.0, 4.0, 2.0, 1.0, 0.5])
    ]
    return {
        "engine": "localcolabfold",
        "plddt": [90, 92, 88],
        "models": [{"rank": 1, "model_id": "model_1", "mean_plddt": 90.0, "frames": frames}],
        "analysis": {"available": True, "frames": frames},
        "meta": {"options": {"msa_mode": "mmseqs2_uniref_env"}},
        "provenance": {"engine": "localcolabfold"},
    }


def test_healthy_run_passes():
    res = evaluate_sanity_gate(_healthy_result(), baseline_ceiling=26.0)
    assert res["passed"] is True, res
    assert res["best_mean_plddt"] == 90.0


def test_real_gfp_single_sequence_fails():
    if not GFP.exists():
        return
    result = json.loads(GFP.read_text(encoding="utf-8"))["result"]
    res = evaluate_sanity_gate(result, baseline_ceiling=26.0)
    # GFP single-sequence: pLDDT ~26, single_sequence msa -> must fail
    assert res["passed"] is False
    names = {c["name"]: c["passed"] for c in res["checks"]}
    assert names["mean_plddt_threshold"] is False
    assert names["improvement_over_single_sequence"] is False
    assert names["msa_mode"] is False  # it was single_sequence


def test_msa_mode_extracted_from_command_fallback():
    result = {
        "engine": "localcolabfold",
        "provenance": {"metadata": {"command": ["colabfold_batch", "--msa-mode", "single_sequence", "x"]}},
    }
    assert _msa_mode(result) == "single_sequence"


def test_threshold_boundary_and_improvement():
    base = _healthy_result()
    base["models"][0]["mean_plddt"] = 69.9
    base["plddt"] = [69, 70, 70]
    res = evaluate_sanity_gate(base, plddt_threshold=70.0, baseline_ceiling=26.0)
    # 69.9 < 70 threshold fails, but 69.9-26 = 43.9 >= 25 improvement passes
    names = {c["name"]: c["passed"] for c in res["checks"]}
    assert names["mean_plddt_threshold"] is False
    assert names["improvement_over_single_sequence"] is True
    assert res["passed"] is False


def test_convergence_indeterminate_does_not_block():
    res = evaluate_sanity_gate({
        "engine": "localcolabfold",
        "plddt": [90],
        "models": [{"rank": 1, "mean_plddt": 90.0}],
        "meta": {"options": {"msa_mode": "mmseqs2_uniref_env"}},
        "analysis": {"available": True, "frames": [{"recycle_index": 0}]},
    })
    conv = next(c for c in res["checks"] if c["name"] == "recycle_convergence")
    assert conv.get("indeterminate") is True
    assert res["passed"] is True  # indeterminate convergence must not fail the gate


def _run():
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    fails = 0
    for fn in fns:
        try:
            fn(); print(f"ok   {fn.__name__}")
        except Exception as e:  # noqa: BLE001
            fails += 1; print(f"FAIL {fn.__name__}: {e!r}")
    print(f"\n{len(fns)-fails}/{len(fns)} passed")
    return 1 if fails else 0


if __name__ == "__main__":
    raise SystemExit(_run())
