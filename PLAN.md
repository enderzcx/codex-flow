---
half_life: 7d
archive_at: 2026-06-09
---

# codex-workflows MVP Plan

## Building

Build a public Codex-native workflow runner that can run repeatable phased workflows using Codex SDK worker threads and deterministic command steps. The MVP proves one useful workflow end to end: `diff-review`.

## Not Building

- No third-party model routing or private adapters.
- No native Codex Desktop background pane in the MVP.
- No automatic `workflow` keyword trigger.
- No generated JavaScript workflow scripts.
- No broad agent marketplace.
- No automatic production file edits in the first workflow.

## Approach

Start with an explicit CLI runner and declarative workflow specs.

Recommended commands:

```bash
cwf run workflows/diff-review.yaml --target <repo>
cwf status <run-id>
cwf watch <run-id>
cwf result <run-id>
cwf cancel <run-id>
```

Recommended run storage:

```text
~/.codex-workflows/runs/<run-id>/
  workflow.json
  state.json
  events.jsonl
  workers/
    <phase>-<worker-id>.json
  result.md
```

## MVP Workflow: diff-review

Goal: review a git diff with multiple independent Codex perspectives, then merge the findings.

Phases:

1. Collect context
   - Verify target is a git repo.
   - Capture branch, staged/unstaged diff, changed files, and package metadata.

2. Parallel review
   - Worker A: correctness and regressions.
   - Worker B: tests and verification gaps.
   - Worker C: security, permissions, data-loss, rollback risk.

3. Reduce
   - Merge duplicate findings.
   - Drop unsupported findings.
   - Rank by severity.
   - Produce final review with file references when available.

4. Evidence
   - Save worker prompts, outputs, usage if available, and final result.

## Minimal Architecture

```text
CLI
  -> workflow loader
  -> run store
  -> phase engine
      -> codex worker adapter
      -> command step adapter
  -> reducer
  -> result renderer
```

## Key Decisions

1. Use Codex SDK as the default agent substrate.
   - Reason: public users already need Codex; no additional model account should be required.

2. Use declarative specs first.
   - Reason: safer, easier to test, easier to explain than model-generated scripts.

3. Default worker sandbox is read-only.
   - Reason: review/audit workflows should not mutate the repo by surprise.

4. Persist every run.
   - Reason: a workflow without durable evidence is just a long prompt with extra steps.

5. Start with `diff-review`.
   - Reason: high value, easy to validate, does not require UI, browser, or private adapters.

## Current State

Local version is `0.2.0`, not `2.0.0`.

Implemented in `0.2.0`:

- `diff-review`
- foreground and background runs
- `status`, `result`, and `cancel`
- `watch` live-refresh status view
- persistent run store under `~/.codex-workflows/runs/<run-id>/`

## Post-MVP Roadmap

### 0.3: Codex Desktop / App-Server Handoff

Goal: make workflow-created follow-up work visible in Codex Desktop instead of only in `cwf` run folders.

Planned capabilities:

- Discover and validate the experimental Codex app-server protocol before use.
- Add a guarded command such as `cwf handoff --app <run-id>` or `cwf spawn-thread --app`.
- Use app-server `thread/start` / `turn/start` where available to create Codex Desktop-visible threads.
- Preserve the stable local fallback: generate a prompt and run `codex -C <repo> ...` when app-server is unavailable.
- Store created thread ids in the run folder for later `status`, `result`, or resume hints.
- Keep `cwf watch` as the public stable progress view until app-server behavior is proven.

Non-goals for 0.3:

- No dependency on a running Desktop app for normal `diff-review`.
- No private model routing.
- No claim of full Claude Dynamic Workflows parity.

## Fragile Assumption

This plan assumes the Codex SDK is available and stable enough for local worker threads. If the SDK changes or is unavailable, the fallback is to wrap `codex exec` JSONL events behind the same adapter interface.

The app-server handoff plan assumes Codex's experimental Desktop protocol remains available. If it changes, `cwf` must fall back to local session creation and keep app integration optional.

## Implementation Order

1. Create package skeleton and CLI entrypoint.
2. Add workflow spec schema.
3. Add run store and status/result commands.
4. Add Codex SDK worker adapter.
5. Add `diff-review` workflow.
6. Add reducer and result renderer.
7. Add fixture repo smoke test.
8. Write README with exact comparison to Claude Dynamic Workflows.
