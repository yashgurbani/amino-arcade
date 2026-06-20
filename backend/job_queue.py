from __future__ import annotations

import hashlib
import json
import threading
import uuid
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.adapters import _read_pae, predict_with_engine


PROJECT_ROOT = Path(__file__).resolve().parents[1]
CACHE_DIR = PROJECT_ROOT / "prediction-cache"
JOBS_DIR = CACHE_DIR / "jobs"
CACHE_DIR.mkdir(exist_ok=True)
JOBS_DIR.mkdir(parents=True, exist_ok=True)

_jobs: dict[str, dict[str, Any]] = {}
_cancel_flags: dict[str, threading.Event] = {}
_lock = threading.Lock()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_options(options: dict[str, Any] | None = None) -> dict[str, Any]:
    raw = options or {}
    normalized: dict[str, Any] = {}
    if raw.get("num_recycle") is not None:
        normalized["num_recycle"] = max(1, min(8, int(raw["num_recycle"])))
    if raw.get("num_models") is not None:
        normalized["num_models"] = max(1, min(5, int(raw["num_models"])))
    if raw.get("msa_mode") is not None:
        value = str(raw["msa_mode"]).strip()
        allowed = {"single_sequence", "mmseqs2_uniref_env", "mmseqs2_uniref", "mmseqs2"}
        if value in allowed:
            normalized["msa_mode"] = value
    return normalized


