# Pedagogy Alignment Review

_Last updated: 2026-06-19_

Source reviewed: `docs/handoffs/PEDAGOGICAL_HANDOFF.md`.

## Alignment

- The main app is organized around the five handoff concepts: coevolution, triangle updates, invariant point attention, FAPE/chirality, and recycling.
- Each concept is framed as a Socratic question in the scene metadata, matching the handoff's instruction to ask the algorithm's question before naming the algorithm.
- The expanded concept scene includes the question, toy interaction, paper location, and toy-vs-real boundary, which satisfies the interpretation-card intent in compact form.
- The provenance distinction is visible: teaching preview vs `REAL: LocalColabFold`, and backend/job logs are exposed instead of hidden.
- The language avoids the core pedagogical error: recycle frames are inference-refinement snapshots, not a physical folding movie.
- pLDDT and PAE are treated as confidence/reliability outputs, not thermodynamics, free energy, or folding probability.

## Target Fidelity

- Insulin now folds full human preproinsulin (110 aa), not the earlier B-chain proxy.
- GFP, myoglobin, lysozyme, and hemoglobin alpha are full practical single-chain targets under the local AF2-family path.
- Collagen is represented by a 768-residue collagen-like GPP chain, the largest raised-limit target proven on this workstation so far. The UI labels it as collagen-like rather than pretending it is native collagen, because real collagen is a multi-chain/triple-helix system outside this demo's single-chain scope.

## Guardrail Position

- The backend default `AF_COMPANION_MAX_SEQUENCE` is now 768. Direct cached-run evidence currently covers targets through the 768-residue collagen-like chain; a 1023-residue attempt failed with LocalColabFold exit code 139 and should not be treated as supported without further optimization.

## Remaining Pedagogy Gaps

- The handoff asks for earned interpretation cards after objective completion. The app currently provides the interpretation in the expanded scene, but does not yet gate/unlock a separate card after a successful learner action.
- The handoff asks for two curriculum paths. The app defaults to paper-faithful order but does not yet expose a necessity-first guided-tour toggle.
- PAE hover/click should eventually highlight both residue partners in Mol*. Current lens annotations highlight representative residues, not full bidirectional PAE pair pinning.
