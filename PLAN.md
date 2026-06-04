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
- No custom remote scheduler unless a later evidence review proves Codex-native threads, SDK workers, skills, sandbox/approval rules, worktrees, and host subagents cannot cover a concrete user workflow.
- No implicit posting into a guessed Codex conversation.
- No generated JavaScript workflow execution.
- No ungated write-capable workflow.

## Source Of Truth

- Current product behavior: `README.md`, `README.zh-CN.md`, `docs/SPEC.md`, `ACCEPTANCE.md`.
- Full product direction: `docs/FULL_PLAN.md`.
- Completed native worker-thread slice: `docs/WORKER_APP_THREADS_PLAN.md`.
- Current goal-mode entrypoint: `GOAL_PROMPT.md`.
- Archived phase goal prompts: `docs/goal-prompts/`.
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
| v1.7 | Done | Selected workflow workers can run as Codex Desktop-visible threads when app-server is available; CLI fallback remains explicit. |

The completed ledger lives in `GOAL_CHECKLIST.md`. Leave it alone during future planning rewrites.

## Remaining Roadmap

### v1.8 Managed-Agents-Style Scheduling Decision

Decision: do not build a platform scheduler now.

Evidence from v1.7 shows the next useful step is not a custom scheduler: app-thread workers can create Codex Desktop-visible execution surfaces, worker outputs still return to the reducer, the CLI lifecycle remains valid without Desktop, and same-conversation final result return stays with the skill wrapper.

Revisit only if real usage proves native Codex surfaces are useful but insufficient for one or more concrete cases:

- durable queueing outside the current process
- cancellation across many long-running worker threads
- policy for nested workers
- shared run ownership across users or machines
- a public workflow registry that needs lifecycle management

Until one of those cases is proven, Codex Flow should keep scheduling out of public core and continue to rely on Codex-native execution boundaries.

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

1. Keep v1.8 as a completed decision record: no scheduler now.
2. Continue collecting real workflow evidence through the existing CLI, SDK worker, app-thread worker, gate, artifact, and skill-wrapper surfaces.
3. If a concrete scheduling gap appears, write the smallest PRD/SPEC/acceptance plan before implementation.
4. Only after that revisit public workflow sharing.

## Acceptance For This Plan

- The plan separates completed evidence from unfinished work.
- v1.8 is decision-only and does not authorize scheduler implementation.
- Same-conversation result return is primary for Codex-launched workflows.
- Desktop worker threads are optional execution/evidence surfaces.
- Managed-agents-style scheduling is explicitly gated by evidence.
- Future agents can find the current goal prompt without reading every historical phase.
