---
name: codex-workflows
description: Run public Codex-native workflow specs and approved local JavaScript dynamic workflows for repeatable multi-worker engineering tasks, including gated documentation refresh, PR-ready artifacts, and safe workflow spec suggestions.
when_to_use: "run a workflow, audit a diff, review a branch with multiple perspectives, coordinate Codex workers, repeatable repo audit, gated documentation refresh, GitHub PR artifact, workflow suggestion, compare Codex workflow behavior to Claude Dynamic Workflows"
metadata:
  version: "1.0.0"
---

# codex-workflows

Use this skill when a task benefits from repeatable phased orchestration rather than a single Codex turn.

## Boundary

This public skill is Codex-native:

- It uses the local `cwf` runner.
- It uses Codex SDK workers.
- It persists run state and artifacts under `~/.codex-workflows/runs/<run-id>/`.
- It does not route to non-Codex models or private adapters.

## Do Not Use For

- Single-file typo fixes.
- Small direct code edits.
- Ordinary test/lint runs.
- Generic project management.
- Model routing or private collaborator delegation.

## Current Workflows

The bundled review workflows are read-only: `diff-review`, `repo-audit`, `implementation-plan`, `research-crosscheck`, and `release-review`. The bundled user-facing write-capable workflow is `doc-refresh`, which is documentation-only and must pause at a gate before writing. v1.10 also supports bounded patch-mode write workflows when a workflow declares `write_policy.mode: patch`, `allowed_paths`, `forbidden_paths`, and optional `verification_commands`. v1.11 supports local dynamic JavaScript workflows through `cwf dynamic run`; these scripts are previewed, approved, AST-gated, and executed in a Node Permission Model child process that can only use parent CWF JSON-RPC APIs.

```bash
cwf validate workflows/diff-review.yaml
cwf workflows list
cwf workflows show diff-review
cwf workflows show repo-audit
cwf workflows show doc-refresh
cwf workflows validate
cwf run diff-review --target <repo>
cwf run repo-audit --target <repo>
cwf run implementation-plan --target <repo>
cwf run research-crosscheck --target <repo>
cwf run release-review --target <repo>
cwf run doc-refresh --target <repo>
cwf run workflows/diff-review.yaml --target <repo>
cwf run workflows/diff-review.yaml --target <repo> --background
cwf dynamic run fixtures/dynamic/read-only.workflow.js --target <repo>
cwf status <run-id>
cwf watch <run-id>
cwf latest --target <repo>
cwf list --limit 5
cwf show <run-id>
cwf approve <run-id> <gate-id>
cwf reject <run-id> <gate-id> --reason <text>
cwf resume <run-id>
cwf result <run-id>
cwf github-pr <run-id> --format comment
cwf github-pr <run-id> --format review
cwf suggest-workflow --goal "<task>" --target <repo>
cwf suggest-workflow --from-run <run-id>
cwf cancel <run-id>
```

Bundled workflows are read-only by default. Review workflows inspect a target git diff from independent Codex worker perspectives and reduce the findings into a stable reduced JSON envelope plus one saved Markdown result. `doc-refresh` is the narrow exception: it creates pre-write artifacts, waits for explicit approval, then runs its writer in an isolated target with the `direct-docs` policy preset. All write workflows extract `artifacts/proposed.patch`, enforce `write_policy`, run `git apply --check --3way`, apply, and then record verification plus rollback artifacts. If workflow verification fails after apply, CWF attempts to reverse-apply the proposed patch before returning a failed run. Dynamic JavaScript workflows are not registry YAML and not unrestricted `node workflow.js`; use them only for local, approved harnesses that stay inside `cwf.git`, `cwf.agent.run`, `cwf.map`, `cwf.artifacts`, and `cwf.report`.

Use `docs/workflow-catalog.md` to choose the workflow. Use `diff-review` for code correctness, `repo-audit` for maintainability and project health, `implementation-plan` for plan quality, `research-crosscheck` for factual/source discipline, `release-review` for ship readiness, and `doc-refresh` only for gated documentation writes.

Prefer `cwf run diff-review --target <repo>` when the local workflow registry can resolve it. Direct path usage remains supported with `cwf run workflows/diff-review.yaml --target <repo>`.

Use `--background` for large diffs. The command returns a run id immediately, while the child process writes status, events, worker outputs, and `run.log` under `~/.codex-workflows/runs/<run-id>/`.

`cwf status <run-id>` is the first thing to read during a long run. Start with the `Now:` line, then check worker progress, fallback count, and artifact paths. If `Result: not ready yet`, keep polling status instead of reading raw state first.

Completed runs include `artifacts/reduced-result.json` and `artifacts/manifest.json`. Use the reduced result when a machine-readable verdict, worker provenance, verification gaps, or degraded status matters. Use the manifest to reconstruct the run evidence.

Use `cwf github-pr <run-id> --format comment|review` to create PR-ready local artifacts. Do not post to GitHub unless the user explicitly asks; posting requires `cwf github-pr <run-id> --post --repo <owner/repo> --pr <number>`.

Use `cwf suggest-workflow --goal "<task>" --target <repo>` to draft a constrained YAML workflow spec. Suggestions are saved under `~/.codex-workflows/suggestions/`, validated immediately, and not installed or run automatically. Report the path and diagnostics; only run a suggestion by explicit path when the user asks.

If the run id is unknown, use `cwf latest --target <repo>` or `cwf list`. Discovery uses `~/.codex-workflows/index.json`, and the CLI rebuilds it from run folders when the index is missing, stale, or corrupt.

If status is `waiting`, read the printed gate line and use `cwf approve` or `cwf reject`. After approval, use `cwf resume`; do not manually edit state. Completed phases are skipped on resume and gate decisions are saved in `state.json` plus `events.jsonl`.

For `doc-refresh`, inspect `artifacts/write-plan.md`, `artifacts/dry-run-preview.md`, `artifacts/verification-plan.md`, and `artifacts/rollback.md` before approving. After resume, report `artifacts/diff-summary.md`, `artifacts/verification.md`, `workers/doc-refresh.json`, and the rollback note.

For patch-mode write workflows, inspect `artifacts/write-plan.md`, `artifacts/dry-run-preview.md`, `artifacts/verification-plan.md`, and `artifacts/rollback.md` before approving. After resume, report `artifacts/proposed.patch`, `artifacts/proposed-patch.md`, `artifacts/diff-summary.md`, `artifacts/verification.md`, `workers/<worker-id>.json`, and whether policy checks, patch apply, and verification commands passed.

For failed runs, read the failure summary in `cwf status` or `cwf show` before opening raw JSON. It names the failed phase, failed workers when known, the default failure policy, and the next artifact or connectivity check.

## Required Closeout

Before claiming completion, verify against:

- `/Users/sunny/Work/CODEX/codex-workflows/IMPLEMENTATION_PLAN.md`
- `/Users/sunny/Work/CODEX/codex-workflows/ACCEPTANCE.md`

Report in plain language what the workflow did, then include the exact commands run, what passed, what failed, whether fallback occurred, whether the verdict degraded, and where the final report plus manifest live.
