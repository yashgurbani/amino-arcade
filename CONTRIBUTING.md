# Contributing

Contributions should make the companion more accurate, more inspectable, or easier to run locally.

## Good First Contributions

- Add a new `SceneSpec` for a paper concept.
- Add a cached example with sequence, PDB, pLDDT, interpretation, and provenance.
- Improve keyboard/a11y behavior in a viewer or control.
- Add tests for concept math or backend adapter error handling.

## Standards

- Label every result by engine and provenance.
- Keep concept math in pure functions where possible.
- Keep UI components dense, readable, and consistent with `DESIGN.md`.
- Do not commit model weights, downloaded databases, virtual environments, or generated build output.

## Validation

Run backend unit tests and frontend build/test commands before proposing changes. If a model adapter is touched, include a cached-output fallback so reviewers can inspect UI behavior without GPU access.
