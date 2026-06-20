from __future__ import annotations

import hashlib
import json
import os
import shutil
import stat
import subprocess
import threading
from contextlib import contextmanager
import time
from dataclasses import dataclass
from pathlib import Path
from time import perf_counter
from typing import Any

from backend.analysis import build_analysis
from backend.guardrails import InferenceConfig, preflight
from backend.pdb_utils import has_structure_atoms, parse_ca_trace, parse_residue_plddt, read_model_groups, read_pdbs, recycle_index
from backend.prediction_engine import predict_structure
from backend.provenance import make_provenance


PROJECT_ROOT = Path(__file__).resolve().parents[1]
RUNS_DIR = PROJECT_ROOT / "prediction-cache" / "runs"
RUNS_DIR.mkdir(parents=True, exist_ok=True)
REAL_TIMEOUT_SECONDS = int(os.environ.get("AF_COMPANION_REAL_TIMEOUT_SECONDS", "1800"))
VALID_AA = set("ACDEFGHIKLMNPQRSTVWY")
_LOCALCOLABFOLD_SEMAPHORE = threading.Semaphore(1)


@contextmanager
def temporary_env(updates: dict[str, str | None]):
    previous = {key: os.environ.get(key) for key in updates}
    try:
        for key, value in updates.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        yield
    finally:
        for key, value in previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


def _handle_remove_readonly(function: Any, path: str, exc_info: Any) -> None:
    try:
        os.chmod(path, stat.S_IWRITE)
        function(path)
    except Exception:
        raise


@dataclass(frozen=True)
class EngineCapability:
    id: str
    label: str
    available: bool
    role: str
    notes: list[str]


def sanitize_sequence(raw: str) -> str:
    lines = []
    for line in (raw or "").splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith(">"):
            lines.append("".join(stripped.split()))
    return "".join(lines)


def validate_sequence(sequence: str) -> tuple[bool, str | None]:
    if not sequence:
        return False, "Sequence cannot be empty."
    for char in sequence:
        if char.upper() not in VALID_AA:
            return False, f"Invalid amino acid sequence character '{char}'."
    return True, None


def backend_capabilities() -> list[EngineCapability]:
    local_bin = os.environ.get("LOCALCOLABFOLD_BIN") or shutil.which("colabfold_batch")
    esm_bin = os.environ.get("ESMFOLD_BIN") or shutil.which("esm-fold")
    mini_dir = _minalphafold2_dir()
    return [
        EngineCapability(
            "educational-simulator",
            "Educational simulator",
            True,
            "teaching",
            [
                "Deterministic NeRF backbone with inspectable confidence profile.",
                "Use for Learn mode and offline demonstrations; not a scientific predictor.",
            ],
        ),
        EngineCapability(
            "localcolabfold",
            "LocalColabFold",
            bool(local_bin),
            "real-af2-family",
            [
                "Set LOCALCOLABFOLD_BIN or expose colabfold_batch on PATH.",
                "Defaults are conservative for an 8GB local GPU: one model, one recycle, templates off.",
            ],
        ),
        EngineCapability(
            "minalphafold2",
            "minAlphaFold2",
            bool(mini_dir),
            "architecture-smoke",
            [
                "Uses the local minAlphaFold2 checkout for architecture smoke/overfit artifacts.",
                "Not pretrained arbitrary sequence inference.",
            ],
        ),
        EngineCapability(
            "esmfold",
            "ESMFold",
            bool(esm_bin),
            "optional-real-backend",
            ["Optional single-sequence folding backend when ESMFOLD_BIN is configured."],
        ),
    ]


def predict_with_engine(
    sequence: str,
    engine: str = "educational-simulator",
    cancel_event: threading.Event | None = None,
    log_callback: Any | None = None,
    options: dict[str, Any] | None = None,
) -> dict[str, Any]:
    sequence = sequence.upper()
    if engine == "educational-simulator":
        return _predict_educational(sequence)
    if engine == "localcolabfold":
        updates = {}
        if options and options.get("num_recycle") is not None:
            updates["LOCALCOLABFOLD_NUM_RECYCLE"] = str(int(options["num_recycle"]))
        if options and options.get("num_models") is not None:
            updates["LOCALCOLABFOLD_NUM_MODELS"] = str(int(options["num_models"]))
        if options and options.get("msa_mode") is not None:
            updates["LOCALCOLABFOLD_MSA_MODE"] = str(options["msa_mode"])
        with _LOCALCOLABFOLD_SEMAPHORE:
            with temporary_env(updates):
                return _predict_localcolabfold(sequence, cancel_event=cancel_event, log_callback=log_callback)
    if engine == "minalphafold2":
        return _predict_minalphafold2(sequence)
    if engine == "esmfold":
        raise RuntimeError("ESMFold adapter is capability-detected but not enabled in this release.")
    raise ValueError(f"Unknown prediction engine '{engine}'.")


