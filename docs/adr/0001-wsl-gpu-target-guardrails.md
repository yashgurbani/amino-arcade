# 0001. Use WSL-GPU scaling evidence for Amino Arcade target guardrails

Date: 2026-06-19

## Status

Accepted

## Context

Amino Arcade needs all six named arcade targets to be foldable when the local machine can support them, while still avoiding misleading claims and unsafe resource use. The previous default sequence cap of 150 residues blocked Myoglobin, Lysozyme, and GFP even though the RCSB reference structures could still render.

Windows LocalColabFold can run through the local executable, but the verified performant path on this machine is the WSL wrapper. The full WSL-GPU ladder ran with one model, two recycles, `single_sequence` MSA mode, templates off, and `--save-recycles`. All six targets succeeded, logged `Running on GPU`, emitted three Mol*-loadable recycle frames, and peaked around 4.23 GiB of the 8 GiB GPU.

## Decision

Use the WSL-GPU benchmark ladder as the basis for the current Amino Arcade guardrails:

- set the default `AF_COMPANION_MAX_SEQUENCE` to 768 residues, with direct cached-run evidence for a four-recycle 768-residue collagen-like chain;
- keep the default `AF_COMPANION_VRAM_BUDGET_MIB` at 7000 MiB;
- keep arcade LocalColabFold defaults at one model, conservative recycles, `single_sequence` MSA mode, templates off, and saved recycle frames;
- require a fresh benchmark record before treating targets above the cached 768-residue range, or above four recycles, as production-safe.

## Consequences

All current arcade targets can expose the real LocalColabFold path under the active guardrail. The guardrail remains evidence-bound for future targets and settings because a 1023-residue LocalColabFold attempt failed with exit code 139, and targets above the cached 768-residue range require fresh proof before being treated as production-safe.

The estimate is still not a live hardware probe. Runtime UI and docs must continue to distinguish WSL-GPU evidence from Windows CPU fallback and must preserve the scientific language: recycle frames are inference-refinement snapshots, not physical folding paths or molecular dynamics.
