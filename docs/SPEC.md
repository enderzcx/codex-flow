# Codex Flow MVP Spec

## CLI

```bash
cwf --help
cwf run <workflow.yaml> --target <repo> [--background]
cwf status <run-id>
cwf result <run-id>
cwf cancel <run-id>
```

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
~/.codex-workflows/runs/<run-id>/
  workflow.json
  state.json
  events.jsonl
  run.log
  workers/
    correctness.json
    tests.json
    safety.json
  result.md
```

## State Contract

`state.json` contains:

- `id`
- `workflow`
- `status`
- `target`
- `run_dir`
- `phases`
- `workers`
- `created_at`
- `updated_at`
- optional `result_path`
- optional `log_path`
- optional `background_pid`
- optional `error`

Statuses:

- `pending`
- `running`
- `completed`
- `failed`
- `cancelled`

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

## Safety Invariants

- Default worker sandbox is read-only.
- The target repo's tracked diff hash is checked before and after worker review.
- If the diff changes during review, the run fails.
- Public MVP has no private adapters or third-party model routing.

## Known Limitations

- Untracked file contents are not included in the review.
- Background runs are process-based, not daemon-backed.
- No retry/rate-limit manager yet.
- No workflow plugin system yet.

