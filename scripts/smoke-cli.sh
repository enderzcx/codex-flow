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
grep -q "cwf dynamic list" /tmp/cwf-help-smoke.txt
grep -q "cwf dynamic generate" /tmp/cwf-help-smoke.txt
grep -q "cwf dynamic run <workflow.js-or-id> --target <repo>" /tmp/cwf-help-smoke.txt
grep -q "cwf result <run-id> --json" /tmp/cwf-help-smoke.txt

echo "==> workflow registry smoke"
node dist/cli.js workflows list
node dist/cli.js workflows show diff-review
node dist/cli.js workflows validate

echo "==> dynamic workflow registry smoke"
node dist/cli.js dynamic list
node dist/cli.js dynamic show change-summary
node dist/cli.js dynamic show docs-change-check

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

echo "==> app-thread direct write rejection smoke"
tmp_app_thread_write_workflow=$(mktemp /tmp/cwf-app-thread-write-XXXXXX.yaml)
cat > "$tmp_app_thread_write_workflow" <<'YAML'
id: app-thread-write-rejected
version: 1.12.0-smoke
title: App Thread Write Rejected
tags:
  - write-capable
  - app-thread
capabilities:
  writes: true
runtime:
  preferred_worker_adapter: codex-app-thread
  fallback_worker_adapter: codex-sdk-headless
