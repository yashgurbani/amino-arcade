from __future__ import annotations

import os
import re
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from urllib.parse import urlparse

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel
from pathlib import Path
from typing import Any

from backend.adapters import backend_capabilities, predict_with_engine, sanitize_sequence, validate_sequence
from backend.example_store import get_example, get_examples
from backend.guardrails import InferenceConfig, preflight
from backend.physics import PhysicsRelaxationError, local_relaxation, physics_status
from backend.job_queue import (
    cancel_job,
    compare_engines,
    create_prediction_job,
    get_job,
    get_job_frame,
    get_job_logs,
    get_job_manifest,
    get_job_result,
    get_job_report,
    job_summary,
)


app = FastAPI(
    title="AlphaFold Scientific Workstation Backend",
    description="Local-first AlphaFold2 learning and inference companion with provenance-aware trajectories.",
    version="3.0.0",
)
from backend.schemas import JobEnvelope, ManifestEnvelope, PredictionResult, ReportEnvelope


def _csv_env(name: str, default: str) -> list[str]:
    values = [value.strip() for value in os.getenv(name, default).split(",")]
    return [value for value in values if value]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_csv_env("AF_COMPANION_CORS_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173"),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

REFERENCE_PDB_CACHE: dict[str, str] = {}
REFERENCE_PDB_CACHE_META: dict[str, dict[str, Any]] = {}
REFERENCE_PDB_ALLOWED_HOSTS = set(_csv_env("AF_COMPANION_PDB_ALLOWED_HOSTS", "files.rcsb.org"))
REFERENCE_PDB_TIMEOUT_SECONDS = float(os.getenv("AF_COMPANION_PDB_TIMEOUT_SECONDS", "10"))
REFERENCE_PDB_MAX_BYTES = int(os.getenv("AF_COMPANION_PDB_MAX_BYTES", str(5 * 1024 * 1024)))
REFERENCE_PDB_CACHE_TTL_SECONDS = int(os.getenv("AF_COMPANION_PDB_CACHE_TTL_SECONDS", str(7 * 24 * 60 * 60)))
REFERENCE_PDB_MIN_INTERVAL_SECONDS = float(os.getenv("AF_COMPANION_PDB_MIN_INTERVAL_SECONDS", "0.25"))
REFERENCE_PDB_CACHE_DIR = Path(os.getenv("AF_COMPANION_PDB_CACHE_DIR", str(Path(__file__).resolve().parents[1] / "prediction-cache" / "pdb")))
REFERENCE_PDB_LAST_FETCH_AT = 0.0


class PredictRequest(BaseModel):
    sequence: str
    engine: str = "educational-simulator"
    num_recycle: int | None = None
    num_models: int | None = None
    msa_mode: str | None = None

    def inference_options(self) -> dict[str, Any]:
        options: dict[str, Any] = {}
        if self.num_recycle is not None:
            options["num_recycle"] = self.num_recycle
        if self.num_models is not None:
            options["num_models"] = self.num_models
        if self.msa_mode is not None:
            options["msa_mode"] = self.msa_mode
        return options


class CompareRequest(BaseModel):
    sequence: str
    engines: list[str] = ["educational-simulator", "localcolabfold", "minalphafold2"]


class PreflightRequest(BaseModel):
    sequence: str
    engine: str = "localcolabfold"
    num_models: int = 1
    num_recycle: int = 4
    templates: bool = False


class PhysicsRelaxationRequest(BaseModel):
    pdb: str
    max_iterations: int = 200


def _validated_sequence(raw: str) -> tuple[str | None, JSONResponse | None]:
    sequence = sanitize_sequence(raw).upper()
    valid, message = validate_sequence(sequence)
    if not valid:
        return None, JSONResponse(status_code=400, content={"status": "error", "message": message})
    return sequence, None


