---
half_life: 30d
archive_at: 2026-07-04
---

# v1.7 Worker App Threads Plan

Status: implemented in code with fake app-server tests and a live Desktop smoke recorded on 2026-06-04. Live Desktop acceptance requires local app-server availability and worker JSON records with real `thread_id` / `turn_id` values.

## Capability Sentence

This phase helps Codex users inspect workflow worker execution in Codex Desktop by adding an optional `codex-app-thread` worker adapter, while keeping final results in the initiating conversation and preserving CLI fallback.

## Plain-Language Result

Today, CWF can run workers and save their outputs, but those workers usually do not appear as separate Codex Desktop threads.

After v1.7:

- a workflow can request Desktop-visible worker execution;
- each selected worker can become a real Codex thread;
- CWF still saves the same worker JSON and reducer output;
- the final result still comes back to the Codex conversation that started the workflow;
- if Desktop/app-server is unavailable, CLI workflows still work.

Worker threads are non-ephemeral inspection surfaces in Codex Desktop. They are intentionally visible after the run; cleanup is a user or host concern until Codex exposes a safe lifecycle API for this use case.

Visibility is host-scoped. A worker thread can be successfully created and listed by app-server with a real `thread_id`, name, cwd, and session file, while a particular Codex Desktop left sidebar may still filter it out by host source, workspace, cwd, or current account view. For live proof, record both the worker JSON ids and an app-server `thread/list` confirmation for the worker name or short run id.

This is not a managed-agent platform. It is the smallest useful bridge between CWF workers and Codex's native thread surface.

## PRD

### Problem

Codex Flow has durable run folders, status output, and worker evidence. That is enough for CLI reliability, but not enough for a native Codex Desktop experience. Users want to see what each worker did without digging through JSON files.

At the same time, the final answer should not disappear into a newly created side thread when the user started the workflow from an existing Codex conversation.

### Target Users

- Codex Desktop users running CWF from an active conversation.
- CLI users who may optionally inspect worker threads when app-server is available.
- Future skill authors who need a clear worker-thread contract without inventing their own scheduler.

### Goals

- Add live `codex-app-thread` worker execution.
- Create one Codex app-server thread per worker when selected.
- Preserve existing worker JSON and reducer contracts.
- Record thread/turn metadata for every app-thread worker.
- Keep same-conversation final result return as primary for skill-launched workflows.
- Keep `--new-thread` explicit for separate coordinator/result threads.
- Keep CLI-only operation reliable without app-server.
- Make fallback behavior explicit and visible.

### Non-Goals

- No managed-agent platform scheduler.
- No remote queue or daemon.
- No marketplace or registry.
- No recursive worker fan-out.
- No write-capable app-thread workers.
- No implicit current-thread detection.
- No non-Codex model routing.
- No exact Claude Managed Agents parity.

## SPEC

### Runtime Opt-In

Workflow specs may request the adapter:

```yaml
runtime:
  preferred_worker_adapter: codex-app-thread
  fallback_worker_adapter: codex-sdk-headless
```

If `fallback_worker_adapter` is omitted and app-server execution is unavailable, the worker fails explicitly.

### App-Thread Worker Flow

For each worker:

1. Probe Codex app-server availability and required methods.
2. Start a thread with `thread/start`.
3. Set a readable name with `thread/name/set`.
4. Start a worker turn with `turn/start`.
5. Read or receive the worker result from the app-server path.
6. Normalize the result into `workers/<worker-id>.json`.
7. Include app-thread metadata in reducer provenance.

Readable thread name format should include:

- `CWF`
- workflow id
- short run id
- worker id or role

Example:

```text
CWF diff-review correctness run_ab12
```

### Worker Metadata

Each worker JSON must preserve:

```json
{
  "runtime": {
    "adapter": "codex-app-thread",
    "requested_adapter": "codex-app-thread",
    "fallback_adapter": "codex-sdk-headless",
    "fallback_used": false,
    "fallback_reason": null,
    "parent_thread_id": null,
    "coordinator_thread_id": null,
    "thread_id": "thr_worker",
    "turn_id": "turn_worker",
    "agent_role": "correctness",
    "agent_nickname": "correctness",
    "transcript_read": true,
    "sandbox": "read-only",
    "approval_policy": "never",
    "result_return_path": "worker-envelope"
  }
}
```

If the host provides an initiating thread id, record it as `parent_thread_id`. If it does not, leave it null. Do not infer it.

### Result Return

Final result priority:

1. Skill wrapper returns the result to the active Codex conversation.
2. Explicit `--thread <thread-id>` posts to a known thread.
3. Explicit `--new-thread` creates a separate coordinator/result thread.
4. CLI artifacts remain the fallback.

Worker threads do not replace the final-result path.

### Failure And Fallback

If app-server is unavailable:

