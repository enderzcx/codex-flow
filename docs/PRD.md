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
- Provide a live-refresh CLI view for background runs.
- Let users list, show, and reopen the latest run without remembering run ids.
- Rebuild discovery data from run folders when the local index is missing, stale, or corrupt.
- Record default failure policy metadata and summarize failures in human-readable terms.
- Pause gated workflows before risky phases.
- Persist approvals and rejections, then resume only pending phases after approval.
- Reject write-capable specs that do not include a prior gate.
- Discover local workflows from project and user search paths.
- Inspect and validate local workflow specs before running.
- Run workflows by id or direct path.
- Keep the public MVP free of private adapters or third-party model routing.

## Non-Goals

- No automatic code modification.
- No non-Codex model routing.
- No UI.
- No generated workflow scripts.
- No broad workflow marketplace in MVP.
- No production write-capable workflow in this release.
- No remote workflow marketplace.
- No generated JavaScript workflows.
- No exact parity with Claude Dynamic Workflows.
- No mandatory Codex Desktop integration in MVP.

## MVP User Stories

1. As a Codex user, I can run `cwf validate workflows/diff-review.yaml` and confirm the workflow is valid before spending model time.
2. As a Codex user, I can run `cwf run workflows/diff-review.yaml --target <repo>` and get a review report.
3. As a user with a large diff, I can run `--background`, poll `status`, and fetch `result`.
4. As a reviewer, I can inspect each worker's JSON output and the event log.
5. As a cautious engineer, I can verify the runner did not mutate my repo.
6. As a tool maintainer, I can mock worker failure and verify failed runs are recorded correctly.
7. As a user returning to a background run, I can understand the current state without reading raw JSON first.
8. As a user watching a long run, I can run `cwf watch <run-id>` and see the status refresh until the run finishes.
9. As a user who forgot a run id, I can run `cwf list`, `cwf latest`, or `cwf show <run-id>` to find and inspect the run.
10. As a user debugging a failed run, I can read the failed phase, failed workers, policy, and suggested next step without opening raw JSON first.
11. As a cautious user, I can require approval before later phases continue.
12. As a user reviewing a gated run, I can approve and resume, or reject with a reason and stop cleanly.
13. As a workflow author, I get a validation error if a phase or worker declares `writes:true` before a gate.
14. As a user, I can run `cwf workflows list` to see available local workflows.
15. As a user, I can run `cwf workflows show diff-review` before running it.
16. As a user, I can run either `cwf run diff-review --target <repo>` or `cwf run workflows/diff-review.yaml --target <repo>`.

## Success Criteria

- `npm run check` passes.
- `cwf --help` works.
- `cwf validate workflows/diff-review.yaml` prints workflow id, phase order, worker ids, and confirms no workers were started.
- `cwf run ...` works on fixture and real repos.
- `cwf run ... --background` returns quickly and completes in the background.
- `cwf cancel <run-id>` cancels an in-progress background run.
- `cwf status <run-id>` shows current work, phase durations, worker progress, fallback count, and artifact paths.
- `cwf watch <run-id>` refreshes status and exits automatically when the run finishes.
- `cwf list [--limit <n>] [--status <status>] [--target <path>]` lists recent runs.
- `cwf latest [--target <path>]` shows the newest run overall or for a target.
- `cwf show <run-id>` prints the same human-readable run detail as status plus discovery commands.
- `cwf approve`, `cwf reject`, and `cwf resume` support gated workflow pauses.
- `cwf workflows list/show/validate` discovers local workflow specs.
- `cwf run <workflow-id-or-path> --target <repo>` works for `diff-review` by id and path.
- Duplicate workflow ids fail with conflicting paths.
- Workflow schema includes `title`, `tags`, `inputs`, and `capabilities`.
- `~/.codex-workflows/index.json` is rebuilt from run folders when missing, stale, or corrupt.
- Run artifacts are persisted under `~/.codex-workflows/runs/<run-id>/`.
- Read-only review does not modify the target repo diff.
- Mocked all-worker failure records failed state, events, and worker JSON.
- Failed runs include default failure policy metadata and a readable failure summary.
- Gate fixtures can pause, approve/resume, reject, and prove completed phases do not rerun.
- Write-capable specs without a prior gate fail validation.

## Public Positioning

Codex Flow is a thin Codex-native workflow runner. It is not an orchestration framework, not a multi-model router, and not an enterprise queue. The MVP is intentionally small so the run contract is easy to understand and verify.

## Future: Codex Desktop Handoff

Codex's experimental app-server protocol appears to support Desktop-visible thread lifecycle events. A later release should explore guarded Desktop handoff so a workflow can create follow-up Codex threads from its result, while keeping the CLI run store and `cwf watch` as the stable baseline.
