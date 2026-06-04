---
half_life: 30d
archive_at: 2026-07-04
---

# Codex Flow Plan

## What We Are Building

Codex Flow is a thin Codex-native workflow layer.

In plain terms: a user asks Codex to run a repeatable engineering workflow, CWF splits the job into phases and workers, saves the evidence, lets risky steps pause for approval, and returns one useful final answer.

Codex Flow owns:

- workflow specs
- run state
- gates
- worker evidence envelopes
- reducer output
- artifact manifests
- CLI/status/watch/result surfaces

Codex owns:

- model execution
- threads and subagents
- sandbox and approvals
- permissions
- skills and plugins
- worktrees

The project should keep reusing Codex-native capability instead of rebuilding a separate agent platform.

## What We Are Not Building

- No third-party model router in the public core.
- No private model adapter requirement.
- No exact clone of Claude Dynamic Workflows.
- No custom agent marketplace.
- No custom remote scheduler before native worker threads are proven.
- No implicit posting into a guessed Codex conversation.
- No generated JavaScript workflow execution.
- No ungated write-capable workflow.

## Source Of Truth

- Current product behavior: `README.md`, `README.zh-CN.md`, `docs/SPEC.md`, `ACCEPTANCE.md`.
- Full product direction: `docs/FULL_PLAN.md`.
- Next unfinished implementation slice: `docs/WORKER_APP_THREADS_PLAN.md`.
- Next goal-mode contract: `GOAL_PROMPT.md`.
- Completed phase evidence: `GOAL_CHECKLIST.md`.
- Detailed historical roadmap: `docs/POST_V1_PLAN.md` and `docs/PHASE_CONTRACTS.md`.

Do not rewrite completed phase evidence unless a new audit proves it is factually wrong.

## Current Baseline

Implemented and treated as historical evidence:

| Phase | Status | Human Meaning |
| --- | --- | --- |
| v1.0 | Done | Stable CLI workflow engine and public package shape. |
| v1.1 | Done | CI, package smoke, and release checklist. |
| v1.2 | Done with fallback | Desktop result handoff can be attempted explicitly; CLI remains reliable when app-server is unavailable. |
| v1.3 | Done | Worker adapter contract exists; native adapters fail honestly when unavailable. |
| v1.4 | Done | Gated docs-only write workflow exists. |
| v1.5 | Done | Completed runs can become GitHub PR comment/review artifacts; posting is explicit. |
| v1.6 | Done | Workflow suggestions create validated YAML specs and do not install or run automatically. |

The completed ledger lives in `GOAL_CHECKLIST.md`. Leave it alone during future planning rewrites.

## Unfinished Roadmap

### v1.7 Worker App Threads

Goal: make selected workflow workers run as real Codex Desktop-visible threads.

User-facing effect:

- If the workflow starts inside an active Codex conversation, the final result returns to that same conversation through the skill wrapper.
- If the workflow requests Desktop-visible worker execution, each worker can also appear as its own Codex thread in the left sidebar.
- `--new-thread` remains explicit and is used only for CLI/background/coordinator cases.

Detailed contract: `docs/WORKER_APP_THREADS_PLAN.md`.

### v1.8 Managed-Agents-Style Scheduling Decision

Goal: decide whether a platform scheduler is still needed after v1.7.

This is not approved for implementation yet. It should start as a design audit, not code.

Build only if v1.7 proves that native Codex threads are useful but insufficient for one or more concrete cases:

- durable queueing outside the current process
- cancellation across many long-running worker threads
- policy for nested workers
- shared run ownership across users or machines
- a public workflow registry that needs lifecycle management

If Codex-native threads/subagents cover the common case, do not build a scheduler.

### v1.9 Public Workflow Registry

Goal: let users share and install workflow specs safely.

This is deferred until v1.7 and the v1.8 decision are complete.

Required shape when revisited:

- signed or checksum-verifiable workflow specs
- validation before install
- no generated JavaScript execution
- no automatic write-capable workflow enablement
- clear trust boundary between bundled, local, and remote workflows

## Next Implementation Order

1. Finish v1.7 Worker App Threads.
2. Run real and fake app-server verification.
3. Audit whether native Codex thread reuse is enough.
4. Only then write the v1.8 scheduler decision plan.
5. Only after that revisit public workflow sharing.

## Acceptance For This Plan

- The plan separates completed evidence from unfinished work.
- The next implementation slice is v1.7 only.
- Same-conversation result return is primary for Codex-launched workflows.
- Desktop worker threads are optional execution/evidence surfaces.
- Managed-agents-style scheduling is explicitly deferred.
- Future agents can find the current goal prompt without reading every historical phase.