def _run_dir(engine: str, sequence: str) -> Path:
    safe = "".join(ch for ch in sequence[:28] if ch.isalnum()) or "sequence"
    digest = hashlib.sha1(sequence.encode("utf-8")).hexdigest()[:12]
    path = RUNS_DIR / engine / f"{safe}-{digest}"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _frame_from_pdb(label: str, pdb: str, fallback_plddt: list[float] | None = None) -> dict[str, Any]:
    if not has_structure_atoms(pdb):
        raise RuntimeError(f"PDB frame '{label}' has no ATOM records and cannot be loaded by Mol*.")
    plddt = parse_residue_plddt(pdb) or fallback_plddt or []
    mean = round(sum(plddt) / len(plddt), 2) if plddt else 0
    return {
        "label": label,
        "pdb": pdb,
        "ca": parse_ca_trace(pdb),
        "plddt": plddt,
        "observables": {
            "confidence": mean,
            "triangleViolation": None,
            "ipaInvariantError": None,
            "fape": None,
            "recycleDelta": None,
            "constraintViolations": 0,
        },
    }


def _frame_label_for_path(path: Path) -> str:
    index = recycle_index(path)
    if index is not None:
        return f"Recycle {index}"
    return path.stem


def _normalize_pae_matrix(value: Any) -> list[list[float]] | None:
    if not isinstance(value, list) or not value:
        return None
    matrix: list[list[float]] = []
    for row in value:
        if not isinstance(row, list) or not row:
            return None
        try:
            matrix.append([round(float(cell), 3) for cell in row])
        except (TypeError, ValueError):
            return None
    width = len(matrix[0])
    if width == 0 or any(len(row) != width for row in matrix):
        return None
    return matrix


def _read_pae(output_dir: Path) -> list[list[float]] | None:
    candidates = sorted(
        [*output_dir.glob("*scores*.json"), *output_dir.glob("*ranking*.json"), *output_dir.glob("*.json")],
        key=lambda path: ("rank_001" not in path.name, "scores" not in path.name, path.name),
    )
    seen: set[Path] = set()
    for path in candidates:
        if path in seen:
            continue
        seen.add(path)
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        for key in ("pae", "predicted_aligned_error"):
            matrix = _normalize_pae_matrix(payload.get(key))
            if matrix is not None:
                return matrix
    return None


def _score_payload_for_rank(output_dir: Path, rank: int) -> dict[str, Any]:
    rank_token = f"rank_{rank:03d}"
    candidates = sorted(
        [*output_dir.glob(f"*scores*{rank_token}*.json"), *output_dir.glob(f"*{rank_token}*scores*.json")],
        key=lambda path: path.name,
    )
    for path in candidates:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if isinstance(payload, dict):
            return payload
    return {}


def _score_payload_for_model(output_dir: Path, model_id: Any) -> dict[str, Any]:
    if not isinstance(model_id, str) or not model_id:
        return {}
    candidates = sorted(
        [*output_dir.glob(f"*scores*{model_id}*.json"), *output_dir.glob(f"*{model_id}*scores*.json")],
        key=lambda path: path.name,
    )
    for path in candidates:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if isinstance(payload, dict):
            return payload
    return {}


def _mean_score(value: Any, fallback: list[float]) -> float:
    if isinstance(value, list) and value:
        numeric = [float(v) for v in value if isinstance(v, (int, float))]
        if numeric:
            return round(sum(numeric) / len(numeric), 2)
    if isinstance(value, (int, float)):
        return round(float(value), 2)
    return round(sum(fallback) / len(fallback), 2) if fallback else 0.0


def _pae_from_payload(payload: dict[str, Any]) -> list[list[float]] | None:
    for key in ("pae", "predicted_aligned_error"):
        matrix = _normalize_pae_matrix(payload.get(key))
        if matrix is not None:
            return matrix
    return None