write_policy:
  mode: patch
  allowed_paths:
    - src/generated/**
inputs:
  target:
    type: path
    required: true
requires:
  target: git-repo
defaults:
  sandbox: read-only
  timeout_ms: 300000
phases:
  - id: collect
    kind: command
  - id: preview-write
    kind: write-preview
    prompt: Preview rejected app-thread write.
  - id: approve-write
    kind: gate
    prompt: Approve rejected app-thread write.
    requires_approval: true
  - id: review
    kind: codex-write
    writes: true
    worker:
      id: app-thread-writer
      perspective: rejected app-thread writer
      prompt: This direct app-thread write should be rejected.
  - id: reduce
    kind: reducer
    reducer: diff-review
artifacts:
  - result.md
YAML
if node dist/cli.js validate "$tmp_app_thread_write_workflow" >/tmp/cwf-app-thread-write.txt 2>&1; then
  echo "Expected app-thread write workflow validation to fail, but it passed." >&2
  cat /tmp/cwf-app-thread-write.txt >&2
  exit 1
fi
grep -q "codex-app-thread is read-only only" /tmp/cwf-app-thread-write.txt
rm -f "$tmp_app_thread_write_workflow" /tmp/cwf-app-thread-write.txt

echo "==> write-proposal safePatch smoke"
tmp_write_proposal_target=$(mktemp -d /tmp/cwf-write-proposal-target-XXXXXX)
mkdir -p "$tmp_write_proposal_target/src"
printf '{"name":"write-proposal-smoke","version":"0.0.0"}\n' > "$tmp_write_proposal_target/package.json"
printf 'export const answer = 42;\n' > "$tmp_write_proposal_target/src/calc.js"
git -C "$tmp_write_proposal_target" init >/dev/null
git -C "$tmp_write_proposal_target" config user.email codex-workflows@example.invalid
git -C "$tmp_write_proposal_target" config user.name codex-workflows
git -C "$tmp_write_proposal_target" add .
git -C "$tmp_write_proposal_target" commit -m baseline >/dev/null
printf 'export const answer = 0;\n' > "$tmp_write_proposal_target/src/calc.js"
write_proposal_run=$(
  TARGET="$tmp_write_proposal_target" node --input-type=module <<'NODE'
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { executeWorkflow } from "./dist/phase-engine.js";
import { RunStore } from "./dist/run-store.js";

const target = process.env.TARGET;
const spec = {
  id: "write-proposal-smoke",
  version: "1.12.0-smoke",
  title: "Write Proposal Smoke",
  tags: ["write-proposal", "safe-write", "smoke"],
  inputs: { target: { type: "path", required: true } },
  capabilities: { writes: true },
  write_policy: {
    mode: "patch",
    allowed_paths: ["src/generated/**"],
    forbidden_paths: [".env", ".git", ".git/**"],
    verification_commands: ["test -f src/generated/proposal.js"],
  },
  requires: { target: "git-repo" },
  defaults: { sandbox: "read-only", timeout_ms: 300000 },
  phases: [
    { id: "collect", kind: "command" },
    { id: "preview-write", kind: "write-preview", prompt: "Preview proposal write." },
    { id: "approve-write", kind: "gate", prompt: "Approve proposal apply.", requires_approval: true },
    {
      id: "review",
      kind: "codex-write",
      writes: true,
      worker: {
        id: "proposal-writer",
        perspective: "safe proposal writer",
        prompt: "Create src/generated/proposal.js.",
        writes: true,
      },
    },
    { id: "reduce", kind: "reducer", reducer: "diff-review" },
  ],
  artifacts: ["result.md"],
};

const store = await RunStore.create(spec, target);
await executeWorkflow({ spec, specPath: "smoke/write-proposal.yaml", target, store });
try {
  await readFile(join(target, "src", "generated", "proposal.js"), "utf8");
  throw new Error("original target changed before approval");
} catch (error) {
  if (!String(error).includes("ENOENT")) {
    throw error;
  }
}
await store.approveGate("approve-write");
await executeWorkflow({
  spec,
  specPath: "smoke/write-proposal.yaml",
  target,
  store,
  resume: true,
  writeRunner: async (worker, _context, options) => {
    // The mock writer mutates only the isolated target. CWF then extracts
    // proposed.patch and applies it to the original target through safe-write.
    await mkdir(join(options.target, "src", "generated"), { recursive: true });
    await writeFile(join(options.target, "src", "generated", "proposal.js"), "export const proposal = true;\n");
    return {
      worker_id: worker.id,
      status: "completed",
      confidence: "high",
      summary: "proposal writer completed",
      findings: [],
      verification: ["mock writer completed"],
      artifacts: ["src/generated/proposal.js"],
      started_at: "2026-01-01T00:00:00.000Z",
      completed_at: "2026-01-01T00:00:01.000Z",
      duration_ms: 1000,
      prompt: "mock proposal writer",
      raw: "{}",
      raw_fallback: false,
      retry_count: 0,
      runtime: {
        adapter: "codex-sdk-headless",
        fallback_used: false,
        agent_role: worker.perspective,
        transcript_read: false,
        sandbox: "workspace-write",
        approval_policy: "never",
        worktree_path: options.target,
      },
    };
  },
});
console.log(store.runId);
NODE
)
test -n "$write_proposal_run"
test -f "$tmp_write_proposal_target/src/generated/proposal.js"
grep -q "src/generated/proposal.js" "$HOME/.codex-workflows/runs/$write_proposal_run/artifacts/proposed.patch"
grep -q "Policy-Applied Files" "$HOME/.codex-workflows/runs/$write_proposal_run/artifacts/diff-summary.md"
grep -q "src/generated/proposal.js" "$HOME/.codex-workflows/runs/$write_proposal_run/artifacts/diff-summary.md"
grep -q "passed: \`test -f src/generated/proposal.js\`" "$HOME/.codex-workflows/runs/$write_proposal_run/artifacts/verification.md"
rm -rf "$tmp_write_proposal_target" "$HOME/.codex-workflows/runs/$write_proposal_run"

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

echo "==> dynamic generate smoke"
tmp_generate_target=$(mktemp -d /tmp/cwf-dynamic-generate-target-XXXXXX)
mkdir -p "$tmp_generate_target/src"
printf '{"name":"dynamic-generate-smoke","version":"0.0.0"}\n' > "$tmp_generate_target/package.json"
printf 'export const generated = true;\n' > "$tmp_generate_target/src/app.js"
git -C "$tmp_generate_target" init >/dev/null
git -C "$tmp_generate_target" config user.email codex-workflows@example.invalid
git -C "$tmp_generate_target" config user.name codex-workflows
git -C "$tmp_generate_target" add .
git -C "$tmp_generate_target" commit -m baseline >/dev/null
printf 'export const generated = false;\n' > "$tmp_generate_target/src/app.js"
tmp_generate_dir=$(mktemp -d /tmp/cwf-dynamic-generate-XXXXXX)
tmp_generated_workflow="$tmp_generate_dir/generated.workflow.js"
node dist/cli.js dynamic generate --goal "Summarize the current fixture diff" --target "$tmp_generate_target" --output "$tmp_generated_workflow" >/tmp/cwf-dynamic-generate.txt
grep -q "Generated: $tmp_generated_workflow" /tmp/cwf-dynamic-generate.txt
generated_run_id=$(sed -n 's/^Run ID: //p' /tmp/cwf-dynamic-generate.txt)
test -n "$generated_run_id"
grep -q "Summarize the current fixture diff" "$HOME/.codex-workflows/runs/$generated_run_id/artifacts/dynamic-preview.md"
rm -rf "$tmp_generate_target" "$tmp_generate_dir" "$HOME/.codex-workflows/runs/$generated_run_id" /tmp/cwf-dynamic-generate.txt

echo "==> dynamic remote URL rejection smoke"
tmp_remote_target=$(mktemp -d /tmp/cwf-dynamic-remote-target-XXXXXX)
git -C "$tmp_remote_target" init >/dev/null
git -C "$tmp_remote_target" config user.email codex-workflows@example.invalid
git -C "$tmp_remote_target" config user.name codex-workflows
printf '{"name":"dynamic-remote-smoke","version":"0.0.0"}\n' > "$tmp_remote_target/package.json"
git -C "$tmp_remote_target" add .
git -C "$tmp_remote_target" commit -m baseline >/dev/null
if node dist/cli.js dynamic run https://example.com/workflow.js --target "$tmp_remote_target" >/tmp/cwf-dynamic-remote.txt 2>&1; then
  echo "Expected remote dynamic workflow URL to fail, but it passed." >&2
  cat /tmp/cwf-dynamic-remote.txt >&2
  exit 1
fi
grep -q "cannot run directly by URL" /tmp/cwf-dynamic-remote.txt
rm -rf "$tmp_remote_target" /tmp/cwf-dynamic-remote.txt

echo "==> dynamic template execution smoke"
tmp_template_target=$(mktemp -d /tmp/cwf-dynamic-template-target-XXXXXX)
mkdir -p "$tmp_template_target/docs"
printf '# Template smoke\n' > "$tmp_template_target/README.md"
printf '# Notes\n' > "$tmp_template_target/docs/note.md"
git -C "$tmp_template_target" init >/dev/null
git -C "$tmp_template_target" config user.email codex-workflows@example.invalid
git -C "$tmp_template_target" config user.name codex-workflows
git -C "$tmp_template_target" add .
git -C "$tmp_template_target" commit -m baseline >/dev/null
printf '# Template smoke updated\n' > "$tmp_template_target/README.md"
node dist/cli.js dynamic run change-summary --target "$tmp_template_target" --approve >/tmp/cwf-dynamic-template-a.txt
template_run_a=$(sed -n 's/^Run ID: //p' /tmp/cwf-dynamic-template-a.txt)
test -n "$template_run_a"
grep -q "Status: completed" /tmp/cwf-dynamic-template-a.txt
grep -q '"template": "change-summary"' "$HOME/.codex-workflows/runs/$template_run_a/artifacts/dynamic-final.json"
node dist/cli.js dynamic run docs-change-check --target "$tmp_template_target" --approve >/tmp/cwf-dynamic-template-b.txt
template_run_b=$(sed -n 's/^Run ID: //p' /tmp/cwf-dynamic-template-b.txt)
test -n "$template_run_b"
grep -q "Status: completed" /tmp/cwf-dynamic-template-b.txt
grep -q '"template": "docs-change-check"' "$HOME/.codex-workflows/runs/$template_run_b/artifacts/dynamic-final.json"
rm -rf "$tmp_template_target" "$HOME/.codex-workflows/runs/$template_run_a" "$HOME/.codex-workflows/runs/$template_run_b" /tmp/cwf-dynamic-template-a.txt /tmp/cwf-dynamic-template-b.txt

echo "==> dynamic save/reuse trust smoke"
tmp_trust_target=$(mktemp -d /tmp/cwf-dynamic-trust-target-XXXXXX)
trusted_id="trusted-change-$$"
mkdir -p "$tmp_trust_target/src"
printf '{"name":"dynamic-trust-smoke","version":"0.0.0"}\n' > "$tmp_trust_target/package.json"
printf 'export const trusted = true;\n' > "$tmp_trust_target/src/app.js"
git -C "$tmp_trust_target" init >/dev/null
git -C "$tmp_trust_target" config user.email codex-workflows@example.invalid
git -C "$tmp_trust_target" config user.name codex-workflows
git -C "$tmp_trust_target" add .
git -C "$tmp_trust_target" commit -m baseline >/dev/null
printf 'export const trusted = false;\n' > "$tmp_trust_target/src/app.js"
node dist/cli.js dynamic save workflows/dynamic/change-summary.workflow.js --id "$trusted_id" >/tmp/cwf-dynamic-save.txt
grep -q "Saved dynamic workflow: $trusted_id" /tmp/cwf-dynamic-save.txt
node dist/cli.js dynamic run "$trusted_id" --target "$tmp_trust_target" --approve >/tmp/cwf-dynamic-saved-run.txt
trusted_run=$(sed -n 's/^Run ID: //p' /tmp/cwf-dynamic-saved-run.txt)
test -n "$trusted_run"
grep -q "Status: completed" /tmp/cwf-dynamic-saved-run.txt
printf '\n// tampered\n' >> "$HOME/.codex-workflows/dynamic/$trusted_id.workflow.js"
if node dist/cli.js dynamic run "$trusted_id" --target "$tmp_trust_target" --approve >/tmp/cwf-dynamic-tampered.txt 2>&1; then
  echo "Expected tampered trusted dynamic workflow to fail, but it passed." >&2
  cat /tmp/cwf-dynamic-tampered.txt >&2
  exit 1
fi
grep -q "SHA mismatch" /tmp/cwf-dynamic-tampered.txt
rm -rf "$tmp_trust_target" "$HOME/.codex-workflows/runs/$trusted_run" "$HOME/.codex-workflows/dynamic/$trusted_id.workflow.js" "$HOME/.codex-workflows/dynamic/$trusted_id.trust.json" /tmp/cwf-dynamic-save.txt /tmp/cwf-dynamic-saved-run.txt /tmp/cwf-dynamic-tampered.txt

echo "==> dynamic safePatch execution smoke"
tmp_safe_patch_target=$(mktemp -d /tmp/cwf-dynamic-safe-patch-target-XXXXXX)
mkdir -p "$tmp_safe_patch_target/src"
printf '{"name":"safe-patch-smoke","version":"0.0.0"}\n' > "$tmp_safe_patch_target/package.json"
git -C "$tmp_safe_patch_target" init >/dev/null
git -C "$tmp_safe_patch_target" config user.email codex-workflows@example.invalid
git -C "$tmp_safe_patch_target" config user.name codex-workflows
git -C "$tmp_safe_patch_target" add .
git -C "$tmp_safe_patch_target" commit -m baseline >/dev/null
node dist/cli.js dynamic run fixtures/dynamic/safe-patch.workflow.js --target "$tmp_safe_patch_target" --approve >/tmp/cwf-dynamic-safe-patch.txt
safe_patch_run=$(sed -n 's/^Run ID: //p' /tmp/cwf-dynamic-safe-patch.txt)
test -n "$safe_patch_run"
grep -q "Status: completed" /tmp/cwf-dynamic-safe-patch.txt
test -f "$tmp_safe_patch_target/src/generated/value.js"
grep -q "export const value = 42;" "$tmp_safe_patch_target/src/generated/value.js"
grep -q '"status": "passed"' "$HOME/.codex-workflows/runs/$safe_patch_run/artifacts/dynamic-safe-patch.json"
rm -rf "$tmp_safe_patch_target" "$HOME/.codex-workflows/runs/$safe_patch_run" /tmp/cwf-dynamic-safe-patch.txt

echo "==> dynamic safePatch rollback smoke"
tmp_safe_patch_fail_target=$(mktemp -d /tmp/cwf-dynamic-safe-patch-fail-target-XXXXXX)
mkdir -p "$tmp_safe_patch_fail_target/src"
printf '{"name":"safe-patch-fail-smoke","version":"0.0.0"}\n' > "$tmp_safe_patch_fail_target/package.json"
git -C "$tmp_safe_patch_fail_target" init >/dev/null
git -C "$tmp_safe_patch_fail_target" config user.email codex-workflows@example.invalid
git -C "$tmp_safe_patch_fail_target" config user.name codex-workflows
git -C "$tmp_safe_patch_fail_target" add .
git -C "$tmp_safe_patch_fail_target" commit -m baseline >/dev/null
node dist/cli.js dynamic run fixtures/dynamic/safe-patch-verification-fail.workflow.js --target "$tmp_safe_patch_fail_target" >/tmp/cwf-dynamic-safe-patch-fail.txt
safe_patch_fail_run=$(sed -n 's/^Run ID: //p' /tmp/cwf-dynamic-safe-patch-fail.txt)
test -n "$safe_patch_fail_run"
node dist/cli.js approve "$safe_patch_fail_run" approve-dynamic >/tmp/cwf-dynamic-safe-patch-fail-approve.txt
if node dist/cli.js resume "$safe_patch_fail_run" >/tmp/cwf-dynamic-safe-patch-fail-resume.txt 2>&1; then
  echo "Expected dynamic safePatch verification failure to fail resume, but it passed." >&2
  cat /tmp/cwf-dynamic-safe-patch-fail.txt >&2
  exit 1
fi
test ! -f "$tmp_safe_patch_fail_target/src/generated/value.js"
grep -q '"status": "failed"' "$HOME/.codex-workflows/runs/$safe_patch_fail_run/artifacts/dynamic-safe-patch.json"
grep -q '"rollback"' "$HOME/.codex-workflows/runs/$safe_patch_fail_run/artifacts/dynamic-safe-patch.json"
grep -q '"status": "passed"' "$HOME/.codex-workflows/runs/$safe_patch_fail_run/artifacts/dynamic-safe-patch.json"
rm -rf "$tmp_safe_patch_fail_target" "$HOME/.codex-workflows/runs/$safe_patch_fail_run" /tmp/cwf-dynamic-safe-patch-fail.txt /tmp/cwf-dynamic-safe-patch-fail-approve.txt /tmp/cwf-dynamic-safe-patch-fail-resume.txt

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
node dist/cli.js result "$run_id" --json >/tmp/cwf-result-json.txt
grep -q '"schema_version": 1' /tmp/cwf-result-json.txt
grep -q '"result_return_path": "stdout-json"' /tmp/cwf-result-json.txt
grep -q '"result_markdown"' /tmp/cwf-result-json.txt
test -f "$HOME/.codex-workflows/runs/$run_id/artifacts/github-pr-comment.md"
test -f "$HOME/.codex-workflows/runs/$run_id/artifacts/github-pr-review.json"
rm -rf "$tmp_target" "$HOME/.codex-workflows/runs/$run_id" /tmp/cwf-result-json.txt

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
