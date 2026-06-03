# Codex Flow MVP Spec

## CLI

```bash
cwf --help
cwf validate <workflow-id-or-path>
cwf dry-run <workflow-id-or-path>
cwf workflows list
cwf workflows show <workflow-id-or-path>
cwf workflows validate [workflow-id-or-path]
cwf run <workflow-id-or-path> --target <repo> [--background]
cwf status <run-id>
cwf watch <run-id> [--interval <ms>] [--once]
cwf list [--limit <n>] [--status <status>] [--target <repo>]
cwf latest [--target <repo>]
cwf show <run-id>
cwf approve <run-id> <gate-id>
cwf reject <run-id> <gate-id> [--reason <text>]
cwf resume <run-id>
cwf result <run-id>
cwf cancel <run-id>
```

`validate` and `dry-run` are aliases. They load and validate the workflow spec by id or path, then print the workflow id, version, phase order, worker ids, and a confirmation that no Codex workers were started.

## Workflow Registry

Workflow discovery searches local files in this order:

```text
./.codex-flow/workflows/
./workflows/
~/.codex-flow/workflows/
```

Only `.yaml` and `.yml` files in those directories are considered. Duplicate workflow ids fail validation and resolution with a message listing every conflicting path.

Registry commands:

- `cwf workflows list` prints workflow id, version, title, and path.
- `cwf workflows show <workflow-id-or-path>` prints metadata, capabilities, inputs, and path.
- `cwf workflows validate [workflow-id-or-path]` validates either one workflow or the full local registry.
- `cwf run <workflow-id-or-path> --target <repo>` accepts either a discovered workflow id or a direct file path.

## Workflow

MVP supports one workflow:

```text
workflows/diff-review.yaml
```

Required phases:

1. `collect`
2. `review`
3. `reduce`

Workflow metadata:

```yaml
id: diff-review
version: 0.6.0
title: Diff Review
description: Review a git diff with independent Codex worker perspectives.
tags:
  - review
  - read-only
capabilities:
  writes: false
inputs:
  target:
    type: path
    required: true
```

Required metadata fields:

- `title`
- `tags`
- `capabilities.writes`
- `inputs.<name>.type`
- `inputs.<name>.required`

## Run Store

Each run writes:

```text
~/.codex-workflows/index.json
~/.codex-workflows/runs/<run-id>/
  workflow.json
  state.json
  events.jsonl
  context.json
  run.log
  workers/
    correctness.json
    tests.json
    safety.json
  artifacts/
    reduced-result.json
    manifest.json
  result.md
```

`index.json` is a rebuildable discovery cache, not the source of truth. `cwf list`, `cwf latest`, and `cwf show` verify freshness before use. If the index is missing, stale, or corrupt, they rebuild it from `~/.codex-workflows/runs/*/state.json`.

Index entries contain:

- `id`
- `workflow`
- `status`
- `target`
- `run_dir`
- `created_at`
- `updated_at`
- optional `result_path`
- optional `artifact_manifest_path`
- optional `log_path`
- optional `error`
- optional `failure_summary`

## State Contract

`state.json` contains:

- `id`
- `workflow`
- `status`
- `target`
- `run_dir`
- `failure_policy`
- `phases`
- `workers`
- `gate_decisions`
- `created_at`
- `updated_at`
- optional `result_path`
- optional `artifact_manifest_path`
- optional `log_path`
- optional `background_pid`
- optional `error`
- optional `failure_summary`

Default `failure_policy`:

```json
{
  "worker_failure": "continue_if_any_worker_succeeds",
  "all_workers_failed": "fail_run",
  "target_diff_changed": "fail_run",
  "unhandled_error": "fail_run"
}
```

`failure_summary` contains a readable title, detail, failed phase when known, failed workers, and a next-step hint.

Statuses:

- `pending`
- `running`
- `waiting`
- `approved`
- `rejected`
- `completed`
- `failed`
- `cancelled`

Gate decisions:

```json
{
  "gate_id": "approve-review",
  "decision": "approved",
  "decided_at": "ISO"
}
```

Rejected decisions may include `reason`.

## Status Output Contract

`cwf status <run-id>` is the human-facing summary for a run. It must include:

- run id
- workflow id
- run status
- plain-language current work
- target path
- failure policy summary
- failure summary for failed runs
- waiting/approved/rejected gate summary when present
- approve/reject/resume commands when a gate needs user action
- completed worker count
- raw fallback count
- active phase when a phase is running
- phase status and duration when timestamps exist
- worker status, duration, raw fallback marker, finding count, and artifact count when available
- artifact paths for `state.json`, `events.jsonl`, `workers/*.json`, `result.md`, `artifacts/manifest.json`, and `run.log`
- PID for active background runs

If `result.md` is not ready, status prints `Result: not ready yet`.

`cwf result <run-id>` must print a useful error when the report is missing and point users back to `cwf status <run-id>`.

## Discovery Output Contract

`cwf list [--limit <n>] [--status <status>] [--target <repo>]` prints recent runs, newest first. Default limit is 20. `--target` resolves the path before filtering.

`cwf latest [--target <repo>]` prints the newest run detail, using the same format as `cwf show`.

`cwf show <run-id>` prints status-style run detail plus discovery commands that help users list similar runs or open the latest run for that target.

## Gate And Resume Contract

Gate phase shape:

```yaml
- id: approve-write
  kind: gate
  prompt: Review the planned file changes before Codex writes.
  requires_approval: true
```

Write-capable phases and workers declare `writes: true`. Validation fails if any phase or worker has `writes: true` before a prior gate phase. Read-only `diff-review` does not require gates.

Execution rules:

- A pending gate changes the run to `waiting` and stops execution.
- `cwf approve <run-id> <gate-id>` changes the gate to `approved` and records a `gate.approved` event.
- `cwf reject <run-id> <gate-id> [--reason <text>]` changes the run to `rejected`, records the reason, and records a `gate.rejected` event.
- `cwf resume <run-id>` continues only phases that are still pending after an approved gate.
- Completed phases do not rerun on resume.
- Rejected runs cannot resume.
- Gate decisions are persisted in `state.json` under `gate_decisions` and in `events.jsonl`.

## Watch Output Contract

`cwf watch <run-id>` is the stable public live progress view. It must:

- render the same information as `cwf status <run-id>`
- refresh until the run reaches `completed`, `failed`, `cancelled`, or `rejected`
- exit automatically for terminal statuses
- support `--interval <ms>` with a minimum effective interval
- support `--once` for one non-clearing snapshot

## Worker Contract

Worker result envelope persisted at `workers/<worker-id>.json`:

```json
{
  "worker_id": "correctness",
  "status": "completed",
  "confidence": "high",
  "summary": "short summary",
  "findings": [
    {
      "severity": "high",
      "title": "short title",
      "evidence": "file or diff evidence",
      "reason": "why it matters",
      "suggested_fix": "specific next action"
    }
  ],
  "verification": ["command or manual check"],
  "artifacts": [],
  "started_at": "ISO",
  "completed_at": "ISO",
  "duration_ms": 1000,
  "prompt": "worker prompt",
  "raw": "raw Codex output",
  "raw_fallback": false,
  "retry_count": 0,
  "error": null,
  "usage": null
}
```

If structured output fails, the worker result is normalized with `raw_fallback: true`, a low-confidence summary, empty findings, and a `fallback_reason`. If the worker process fails, status is `failed` and the error remains visible in state, events, status, show, and reducer provenance.

## Worker Perspectives

`correctness`:

- behavior regressions
- broken assumptions
- edge cases
- missing error handling

`tests`:

- missing tests
- weak assertions
- fixture gaps
- verification commands

`safety`:

- security
- permissions
- data loss
- rollback gaps
- unexpected writes

## Reducer Contract

The reducer must:

- merge duplicate findings
- preserve strongest evidence
- rank by severity
- drop low-confidence unsupported claims
- keep contributing worker ids
- keep worker provenance for all workers, including failed and raw-fallback workers
- mark partial worker failure or raw fallback as degraded evidence unless stronger supported findings require `fail`
- render final Markdown

Reduced result envelope persisted at `artifacts/reduced-result.json`:

```json
{
  "verdict": "pass|review|fail|degraded",
  "summary": "string",
  "findings": [],
  "verification_gaps": [],
  "next_actions": [],
  "worker_provenance": [],
  "artifacts": []
}
```

Final sections:

- Verdict
- Findings
- Verification Gaps
- Suggested Next Actions
- Worker Summary
- Artifacts

## Artifact Manifest Contract

Completed runs write:

```text
~/.codex-workflows/runs/<run-id>/artifacts/manifest.json
```

The manifest contains:

- `version`
- `run_id`
- `workflow`
- `generated_at`
- `artifacts`

Artifact entries contain `id`, `type`, `path`, and `description`. The default `diff-review` manifest includes workflow, state, events, context, every worker envelope, reduced result, final Markdown result, and the manifest itself. Background runs also include `run.log`.

## Background Mode

`--background` behavior:

1. Parent creates run store.
2. Parent spawns a detached child process with hidden `cwf __run`.
3. Parent records `background_pid` and `run.log`.
4. Parent returns run id immediately.
5. Child continues writing `state.json`, `events.jsonl`, worker outputs, `artifacts/reduced-result.json`, `artifacts/manifest.json`, and `result.md`.

## Cancellation

`cwf cancel <run-id>`:

- sends `SIGTERM` to `background_pid` when the run is active
- marks pending/running phases and workers as `cancelled`
- ignores completed/failed/cancelled runs

## Planned App-Server Handoff

The Codex Desktop/app-server protocol exposes experimental thread operations such as `thread/start`, `thread/list`, `thread/started`, and status-change notifications. Future `cwf` versions may use this to create Desktop-visible follow-up threads from a completed workflow run.

Planned contract:

- app-server integration is optional and guarded by an explicit flag or command
- normal `diff-review` must still work without Codex Desktop running
- created thread ids are recorded in the run folder
- failures fall back to a local prompt/session handoff instead of failing the workflow result
- experimental protocol behavior is documented and tested separately from core run-store behavior

## Safety Invariants

- Default worker sandbox is read-only.
- The target repo's tracked diff hash is checked before and after worker review.
- If the diff changes during review, the run fails.
- If one or more Codex workers fail but at least one succeeds, the review continues and worker failures remain visible in state, events, status, show output, reducer provenance, and the final report.
- If a worker uses raw fallback, the reducer marks the evidence as degraded and records the fallback reason.
- If all Codex workers fail, the run fails with a failure summary that points users at Codex SDK connectivity and worker logs.
- Workflow ids discovered in local search paths must be unique.
- Write-capable phases or workers must be preceded by a gate.
- Gates only pause and resume workflow phases; this release does not ship a production write-capable workflow.
- Public MVP has no private adapters or third-party model routing.

## Known Limitations

- Untracked file contents are not included in the review.
- Background runs are process-based, not daemon-backed.
- No retry/rate-limit manager yet.
- No workflow plugin system yet.
- Run discovery is a local index only.
- Workflow registry is local filesystem discovery only; no remote marketplace.
- No stable Codex Desktop app-server handoff yet.