def _trajectory(
    sequence: str,
    engine: str,
    provenance: dict[str, Any],
    frames: list[dict[str, Any]],
    meta: dict[str, Any],
    models: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    if models:
        top = models[0]
        frames = top.get("frames") or frames
        final_pdb = top.get("final_pdb") or frames[-1].get("pdb")
        plddt = top.get("plddt") or frames[-1].get("plddt", [])
        pae = top.get("pae")
    else:
        final = frames[-1]
        final_pdb = final.get("pdb")
        plddt = final.get("plddt", [])
        pae = meta.get("pae")
    result = {
        "status": "success",
        "engine": engine,
        "sequence": sequence,
        "provenance": provenance,
        "frames": frames,
        "pdb": final_pdb,
        "plddt": plddt,
        "pae": pae,
        "meta": meta,
        "warnings": [*provenance["disclaimers"], *([meta["adapter_warning"]] if meta.get("adapter_warning") else [])],
    }
    if models:
        result["models"] = models
        result["ranking"] = {
            "metric": "0.8*iptm+0.2*ptm" if any(model.get("iptm") is not None for model in models) else "mean_plddt",
            "order": [model.get("model_id") or f"rank_{int(model.get('rank', index + 1)):03d}" for index, model in enumerate(models)],
        }

    # Derived, honest per-frame diagnostics computed from the real recycle
    # coordinates (RMSD, contact deltas, Ca-FAPE, geometry, pLDDT stats). Kept in
    # a separate `analysis` object so the legacy `frames`/`observables` payload is
    # untouched. See backend/analysis.py and HANDOFF_PEDAGOGY_AND_LENSES.md.
    try:
        result["analysis"] = build_analysis(frames, reference="final")
        if models:
            for model in models:
                model_frames = model.get("frames")
                if isinstance(model_frames, list) and model_frames:
                    model["analysis"] = build_analysis(model_frames, reference="final")
    except Exception as exc:  # pragma: no cover - never let analysis break a prediction
        result["analysis"] = {"available": False, "error": str(exc), "frames": []}
    return result


def _predict_educational(sequence: str) -> dict[str, Any]:
    start = perf_counter()
    pdb, plddt = predict_structure(sequence)
    frame = _frame_from_pdb("Teaching endpoint", pdb, plddt)
    frame["observables"].update(
        {
            "confidence": round(sum(plddt) / len(plddt), 2) if plddt else 0,
            "triangleViolation": 0.12,
            "ipaInvariantError": 0,
            "fape": 0.38,
            "recycleDelta": 0.05,
        }
    )
    return _trajectory(
        sequence,
        "educational-simulator",
        make_provenance("educational-simulator", source="backend.prediction_engine.predict_structure"),
        [frame],
        {
            "runtime_ms": round((perf_counter() - start) * 1000, 2),
            "cached": False,
            "model_note": "Deterministic NeRF/propensity teaching model.",
        },
    )


def _localcolabfold_command(executable: str, fasta: Path, out_dir: Path) -> list[str]:
    cmd = [
        executable,
        "--num-recycle",
        os.environ.get("LOCALCOLABFOLD_NUM_RECYCLE", "4"),
        "--num-models",
        os.environ.get("LOCALCOLABFOLD_NUM_MODELS", "1"),
    ]
    msa_mode = os.environ.get("LOCALCOLABFOLD_MSA_MODE")
    if msa_mode:
        cmd.extend(["--msa-mode", msa_mode])
    model_type = os.environ.get("LOCALCOLABFOLD_MODEL_TYPE")
    if model_type:
        cmd.extend(["--model-type", model_type])
    data_dir = os.environ.get("LOCALCOLABFOLD_DATA_DIR")
    if data_dir:
        cmd.extend(["--data", data_dir])
    max_msa = os.environ.get("LOCALCOLABFOLD_MAX_MSA")
    if max_msa:
        cmd.extend(["--max-msa", max_msa])
    max_seq = os.environ.get("LOCALCOLABFOLD_MAX_SEQ")
    if max_seq:
        cmd.extend(["--max-seq", max_seq])
    max_extra_seq = os.environ.get("LOCALCOLABFOLD_MAX_EXTRA_SEQ")
    if max_extra_seq:
        cmd.extend(["--max-extra-seq", max_extra_seq])
    if os.environ.get("LOCALCOLABFOLD_OVERWRITE", "1") != "0":
        cmd.append("--overwrite-existing-results")
    if os.environ.get("LOCALCOLABFOLD_DISABLE_UNIFIED_MEMORY", "0") != "0":
        cmd.append("--disable-unified-memory")
    if os.environ.get("LOCALCOLABFOLD_SAVE_RECYCLES", "1") != "0":
        cmd.append("--save-recycles")
    if os.environ.get("LOCALCOLABFOLD_TEMPLATES", "0") != "0":
        cmd.append("--templates")
    cmd.extend([str(fasta), str(out_dir)])
    return cmd


def _read_msa_depth(output_dir: Path) -> int | None:
    best = 0
    for pattern in ("*.a3m", "*.aln", "*.sto"):
        for path in output_dir.rglob(pattern):
            try:
                text = path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            if path.suffix == ".sto":
                count = sum(1 for line in text.splitlines() if line and not line.startswith(("#", "//")) and len(line.split()) >= 2)
            else:
                count = sum(1 for line in text.splitlines() if line.startswith(">"))
            best = max(best, count)
    return best or None


def _emit(log_callback: Any | None, message: str) -> None:
    if log_callback:
        log_callback(message)


def _terminate_process(process: subprocess.Popen[str], log_callback: Any | None) -> None:
    if process.poll() is not None:
        return
    _emit(log_callback, "Cancellation requested; terminating LocalColabFold subprocess.")
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        _emit(log_callback, "LocalColabFold did not terminate promptly; killing subprocess.")
        process.kill()
        process.wait(timeout=5)
    for stream in (process.stdout, process.stderr):
        if stream and not stream.closed:
            stream.close()


def _run_cancellable_subprocess(
    cmd: list[str],
    cwd: Path,
    timeout_seconds: int,
    cancel_event: threading.Event | None,
    log_callback: Any | None,
) -> tuple[int, str, str]:
    stdout_path = cwd / "localcolabfold.stdout.log"
    stderr_path = cwd / "localcolabfold.stderr.log"
    with stdout_path.open("w", encoding="utf-8", errors="replace") as stdout_file, stderr_path.open("w", encoding="utf-8", errors="replace") as stderr_file:
        process = subprocess.Popen(
            cmd,
            cwd=str(cwd),
            stdout=stdout_file,
            stderr=stderr_file,
            text=True,
        )
        start = time.monotonic()
        _emit(log_callback, f"Started subprocess pid={process.pid}.")
        while process.poll() is None:
            if cancel_event and cancel_event.is_set():
                _terminate_process(process, log_callback)
                raise InterruptedError("LocalColabFold run cancelled.")
            if time.monotonic() - start > timeout_seconds:
                _terminate_process(process, log_callback)
                raise TimeoutError(f"LocalColabFold exceeded timeout of {timeout_seconds} seconds.")
            time.sleep(0.1)
        process.wait()
    stdout = stdout_path.read_text(encoding="utf-8", errors="replace") if stdout_path.exists() else ""
    stderr = stderr_path.read_text(encoding="utf-8", errors="replace") if stderr_path.exists() else ""
    return process.returncode or 0, stdout, stderr


def _predict_localcolabfold(
    sequence: str,
    cancel_event: threading.Event | None = None,
    log_callback: Any | None = None,
) -> dict[str, Any]:
    executable = os.environ.get("LOCALCOLABFOLD_BIN") or shutil.which("colabfold_batch")
    if not executable:
        raise RuntimeError("LocalColabFold is not configured. Set LOCALCOLABFOLD_BIN or install colabfold_batch.")
    config = InferenceConfig(
        engine="localcolabfold",
        sequence_length=len(sequence),
        num_models=int(os.environ.get("LOCALCOLABFOLD_NUM_MODELS", "1")),
        num_recycle=int(os.environ.get("LOCALCOLABFOLD_NUM_RECYCLE", "4")),
        templates=os.environ.get("LOCALCOLABFOLD_TEMPLATES", "0") != "0",
    )
    guard = preflight(config, budget_mib=int(os.environ.get("AF_COMPANION_VRAM_BUDGET_MIB", "7000")))
    if not guard["ok"]:
        raise RuntimeError(str(guard["message"]))

    run_dir = _run_dir("localcolabfold", sequence)
    fasta = run_dir / "query.fasta"
    out_dir = run_dir / "out"
    if out_dir.exists() and os.environ.get("LOCALCOLABFOLD_OVERWRITE", "1") != "0":
        shutil.rmtree(out_dir, onerror=_handle_remove_readonly)
    out_dir.mkdir(exist_ok=True)
    fasta.write_text(f">query\n{sequence}\n", encoding="utf-8")
    cmd = _localcolabfold_command(executable, fasta, out_dir)
    msa_mode = os.environ.get("LOCALCOLABFOLD_MSA_MODE") or None

    start = perf_counter()
    returncode, stdout, stderr = _run_cancellable_subprocess(
        cmd,
        run_dir,
        REAL_TIMEOUT_SECONDS,
        cancel_event,
        log_callback,
    )
    runtime = round(perf_counter() - start, 2)
    if cancel_event and cancel_event.is_set():
        raise InterruptedError("LocalColabFold run cancelled.")

    model_groups = read_model_groups(out_dir)
    pdb_paths = read_pdbs(out_dir)
    msa_depth = _read_msa_depth(out_dir)
    adapter_warning = None
    if returncode != 0:
        detail = (stderr or stdout or "").strip()[-4000:]
        if not model_groups and not pdb_paths:
            raise RuntimeError(f"LocalColabFold failed with exit code {returncode}: {detail}")
        adapter_warning = (
            "LocalColabFold exited nonzero after writing structure artifacts; "
            "parsed the completed PDB outputs. stderr_tail=" + detail[-1000:]
        )
    if not model_groups and not pdb_paths:
        raise RuntimeError(f"LocalColabFold completed but no PDB files were found in {out_dir}.")

    models: list[dict[str, Any]] = []
    for group in model_groups:
        rank = int(group["rank"])
        frame_paths = list(group.get("recycle_frames") or []) or [group["final"]]
        frames = [
            _frame_from_pdb(_frame_label_for_path(path), path.read_text(encoding="utf-8", errors="replace"))
            for path in frame_paths
        ]
        final_pdb = Path(group["final"]).read_text(encoding="utf-8", errors="replace")
        final_plddt = parse_residue_plddt(final_pdb) or (frames[-1].get("plddt") or [])
        scores = _score_payload_for_rank(out_dir, rank) or _score_payload_for_model(out_dir, group.get("model_id"))
        pae = _pae_from_payload(scores)
        models.append(
            {
                "rank": rank,
                "model_id": group.get("model_id"),
                "seed": group.get("seed"),
                "mean_plddt": _mean_score(scores.get("plddt"), final_plddt),
                "ptm": scores.get("ptm"),
                "iptm": scores.get("iptm"),
                "pae": pae,
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
        frames = [
            _frame_from_pdb(_frame_label_for_path(path), path.read_text(encoding="utf-8", errors="replace"))
            for path in pdb_paths
        ]
        has_recycle_frames = any(recycle_index(path) is not None for path in pdb_paths)
        pae = _read_pae(out_dir)
    return _trajectory(
        sequence,
        "localcolabfold",
        make_provenance(
            "localcolabfold",
            source=str(run_dir),
            command=cmd,
            guardrail=guard,
            stdout_tail=stdout[-2000:],
            msa_mode=msa_mode,
            msa_depth=msa_depth,
        ),
        frames,
        {
            "runtime_seconds": runtime,
            "cached": False,
            "run_dir": str(run_dir),
            "command": cmd,
            "guardrail": guard,
            "msa_mode": msa_mode,
            "msa_depth": msa_depth,
            "pae": pae,
            "adapter_warning": adapter_warning,
            "trajectory_note": "LocalColabFold recycle PDBs parsed as real inference-refinement frames." if has_recycle_frames else "Endpoint only; no intermediate recycle PDBs were exposed.",
        },
        models=models or None,
    )


def _minalphafold2_dir() -> Path | None:
    configured = os.environ.get("MINALPHAFOLD2_DIR")
    candidates = [Path(configured) if configured else None, PROJECT_ROOT / "models" / "minAlphaFold2"]
    for candidate in candidates:
        if candidate and candidate.exists():
            return candidate
    return None


def _predict_minalphafold2(sequence: str) -> dict[str, Any]:
    repo = _minalphafold2_dir()
    if not repo:
        raise RuntimeError("minAlphaFold2 is not configured. Set MINALPHAFOLD2_DIR or keep using the educational simulator.")
    pdbs = read_pdbs(repo)
    if not pdbs:
        raise RuntimeError(f"No minAlphaFold2 PDB artifacts found under {repo}.")
    pdb = pdbs[-1].read_text(encoding="utf-8", errors="replace")
    return _trajectory(
        sequence,
        "minalphafold2",
        make_provenance("minalphafold2", source=str(pdbs[-1])),
        [_frame_from_pdb("minAlphaFold2 artifact", pdb)],
        {"cached": False, "artifact": str(pdbs[-1])},
    )
