---
name: codex-workflows
description: Run public Codex-native workflow specs for repeatable multi-worker engineering tasks.
when_to_use: "run a workflow, audit a diff, review a branch with multiple perspectives, coordinate Codex workers, repeatable repo audit, compare Codex workflow behavior to Claude Dynamic Workflows"
metadata:
  version: "0.6.0"
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

## Current Workflow

Only `diff-review` is in scope for the MVP.

```bash
cwf validate workflows/diff-review.yaml
cwf workflows list
cwf workflows show diff-review
cwf workflows validate
cwf run diff-review --target <repo>
cwf run workflows/diff-review.yaml --target <repo>
cwf run workflows/diff-review.yaml --target <repo> --background
cwf status <run-id>
cwf watch <run-id>
cwf latest --target <repo>
cwf list --limit 5
cwf show <run-id>
cwf approve <run-id> <gate-id>
cwf reject <run-id> <gate-id> --reason <text>
cwf resume <run-id>
cwf result <run-id>
cwf cancel <run-id>
```

`diff-review` is read-only by default. It reviews a target git diff from independent Codex worker perspectives and reduces the findings into a stable reduced JSON envelope plus one saved Markdown result.

Prefer `cwf run diff-review --target <repo>` when the local workflow registry can resolve it. Direct path usage remains supported with `cwf run workflows/diff-review.yaml --target <repo>`.

Use `--background` for large diffs. The command returns a run id immediately, while the child process writes status, events, worker outputs, and `run.log` under `~/.codex-workflows/runs/<run-id>/`.

`cwf status <run-id>` is the first thing to read during a long run. Start with the `Now:` line, then check worker progress, fallback count, and artifact paths. If `Result: not ready yet`, keep polling status instead of reading raw state first.

Completed runs include `artifacts/reduced-result.json` and `artifacts/manifest.json`. Use the reduced result when a machine-readable verdict, worker provenance, verification gaps, or degraded status matters. Use the manifest to reconstruct the run evidence.

If the run id is unknown, use `cwf latest --target <repo>` or `cwf list`. Discovery uses `~/.codex-workflows/index.json`, and the CLI rebuilds it from run folders when the index is missing, stale, or corrupt.

If status is `waiting`, read the printed gate line and use `cwf approve` or `cwf reject`. After approval, use `cwf resume`; do not manually edit state. Completed phases are skipped on resume and gate decisions are saved in `state.json` plus `events.jsonl`.

For failed runs, read the failure summary in `cwf status` or `cwf show` before opening raw JSON. It names the failed phase, failed workers when known, the default failure policy, and the next artifact or connectivity check.

## Required Closeout

Before claiming completion, verify against:

- `/Users/sunny/Work/CODEX/codex-workflows/IMPLEMENTATION_PLAN.md`
- `/Users/sunny/Work/CODEX/codex-workflows/ACCEPTANCE.md`

Report in plain language what the workflow did, then include the exact commands run, what passed, what failed, whether fallback occurred, whether the verdict degraded, and where the final report plus manifest live.
