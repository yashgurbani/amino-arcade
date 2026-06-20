from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from time import perf_counter
from typing import Dict, List

from backend.prediction_engine import predict_structure


@dataclass(frozen=True)
class ExampleSpec:
    id: str
    title: str
    category: str
    sequence: str
    msa_depth: int
    difficulty: str
    concept: str
    interpretation: str
    visual_approach: str


EXAMPLE_SPECS: List[ExampleSpec] = [
    ExampleSpec(
        id="easy-monomer",
        title="Easy monomer with strong coevolution signal",
        category="cached-simulator",
        sequence="MGEELFTGVVPILVELDGDVNGHKFSVSGEGEGDATYGKLTLKFICTTGKLPVPWPTLVTTFS",
        msa_depth=840,
        difficulty="easy",
        concept="Coevolution gives the pair representation a sharp contact prior.",
        interpretation=(
            "High MSA depth makes direct residue couplings easier to separate from indirect correlations, "
            "so the contact map and confidence profile converge early."
        ),
        visual_approach="Use the coevolution scene to click a high-coupling cell, then inspect the highlighted residue pair in the structure viewer.",
    ),
    ExampleSpec(
        id="low-msa-hard",
        title="Low-MSA hard target",
        category="cached-simulator",
        sequence="MSDKIIHLTDDSFDTDVLKADGAILVDFWAEWCGPCKMIAPILDEIADEYQGKLTVAKLNIDQNPGT",
        msa_depth=18,
        difficulty="hard",
        concept="When evolutionary samples are sparse, geometry and recycling carry more of the burden.",
        interpretation=(
            "Weak coevolutionary evidence forces the model to rely more heavily on learned geometric priors. "
            "This is where triangle consistency and recycling become visible as constraint propagation."
        ),
        visual_approach="Compare early and late recycling frames; confidence rises more slowly and flexible segments remain lower confidence.",
    ),
    ExampleSpec(
        id="flexible-tail",
        title="Structured core with flexible termini",
        category="cached-simulator",
        sequence="MADQLTEEQIAEFKEAFSLFDKDGDGTITTKELGTVMRSLGQNPTEAELQDMISEVDADGNGTIDFPEFLTMMARK",
        msa_depth=220,
        difficulty="medium",
        concept="pLDDT is local confidence, not a free energy or folding rate.",
        interpretation=(
            "The core can look reliable while terminal regions remain mobile or unresolved. "
            "Use this example to separate structural confidence from a literal folding trajectory."
        ),
        visual_approach="Turn on confidence coloring and compare the terminal confidence troughs against the residue chart.",
    ),
    ExampleSpec(
        id="interface-toy",
        title="Interface contact toy",
        category="cached-simulator",
        sequence="MGSSHHHHHHSSGLVPRGSHMASMTGGQQMGRDLYDDDDKDRWGSMKQLEDKVEELLSKNYHLENEVARLKK",
        msa_depth=96,
        difficulty="medium",
        concept="Single-chain confidence is not the same as multimer interface certainty.",
        interpretation=(
            "The original AlphaFold2 paper focuses on monomer prediction. Interface reasoning needs additional "
            "signals and is better treated as an extension, not as a solved property of this simulator."
        ),
        visual_approach="Use this as an extension prompt: add a second chain and ask what extra evidence a multimer model would need.",
    ),
    ExampleSpec(
        id="chirality-reflection",
        title="Chirality and reflected frames",
        category="concept-toy",
        sequence="ACDEFGHIKLMNPQRSTVWYACDEFGHIKLMNPQRSTVWY",
        msa_depth=64,
        difficulty="conceptual",
        concept="Distance geometry alone cannot choose handedness; FAPE in local frames penalizes reflections.",
        interpretation=(
            "Two structures can preserve many distances while disagreeing in handedness. "
            "The FAPE/chirality scene makes that failure mode explicit."
        ),
        visual_approach="Toggle reflection in the FAPE scene and watch distance-like agreement fail under local-frame comparison.",
    ),
    ExampleSpec(
        id="recycling-convergence",
        title="Recycling fixed-point convergence",
        category="concept-toy",
        sequence="MKTVRQERLKSIVRILERSKEPVSGAQLAEELSVSRQVIVQDIAYLRSLGYNIVATPRGYVLAGG",
        msa_depth=310,
        difficulty="medium",
        concept="Recycling is a learned fixed-point iteration over representations and coordinates.",
        interpretation=(
            "The important object is not a physical movie of folding, but an iterative refinement process "
            "that reuses model outputs as inputs."
        ),
        visual_approach="Scrub through recycling steps and compare confidence, constraint violations, and coordinate movement.",
    ),
]


def _confidence_summary(plddt: List[float]) -> Dict[str, float]:
    if not plddt:
        return {"mean": 0.0, "min": 0.0, "max": 0.0}
    return {
        "mean": round(sum(plddt) / len(plddt), 2),
        "min": round(min(plddt), 2),
        "max": round(max(plddt), 2),
    }


def _make_pae(length: int, difficulty: str) -> List[List[float]]:
    scale = {"easy": 4.0, "medium": 8.0, "hard": 14.0, "conceptual": 10.0}.get(difficulty, 8.0)
    return [
        [round(min(31.0, 1.5 + abs(i - j) / max(1, length) * scale), 2) for j in range(length)]
        for i in range(length)
    ]


def _make_trajectory(length: int, steps: int = 6) -> List[Dict[str, object]]:
    frames = []
    for step in range(steps):
        progress = step / max(1, steps - 1)
        frames.append(
            {
                "step": step,
                "progress": round(progress, 3),
                "mean_plddt": round(48 + 42 * progress, 2),
                "violation_score": round(1.0 - 0.86 * progress, 3),
                "note": "Initial noisy representation" if step == 0 else ("Refined structure" if step == steps - 1 else "Recycling refinement"),
                "residue_offsets": [
                    round((1.0 - progress) * ((i % 7) - 3) / 5.0, 3)
                    for i in range(min(length, 40))
                ],
            }
        )
    return frames


@lru_cache(maxsize=1)
def get_examples() -> List[Dict[str, object]]:
    examples: List[Dict[str, object]] = []
    for spec in EXAMPLE_SPECS:
        start = perf_counter()
        pdb, plddt = predict_structure(spec.sequence)
        runtime_ms = round((perf_counter() - start) * 1000, 2)
        examples.append(
            {
                "id": spec.id,
                "title": spec.title,
                "category": spec.category,
                "engine": "educational-simulator",
                "sequence": spec.sequence,
                "length": len(spec.sequence),
                "msa_depth": spec.msa_depth,
                "difficulty": spec.difficulty,
                "concept": spec.concept,
                "interpretation": spec.interpretation,
                "visual_approach": spec.visual_approach,
                "pdb": pdb,
                "plddt": plddt,
                "pae": _make_pae(len(spec.sequence), spec.difficulty),
                "trajectory": _make_trajectory(len(spec.sequence)),
                "confidence": _confidence_summary(plddt),
                "runtime": {"simulator_ms": runtime_ms, "cached": True},
                "warnings": [
                    "Cached educational output, not a peer-reviewed structure prediction.",
                    "Use the LocalColabFold adapter for true AF2-family inference.",
                ],
            }
        )
    return examples


def get_example(example_id: str) -> Dict[str, object] | None:
    for example in get_examples():
        if example["id"] == example_id:
            return example
    return None
