#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> npm run check"
npm run check

echo "==> npm pack --dry-run"
npm pack --dry-run

echo "==> cwf help"
node dist/cli.js --help >/tmp/cwf-help-smoke.txt
grep -q "cwf workflows validate" /tmp/cwf-help-smoke.txt
grep -q "cwf run <workflow-id-or-path> --target <repo>" /tmp/cwf-help-smoke.txt

echo "==> workflow registry smoke"
node dist/cli.js workflows list
node dist/cli.js workflows show diff-review
node dist/cli.js workflows validate

echo "==> workflow validation smoke"
node dist/cli.js validate workflows/diff-review.yaml
node dist/cli.js validate fixtures/workflows/gated-diff-review.yaml

echo "==> write-gate validation smoke"
if node dist/cli.js validate fixtures/workflows/write-without-gate.yaml >/tmp/cwf-write-without-gate.txt 2>&1; then
  echo "Expected write-without-gate validation to fail, but it passed." >&2
  cat /tmp/cwf-write-without-gate.txt >&2
  exit 1
fi
grep -q "writes:true" /tmp/cwf-write-without-gate.txt

echo "cwf CLI smoke passed without live Codex worker calls."
