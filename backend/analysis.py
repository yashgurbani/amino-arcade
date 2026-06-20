"""Derived per-frame analysis for AF2-family recycle trajectories.

This module is intentionally free of any web-framework or AlphaFold dependency.
It turns the *real* coordinates we already parse from LocalColabFold recycle PDBs
into honest, inspectable diagnostics: rigid-body superposition, RMSD, per-residue
displacement, Cα contact maps and their deltas, a Cα-frame FAPE approximation,
backbone geometry sanity, and pLDDT statistics.

Honesty boundaries (see HANDOFF_PEDAGOGY_AND_LENSES.md, Part 7):
  * Nothing here invents motion or interpolates frames. Every number is computed
    from coordinates LocalColabFold actually produced.
  * "FAPE" here is a Cα-only approximation to a reference structure, not the
    all-atom, all-frames clamped FAPE *loss* from the paper. It is labelled as
    such everywhere it surfaces.
  * pLDDT deltas are confidence deltas, never "stabilization" or "energy".

The public entrypoint is :func:`build_analysis`, which returns a JSON-serialisable
dict keyed by recycle index. The adapter attaches it to the trajectory result
under ``result["analysis"]`` without disturbing the legacy ``frames`` payload.
"""

from __future__ import annotations

from typing import Any, Iterable, Sequence

import math

import numpy as np

# ---------------------------------------------------------------------------
# Tunable constants. Kept module-level so tests and the frontend mirror them.
# ---------------------------------------------------------------------------
CONTACT_THRESHOLD_A = 8.0          # Cα–Cα distance defining a "contact"
CONTACT_MIN_SEQ_SEP = 6            # ignore trivial local contacts |i-j| < this
CA_VIRTUAL_BOND_A = 3.8            # ideal consecutive Cα–Cα distance
CA_BOND_TOLERANCE_A = 1.0          # allowed deviation before flagging geometry
CA_CLASH_A = 3.4                   # non-adjacent Cα closer than this = clash
FAPE_CLAMP_A = 10.0                # clamp distance for the Cα-FAPE approximation
PLDDT_LOW = 50.0                   # below: likely unreliable / disordered
PLDDT_CAUTION = 70.0              # below: treat with caution

TRAJECTORY_KIND = "af2_inference_refinement"


# ---------------------------------------------------------------------------
# Linear algebra: Kabsch superposition
# ---------------------------------------------------------------------------
def _as_xyz(coords: Sequence[Sequence[float]]) -> np.ndarray:
    arr = np.asarray(coords, dtype=float)
    if arr.ndim != 2 or arr.shape[1] != 3:
        raise ValueError(f"expected an (N, 3) coordinate array, got shape {arr.shape}")
    return arr