def cache_key(sequence: str, engine: str, options: dict[str, Any] | None = None) -> str:
    option_key = json.dumps(normalize_options(options), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(f"{engine}:{option_key}:{sequence}".encode("utf-8")).hexdigest()[:16]


def cache_path(sequence: str, engine: str, options: dict[str, Any] | None = None) -> Path:
    return CACHE_DIR / f"{cache_key(sequence, engine, options)}.json"


def _persist(job: dict[str, Any]) -> None:
    path = JOBS_DIR / f"{job['id']}.json"
    payload = deepcopy(job)
    if isinstance(payload.get("result"), dict):
        payload["result"] = _compact_result(payload["result"])
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def reload_persisted_jobs() -> int:
    loaded = 0
    with _lock:
      _jobs.clear()
      _cancel_flags.clear()
      for path in sorted(JOBS_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime):
          try:
              job = json.loads(path.read_text(encoding="utf-8"))
          except (OSError, json.JSONDecodeError):
              continue
          if not isinstance(job, dict) or not job.get("id"):
              continue
          if job.get("status") in {"queued", "running"}:
              job["status"] = "failed"
              job["error"] = "Process exited before this persisted job completed."
              job["updated_at"] = _now()
              _append_log(job, "Marked failed during startup recovery.")
              _persist(job)
          _jobs[str(job["id"])] = job
          _cancel_flags[str(job["id"])] = threading.Event()
          loaded += 1
    return loaded


def _compact_result(result: dict[str, Any]) -> dict[str, Any]:
    compact = deepcopy(result)
    if "pdb" in compact:
        compact["pdb_atom_count"] = compact["pdb"].count("\nATOM")
        compact.pop("pdb", None)
    for frame in compact.get("frames", []) or []:
        if isinstance(frame, dict) and "pdb" in frame:
            frame["pdb_atom_count"] = frame["pdb"].count("\nATOM")
            frame.pop("pdb", None)
    for model in compact.get("models", []) or []:
        if not isinstance(model, dict):
            continue
        if "final_pdb" in model:
            model["final_pdb_atom_count"] = model["final_pdb"].count("\nATOM")
            model.pop("final_pdb", None)
        for frame in model.get("frames", []) or []:
            if isinstance(frame, dict) and "pdb" in frame:
                frame["pdb_atom_count"] = frame["pdb"].count("\nATOM")
                frame.pop("pdb", None)
    return compact


def _public(job: dict[str, Any]) -> dict[str, Any]:
    public = deepcopy(job)
    if isinstance(public.get("result"), dict):
        public["result"] = _compact_result(public["result"])
    return public


def load_cached_prediction(sequence: str, engine: str, options: dict[str, Any] | None = None) -> dict[str, Any] | None:
    path = cache_path(sequence, engine, options)
    if not path.exists():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    if not data.get("provenance") or not data.get("frames"):
        return None
    data.setdefault("meta", {})
    if engine == "localcolabfold" and not data.get("pae"):
        run_dir = data["meta"].get("run_dir")
        if run_dir:
            pae = _read_pae(Path(run_dir) / "out")
            if pae:
                data["pae"] = pae
                data["meta"]["pae"] = pae
                path.write_text(json.dumps(data), encoding="utf-8")
    data["meta"]["cached"] = True
    data["cache_key"] = path.stem
    return data


def save_cached_prediction(sequence: str, engine: str, result: dict[str, Any], options: dict[str, Any] | None = None) -> dict[str, Any]:
    path = cache_path(sequence, engine, options)
    payload = deepcopy(result)
    payload.setdefault("meta", {})
    payload["meta"]["cached"] = False
    payload["meta"]["options"] = normalize_options(options)
    payload["cache_key"] = path.stem
    path.write_text(json.dumps(payload), encoding="utf-8")
    return payload


def create_prediction_job(sequence: str, engine: str, options: dict[str, Any] | None = None) -> dict[str, Any]:
    options = normalize_options(options)
    job_id = str(uuid.uuid4())
    job = {
        "id": job_id,
        "status": "queued",
        "engine": engine,
        "sequence": sequence,
        "created_at": _now(),
        "updated_at": _now(),
        "logs": [f"Job accepted. options={options}"],
        "result": None,
        "error": None,
        "options": options,
        "cache_key": cache_key(sequence, engine, options),
    }
    flag = threading.Event()
    with _lock:
        _jobs[job_id] = job
        _cancel_flags[job_id] = flag
        _persist(job)
    threading.Thread(target=_run_job, args=(job_id,), daemon=True).start()
    return _public(job)


def _append_log(job: dict[str, Any], line: str) -> None:
    job.setdefault("logs", []).append(f"{_now()} {line}")
    job["logs"] = job["logs"][-120:]


def _run_job(job_id: str) -> None:
    with _lock:
        job = _jobs[job_id]
        flag = _cancel_flags[job_id]
        job["status"] = "running"
        job["updated_at"] = _now()
        _append_log(job, f"Job started. options={job.get('options', {})}")
        sequence = str(job["sequence"])
        engine = str(job["engine"])
        options = normalize_options(job.get("options") if isinstance(job.get("options"), dict) else {})
        _persist(job)

    try:
        if flag.is_set():
            raise InterruptedError("Job cancelled before execution.")
        cached = load_cached_prediction(sequence, engine, options)
        if cached is not None:
            result = cached
            log_line = "Loaded cached trajectory."
        else:
            result = save_cached_prediction(
                sequence,
                engine,
                predict_with_engine(sequence, engine, cancel_event=flag, log_callback=lambda line: _job_log(job_id, line), options=options),
                options,
            )
            log_line = "Prediction completed and cached."
        with _lock:
            job = _jobs[job_id]
            if flag.is_set():
                job["status"] = "cancelled"
                _append_log(job, "Cancellation requested after prediction returned.")
            else:
                job["status"] = "succeeded"
                job["result"] = result
                _append_log(job, log_line)
            job["updated_at"] = _now()
            _persist(job)
    except InterruptedError as exc:
        with _lock:
            job = _jobs[job_id]
            job["status"] = "cancelled"
            job["error"] = str(exc)
            job["updated_at"] = _now()
            _append_log(job, "Job cancelled.")
            _persist(job)
    except Exception as exc:  # noqa: BLE001
        with _lock:
            job = _jobs[job_id]
            job["status"] = "failed"
            job["error"] = str(exc)
            job["updated_at"] = _now()
            _append_log(job, f"Job failed: {exc}")
            _persist(job)


def cancel_job(job_id: str) -> dict[str, Any] | None:
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return None
        _cancel_flags[job_id].set()
        if job["status"] in {"queued", "running"}:
            job["status"] = "cancelled"
            job["updated_at"] = _now()
            _append_log(job, "Cancellation requested.")
            _persist(job)
        return _public(job)


def _job_log(job_id: str, line: str) -> None:
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return
        _append_log(job, line)
        job["updated_at"] = _now()
        _persist(job)


def get_job(job_id: str) -> dict[str, Any] | None:
    with _lock:
        job = _jobs.get(job_id)
        return _public(job) if job else None


def get_job_logs(job_id: str) -> list[str] | None:
    with _lock:
        job = _jobs.get(job_id)
        return list(job.get("logs", [])) if job else None


def get_job_result(job_id: str) -> dict[str, Any] | None:
    with _lock:
        job = _jobs.get(job_id)
        if not job or not isinstance(job.get("result"), dict):
            return None
        result = deepcopy(job["result"])
        if result.get("pdb"):
            return result
        cached = load_cached_prediction(str(job.get("sequence", "")), str(job.get("engine", "")), job.get("options") if isinstance(job.get("options"), dict) else {})
        return cached or result


def get_job_report(job_id: str) -> dict[str, Any] | None:
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return None
        result = job.get("result") if isinstance(job.get("result"), dict) else {}
        hydrated = load_cached_prediction(str(job.get("sequence", "")), str(job.get("engine", "")), job.get("options") if isinstance(job.get("options"), dict) else {}) or result
        return {
            "job": _public(job),
            "provenance": hydrated.get("provenance"),
            "meta": hydrated.get("meta"),
            "cache_key": job.get("cache_key"),
            "artifact_summary": {
                "frame_count": len(hydrated.get("frames", []) or []),
                "has_pdb": bool(hydrated.get("pdb")),
            },
        }


def _frame_manifest(frame: dict[str, Any], index: int, analysis_frame: dict[str, Any] | None = None) -> dict[str, Any]:
    plddt = frame.get("plddt") if isinstance(frame.get("plddt"), list) else []
    ca = frame.get("ca") if isinstance(frame.get("ca"), list) else []
    pdb = frame.get("pdb") if isinstance(frame.get("pdb"), str) else ""
    return {
        "index": index,
        "label": frame.get("label") or f"Frame {index}",
        "has_pdb": bool(pdb),
        "pdb_atom_count": pdb.count("\nATOM") if pdb else frame.get("pdb_atom_count"),
        "residue_count": len(plddt) or len(ca) or None,
        "mean_plddt": round(sum(float(v) for v in plddt) / len(plddt), 2) if plddt else None,
        "ca_count": len(ca),
        "analysis": analysis_frame,
    }


def _model_manifest(model: dict[str, Any], index: int) -> dict[str, Any]:
    frames = model.get("frames") if isinstance(model.get("frames"), list) else []
    analysis_frames = (model.get("analysis") or {}).get("frames") if isinstance(model.get("analysis"), dict) else []
    return {
        "index": index,
        "rank": model.get("rank"),
        "model_id": model.get("model_id"),
        "seed": model.get("seed"),
        "mean_plddt": model.get("mean_plddt"),
        "ptm": model.get("ptm"),
        "iptm": model.get("iptm"),
        "frame_count": len(frames),
        "has_final_pdb": bool(model.get("final_pdb")),
        "frames": [
            _frame_manifest(frame, frame_index, analysis_frames[frame_index] if isinstance(analysis_frames, list) and frame_index < len(analysis_frames) else None)
            for frame_index, frame in enumerate(frames)
            if isinstance(frame, dict)
        ],
    }


def get_job_manifest(job_id: str) -> dict[str, Any] | None:
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return None
        result = job.get("result") if isinstance(job.get("result"), dict) else {}
        hydrated = load_cached_prediction(str(job.get("sequence", "")), str(job.get("engine", "")), job.get("options") if isinstance(job.get("options"), dict) else {}) or result
        frames = hydrated.get("frames") if isinstance(hydrated.get("frames"), list) else []
        analysis_frames = (hydrated.get("analysis") or {}).get("frames") if isinstance(hydrated.get("analysis"), dict) else []
        models = hydrated.get("models") if isinstance(hydrated.get("models"), list) else []
        pae = hydrated.get("pae") if isinstance(hydrated.get("pae"), list) else None
        return {
            "job": _public(job),
            "cache_key": job.get("cache_key"),
            "provenance": hydrated.get("provenance"),
            "meta": hydrated.get("meta"),
            "ranking": hydrated.get("ranking"),
            "frame_count": len(frames),
            "frames": [
                _frame_manifest(frame, index, analysis_frames[index] if isinstance(analysis_frames, list) and index < len(analysis_frames) else None)
                for index, frame in enumerate(frames)
                if isinstance(frame, dict)
            ],
            "models": [_model_manifest(model, index) for index, model in enumerate(models) if isinstance(model, dict)],
            "pae_shape": [len(pae), len(pae[0])] if pae and isinstance(pae[0], list) else None,
            "has_pdb": bool(hydrated.get("pdb")),
        }


def get_job_frame(job_id: str, frame_index: int, model_index: int | None = None) -> dict[str, Any] | None:
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return None
        result = job.get("result") if isinstance(job.get("result"), dict) else {}
        hydrated = load_cached_prediction(str(job.get("sequence", "")), str(job.get("engine", "")), job.get("options") if isinstance(job.get("options"), dict) else {}) or result
        source: Any = hydrated
        if model_index is not None:
            models = hydrated.get("models") if isinstance(hydrated.get("models"), list) else []
            if model_index < 0 or model_index >= len(models):
                return None
            source = models[model_index]
        frames = source.get("frames") if isinstance(source, dict) and isinstance(source.get("frames"), list) else []
        if frame_index < 0 or frame_index >= len(frames) or not isinstance(frames[frame_index], dict):
            return None
        return deepcopy(frames[frame_index])


def job_summary() -> dict[str, Any]:
    with _lock:
        jobs = list(_jobs.values())
    return {
        "active_jobs": sum(1 for job in jobs if job["status"] == "running"),
        "queued_jobs": sum(1 for job in jobs if job["status"] == "queued"),
        "completed_jobs": sum(1 for job in jobs if job["status"] == "succeeded"),
        "failed_jobs": sum(1 for job in jobs if job["status"] == "failed"),
        "cancelled_jobs": sum(1 for job in jobs if job["status"] == "cancelled"),
        "recent_jobs": [_public(job) for job in jobs[-8:]],
    }


def compare_engines(sequence: str, engines: list[str]) -> dict[str, Any]:
    comparisons = []
    for engine in engines:
        try:
            result = load_cached_prediction(sequence, engine) or save_cached_prediction(sequence, engine, predict_with_engine(sequence, engine))
            plddt = result.get("plddt") or []
            comparisons.append(
                {
                    "engine": engine,
                    "status": "success",
                    "provenance": result.get("provenance"),
                    "mean_plddt": round(sum(plddt) / len(plddt), 2) if plddt else None,
                    "frame_count": len(result.get("frames", []) or []),
                    "cached": bool(result.get("meta", {}).get("cached")),
                }
            )
        except Exception as exc:  # noqa: BLE001
            comparisons.append({"engine": engine, "status": "error", "message": str(exc)})
    return {"sequence": sequence, "comparisons": comparisons}


reload_persisted_jobs()
