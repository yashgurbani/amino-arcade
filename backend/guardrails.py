from __future__ import annotations

import os
from dataclasses import dataclass


DEFAULT_BUDGET_MIB = int(os.environ.get("AF_COMPANION_VRAM_BUDGET_MIB", "7000"))
DEFAULT_MAX_SEQUENCE = int(os.environ.get("AF_COMPANION_MAX_SEQUENCE", "768"))


@dataclass(frozen=True)
class InferenceConfig:
    engine: str
    sequence_length: int
    num_models: int = 1
    num_recycle: int = 1
    templates: bool = False


def estimate_vram_mib(config: InferenceConfig) -> int:
    """Documented conservative heuristic, not a hardware probe."""
    if config.engine == "educational-simulator":
        return 128
    if config.engine == "localcolabfold":
        base = 3900
        residue_term = config.sequence_length * 1.1
        model_term = max(1, config.num_models) * 500
        recycle_term = max(1, config.num_recycle) * 250
        template_term = 800 if config.templates else 0
        return int(base + residue_term + model_term + recycle_term + template_term)
    base = 1600
    residue_term = config.sequence_length * (16 + config.sequence_length * 0.18)
    model_term = max(1, config.num_models) * 420
    recycle_term = max(1, config.num_recycle) * 260
    template_term = 800 if config.templates else 0
    return int(base + residue_term + model_term + recycle_term + template_term)


def preflight(config: InferenceConfig, budget_mib: int = DEFAULT_BUDGET_MIB) -> dict[str, object]:
    if config.sequence_length <= 0:
        return {
            "ok": False,
            "allowed": False,
            "message": "Sequence cannot be empty.",
            "reason": "Sequence cannot be empty.",
            "estimate_mib": 0,
            "estimated_memory_mib": 0,
            "budget_mib": budget_mib,
            "suggested_actions": ["paste an amino acid sequence"],
        }
    if config.sequence_length > DEFAULT_MAX_SEQUENCE:
        estimate = estimate_vram_mib(config)
        message = (
            f"Sequence length {config.sequence_length} exceeds the configured safe limit "
            f"of {DEFAULT_MAX_SEQUENCE} residues for this local workstation."
        )
        return {
            "ok": False,
            "allowed": False,
            "message": message,
            "reason": message,
            "estimate_mib": estimate,
            "estimated_memory_mib": estimate,
            "budget_mib": budget_mib,
            "suggested_actions": ["reduce sequence length", "use a remote runtime", "split the target into domains"],
        }
    estimate = estimate_vram_mib(config)
    if estimate > budget_mib:
        message = (
            f"Estimated VRAM use is {estimate} MiB, above the {budget_mib} MiB budget. "
            "Use fewer recycles/models, disable templates, or shorten the sequence."
        )
        return {
            "ok": False,
            "allowed": False,
            "message": message,
            "reason": message,
            "estimate_mib": estimate,
            "estimated_memory_mib": estimate,
            "budget_mib": budget_mib,
            "suggested_actions": ["lower recycles", "lower model count", "disable templates", "shorten the sequence"],
        }
    return {
        "ok": True,
        "allowed": True,
        "message": "Preflight passed.",
        "reason": "Preflight passed.",
        "estimate_mib": estimate,
        "estimated_memory_mib": estimate,
        "budget_mib": budget_mib,
        "suggested_actions": [],
    }