def kabsch(mobile: np.ndarray, target: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Return the rotation R and translation t mapping ``mobile`` onto ``target``.

    Minimises RMSD with a proper (det = +1) rotation; reflections are corrected
    so a mirror image is never silently "fixed" into the target.
    Applying the transform: ``aligned = mobile @ R.T + t``.
    """
    if mobile.shape != target.shape:
        raise ValueError(f"shape mismatch: {mobile.shape} vs {target.shape}")
    mob_c = mobile.mean(axis=0)
    tgt_c = target.mean(axis=0)
    p = mobile - mob_c
    q = target - tgt_c
    h = p.T @ q
    u, _s, vt = np.linalg.svd(h)
    d = np.sign(np.linalg.det(vt.T @ u.T))
    correction = np.diag([1.0, 1.0, d])
    r = vt.T @ correction @ u.T
    t = tgt_c - r @ mob_c
    return r, t


def superpose(mobile: Sequence[Sequence[float]], target: Sequence[Sequence[float]]) -> np.ndarray:
    """Rigidly superpose ``mobile`` onto ``target`` (Kabsch); return aligned coords."""
    m = _as_xyz(mobile)
    t = _as_xyz(target)
    r, trans = kabsch(m, t)
    return m @ r.T + trans


def rmsd(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.sum((a - b) ** 2, axis=1))))


def kabsch_rmsd(mobile: Sequence[Sequence[float]], target: Sequence[Sequence[float]]) -> float:
    """RMSD after optimal rigid-body superposition (rotation/translation removed)."""
    return rmsd(superpose(mobile, target), _as_xyz(target))


def raw_rmsd(mobile: Sequence[Sequence[float]], target: Sequence[Sequence[float]]) -> float:
    """RMSD in the coordinates as stored (includes any global tumbling)."""
    return rmsd(_as_xyz(mobile), _as_xyz(target))


def per_residue_displacement(
    mobile: Sequence[Sequence[float]], target: Sequence[Sequence[float]]
) -> list[float]:
    """Per-residue Cα displacement (Å) after superposing ``mobile`` onto ``target``."""
    aligned = superpose(mobile, target)
    tgt = _as_xyz(target)
    return [round(float(v), 3) for v in np.linalg.norm(aligned - tgt, axis=1)]


def radius_of_gyration(coords: Sequence[Sequence[float]]) -> float:
    c = _as_xyz(coords)
    value = float(np.sqrt(np.mean(np.sum((c - c.mean(axis=0)) ** 2, axis=1))))
    return round(value, 3) if math.isfinite(value) else None


# ---------------------------------------------------------------------------
# Contact maps (drives the Coevolution / Contacts lens)
# ---------------------------------------------------------------------------
def contact_pairs(
    coords: Sequence[Sequence[float]],
    threshold: float = CONTACT_THRESHOLD_A,
    min_seq_sep: int = CONTACT_MIN_SEQ_SEP,
) -> set[tuple[int, int]]:
    """Set of residue index pairs (i < j) whose Cα are within ``threshold`` Å."""
    c = _as_xyz(coords)
    n = len(c)
    if n < 2:
        return set()
    diff = c[:, None, :] - c[None, :, :]
    dist = np.sqrt(np.sum(diff * diff, axis=-1))
    iu, ju = np.triu_indices(n, k=min_seq_sep)
    close = dist[iu, ju] <= threshold
    return {(int(i), int(j)) for i, j in zip(iu[close], ju[close])}


def contact_delta(
    current: set[tuple[int, int]], other: set[tuple[int, int]]
) -> dict[str, Any]:
    """Gained / lost / stable contacts and the Jaccard overlap vs ``other``."""
    gained = sorted(current - other)
    lost = sorted(other - current)
    stable = sorted(current & other)
    union = current | other
    jaccard = round(len(stable) / len(union), 4) if union else 1.0
    return {
        "gained": [list(p) for p in gained],
        "lost": [list(p) for p in lost],
        "stable_count": len(stable),
        "gained_count": len(gained),
        "lost_count": len(lost),
        "jaccard": jaccard,
    }


# ---------------------------------------------------------------------------
# Cα-frame FAPE approximation (drives the FAPE & chirality lens)
# ---------------------------------------------------------------------------
def _ca_local_frames(coords: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Build per-residue local frames from (CA[i-1], CA[i], CA[i+1]).

    Returns (origins, rotations) where rotations[i] maps world -> local frame i.
    Endpoints reuse their single available neighbour. This is the standard
    Cα-only frame trick; it is an approximation to the paper's backbone frames.
    """
    n = len(coords)
    prev_idx = np.clip(np.arange(n) - 1, 0, n - 1)
    next_idx = np.clip(np.arange(n) + 1, 0, n - 1)
    origin = coords
    e1 = coords[next_idx] - coords[prev_idx]
    e1 = _safe_unit(e1)
    ref = coords[next_idx] - coords  # in-plane reference vector
    proj = np.sum(ref * e1, axis=1, keepdims=True) * e1
    e2 = _safe_unit(ref - proj)
    e3 = np.cross(e1, e2)
    rot = np.stack([e1, e2, e3], axis=1)  # (N, 3, 3): rows are basis vectors
    return origin, rot


def _safe_unit(v: np.ndarray) -> np.ndarray:
    norm = np.linalg.norm(v, axis=-1, keepdims=True)
    norm = np.where(norm < 1e-8, 1.0, norm)
    return v / norm


def ca_fape(
    mobile: Sequence[Sequence[float]],
    target: Sequence[Sequence[float]],
    clamp: float = FAPE_CLAMP_A,
) -> float:
    """Clamped Cα-frame FAPE approximation between ``mobile`` and ``target``.

    For every residue frame, both structures' Cα are expressed in that local
    frame and the position error is measured, clamped, and averaged over all
    residue pairs. SE(3)-invariant by construction (no global alignment needed).
    """
    m = _as_xyz(mobile)
    t = _as_xyz(target)
    if m.shape != t.shape or len(m) < 3:
        return None
    o_m, r_m = _ca_local_frames(m)
    o_t, r_t = _ca_local_frames(t)
    # points of m in each frame of m: (N_frames, N_points, 3)
    local_m = np.einsum("fij,fpj->fpi", r_m, (m[None, :, :] - o_m[:, None, :]))
    local_t = np.einsum("fij,fpj->fpi", r_t, (t[None, :, :] - o_t[:, None, :]))
    err = np.linalg.norm(local_m - local_t, axis=-1)
    err = np.minimum(err, clamp)
    value = float(err.mean())
    return round(value, 4) if math.isfinite(value) else None


# ---------------------------------------------------------------------------
# Backbone geometry sanity (drives the Triangle / realizability lens)
# ---------------------------------------------------------------------------
def geometry_violations(coords: Sequence[Sequence[float]]) -> dict[str, int]:
    """Count backbone geometry problems: bad virtual-bond lengths and clashes."""
    c = _as_xyz(coords)
    n = len(c)
    if n < 2:
        return {"bond_outliers": 0, "clashes": 0}
    consecutive = np.linalg.norm(c[1:] - c[:-1], axis=1)
    bond_outliers = int(np.sum(np.abs(consecutive - CA_VIRTUAL_BOND_A) > CA_BOND_TOLERANCE_A))
    diff = c[:, None, :] - c[None, :, :]
    dist = np.sqrt(np.sum(diff * diff, axis=-1))
    iu, ju = np.triu_indices(n, k=2)  # skip self and immediate neighbours
    clashes = int(np.sum(dist[iu, ju] < CA_CLASH_A))
    return {"bond_outliers": bond_outliers, "clashes": clashes}


# ---------------------------------------------------------------------------
# pLDDT statistics (drives the Confidence lens + low-confidence lesson card)
# ---------------------------------------------------------------------------
def plddt_stats(plddt: Sequence[float]) -> dict[str, Any]:
    if not plddt:
        return {
            "mean": None, "median": None,
            "fraction_below_50": None, "fraction_below_70": None,
        }
    arr = np.asarray(plddt, dtype=float)
    return {
        "mean": round(float(arr.mean()), 2),
        "median": round(float(np.median(arr)), 2),
        "fraction_below_50": round(float(np.mean(arr < PLDDT_LOW)), 4),
        "fraction_below_70": round(float(np.mean(arr < PLDDT_CAUTION)), 4),
    }


# ---------------------------------------------------------------------------
# Public entrypoint
# ---------------------------------------------------------------------------
def _coords_of(frame: dict[str, Any]) -> list[list[float]] | None:
    ca = frame.get("ca")
    if isinstance(ca, list) and len(ca) >= 1 and all(isinstance(p, (list, tuple)) and len(p) == 3 for p in ca):
        return [list(map(float, p)) for p in ca]
    return None


def build_analysis(
    frames: Iterable[dict[str, Any]],
    *,
    reference: str = "final",
) -> dict[str, Any]:
    """Compute per-frame derived metrics for a recycle trajectory.

    Parameters
    ----------
    frames:
        Sequence of frame dicts, each with ``ca`` (list of [x,y,z]) and
        optionally ``plddt`` and ``label``.
    reference:
        Which frame to treat as the alignment/contact reference. ``"final"``
        (default, per product decision) aligns every frame onto the last
        recycle so the trajectory visibly settles into its endpoint;
        ``"first"`` aligns onto recycle 0.

    Returns a dict ``{"reference", "labels", "frames": [...]}`` that is fully
    JSON-serialisable. Returns ``available: False`` when coordinates are missing
    or inconsistent so the frontend can degrade gracefully.
    """
    frame_list = list(frames)
    coords = [_coords_of(f) for f in frame_list]
    usable = [c for c in coords if c is not None]
    consistent = bool(usable) and len({len(c) for c in usable}) == 1 and len(usable) == len(frame_list)

    labels = {
        "trajectory_kind": TRAJECTORY_KIND,
        "not_physical_time": True,
        "reference": reference,
        "contact_threshold_a": CONTACT_THRESHOLD_A,
        "contact_min_seq_sep": CONTACT_MIN_SEQ_SEP,
        "fape_kind": "ca_frame_approximation",
    }

    if not consistent:
        return {"available": False, "reference": reference, "labels": labels, "frames": []}

    ref_idx = len(coords) - 1 if reference == "final" else 0
    ref_coords = coords[ref_idx]
    ref_contacts = contact_pairs(ref_coords)
    displacements_to_reference = [per_residue_displacement(cur, ref_coords) for cur in coords]
    max_displacement_overall = round(max((max(disp) for disp in displacements_to_reference if len(disp) > 0), default=0.0), 3)

    out_frames: list[dict[str, Any]] = []
    prev_coords: list[list[float]] | None = None
    prev_contacts: set[tuple[int, int]] | None = None
    prev_mean_plddt: float | None = None

    for idx, frame in enumerate(frame_list):
        cur = coords[idx]
        plddt = frame.get("plddt") or []
        stats = plddt_stats(plddt)
        contacts = contact_pairs(cur)
        geom = geometry_violations(cur)

        delta_mean_plddt = None
        if stats["mean"] is not None and prev_mean_plddt is not None:
            delta_mean_plddt = round(stats["mean"] - prev_mean_plddt, 2)

        entry: dict[str, Any] = {
            "recycle_index": idx,
            "label": frame.get("label", f"Recycle {idx}"),
            "mean_plddt": stats["mean"],
            "median_plddt": stats["median"],
            "delta_mean_plddt": delta_mean_plddt,
            "fraction_below_50": stats["fraction_below_50"],
            "fraction_below_70": stats["fraction_below_70"],
            "radius_of_gyration_a": radius_of_gyration(cur),
            "contact_count": len(contacts),
            "geometry": geom,
            # vs final (or chosen reference)
            "rmsd_to_reference_a": round(kabsch_rmsd(cur, ref_coords), 3),
            "raw_rmsd_to_reference_a": round(raw_rmsd(cur, ref_coords), 3),
            "fape_to_reference_a": ca_fape(cur, ref_coords),
            "contact_delta_to_reference": contact_delta(contacts, ref_contacts),
            "max_displacement_to_reference_a": round(max(displacements_to_reference[idx]), 3) if len(cur) > 0 else None,
            "max_displacement_overall_a": max_displacement_overall,
            # vs previous frame
            "rmsd_to_previous_a": None,
            "raw_rmsd_to_previous_a": None,
            "contact_delta_to_previous": None,
        }

        if prev_coords is not None:
            entry["rmsd_to_previous_a"] = round(kabsch_rmsd(cur, prev_coords), 3)
            entry["raw_rmsd_to_previous_a"] = round(raw_rmsd(cur, prev_coords), 3)
            entry["contact_delta_to_previous"] = contact_delta(contacts, prev_contacts)

        out_frames.append(entry)
        prev_coords = cur
        prev_contacts = contacts
        prev_mean_plddt = stats["mean"]

    return {
        "available": True,
        "reference": reference,
        "reference_index": ref_idx,
        "max_displacement_overall_a": max_displacement_overall,
        "labels": labels,
        "frames": out_frames,
    }
