---
half_life: 7d
archive_at: 2026-06-09
---

# Acceptance Criteria

## Scope

Accept only a public Codex-native v1.0 core. Private adapters are out of scope.

## Must Pass

- [ ] Repository/folder contains no third-party model routing or private adapter dependency.
  - Evidence: implementation files contain no dependency on non-Codex model routers, private local keys, or Ender-only tools.

- [ ] CLI exists and prints help.
  - Evidence: `cwf --help`

- [ ] Workflow validation works before workers start.
  - Evidence: `cwf validate workflows/diff-review.yaml` prints workflow id, phases, worker ids, and `No Codex workers were started.`

- [ ] Workflow registry discovery works.
  - Evidence: `cwf workflows list`, `cwf workflows show diff-review`, `cwf workflows show repo-audit`, and `cwf workflows validate`.

- [ ] Workflows can run by id or direct path.
  - Evidence: `cwf run diff-review --target <fixture-or-real-repo>` and `cwf run workflows/diff-review.yaml --target <fixture-or-real-repo>`.

- [ ] Bundled workflows are discoverable and capability-scoped.
  - Evidence: `cwf workflows list` includes `repo-audit`, `implementation-plan`, `research-crosscheck`, `release-review`, and `doc-refresh`; review specs have `capabilities.writes: false`, while `doc-refresh` has `capabilities.writes: true` plus a gate before writes.

- [ ] Workflow catalog explains when to use and when not to use each bundled workflow.
  - Evidence: `docs/workflow-catalog.md` includes entries for all bundled workflows.

- [ ] Duplicate workflow ids fail clearly.
  - Evidence: tests create duplicate ids in registry search paths and assert the conflicting paths are reported.

- [ ] Workflow metadata is required and visible.
  - Evidence: schema tests cover `title`, `tags`, `inputs`, `capabilities`, and `cwf workflows show diff-review` prints them.

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

- [ ] Gate phase pauses workflow execution.
  - Evidence: `cwf run fixtures/workflows/gated-diff-review.yaml --target <repo>` reaches `Status: waiting` and prints approve/reject commands.

- [ ] Approved gates can resume without rerunning completed phases.
  - Evidence: `cwf approve <run-id> <gate-id>`, then `cwf resume <run-id>` completes and `events.jsonl` contains one `collect.context` event.

- [ ] Rejected gates stop cleanly.
  - Evidence: `cwf reject <run-id> <gate-id> --reason <text>` changes status to `rejected`, records `gate.rejected`, and `cwf resume <run-id>` fails.

- [ ] Write-capable workflow specs require a prior gate.
  - Evidence: `cwf validate fixtures/workflows/write-without-gate.yaml` fails with a `writes:true` gate error.

- [ ] Gated write-capable documentation workflow has preview, approval, rollback, and verification evidence.
  - Evidence: `doc-refresh` fixture tests cover preview artifacts, approve/resume writing scoped docs, reject writing nothing, worker sandbox metadata, diff summary, rollback, verification, and manifest entries.

- [ ] Result command prints a final review and points to saved artifacts.
  - Evidence: `cwf result <run-id>` prints final review and `~/.codex-workflows/runs/<run-id>/result.md` exists.

- [ ] Worker outputs are persisted.
  - Evidence: `~/.codex-workflows/runs/<run-id>/workers/*.json` exists and includes prompt, raw output, status, confidence, summary, findings, verification, artifacts, retry/fallback metadata, and timing.

- [ ] Reduced output is persisted as a stable envelope.
  - Evidence: `~/.codex-workflows/runs/<run-id>/artifacts/reduced-result.json` exists and includes verdict, summary, findings, verification gaps, next actions, worker provenance, and artifacts.

- [ ] Artifact manifest reconstructs the run evidence.
  - Evidence: `~/.codex-workflows/runs/<run-id>/artifacts/manifest.json` exists and includes workflow, state, events, context, worker outputs, reduced result, final result, and manifest entries.

- [ ] Partial worker failure and malformed output are visible.
  - Evidence: fixtures cover a failed worker continuing as degraded evidence and raw fallback appearing in status/result.

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

- [ ] Example workflows preserve the shared worker/reducer evidence contract.
  - Evidence: fixture tests and smokes confirm reduced results include worker provenance, verification gaps, and artifact references.

- [ ] Release notes are prepared.
  - Evidence: `RELEASE_NOTES.md` describes stable surface, public boundary, verification, and known limits.

- [ ] Release CI and local CLI smoke protect documented commands.
  - Evidence: `.github/workflows/ci.yml` runs build/test/pack/smoke, and `bash scripts/smoke-cli.sh` passes without live Codex worker calls.

- [ ] Desktop result handoff is explicit and fallback-safe.
  - Evidence: `cwf desktop check`, `cwf desktop result <run-id> --print`, handoff artifacts, app-server fallback metadata, and tests proving no current-thread guessing.

- [ ] GitHub PR artifacts are generated locally and posting is explicit.
  - Evidence: `cwf github-pr <run-id> --format comment`, `cwf github-pr <run-id> --format review`, mocked `gh` post success/failure tests, and source audit showing no auto-post path.

## Should Pass

- [ ] `cwf cancel <run-id>` stops pending workers.
- [ ] `cwf status <run-id>` shows token usage when Codex SDK exposes it.
- [ ] Workflow spec validation fails fast on invalid YAML/JSON.
- [ ] Error output includes the failed phase and worker id.
- [ ] Failed runs include default failure policy metadata and a human-readable failure summary.
- [ ] Degraded reducer results preserve worker provenance and raw fallback details.

## Explicit Non-Goals For v1.0

- Native Codex Desktop task panel.
- Codex app-server Desktop handoff. This is planned for a later guarded integration.
- Auto-trigger from the word `workflow`.
- Generated JavaScript workflow scripts.
- Non-Codex model adapters.
- Ungated automatic code modification workflows.
- Remote workflow marketplace.
- Broad production write-capable workflow beyond gated documentation refresh.
- Automatic GitHub posting.
- Publishing to npm from this task.

## Stop Conditions

Stop implementation and report instead of expanding scope if any of these happen:

- Codex SDK cannot be invoked locally after a minimal connectivity check.
- `diff-review` requires target repo mutation to work.
- The runner needs a new backend service.
- The implementation starts depending on private local files or keys.
- More workflows are being implemented before `diff-review` and the shared contracts pass smoke.