def _engine_preflight(sequence: str, request: PredictRequest) -> JSONResponse | None:
    if request.engine != "localcolabfold":
        return None
    options = request.inference_options()
    result = preflight(
        InferenceConfig(
            engine=request.engine,
            sequence_length=len(sequence),
            num_models=int(options.get("num_models", 1)),
            num_recycle=int(options.get("num_recycle", 4)),
        )
    )
    if result["ok"]:
        return None
    return JSONResponse(status_code=400, content={"status": "error", "message": str(result["message"]), "guardrail": result})


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "alphafold-scientific-workstation", "version": "3.0.0"}


@app.get("/api/backend/capabilities")
async def capabilities():
    physics = physics_status()
    return {
        "status": "success",
        "default_engine": "educational-simulator",
        "engines": [cap.__dict__ for cap in backend_capabilities()],
        "physics": physics.__dict__,
        "hardware_profile": {
            "target_gpu": "RTX 5060 8GB",
            "safe_default": "educational simulator plus cached/stubbed real-engine verification",
        },
    }


def _reference_cache_path(pdb_id: str) -> Path:
    return REFERENCE_PDB_CACHE_DIR / f"{pdb_id}.pdb"


def _reference_meta_path(pdb_id: str) -> Path:
    return REFERENCE_PDB_CACHE_DIR / f"{pdb_id}.json"


def _read_reference_disk_cache(pdb_id: str) -> tuple[str, dict[str, Any]] | None:
    pdb_path = _reference_cache_path(pdb_id)
    meta_path = _reference_meta_path(pdb_id)
    if not pdb_path.exists() or not meta_path.exists():
        return None
    if pdb_path.stat().st_size > REFERENCE_PDB_MAX_BYTES:
        return None
    age = time.time() - pdb_path.stat().st_mtime
    if age > REFERENCE_PDB_CACHE_TTL_SECONDS:
        return None
    try:
        import json

        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        text = pdb_path.read_text(encoding="utf-8", errors="replace")
    except (OSError, ValueError):
        return None
    if "ATOM" not in text:
        return None
    return text, meta


def _write_reference_disk_cache(pdb_id: str, text: str, meta: dict[str, Any]) -> None:
    import json

    REFERENCE_PDB_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    _reference_cache_path(pdb_id).write_text(text, encoding="utf-8")
    _reference_meta_path(pdb_id).write_text(json.dumps(meta, indent=2), encoding="utf-8")


def _reference_response(text: str, meta: dict[str, Any]) -> Response:
    return Response(
        content=text,
        media_type="chemical/x-pdb",
        headers={
            "Cache-Control": "public, max-age=86400",
            "X-Reference-PDB-ID": str(meta.get("pdb_id", "")),
            "X-Reference-Source": str(meta.get("source", "")),
            "X-Reference-Fetched-At": str(meta.get("fetched_at", "")),
        },
    )


