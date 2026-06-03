# Codex Flow MVP Spec

## CLI

```bash
cwf --help
cwf validate <workflow.yaml>
cwf dry-run <workflow.yaml>
cwf run <workflow.yaml> --target <repo> [--background]
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

`validate` and `dry-run` are aliases. They load and validate the workflow spec, then print the workflow id, version, phase order, worker ids, and a confirmation that no Codex workers were started.

## Workflow

MVP supports one workflow:

```text
workflows/diff-review.yaml
```

Required phases:

1. `collect`
2. `review`
3. `reduce`

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
- worker status, duration, fallback marker, and finding count when available
- artifact paths for `state.json`, `events.jsonl`, `workers/*.json`, `result.md`, and `run.log`
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

Worker output:

```json
{
  "worker_id": "correctness",
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
  "confidence": "high"
}
```

If structured output fails, the worker result may be marked `raw_fallback`.

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
- render final Markdown

Final sections:

- Verdict
- Findings
- Verification Gaps
- Suggested Next Actions
- Worker Summary
- Artifacts

## Background Mode

`--background` behavior:

1. Parent creates run store.
2. Parent spawns a detached child process with hidden `cwf __run`.
3. Parent records `background_pid` and `run.log`.
4. Parent returns run id immediately.
5. Child continues writing `state.json`, `events.jsonl`, worker outputs, and `result.md`.

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
- If one or more Codex workers fail but at least one succeeds, the review continues and worker failures remain visible in state, events, status, and show output.
- If all Codex workers fail, the run fails with a failure summary that points users at Codex SDK connectivity and worker logs.
- Write-capable phases or workers must be preceded by a gate.
- Gates only pause and resume workflow phases; this release does not ship a production write-capable workflow.
- Public MVP has no private adapters or third-party model routing.

## Known Limitations

- Untracked file contents are not included in the review.
- Background runs are process-based, not daemon-backed.
- No retry/rate-limit manager yet.
- No workflow plugin system yet.
- Discovery is a run index only, not a workflow registry.
- No stable Codex Desktop app-server handoff yet.
