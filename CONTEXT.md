# Amino Arcade Context

This glossary defines the product language for Amino Arcade, a local-first AlphaFold companion that combines serious structure inspection with arcade-style teaching interactions.

## Language

**Amino Arcade**:
The interactive AlphaFold companion experience that teaches core geometric ideas while exposing local inference and structure-inspection workflows.
_Avoid_: FoldYourProtein, AlphaFold workstation, protein toy

**FIY**:
The Fold It Yourself workflow where the user supplies or selects a sequence, runs an engine, and inspects the resulting structure with typed backend provenance.
_Avoid_: Run inference, custom fold, manual mode

**Real Structure**:
A molecular structure loaded from a real PDB or an AF2-family prediction artifact and rendered in the primary protein viewer.
_Avoid_: Arcade structure, decorative molecule

**Inference Trajectory**:
A sequence of real model-refinement frames emitted by an inference engine, such as LocalColabFold recycle PDBs; it is not a physical folding pathway.
_Avoid_: Physical folding path, molecular dynamics trajectory

**Teaching Trajectory**:
A computed refinement sequence that animates inspectable teaching observables; it is not physical folding time or a claim about AlphaFold2 internals.
_Avoid_: Folding movie, real-time folding, kinetic path

**Arcade Lens**:
A visual overlay on the real structure, inference trajectory, or teaching trajectory that highlights one AlphaFold concept such as contacts, triangle consistency, chirality, or recycling.
_Avoid_: Mode tab, mini-game, effect
