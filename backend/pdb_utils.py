from __future__ import annotations

from pathlib import Path
import re


RECYCLE_PDB_RE = re.compile(r"\.r(\d+)\.pdb$", re.IGNORECASE)
RANK_RE = re.compile(r"rank[_-]?(\d+)", re.IGNORECASE)
MODEL_RE = re.compile(r"model[_-]?(\d+)", re.IGNORECASE)
SEED_RE = re.compile(r"seed[_-]?(\d+)", re.IGNORECASE)


def recycle_index(path: Path) -> int | None:
    match = RECYCLE_PDB_RE.search(path.name)
    return int(match.group(1)) if match else None


def parse_residue_plddt(pdb: str) -> list[float]:
    residue_scores: dict[int, list[float]] = {}
    for line in pdb.splitlines():
        if not line.startswith("ATOM"):
            continue
        try:
            residue = int(line[22:26].strip())
            score = float(line[60:66].strip())
        except ValueError:
            continue
        residue_scores.setdefault(residue, []).append(score)
    return [round(sum(scores) / len(scores), 2) for _, scores in sorted(residue_scores.items()) if scores]


def parse_ca_trace(pdb: str) -> list[list[float]]:
    points = []
    for line in pdb.splitlines():
        if not line.startswith("ATOM") or line[12:16].strip() != "CA":
            continue
        try:
            points.append([float(line[30:38]), float(line[38:46]), float(line[46:54])])
        except ValueError:
            continue
    return points


def parse_structure(pdb: str) -> list[dict[str, object]]:
    """Chain-aware residue parse.

    Returns residues in file order, each keyed by ``(chain, resnum, icode)`` so
    multichain PDBs with overlapping residue numbering (e.g. hemoglobin, or RCSB
    reference structures) are never mixed. Each entry carries the mean B-factor
    (pLDDT for predictions) and the C-alpha coordinate when present.

    The legacy flat helpers (:func:`parse_residue_plddt`, :func:`parse_ca_trace`)
    are kept for backward compatibility with single-chain prediction output.
    """
    residues: dict[tuple[str, int, str], dict[str, object]] = {}
    order: list[tuple[str, int, str]] = []
    for line in pdb.splitlines():
        if not line.startswith("ATOM"):
            continue
        try:
            resnum = int(line[22:26].strip())
        except ValueError:
            continue
        chain = line[21:22].strip() or "A"
        icode = line[26:27].strip()
        atom = line[12:16].strip()
        key = (chain, resnum, icode)
        entry = residues.get(key)
        if entry is None:
            entry = {"chain": chain, "resnum": resnum, "icode": icode, "_b": [], "ca": None}
            residues[key] = entry
            order.append(key)
        try:
            entry["_b"].append(float(line[60:66].strip()))  # type: ignore[union-attr]
        except ValueError:
            pass
        if atom == "CA":
            try:
                entry["ca"] = [float(line[30:38]), float(line[38:46]), float(line[46:54])]
            except ValueError:
                pass
    out: list[dict[str, object]] = []
    for key in order:
        entry = residues[key]
        b = entry.pop("_b")  # type: ignore[arg-type]
        entry["plddt"] = round(sum(b) / len(b), 2) if b else None  # type: ignore[arg-type]
        out.append(entry)
    return out


def ca_by_chain(pdb: str) -> dict[str, list[list[float]]]:
    """Map chain id -> ordered list of C-alpha coordinates (chain-aware)."""
    chains: dict[str, list[list[float]]] = {}
    for res in parse_structure(pdb):
        ca = res.get("ca")
        if ca is not None:
            chains.setdefault(str(res["chain"]), []).append(ca)  # type: ignore[arg-type]
    return chains


def has_structure_atoms(pdb: str) -> bool:
    return any(line.startswith("ATOM") for line in pdb.splitlines())


def read_recycle_pdbs(output_dir: Path) -> list[Path]:
    recycle_paths = [path for path in output_dir.glob("*.pdb") if recycle_index(path) is not None]
    return sorted(recycle_paths, key=lambda path: (recycle_index(path) or 0, path.name))


def read_pdbs(output_dir: Path) -> list[Path]:
    recycle_paths = read_recycle_pdbs(output_dir)
    if recycle_paths:
        return recycle_paths

    patterns = ["*rank_001*.pdb", "*rank_1*.pdb", "*unrelaxed*.pdb", "*.pdb"]
    seen: dict[Path, None] = {}
    for pattern in patterns:
        for path in sorted(output_dir.glob(pattern)):
            if recycle_index(path) is None:
                seen[path] = None
    return sorted(seen.keys(), key=lambda p: (p.stat().st_mtime, p.name))


def model_rank(path: Path) -> int | None:
    match = RANK_RE.search(path.name)
    return int(match.group(1)) if match else None


def model_id(path: Path) -> str | None:
    match = MODEL_RE.search(path.name)
    return f"model_{int(match.group(1))}" if match else None


def model_seed(path: Path) -> str | None:
    match = SEED_RE.search(path.name)
    return f"seed_{int(match.group(1)):03d}" if match else None


def model_number(path: Path) -> int | None:
    match = MODEL_RE.search(path.name)
    return int(match.group(1)) if match else None


def read_model_groups(output_dir: Path) -> list[dict[str, object]]:
    groups: dict[int, dict[str, object]] = {}
    for path in sorted(output_dir.glob("*.pdb")):
        rank = model_rank(path) or model_number(path)
        if rank is None:
            continue
        group = groups.setdefault(
            rank,
            {
                "rank": rank,
                "model_id": model_id(path),
                "seed": model_seed(path),
                "recycle_frames": [],
                "final_candidates": [],
            },
        )
        group["model_id"] = group.get("model_id") or model_id(path)
        group["seed"] = group.get("seed") or model_seed(path)
        if recycle_index(path) is None:
            group["final_candidates"].append(path)
        else:
            group["recycle_frames"].append(path)

    out = []
    for rank in sorted(groups):
        group = groups[rank]
        recycle_by_index: dict[int, Path] = {}
        for path in sorted(group["recycle_frames"], key=lambda p: (recycle_index(p) or 0, p.name)):
            index = recycle_index(path)
            if index is None:
                continue
            current = recycle_by_index.get(index)
            if current is None or (model_rank(path) is not None and model_rank(current) is None):
                recycle_by_index[index] = path
        recycle_frames = [recycle_by_index[index] for index in sorted(recycle_by_index)]
        finals = sorted(group["final_candidates"], key=lambda path: (model_rank(path) is None, "unrelaxed" in path.name.lower(), path.name))
        final = finals[0] if finals else (recycle_frames[-1] if recycle_frames else None)
        if not final:
            continue
        out.append(
            {
                "rank": rank,
                "model_id": group.get("model_id") or f"rank_{rank:03d}",
                "seed": group.get("seed"),
                "recycle_frames": recycle_frames,
                "final": final,
            }
        )
    return out
