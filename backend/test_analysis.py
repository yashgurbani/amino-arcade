"""Tests for backend.analysis.

Runnable two ways:
  * pytest:           python -m pytest backend/test_analysis.py
  * standalone:       python backend/test_analysis.py
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

try:  # allow both `python -m pytest backend/...` and `python backend/test_analysis.py`
    from backend import analysis
except ModuleNotFoundError:  # pragma: no cover - direct invocation fallback
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from backend import analysis


REPO = Path(__file__).resolve().parents[1]
CACHED_JOB = REPO / "prediction-cache" / "jobs" / "94e52501-0d98-40be-b21e-44f2bd377cf8.json"


def _random_structure(n: int = 40, seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    # a self-avoiding-ish random walk so contacts/geometry are non-degenerate
    steps = rng.normal(size=(n, 3))
    steps = steps / np.linalg.norm(steps, axis=1, keepdims=True) * analysis.CA_VIRTUAL_BOND_A
    return np.cumsum(steps, axis=0)


def _rotation(seed: int = 1) -> np.ndarray:
    rng = np.random.default_rng(seed)
    a = rng.normal(size=(3, 3))
    q, _ = np.linalg.qr(a)
    if np.linalg.det(q) < 0:
        q[:, 0] = -q[:, 0]
    return q


def test_kabsch_recovers_pure_rigid_motion():
    p = _random_structure(seed=2)
    r = _rotation(seed=3)
    t = np.array([10.0, -5.0, 3.0])
    moved = p @ r.T + t
    # raw RMSD is large (tumbling), Kabsch RMSD ~0 (same internal structure)
    assert analysis.raw_rmsd(moved, p) > 5.0
    assert analysis.kabsch_rmsd(moved, p) < 1e-6


def test_kabsch_rmsd_is_symmetric():
    a = _random_structure(seed=4)
    b = _random_structure(seed=5)
    assert math.isclose(analysis.kabsch_rmsd(a, b), analysis.kabsch_rmsd(b, a), abs_tol=1e-6)


def test_per_residue_displacement_zero_for_identical():
    p = _random_structure(seed=6)
    disp = analysis.per_residue_displacement(p, p)
    assert max(disp) < 1e-6


def test_contact_delta_self_is_perfect():
    p = _random_structure(seed=7)
    contacts = analysis.contact_pairs(p)
    delta = analysis.contact_delta(contacts, contacts)
    assert delta["jaccard"] == 1.0
    assert delta["gained_count"] == 0 and delta["lost_count"] == 0


def test_contact_pairs_respects_min_sequence_separation():
    # a tight helix-like coil: many local neighbours, all must be filtered out
    n = 30
    coords = np.array([[math.cos(i), math.sin(i), i * 0.3] for i in range(n)])
    pairs = analysis.contact_pairs(coords, threshold=2.0, min_seq_sep=6)
    assert all(j - i >= 6 for (i, j) in pairs)


def test_ca_fape_invariant_under_rigid_motion():
    p = _random_structure(seed=8)
    r = _rotation(seed=9)
    moved = p @ r.T + np.array([4.0, 4.0, 4.0])
    # FAPE is SE(3)-invariant: a rigid copy has ~0 frame-aligned error
    assert analysis.ca_fape(moved, p) < 1e-6


def test_ca_fape_detects_reflection():
    p = _random_structure(seed=10)
    mirror = p.copy()
    mirror[:, 0] = -mirror[:, 0]  # flip handedness
    assert analysis.ca_fape(mirror, p) > 1.0


def test_plddt_stats_bands():
    stats = analysis.plddt_stats([10, 40, 60, 80, 95])
    assert stats["fraction_below_50"] == 0.4   # 10, 40
    assert stats["fraction_below_70"] == 0.6   # 10, 40, 60


def test_build_analysis_handles_missing_coords():
    res = analysis.build_analysis([{"label": "x", "plddt": [50]}])
    assert res["available"] is False
    assert res["frames"] == []


def test_build_analysis_reference_final_has_zero_self_rmsd():
    frames = [
        {"label": "r0", "ca": _random_structure(seed=11).tolist(), "plddt": [30] * 40},
        {"label": "r1", "ca": _random_structure(seed=12).tolist(), "plddt": [40] * 40},
    ]
    res = analysis.build_analysis(frames, reference="final")
    assert res["available"] is True
    assert res["reference_index"] == 1
    # last frame is the reference -> aligned RMSD to reference is ~0
    assert res["frames"][-1]["rmsd_to_reference_a"] < 1e-6
    # first frame carries no "previous"
    assert res["frames"][0]["rmsd_to_previous_a"] is None
    # delta pLDDT computed for the second frame
    assert res["frames"][1]["delta_mean_plddt"] == 10.0
    assert res["max_displacement_overall_a"] == max(f["max_displacement_to_reference_a"] for f in res["frames"])
    assert all(f["max_displacement_overall_a"] == res["max_displacement_overall_a"] for f in res["frames"])


def test_against_real_cached_gfp_job():
    """The example-2 GFP run: confirms our forensic numbers are reproducible."""
    if not CACHED_JOB.exists():
        return  # fixture not present in this checkout; skip silently
    data = json.loads(CACHED_JOB.read_text(encoding="utf-8"))
    frames = data["result"]["frames"]
    res = analysis.build_analysis(frames, reference="final")
    assert res["available"] is True
    f = res["frames"]
    # 9 recycle frames
    assert len(f) == 9
    # mean pLDDT is stuck in the mid-20s (doomed single-sequence run)
    assert all(20 <= e["mean_plddt"] <= 30 for e in f)
    # frame 0 tumbles a lot in raw coords but far less once aligned (the illusion)
    assert f[0]["raw_rmsd_to_reference_a"] > f[0]["rmsd_to_reference_a"] + 3.0
    # almost the entire structure is below the caution band
    assert f[-1]["fraction_below_70"] > 0.9


def _run_standalone() -> int:
    funcs = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failures = 0
    for fn in funcs:
        try:
            fn()
            print(f"ok   {fn.__name__}")
        except AssertionError as exc:  # noqa: PERF203
            failures += 1
            print(f"FAIL {fn.__name__}: {exc}")
        except Exception as exc:  # noqa: BLE001
            failures += 1
            print(f"ERROR {fn.__name__}: {exc!r}")
    print(f"\n{len(funcs) - failures}/{len(funcs)} passed")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(_run_standalone())
