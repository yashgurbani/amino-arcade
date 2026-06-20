from __future__ import annotations

import re
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

REFERENCE_PDB_CACHE: dict[str, str] = {}


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


@app.get("/api/reference/pdb/{pdb_id}")
async def reference_pdb(pdb_id: str):
    normalized = pdb_id.upper().strip()
    if not re.fullmatch(r"[A-Z0-9]{4}", normalized):
        return JSONResponse(status_code=400, content={"status": "error", "message": "PDB id must be four alphanumeric characters."})
    if normalized in REFERENCE_PDB_CACHE:
        return Response(content=REFERENCE_PDB_CACHE[normalized], media_type="chemical/x-pdb", headers={"Cache-Control": "public, max-age=86400"})
    url = f"https://files.rcsb.org/download/{normalized}.pdb"
    try:
        request = Request(url, headers={"User-Agent": "amino-arcade/3d-companion"})
        with urlopen(request, timeout=10) as response:
            text = response.read().decode("utf-8", errors="replace")
    except HTTPError as exc:
        return JSONResponse(status_code=exc.code, content={"status": "error", "message": f"RCSB {normalized} returned HTTP {exc.code}."})
    except (TimeoutError, URLError, OSError) as exc:
        return JSONResponse(status_code=502, content={"status": "error", "message": f"RCSB {normalized} unavailable: {exc}"})
    if "ATOM" not in text:
        return JSONResponse(status_code=502, content={"status": "error", "message": f"RCSB {normalized} did not return a usable PDB."})
    REFERENCE_PDB_CACHE[normalized] = text
    return Response(content=text, media_type="chemical/x-pdb", headers={"Cache-Control": "public, max-age=86400"})


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


@app.post("/api/predict")
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


@app.post("/api/predict/jobs")
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


@app.get("/api/predict/jobs/{job_id}")
async def prediction_job(job_id: str):
    job = get_job(job_id)
    if not job:
        return JSONResponse(status_code=404, content={"status": "error", "message": f"Job '{job_id}' not found."})
    return {"status": "success", "job": job}


@app.post("/api/predict/jobs/{job_id}/cancel")
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


@app.get("/api/predict/jobs/{job_id}/manifest")
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


@app.get("/api/predict/jobs/{job_id}/report")
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
