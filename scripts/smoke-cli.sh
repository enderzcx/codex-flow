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
grep -q "cwf dynamic run <workflow.js> --target <repo>" /tmp/cwf-help-smoke.txt

echo "==> workflow registry smoke"
node dist/cli.js workflows list
node dist/cli.js workflows show diff-review
node dist/cli.js workflows validate

echo "==> workflow validation smoke"
node dist/cli.js validate workflows/diff-review.yaml
node dist/cli.js validate fixtures/workflows/gated-diff-review.yaml
node dist/cli.js validate fixtures/workflows/gated-doc-refresh.yaml
node dist/cli.js validate fixtures/workflows/gated-safe-write.yaml
node dist/cli.js validate fixtures/workflows/app-thread-diff-review.yaml

echo "==> write-gate validation smoke"
if node dist/cli.js validate fixtures/workflows/write-without-gate.yaml >/tmp/cwf-write-without-gate.txt 2>&1; then
  echo "Expected write-without-gate validation to fail, but it passed." >&2
  cat /tmp/cwf-write-without-gate.txt >&2
  exit 1
fi
grep -q "writes:true" /tmp/cwf-write-without-gate.txt

echo "==> dynamic workflow preview smoke"
tmp_dynamic_target=$(mktemp -d /tmp/cwf-dynamic-target-XXXXXX)
mkdir -p "$tmp_dynamic_target/src"
printf '{"name":"dynamic-smoke","version":"0.0.0"}\n' > "$tmp_dynamic_target/package.json"
printf 'export const answer = 42;\n' > "$tmp_dynamic_target/src/calc.js"
git -C "$tmp_dynamic_target" init >/dev/null
git -C "$tmp_dynamic_target" config user.email codex-workflows@example.invalid
git -C "$tmp_dynamic_target" config user.name codex-workflows
git -C "$tmp_dynamic_target" add .
git -C "$tmp_dynamic_target" commit -m baseline >/dev/null
printf 'export const answer = 0;\n' > "$tmp_dynamic_target/src/calc.js"
node dist/cli.js dynamic run fixtures/dynamic/read-only.workflow.js --target "$tmp_dynamic_target" >/tmp/cwf-dynamic-preview.txt
grep -q "Approve: cwf approve" /tmp/cwf-dynamic-preview.txt
dynamic_run_id=$(sed -n 's/^Run ID: //p' /tmp/cwf-dynamic-preview.txt)
test -n "$dynamic_run_id"
test -f "$HOME/.codex-workflows/runs/$dynamic_run_id/artifacts/dynamic-preview.md"
test -f "$HOME/.codex-workflows/runs/$dynamic_run_id/artifacts/workflow.sha256"
grep -q "Node Permission Model child process" "$HOME/.codex-workflows/runs/$dynamic_run_id/artifacts/dynamic-preview.md"
rm -rf "$tmp_dynamic_target" "$HOME/.codex-workflows/runs/$dynamic_run_id" /tmp/cwf-dynamic-preview.txt

echo "==> github-pr artifact smoke"
tmp_target=$(mktemp -d /tmp/cwf-gh-target-XXXXXX)
mkdir -p "$tmp_target/src"
printf 'export const ok = true;\n' > "$tmp_target/src/app.js"
run_id=$(TARGET="$tmp_target" node --input-type=module <<'NODE'
import { RunStore } from "./dist/run-store.js";
const spec = {
  id: "diff-review",
  version: "1.0.0",
  title: "Diff Review",
  tags: ["review", "read-only"],
  inputs: { target: { type: "path", required: true } },
  capabilities: { writes: false },
  requires: { target: "git-repo" },
  defaults: { sandbox: "read-only", timeout_ms: 300000 },
  phases: [
    { id: "collect", kind: "command" },
    { id: "review", kind: "codex-parallel", workers: [{ id: "correctness", perspective: "correctness", prompt: "review" }] },
    { id: "reduce", kind: "reducer", reducer: "diff-review" },
  ],
  artifacts: ["result.md"],
};
const store = await RunStore.create(spec, process.env.TARGET);
await store.writeResult("# Review\n\nSmoke result.\n");
console.log(store.runId);
NODE
)
node dist/cli.js github-pr "$run_id" --format comment
node dist/cli.js github-pr "$run_id" --format review
test -f "$HOME/.codex-workflows/runs/$run_id/artifacts/github-pr-comment.md"
test -f "$HOME/.codex-workflows/runs/$run_id/artifacts/github-pr-review.json"
rm -rf "$tmp_target" "$HOME/.codex-workflows/runs/$run_id"

echo "==> suggest-workflow smoke"
tmp_suggest_target=$(mktemp -d /tmp/cwf-suggest-target-XXXXXX)
mkdir -p "$tmp_suggest_target/docs"
printf '# Smoke\n' > "$tmp_suggest_target/docs/note.md"
tmp_suggestion_dir=$(mktemp -d /tmp/cwf-suggestion-XXXXXX)
tmp_suggestion="$tmp_suggestion_dir/suggested.yaml"
node dist/cli.js suggest-workflow --goal "Review fixture docs" --target "$tmp_suggest_target" --output "$tmp_suggestion" >/tmp/cwf-suggestion.txt
grep -q "Validation: OK" /tmp/cwf-suggestion.txt
grep -q "Installed: no" /tmp/cwf-suggestion.txt
node dist/cli.js validate "$tmp_suggestion"
if node dist/cli.js workflows list | grep -q "suggested-review-fixture-docs"; then
  echo "Suggestion should not be installed in workflow registry" >&2
  exit 1
fi
rm -rf "$tmp_suggest_target" "$tmp_suggestion_dir" /tmp/cwf-suggestion.txt

echo "cwf CLI smoke passed without live Codex worker calls."
