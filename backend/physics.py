from __future__ import annotations

import io
from dataclasses import dataclass
from importlib.util import find_spec
from typing import Any


@dataclass(frozen=True)
class PhysicsStatus:
    available: bool
    label: str
    mode: str
    message: str
    packages: dict[str, bool]


class PhysicsRelaxationError(RuntimeError):
    """OpenMM could not parametrize or minimize the submitted structure."""


def physics_status() -> PhysicsStatus:
    packages = {
        "openmm": find_spec("openmm") is not None,
        "pdbfixer": find_spec("pdbfixer") is not None,
    }
    available = packages["openmm"]
    return PhysicsStatus(
        available=available,
        label="local relaxation",
        mode="openmm-local-relaxation",
        message=(
            "OpenMM is available; local relaxation can energy-minimize an existing predicted structure."
            if available
            else "OpenMM is not installed. Physics mode is disabled; prediction/recycle views remain unchanged."
        ),
        packages=packages,
    )


def _ensure_openmm():
    try:
        from openmm import LangevinIntegrator, LocalEnergyMinimizer, Platform, unit  # type: ignore
        from openmm.app import ForceField, Modeller, NoCutoff, PDBFile, Simulation  # type: ignore
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError("OpenMM is not installed; local relaxation is unavailable.") from exc
    return {
        "ForceField": ForceField,
        "LangevinIntegrator": LangevinIntegrator,
        "LocalEnergyMinimizer": LocalEnergyMinimizer,
        "Modeller": Modeller,
        "NoCutoff": NoCutoff,
        "PDBFile": PDBFile,
        "Platform": Platform,
        "Simulation": Simulation,
        "unit": unit,
    }


def local_relaxation(pdb_text: str, max_iterations: int = 200) -> dict[str, Any]:
    """Energy-minimize an existing PDB with OpenMM.

    This is local relaxation, not folding: it starts from predicted coordinates
    and performs a coordinate cleanup. It does not infer structure from sequence
    or create a folding trajectory.
    """

    if not pdb_text or "ATOM" not in pdb_text:
        raise ValueError("Physics relaxation requires a PDB string with ATOM records.")
    max_iterations = max(1, min(int(max_iterations or 200), 1000))

    mm = _ensure_openmm()
    PDBFile = mm["PDBFile"]
    ForceField = mm["ForceField"]
    Modeller = mm["Modeller"]
    Simulation = mm["Simulation"]
    NoCutoff = mm["NoCutoff"]
    LangevinIntegrator = mm["LangevinIntegrator"]
    LocalEnergyMinimizer = mm["LocalEnergyMinimizer"]
    Platform = mm["Platform"]
    unit = mm["unit"]

    try:
        pdb = PDBFile(io.StringIO(pdb_text))
        forcefield = ForceField("amber14-all.xml", "amber14/tip3pfb.xml")
        modeller = Modeller(pdb.topology, pdb.positions)
        modeller.addHydrogens(forcefield)

        system = forcefield.createSystem(modeller.topology, nonbondedMethod=NoCutoff, constraints=None)
        integrator = LangevinIntegrator(300 * unit.kelvin, 1 / unit.picosecond, 0.002 * unit.picoseconds)
        try:
            platform = Platform.getPlatformByName("CPU")
            simulation = Simulation(modeller.topology, system, integrator, platform)
        except Exception:  # noqa: BLE001
            simulation = Simulation(modeller.topology, system, integrator)

        simulation.context.setPositions(modeller.positions)
        before = simulation.context.getState(getEnergy=True).getPotentialEnergy()
        LocalEnergyMinimizer.minimize(simulation.context, maxIterations=max_iterations)
        state = simulation.context.getState(getEnergy=True, getPositions=True)
        after = state.getPotentialEnergy()
    except Exception as exc:  # noqa: BLE001
        raise PhysicsRelaxationError(f"OpenMM could not relax this structure: {exc}") from exc

    out = io.StringIO()
    PDBFile.writeFile(modeller.topology, state.getPositions(), out)
    return {
        "status": "success",
        "mode": "openmm-local-relaxation",
        "label": "local relaxation",
        "max_iterations": max_iterations,
        "energy_before_kj_per_mol": float(before.value_in_unit(unit.kilojoule_per_mole)),
        "energy_after_kj_per_mol": float(after.value_in_unit(unit.kilojoule_per_mole)),
        "pdb": out.getvalue(),
        "not_folding": True,
        "message": "Local relaxation completed. This is energy minimization of an existing structure, not folding.",
    }
