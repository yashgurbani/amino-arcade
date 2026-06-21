from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class ApiEnvelope(BaseModel):
    model_config = ConfigDict(extra="allow")

    status: str


class ErrorEnvelope(ApiEnvelope):
    status: Literal["error"] = "error"
    message: str


class Provenance(BaseModel):
    model_config = ConfigDict(extra="allow")

    kind: str
    label: str
    scientific_validity: str
    explanation: str
    model_version: str
    database_mode: str | None = None
    engine: str
    created_at: str
    claims: list[str] = Field(default_factory=list)
    disclaimers: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class PredictionResult(BaseModel):
    model_config = ConfigDict(extra="allow")

    status: Literal["success"] = "success"
    engine: str
    prediction_kind: str
    prediction_label: str
    scientific_validity: str
    explanation: str
    model_version: str
    database_mode: str | None = None
    parameters: dict[str, Any] = Field(default_factory=dict)
    limitations: list[str] = Field(default_factory=list)
    sequence: str
    provenance: Provenance
    frames: list[dict[str, Any]] = Field(default_factory=list)
    pdb: str | None = None
    plddt: list[float] = Field(default_factory=list)
    pae: list[list[float]] | None = None
    meta: dict[str, Any] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)


class PredictionEnvelope(ApiEnvelope):
    status: Literal["success"] = "success"
    result: PredictionResult | None = None


class JobEnvelope(ApiEnvelope):
    status: Literal["success"] = "success"
    job: dict[str, Any]


class ManifestEnvelope(ApiEnvelope):
    status: Literal["success"] = "success"
    manifest: dict[str, Any]


class ReportEnvelope(ApiEnvelope):
    status: Literal["success"] = "success"
    report: dict[str, Any]
