from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


PROVENANCE_PRESETS = {
    "educational-simulator": {
        "kind": "teaching-sim",
        "label": "SIMULATED: educational teaching model",
        "tone": "warning",
        "claims": [
            "Explains geometry, confidence coloring, and API workflow.",
            "Produces deterministic backbone-like coordinates for learning.",
        ],
        "disclaimers": [
            "Not AlphaFold2, not ColabFold, and not evidence for a biological structure.",
            "Trajectory frames are representational teaching iterations, not folding kinetics.",
        ],
    },
    "localcolabfold": {
        "kind": "real-af2",
        "label": "REAL: LocalColabFold",
        "tone": "success",
        "claims": [
            "Runs an AF2-family ColabFold pipeline through the configured local executable.",
            "Supports scientific inspection when databases, parameters, and runtime are configured correctly.",
        ],
        "disclaimers": [
            "Result quality depends on local databases, model settings, and input suitability.",
            "Per-recycle frames are shown only when the engine exposes matching artifacts.",
        ],
    },
    "minalphafold2": {
        "kind": "architecture-smoke",
        "label": "REAL CODE: minAlphaFold2 smoke",
        "tone": "info",
        "claims": [
            "Exercises a paper-faithful educational AlphaFold2 architecture implementation.",
            "Useful for architecture and training-loop inspection.",
        ],
        "disclaimers": [
            "Not a pretrained arbitrary-sequence structure predictor.",
            "Returned artifacts are overfit/smoke-test outputs unless separately configured.",
        ],
    },
    "esmfold": {
        "kind": "real-lm-fold",
        "label": "REAL: ESMFold",
        "tone": "info",
        "claims": [
            "Uses a protein language model folding backend when configured.",
        ],
        "disclaimers": [
            "Not AlphaFold2 and not a replacement for AF2-family confidence interpretation.",
        ],
    },
}


def make_provenance(engine: str, **metadata: Any) -> dict[str, Any]:
    preset = PROVENANCE_PRESETS.get(engine)
    if not preset:
        raise ValueError(f"Unknown provenance engine '{engine}'.")
    return {
        **preset,
        "engine": engine,
        "source": metadata.pop("source", None),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "metadata": metadata,
    }