@app.get("/api/reference/pdb/{pdb_id}")
async def reference_pdb(pdb_id: str):
    global REFERENCE_PDB_LAST_FETCH_AT
    normalized = pdb_id.upper().strip()
    if not re.fullmatch(r"[A-Z0-9]{4}", normalized):
        return JSONResponse(status_code=400, content={"status": "error", "message": "PDB id must be four alphanumeric characters."})
    if normalized in REFERENCE_PDB_CACHE:
        return _reference_response(REFERENCE_PDB_CACHE[normalized], REFERENCE_PDB_CACHE_META.get(normalized, {"pdb_id": normalized, "source": "memory-cache"}))
    disk_cached = _read_reference_disk_cache(normalized)
    if disk_cached:
        text, meta = disk_cached
        REFERENCE_PDB_CACHE[normalized] = text
        REFERENCE_PDB_CACHE_META[normalized] = meta
        return _reference_response(text, meta)
    url = f"https://files.rcsb.org/download/{normalized}.pdb"
    host = urlparse(url).hostname or ""
    if host not in REFERENCE_PDB_ALLOWED_HOSTS:
        return JSONResponse(status_code=502, content={"status": "error", "message": f"Reference host '{host}' is not allowlisted."})
    elapsed = time.monotonic() - REFERENCE_PDB_LAST_FETCH_AT
    if elapsed < REFERENCE_PDB_MIN_INTERVAL_SECONDS:
        time.sleep(REFERENCE_PDB_MIN_INTERVAL_SECONDS - elapsed)
    try:
        request = Request(url, headers={"User-Agent": "amino-arcade/3d-companion"})
        with urlopen(request, timeout=REFERENCE_PDB_TIMEOUT_SECONDS) as response:
            REFERENCE_PDB_LAST_FETCH_AT = time.monotonic()
            headers = getattr(response, "headers", {})
            content_length = headers.get("Content-Length") if hasattr(headers, "get") else None
            if content_length and int(content_length) > REFERENCE_PDB_MAX_BYTES:
                return JSONResponse(status_code=413, content={"status": "error", "message": f"RCSB {normalized} PDB exceeds the configured size limit."})
            payload = response.read(REFERENCE_PDB_MAX_BYTES + 1)
            if len(payload) > REFERENCE_PDB_MAX_BYTES:
                return JSONResponse(status_code=413, content={"status": "error", "message": f"RCSB {normalized} PDB exceeds the configured size limit."})
            text = payload.decode("utf-8", errors="replace")
    except HTTPError as exc:
        return JSONResponse(status_code=exc.code, content={"status": "error", "message": f"RCSB {normalized} returned HTTP {exc.code}."})
    except (TimeoutError, URLError, OSError) as exc:
        return JSONResponse(status_code=502, content={"status": "error", "message": f"RCSB {normalized} unavailable: {exc}"})
    if "ATOM" not in text:
        return JSONResponse(status_code=502, content={"status": "error", "message": f"RCSB {normalized} did not return a usable PDB."})
    meta = {"pdb_id": normalized, "source": url, "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "max_bytes": REFERENCE_PDB_MAX_BYTES}
    REFERENCE_PDB_CACHE[normalized] = text
    REFERENCE_PDB_CACHE_META[normalized] = meta
    _write_reference_disk_cache(normalized, text, meta)
    return _reference_response(text, meta)


@app.post("/api/backend/preflight")
async def backend_preflight(request: PreflightRequest):
    sequence = sanitize_sequence(request.sequence).upper()
    result = preflight(
        InferenceConfig(
            engine=request.engine,
            sequence_length=len(sequence),
            num_models=request.num_models,
            num_recycle=request.num_recycle,
            templates=request.templates,
        )
    )
    return {"status": "success" if result["ok"] else "error", **result}


@app.get("/api/physics/status")
async def physics_mode_status():
    return {"status": "success", "physics": physics_status().__dict__}


@app.post("/api/physics/local-relaxation")
async def physics_local_relaxation(request: PhysicsRelaxationRequest):
    status = physics_status()
    if not status.available:
        return JSONResponse(status_code=503, content={"status": "error", "message": status.message, "physics": status.__dict__})
    try:
        return local_relaxation(request.pdb, max_iterations=request.max_iterations)
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"status": "error", "message": str(exc)})
    except PhysicsRelaxationError as exc:
        return JSONResponse(
            status_code=422,
            content={
                "status": "error",
                "message": str(exc),
                "physics": physics_status().__dict__,
                "not_folding": True,
            },
        )
    except RuntimeError as exc:
        return JSONResponse(status_code=503, content={"status": "error", "message": str(exc), "physics": physics_status().__dict__})
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(status_code=500, content={"status": "error", "message": f"Local relaxation failed: {exc}"})


