# Codex Flow PRD

## Summary

Codex Flow is a Codex-native workflow layer for repeatable multi-agent engineering work.

v1.0 is the stable CLI engine: read-only workflows, filesystem run store, worker envelopes, gates, and reducer output. v1.4 adds one narrow gated documentation write workflow.

Post-v1 should move closer to Codex's native product model: a Codex conversation starts workflow work, worker agents can run in their own Desktop-visible threads, results return to the initiating conversation when one exists, and write-capable work uses Codex's own sandbox, approvals, permissions, and worktrees.

## Problem

Codex is strong in a single session, but complex engineering work benefits from repeatable phases, independent worker contexts, and a durable evidence trail. Today that orchestration is usually ad hoc:

- prompts are copied by hand
- intermediate results disappear into chat context
- review perspectives are not repeatable
- long runs provide little progress visibility
- failures are hard to inspect after the fact
- Desktop-visible Codex threads, subagents, and approval controls exist, but there is no small public workflow contract that ties them to reusable specs, run artifacts, and reducer output

## Target Users

- Engineers using OpenAI Codex CLI, SDK, or App.
- Maintainers who want repeatable branch or PR review without another LLM stack.
- Builders interested in dynamic workflow patterns who want to stay Codex-native instead of building a separate agent platform.

## Goals

- Run a reusable diff review workflow from the CLI.
- Validate workflow specs before starting Codex workers.
- Start independent Codex workers for correctness, tests, and safety.
- Persist run state, events, worker outputs, and final results.
- Support foreground and background runs.
- Show readable status during long runs, including current work, worker progress, fallback count, and artifact paths.
- Provide a live-refresh CLI view for background runs.
- Let users list, show, and reopen the latest run without remembering run ids.
- Generate GitHub PR-ready comment and review artifacts from completed local runs.
- Generate constrained workflow spec suggestions without installing or running them automatically.
- Rebuild discovery data from run folders when the local index is missing, stale, or corrupt.
- Record default failure policy metadata and summarize failures in human-readable terms.
- Persist standardized worker envelopes, a standardized reduced result envelope, and an artifact manifest for each completed run.
- Make partial worker failures, degraded verdicts, and raw fallback visible in status and result output.
- Pause gated workflows before risky phases.
- Persist approvals and rejections, then resume only pending phases after approval.
- Reject write-capable specs that do not include a prior gate.
- Discover local workflows from project and user search paths.
- Inspect and validate local workflow specs before running.
- Run workflows by id or direct path.
- Ship read-only example workflows for repo audit, implementation-plan review, research cross-check, and release review.
- Ship one narrow gated documentation write workflow with pre-write preview, explicit approval, diff summary, rollback, and verification evidence.
- Keep GitHub posting disabled by default and require explicit `--post --repo --pr` before invoking `gh`.
- Document when to use and when not to use each bundled workflow.
- Keep the public v1.0 core free of private adapters or third-party model routing.
- Define the post-v1 native runtime bridge: coordinator thread, worker agent threads, result return, and Codex safety inheritance.
- Treat same-conversation result return as the primary UX when a workflow is started from Codex.
- Treat Desktop coordinator/result threads as explicit CLI/background paths, not the default destination for an active conversation.
- Keep Codex Flow-owned pieces limited to workflow specs, run-store evidence, gates, artifact manifests, and reducers.

## Non-Goals

- No ungated automatic code modification.
- No non-Codex model routing.
- No UI.
- No custom subagent scheduler that duplicates Codex's own subagent mechanism.
- No Claude Managed Agents-style platform scheduler in the worker-thread phase.
- No custom sandbox or approval system that bypasses Codex permissions.
- No generated workflow scripts.
- No auto-running generated workflow suggestions.
- No broad workflow marketplace in v1.0.
- No broad production write-capable workflow beyond gated documentation refresh.
- No remote workflow marketplace.
- No generated JavaScript workflows.
- No automatic GitHub posting.
- No exact parity with Claude Dynamic Workflows.
- No mandatory Codex Desktop integration in v1.0.

