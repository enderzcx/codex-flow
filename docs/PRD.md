# Codex Flow PRD

## Summary

Codex Flow is a Codex-native workflow runner for repeatable multi-worker engineering review. The MVP focuses on one workflow: `diff-review`.

## Problem

Codex is strong in a single session, but large diffs benefit from parallel independent review perspectives. Today that orchestration is usually ad hoc:

- prompts are copied by hand
- intermediate results disappear into chat context
- review perspectives are not repeatable
- long runs provide little progress visibility
- failures are hard to inspect after the fact

## Target Users

- Engineers using OpenAI Codex CLI or SDK.
- Maintainers who want repeatable branch or PR review without another LLM stack.
- Builders interested in dynamic workflow patterns but wanting to stay Codex-native.

## Goals

- Run a reusable diff review workflow from the CLI.
- Validate workflow specs before starting Codex workers.
- Start independent Codex workers for correctness, tests, and safety.
- Persist run state, events, worker outputs, and final results.
- Support foreground and background runs.
- Show readable status during long runs, including current work, worker progress, fallback count, and artifact paths.
- Keep the public MVP free of private adapters or third-party model routing.

## Non-Goals

- No automatic code modification.
- No non-Codex model routing.
- No UI.
- No generated workflow scripts.
- No broad workflow marketplace in MVP.
- No exact parity with Claude Dynamic Workflows.

## MVP User Stories

1. As a Codex user, I can run `cwf validate workflows/diff-review.yaml` and confirm the workflow is valid before spending model time.
2. As a Codex user, I can run `cwf run workflows/diff-review.yaml --target <repo>` and get a review report.
3. As a user with a large diff, I can run `--background`, poll `status`, and fetch `result`.
4. As a reviewer, I can inspect each worker's JSON output and the event log.
5. As a cautious engineer, I can verify the runner did not mutate my repo.
6. As a tool maintainer, I can mock worker failure and verify failed runs are recorded correctly.
7. As a user returning to a background run, I can understand the current state without reading raw JSON first.

## Success Criteria

- `npm run check` passes.
- `cwf --help` works.
- `cwf validate workflows/diff-review.yaml` prints workflow id, phase order, worker ids, and confirms no workers were started.
- `cwf run ...` works on fixture and real repos.
- `cwf run ... --background` returns quickly and completes in the background.
- `cwf cancel <run-id>` cancels an in-progress background run.
- `cwf status <run-id>` shows current work, phase durations, worker progress, fallback count, and artifact paths.
- Run artifacts are persisted under `~/.codex-workflows/runs/<run-id>/`.
- Read-only review does not modify the target repo diff.
- Mocked all-worker failure records failed state, events, and worker JSON.

## Public Positioning

Codex Flow is a thin Codex-native workflow runner. It is not an orchestration framework, not a multi-model router, and not an enterprise queue. The MVP is intentionally small so the run contract is easy to understand and verify.
