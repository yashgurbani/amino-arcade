#!/usr/bin/env sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"

cd "$ROOT/frontend"
npm test
npm run lint
npm run build

cd "$ROOT"
python -m unittest backend.test_backend

if rg "buildFoldingFrames" frontend/src backend; then
  echo "buildFoldingFrames is still present. Delete stale synthetic trajectory code." >&2
  exit 1
fi

echo "Verification passed."