## User Stories

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
17. As a reviewer, I can trust the final output because it preserves worker provenance, raw fallback status, and the artifact evidence used to render the report.
18. As a user, I can choose `repo-audit`, `implementation-plan`, `research-crosscheck`, or `release-review` from the catalog when my review goal is broader than a code diff review.
19. As a Codex App user, I can explicitly ask a workflow to create a visible supervisor/result thread instead of hiding all progress in a detached CLI process.
20. As a Codex user in an active conversation, I can get the workflow result back in this conversation through the Codex skill wrapper.
21. As a workflow author, I can describe worker roles while Codex Flow decides whether the current runtime uses SDK headless workers, app-server threads, or Codex subagents.
22. As a Codex Desktop user, I can ask for worker app threads and inspect each worker's left-sidebar thread while still receiving the final result in the initiating conversation.
23. As a cautious user, I can allow write-capable workflows only when they pass a workflow gate and then run through Codex's own sandbox, approval, and worktree/thread boundaries.
24. As a documentation maintainer, I can run `doc-refresh`, review the dry-run artifacts, explicitly approve, and receive rollback plus verification evidence.
25. As a maintainer, I can generate a PR-ready comment or review artifact without posting anything.
26. As a maintainer, I can explicitly post with `--post --repo --pr`, and failures leave local artifacts behind.
27. As a workflow author, I can run `cwf suggest-workflow --goal "<task>"` to draft a valid YAML spec.
28. As a cautious user, I can verify suggestions are not installed or run unless I explicitly use their path.

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
- Completed runs include `artifacts/reduced-result.json` and `artifacts/manifest.json`.
- Worker JSON uses a stable envelope with status, confidence, summary, findings, verification, artifacts, retry/fallback metadata, raw output, timing, and optional error/usage.
- Reducer output uses a stable envelope with verdict, summary, findings, verification gaps, next actions, worker provenance, and artifact references.
- Partial worker failure or raw fallback is visible as degraded evidence unless stronger supported findings require `fail`.
- Read-only review does not modify the target repo diff.
- Mocked all-worker failure records failed state, events, and worker JSON.
- Failed runs include default failure policy metadata and a readable failure summary.
- Gate fixtures can pause, approve/resume, reject, and prove completed phases do not rerun.
- Write-capable specs without a prior gate fail validation.
- `cwf workflows validate` validates all bundled workflows.
- Each bundled example workflow has fixture coverage and at least one real smoke.
- Workflow catalog documents when to use and when not to use each bundled workflow.
- Post-v1 native mode can create a named Codex App supervisor/result thread when `--new-thread` is explicitly used and record its thread id.
- Post-v1 result return works through the skill wrapper as the primary active-conversation path, or through an explicit app-server thread id/new-thread flag for CLI/background use; it must not guess the current thread from a thread list.
- Post-v1 worker execution treats "agent" as the role/config and "thread" as the run instance.
- Post-v1 worker runtime adapters are Codex-only, validate public adapter names, preserve runtime metadata, and fall back to SDK headless only when configured.
- Post-v1 worker app threads can record per-worker thread ids, turn ids, parent/coordinator ids when known, transcript-read status, adapter metadata, and fallback status.
- Post-v1 write-capable phases run only after a gate and use Codex sandbox/permissions behavior; the CWF gate is the explicit human approval boundary for the current SDK write path.
- `doc-refresh` pauses before writing, rejects cleanly, and after approval produces write plan, dry-run preview, diff summary, rollback, verification, worker JSON, reduced result, and manifest artifacts.
- Release CI runs build, tests, package dry-run, and non-live CLI smoke on push to `main` and pull requests.
- Release operators have a checklist for install/build/test, package dry-run, CLI smoke, source audit, docs audit, and optional live smoke.
- `cwf desktop check` reports whether the local Codex CLI, app-server schema, daemon, and required thread methods are available.
- `cwf desktop result <run-id> --print` can return a completed run through a local prompt without Desktop.
- `cwf desktop result <run-id> --new-thread` or `--thread <thread-id>` attempts explicit app-server result return and records fallback metadata if unavailable.
- `cwf github-pr <run-id> --format comment|review` writes local PR artifacts without posting.
- `cwf github-pr <run-id> --post --repo <owner/repo> --pr <number>` is the only GitHub posting path and uses `gh`.
- `cwf suggest-workflow --goal "<task>"` writes a validated suggestion under `~/.codex-workflows/suggestions/` by default.
- `cwf suggest-workflow --from-run <run-id>` derives a validated suggestion from prior run context.
- Workflow suggestions are absent from `cwf workflows list` until manually moved into a workflow search path.
- A valid suggestion can be run only by explicit path.
- Invalid suggestion diagnostics are visible and do not delete the saved file.

## Public Positioning

Codex Flow is a thin Codex-native workflow layer. It is not a multi-model router, not an enterprise queue, and not a replacement for Codex subagents, threads, worktrees, approvals, or plugins.

The public core owns the workflow contract and evidence trail: specs, state, events, worker envelopes, gates, reducer output, and artifact manifests.

Codex owns the agent execution boundary: threads, subagents, sandbox, permissions, and file writes. Codex Flow owns the workflow gate that approves a write phase before the current SDK writer runs.

## Future: Codex App Thread Integration

Codex's app-server protocol supports thread lifecycle methods, turn streaming, review threads, sandbox/approval controls, skills, plugins, and subagent-visible thread metadata. v1.2 adds explicit result handoff and coordinator-thread attempts for completed runs. v1.3 adds the worker adapter contract, SDK fallback, and runtime metadata preservation. v1.7 turns `codex-app-thread` into a worker path that can create Desktop-visible read-only worker threads when app-server is available. v1.4 adds a gated docs-only write workflow through Codex SDK `workspace-write`; broader native write workflows should continue to reuse Codex's thread, worktree, sandbox, approval, and subagent boundaries when those interactive host surfaces are available.

Managed-Agents-style platform scheduling is not part of the current product. v1.8 records the decision not to build a scheduler now: v1.7 already proves visible app-thread worker execution, reducer-compatible worker envelopes, same-conversation result return through the skill wrapper, and safe CLI fallback. Revisit a scheduler only when a concrete workflow proves Codex-native threads, SDK workers, skills, sandbox/approval rules, worktrees, and host subagents are insufficient.

The CLI run store and `cwf watch` remain the stable baseline for users without Codex Desktop.