@app.post("/api/predict", response_model=PredictionResult)
async def predict(request: PredictRequest):
    sequence, error = _validated_sequence(request.sequence)
    if error:
        return error
    guard_error = _engine_preflight(sequence or "", request)
    if guard_error:
        return guard_error
    try:
        return predict_with_engine(sequence or "", request.engine, options=request.inference_options())
    except (ValueError, RuntimeError, NotImplementedError) as exc:
        return JSONResponse(status_code=400, content={"status": "error", "message": str(exc)})
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(status_code=500, content={"status": "error", "message": f"Prediction failed: {exc}"})


@app.post("/api/predict/jobs", response_model=JobEnvelope)
async def create_job(request: PredictRequest):
    sequence, error = _validated_sequence(request.sequence)
    if error:
        return error
    guard_error = _engine_preflight(sequence or "", request)
    if guard_error:
        return guard_error
    return {"status": "success", "job": create_prediction_job(sequence or "", request.engine, request.inference_options())}


@app.get("/api/predict/jobs")
async def jobs():
    return {"status": "success", **job_summary()}


@app.get("/api/predict/status")
async def prediction_status():
    return {"status": "running" if job_summary()["active_jobs"] else "idle", **job_summary()}


@app.get("/api/predict/jobs/{job_id}", response_model=JobEnvelope)
async def prediction_job(job_id: str):
    job = get_job(job_id)
    if not job:
        return JSONResponse(status_code=404, content={"status": "error", "message": f"Job '{job_id}' not found."})
    return {"status": "success", "job": job}


@app.post("/api/predict/jobs/{job_id}/cancel", response_model=JobEnvelope)
async def prediction_cancel(job_id: str):
    job = cancel_job(job_id)
    if not job:
        return JSONResponse(status_code=404, content={"status": "error", "message": f"Job '{job_id}' not found."})
    return {"status": "success", "job": job}


@app.get("/api/predict/jobs/{job_id}/logs")
async def prediction_logs(job_id: str):
    logs = get_job_logs(job_id)
    if logs is None:
        return JSONResponse(status_code=404, content={"status": "error", "message": f"Job '{job_id}' not found."})
    return {"status": "success", "logs": logs}


@app.get("/api/predict/jobs/{job_id}/result")
async def prediction_result(job_id: str):
    result = get_job_result(job_id)
    if not result:
        return JSONResponse(status_code=404, content={"status": "error", "message": f"Result for job '{job_id}' not found."})
    return {"status": "success", "result": result}


@app.get("/api/predict/jobs/{job_id}/manifest", response_model=ManifestEnvelope)
async def prediction_manifest(job_id: str):
    manifest = get_job_manifest(job_id)
    if not manifest:
        return JSONResponse(status_code=404, content={"status": "error", "message": f"Manifest for job '{job_id}' not found."})
    return {"status": "success", "manifest": manifest}


@app.get("/api/predict/jobs/{job_id}/frames/{frame_index}")
async def prediction_frame(job_id: str, frame_index: int, model_index: int | None = None):
    frame = get_job_frame(job_id, frame_index, model_index=model_index)
    if not frame:
        return JSONResponse(status_code=404, content={"status": "error", "message": f"Frame {frame_index} for job '{job_id}' not found."})
    return {"status": "success", "frame": frame}


@app.get("/api/predict/jobs/{job_id}/report", response_model=ReportEnvelope)
async def prediction_report(job_id: str):
    report = get_job_report(job_id)
    if not report:
        return JSONResponse(status_code=404, content={"status": "error", "message": f"Job '{job_id}' not found."})
    return {"status": "success", "report": report}


@app.post("/api/compare")
async def compare(request: CompareRequest):
    sequence, error = _validated_sequence(request.sequence)
    if error:
        return error
    return {"status": "success", **compare_engines(sequence or "", request.engines)}


@app.get("/api/examples")
async def examples():
    return {"status": "success", "examples": get_examples()}


@app.get("/api/examples/{example_id}")
async def example(example_id: str):
    found = get_example(example_id)
    if not found:
        return JSONResponse(status_code=404, content={"status": "error", "message": f"Example '{example_id}' not found."})
    return {"status": "success", "example": found}
