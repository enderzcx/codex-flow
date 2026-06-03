---
half_life: 7d
archive_at: 2026-06-09
---

# Acceptance Criteria

## Scope

Accept only a public Codex-native MVP. Private adapters are out of scope.

## Must Pass

- [ ] Repository/folder contains no third-party model routing or private adapter dependency.
  - Evidence: implementation files contain no dependency on non-Codex model routers, private local keys, or Ender-only tools.

- [ ] CLI exists and prints help.
  - Evidence: `cwf --help`

- [ ] Workflow validation works before workers start.
  - Evidence: `cwf validate workflows/diff-review.yaml` prints workflow id, phases, worker ids, and `No Codex workers were started.`

- [ ] `diff-review` workflow runs on a git repo and returns a run id.
  - Evidence: `cwf run workflows/diff-review.yaml --target <fixture-or-real-repo>`

- [ ] `diff-review` can start in background mode and return a run id immediately.
  - Evidence: `cwf run workflows/diff-review.yaml --target <fixture-or-real-repo> --background`, then `cwf status <run-id>` while or after it runs.

- [ ] Status command explains the run in human terms.
  - Evidence: `cwf status <run-id>` includes `Now:`, phase durations, worker progress, fallback count, artifact paths, and result/log paths.

- [ ] Watch command live-refreshes run status.
  - Evidence: `cwf watch <run-id> --once` prints the status frame, and `cwf watch <run-id>` exits automatically for completed/failed/cancelled runs.

- [ ] Run discovery commands find existing runs without manual folder lookup.
  - Evidence: `cwf list --limit 5`, `cwf list --status <status>`, `cwf list --target <repo>`, `cwf latest --target <repo>`, and `cwf show <run-id>`.

- [ ] Discovery index is rebuildable.
  - Evidence: tests cover missing, stale, and corrupt `~/.codex-workflows/index.json` rebuilding from `~/.codex-workflows/runs/*/state.json`.

- [ ] Result command prints a final review and points to saved artifacts.
  - Evidence: `cwf result <run-id>` prints final review and `~/.codex-workflows/runs/<run-id>/result.md` exists.

- [ ] Worker outputs are persisted.
  - Evidence: `~/.codex-workflows/runs/<run-id>/workers/*.json` exists and includes prompt, output, status, and timing.

- [ ] Run events are persisted as JSONL.
  - Evidence: `~/.codex-workflows/runs/<run-id>/events.jsonl` exists and has phase/worker events.

- [ ] Background runs persist a log file.
  - Evidence: `~/.codex-workflows/runs/<run-id>/run.log` exists for a background run.

- [ ] Default `diff-review` does not modify the target repo.
  - Evidence: `git diff --exit-code` in the target repo is unchanged before/after the run, unless the target repo was dirty before the run.

- [ ] Reducer de-duplicates findings.
  - Evidence: fixture with duplicate worker findings produces one merged finding.

- [ ] Unsupported findings can be marked or dropped.
  - Evidence: fixture with weak findings produces a lower-ranked or removed finding.

- [ ] The project clearly explains how it differs from Claude Dynamic Workflows.
  - Evidence: `docs/claude-vs-codex-workflows.md` includes effect, components, and principle differences.

## Should Pass

- [ ] `cwf cancel <run-id>` stops pending workers.
- [ ] `cwf status <run-id>` shows token usage when Codex SDK exposes it.
- [ ] Workflow spec validation fails fast on invalid YAML/JSON.
- [ ] Error output includes the failed phase and worker id.
- [ ] Failed runs include default failure policy metadata and a human-readable failure summary.

## Explicit Non-Goals For MVP

- Native Codex Desktop task panel.
- Codex app-server Desktop handoff. This is planned for a later guarded integration.
- Auto-trigger from the word `workflow`.
- Generated JavaScript workflow scripts.
- Non-Codex model adapters.
- Automatic code modification workflows.
- Workflow registry.
- Publishing to npm.

## Stop Conditions

Stop implementation and report instead of expanding scope if any of these happen:

- Codex SDK cannot be invoked locally after a minimal connectivity check.
- `diff-review` requires target repo mutation to work.
- The runner needs a new backend service.
- The implementation starts depending on private local files or keys.
- More than one workflow is being implemented before `diff-review` passes smoke.