- with fallback configured: use fallback, record `fallback_used: true`, keep status readable;
- without fallback: fail with `WorkerAdapterUnavailableError`;
- never silently downgrade without metadata.

If app-server starts the worker but result reading fails:

- preserve the best available response if any;
- set `transcript_read: false`;
- keep app-server ids and artifact paths visible;
- fail clearly if no reliable worker output exists.

If app-server thread APIs exist but turn execution cannot produce an assistant response:

- status/fallback reason must use `app-thread-execution-unavailable` and say plainly that thread APIs are available, but the model execution channel did not return a readable assistant response;
- treat `codex-app-thread` as execution-unavailable, not merely slow;
- run the configured fallback worker adapter before creating real worker threads;
- keep probe thread/turn ids in the fallback reason for diagnosis;
- continue to distinguish `created/listed` evidence from `executed/responded` evidence.

If the probe cannot complete setup before a turn exists, keep that separate as `app-thread-probe-setup-failed`; do not label initialize, thread creation, naming, transport timeout, or app-server setup failures as model-channel execution failures.

Timeout tuning:

- `options.timeoutMs` is the overall worker deadline; app-thread setup, turn start, and result reading must not exceed it cumulatively.
- `CWF_APP_THREAD_WORKER_REQUEST_TIMEOUT_MS` caps individual app-server setup/start requests within that overall deadline.
- `CWF_APP_THREAD_RESULT_TIMEOUT_MS` caps worker result polling within the remaining overall deadline.
- `CWF_APP_THREAD_CLOSE_TIMEOUT_MS` caps best-effort transport close; close failures must not hide an already collected worker result.
- Invalid timeout env values fall back to defaults instead of producing `NaN` or immediate accidental timeouts.

### Safety Invariants

- `thread/list` must never choose the initiating/current conversation.
- App-thread workers are read-only in v1.7.
- Write-capable phases continue to use existing gates and SDK workspace-write behavior.
- Reducers must be adapter-independent.
- CLI lifecycle must not depend on Codex Desktop.
- All native-thread claims must be backed by recorded `thread_id` and `turn_id`.

## Acceptance Criteria

- [ ] Same-conversation final result remains primary.
  - Test: docs/source audit shows `--new-thread` is explicit and not the default Codex-launched return path.

- [ ] One worker can run through a fake app-server.
  - Test: fake app-server integration covers `thread/start`, `thread/name/set`, `turn/start`, result read, and worker envelope normalization.

- [ ] Runtime metadata is complete.
  - Test: worker JSON contains adapter, requested adapter, fallback fields, parent/coordinator ids when known, worker `thread_id`, worker `turn_id`, transcript-read status, sandbox, approval policy, and result-return path.

- [ ] Reducer output is adapter-independent.
  - Test: mixed SDK/app-thread reducer fixture passes and preserves runtime metadata in provenance.

- [ ] Fallback is explicit.
  - Test: unavailable app-thread with configured fallback records `fallback_used: true`; unavailable app-thread without fallback fails with `WorkerAdapterUnavailableError`.

- [ ] CLI-only use still works.
  - Test: `npm run check`, `bash scripts/smoke-cli.sh`, and normal CLI `diff-review` smoke pass without app-server.

- [ ] No current-thread guessing exists.
  - Test: source audit and unit tests prove `thread/list` is not used to select a parent/current thread.

- [ ] Live Desktop worker threads are proven when app-server is available.
  - Manual evidence: live `diff-review` smoke records one worker `thread_id` and one worker `turn_id` per worker.

## Verification Commands

```bash
git diff --check
npm run check
bash scripts/smoke-cli.sh
npx vitest run tests/worker-adapter.test.ts
npx vitest run tests/desktop-bridge.test.ts
npx vitest run tests/diff-review-reducer.test.ts
```

Live app-server smoke when available:

```bash
cwf desktop check
cwf run fixtures/workflows/app-thread-diff-review.yaml --target <fixture> --background
cwf status <run-id>
cwf result <run-id>
```

The implementation may add a specific fixture workflow or runtime flag for app-thread smoke. If so, update this file and the matching archived phase prompt under `docs/goal-prompts/`. Root `GOAL_PROMPT.md` should remain the current or next goal-mode entrypoint.

## Stop Conditions

Stop and ask for direction if:

- app-server lacks required thread/turn methods;
- worker result retrieval is not deterministic;
- v1.7 cannot be completed without a custom scheduler;
- write-capable app-thread workers become necessary;
- no-current-thread guessing becomes tempting;
- live app-server smoke is unavailable after three repeated attempts with the same blocker.

## Deferred

Managed-agents-style scheduling is deferred.

Start a separate v1.8 design plan only after v1.7 proves:

- worker threads are visible;
- worker output returns to the reducer;
- final result returns to the initiating conversation;
- fallback is safe for CLI-only users;
- native Codex thread/subagent reuse still leaves a concrete unsolved scheduling problem.
