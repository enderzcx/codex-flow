---
half_life: 30d
archive_at: 2026-07-04
---

# v1.7 Worker App Threads Plan

## Plain-Language Outcome

When a user starts Codex Flow from an active Codex conversation, the final workflow summary should come back to that same conversation through the skill wrapper.

When the user asks for Desktop-visible worker execution, each workflow worker can also run in its own Codex Desktop thread. The left sidebar then shows real worker threads such as `CWF diff-review correctness`, `CWF diff-review tests`, and `CWF diff-review safety`. Those worker threads are evidence and debugging surfaces; they are not the default final result destination.

`--new-thread` remains explicit. It is for CLI/background runs that do not have an initiating conversation, or when the user intentionally wants a separate coordinator/result thread.

## PRD

### Problem

Codex Flow can now return a completed run to a newly created Codex Desktop thread, but that is not the normal product shape when a user starts the workflow from an existing Codex conversation. The default user expectation is:

- I ask Codex to run a workflow here.
- Codex may create worker threads to do the work.
- The final answer returns here.

At the same time, Desktop-visible worker threads are valuable because they make each worker's context, prompt, transcript, and result inspectable without hiding all work inside a filesystem run folder.

### Goals

- Keep same-conversation result return as the primary UX when CWF is launched by a Codex skill or host thread.
- Add `codex-app-thread` worker execution as an explicit runtime option.
- Create one Codex Desktop thread per worker when `codex-app-thread` is selected and app-server is available.
- Record worker `thread_id`, `turn_id`, adapter, fallback status, sandbox, approval policy, and transcript-read status in worker runtime metadata.
- Normalize app-thread worker output into the same `workers/<worker-id>.json` envelope used by SDK workers.
- Keep reducers adapter-independent.
- Fall back to `codex-sdk-headless` only when the workflow explicitly configures that fallback.
- Keep CLI-only workflows working without Codex Desktop.

### Non-Goals

- No implicit current-thread detection from `thread/list`.
- No default result return to a new Desktop thread when a current Codex conversation exists.
- No custom subagent scheduler.
- No Claude Managed Agents parity in this phase.
- No recursive worker fan-out.
- No write-capable worker threads in this phase.
- No background daemon, remote queue, or custom platform scheduler.

## SPEC

### Runtime Selection

Workflow authors can request Desktop-visible worker execution:

```yaml
runtime:
  preferred_worker_adapter: codex-app-thread
  fallback_worker_adapter: codex-sdk-headless
```

If `preferred_worker_adapter: codex-app-thread` is selected:

1. CWF probes the Codex app-server schema and daemon.
2. CWF creates one thread per worker with `thread/start`.
3. CWF names each thread with workflow id, run id, and worker id.
4. CWF starts a worker turn with `turn/start`.
5. CWF reads or receives the worker result, then normalizes it into the standard worker envelope.
6. CWF records native runtime metadata beside the worker result.

If app-server is unavailable:

- if `fallback_worker_adapter` is configured, CWF uses that adapter and records `fallback_used: true`;
- if no fallback is configured, the worker fails explicitly with `WorkerAdapterUnavailableError`.

### Result Return Priority

Result return follows this order:

1. **Skill wrapper return**: if a Codex skill launched the workflow, it reads `result.md` or structured result JSON and replies in the active conversation.
2. **Explicit thread return**: if a host or user provides `--thread <thread-id>`, CWF posts to that known thread.
3. **Explicit new thread**: if the user provides `--new-thread`, CWF creates a separate coordinator/result thread.
4. **CLI fallback**: without Desktop context, CWF writes `handoff-prompt.md`, `result.md`, and run artifacts.

CWF must never infer the initiating conversation from `thread/list`.

### Worker Runtime Metadata

Each app-thread worker stores:

```json
{
  "adapter": "codex-app-thread",
  "requested_adapter": "codex-app-thread",
  "fallback_adapter": "codex-sdk-headless",
  "fallback_used": false,
  "fallback_reason": null,
  "parent_thread_id": "optional host-provided initiating thread id",
  "coordinator_thread_id": "optional coordinator/result thread id",
  "thread_id": "worker thread id",
  "turn_id": "worker turn id",
  "agent_role": "correctness",
  "agent_nickname": "correctness",
  "transcript_read": true,
  "sandbox": "read-only",
  "approval_policy": "never",
  "result_return_path": "worker-envelope"
}
```

If transcript reading is not available, CWF preserves the best available final response, records `transcript_read: false`, and keeps artifact paths inspectable.

### Thread Topology

```text
initiating Codex conversation
  -> CWF skill wrapper returns final result here
  -> CWF run store records all evidence
  -> optional worker thread: correctness
  -> optional worker thread: tests
  -> optional worker thread: safety
  -> optional coordinator/result thread only when explicitly requested
```

## Acceptance Criteria

- [ ] Same-conversation result return is the documented primary UX.
  - Test: docs/spec source audit proves `--new-thread` is described as explicit/background/fallback, not default.

- [ ] `codex-app-thread` can run one worker through app-server.
  - Test: fake app-server integration test covers `thread/start`, `thread/name/set`, `turn/start`, `thread/read`, and worker envelope normalization.

- [ ] `diff-review` can create three Desktop-visible worker threads when app-server is available.
  - Manual evidence: live smoke records three worker `thread_id` values and three `turn_id` values in worker JSON.

- [ ] Worker runtime metadata is recorded per spec.
  - Test: worker JSON includes adapter, requested adapter, fallback fields, worker `thread_id`, worker `turn_id`, parent/coordinator ids when provided, transcript-read status, sandbox, and approval policy.

- [ ] Reducer behavior is unchanged across SDK and app-thread workers.
  - Test: mixed-adapter reducer fixture passes and preserves runtime metadata in provenance.

- [ ] Fallback is explicit.
  - Test: native adapter unavailable with fallback configured records `fallback_used: true`; without fallback it fails with `WorkerAdapterUnavailableError`.

- [ ] No current-thread guessing exists.
  - Test: source audit and unit tests show CWF never selects a parent/current thread from `thread/list`.

- [ ] Existing CLI users are unaffected.
  - Test: `npm run check`, `bash scripts/smoke-cli.sh`, and a CLI `diff-review` smoke pass without app-server.

- [ ] Result thread behavior stays explicit.
  - Manual evidence: `cwf desktop result <run-id> --new-thread` creates a coordinator/result thread only when the flag is present.

## Deferred: Managed-Agents-Style Platform Scheduling

This phase intentionally does not build a managed agent platform. It does not own a scheduler, queue, remote lifecycle service, nested agent policy, or agent marketplace. That work can be reconsidered after worker app threads are proven with real app-server smoke.

The future managed scheduling plan should start only after v1.7 can prove:

- worker threads are visible;
- worker outputs return to the reducer;
- final results return to the initiating conversation;
- fallback is safe for CLI-only users;
- no custom platform layer is needed for the common case.
