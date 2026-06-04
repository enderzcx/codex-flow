---
half_life: 7d
archive_at: 2026-06-11
---

# v1.7 Implementation Plan

## Plain Goal

Make Codex Flow able to run workflow workers as real Codex Desktop-visible threads when a workflow explicitly asks for that mode.

The final result should still come back to the Codex conversation that launched the workflow. Worker threads are extra inspection surfaces, not the default place where the final answer lands.

## Scope

Build v1.7 only:

- live `codex-app-thread` worker adapter
- fake app-server tests
- worker runtime metadata
- mixed SDK/app-thread reducer proof
- explicit fallback behavior
- live app-server smoke when the local Codex app-server is available
- docs update for the v1.7 contract if implementation details change

## Non-Scope

- Do not rewrite completed v1.1-v1.6 evidence.
- Do not build a managed-agent platform scheduler.
- Do not build a remote queue, daemon, marketplace, or registry.
- Do not add non-Codex model routing.
- Do not enable write-capable app-thread workers.
- Do not infer the current Codex conversation from `thread/list`.
- Do not make CLI-only workflows require Codex Desktop.

## Current Architecture To Reuse

Use existing pieces first:

- app-server transport and capability probe from `src/desktop-bridge.ts`
- worker adapter contract from `src/adapters/worker-adapter.ts`
- workflow runtime config validation in schema code
- worker JSON envelope and reducer provenance
- run store under `~/.codex-workflows/runs/<run-id>/`
- tests and smoke script already used for CLI reliability

If an existing seam is insufficient, extend it narrowly. Do not create a second runtime.

## Runtime Behavior

Workflow opt-in:

```yaml
runtime:
  preferred_worker_adapter: codex-app-thread
  fallback_worker_adapter: codex-sdk-headless
```

When `codex-app-thread` is selected:

1. Probe the app-server capability surface.
2. Create one app-server thread per worker.
3. Name the thread with workflow id, run id, and worker id.
4. Start a worker turn using the same worker role and prompt as SDK workers.
5. Read the worker result through the app-server path when available.
6. Normalize output into the existing worker envelope.
7. Preserve runtime metadata in the worker JSON and reducer provenance.

When app-server is unavailable:

- use `runtime.fallback_worker_adapter` only if configured;
- otherwise fail the worker with `WorkerAdapterUnavailableError`;
- keep the failure visible in state, events, status/show output, and reducer provenance.

## Result Return Rule

Priority:

1. Codex skill wrapper reads the run result and replies in the active conversation.
2. `cwf desktop result <run-id> --thread <thread-id>` posts to a known explicit thread.
3. `cwf desktop result <run-id> --new-thread` creates a separate coordinator/result thread.
4. CLI artifacts remain the fallback.

`thread/list` may be used only for verification/search after an explicit thread id exists. It must never be used to choose the initiating/current conversation.

## Implementation Slices

### Slice 1: App-Thread Adapter Skeleton

- Add a concrete `codex-app-thread` adapter implementation behind the existing adapter interface.
- Reuse the app-server client/probe instead of duplicating connection code.
- Keep unavailable behavior explicit and testable.

Evidence:

- unit test for unavailable adapter with fallback configured
- unit test for unavailable adapter without fallback
- source audit for no current-thread guessing

### Slice 2: Fake App-Server Worker Test

- Add a fake app-server transport that supports the needed methods.
- Test `thread/start`, `thread/name/set`, `turn/start`, and result read.
- Verify normalized worker JSON matches the existing envelope.

Evidence:

- fake app-server integration test passes
- worker JSON includes `thread_id`, `turn_id`, adapter, sandbox, approval policy, and transcript-read metadata

### Slice 3: Reducer Compatibility

- Run a fixture with mixed SDK and app-thread worker outputs.
- Ensure the reducer does not branch on adapter type.
- Preserve runtime metadata in provenance.

Evidence:

- mixed-adapter reducer fixture passes
- reduced result remains schema-compatible

### Slice 4: CLI Smoke Without Desktop

- Confirm existing CLI workflows still work without app-server.
- Confirm validation, status, watch, result, gated workflows, GitHub artifacts, and suggestions are unaffected.

Evidence:

- `npm run check`
- `bash scripts/smoke-cli.sh`
- normal `diff-review` smoke without app-server

### Slice 5: Live App-Server Smoke

Run only when the local Codex app-server daemon is available.

- Start or connect to app-server.
- Run a `diff-review` workflow with `preferred_worker_adapter: codex-app-thread`.
- Record one thread id and one turn id per worker.
- Confirm final result still returns through the initiating conversation path or the documented manual wrapper path.

Evidence:

- worker JSON records three worker `thread_id` values and three worker `turn_id` values
- `cwf result <run-id>` works
- `cwf desktop result <run-id> --new-thread` remains explicit

If app-server is unavailable, record the exact command/error and do not claim live Desktop thread acceptance.

## Verification Commands

Required:

```bash
npm run check
bash scripts/smoke-cli.sh
git diff --check
```

Targeted:

```bash
npx vitest run tests/worker-adapter.test.ts
npx vitest run tests/desktop-bridge.test.ts
npx vitest run tests/diff-review-reducer.test.ts
```

Manual/live when available:

```bash
codex app-server daemon start
codex app-server daemon enable-remote-control
cwf desktop check
cwf run diff-review --target <fixture> --background
cwf status <run-id>
cwf result <run-id>
```

The exact live app-thread workflow command may change during implementation; if it does, update this plan and `docs/WORKER_APP_THREADS_PLAN.md`.

## Stop Conditions

Stop and report before continuing if:

- the local Codex app-server protocol lacks the thread or turn methods required for worker execution;
- app-server result retrieval cannot be made deterministic enough to normalize worker output;
- the implementation would require a custom scheduler or daemon;
- write-capable worker threads become necessary to finish v1.7;
- tests pass only by hiding fallback or skipping metadata;
- current-thread guessing appears necessary.

## Done Means

v1.7 is done only when:

- fake app-server worker tests pass;
- existing CLI smoke still passes without Desktop;
- fallback behavior is explicit and covered;
- no-current-thread-guessing audit passes;
- docs match the implemented behavior;
- live Desktop worker-thread smoke is either passed with thread ids/turn ids or clearly documented as unavailable in this environment.
