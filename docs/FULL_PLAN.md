---
half_life: 30d
archive_at: 2026-07-04
---

# Codex Flow Full Plan

## Product North Star

Codex Flow should let Codex run repeatable engineering workflows without turning every complex task into one giant chat.

The finished product should feel like this:

1. The user or a Codex skill chooses a workflow.
2. CWF validates the workflow before spending model time.
3. CWF runs focused Codex workers through phases.
4. CWF saves progress, worker output, gates, failures, and artifacts.
5. Risky phases pause for explicit approval.
6. A reducer produces one actionable result.
7. If launched from Codex, the final result comes back to the initiating conversation.
8. Optional native Codex threads make worker activity inspectable when the host supports it.

## Design Principle

Codex Flow is not a replacement for Codex's own agent runtime. It is a small workflow contract layer on top of it.

Reuse Codex-native capability first:

- Codex SDK for headless workers
- Codex app-server threads for Desktop-visible workers
- Codex sandbox and approval model
- Codex skills for active-conversation result return
- Codex worktrees/subagents when those host surfaces are available

Only add a custom CWF layer where Codex does not already provide the product concept:

- workflow spec validation
- phase ordering
- run store
- gate state
- worker envelope normalization
- reducer output
- artifact manifest
- CLI status/watch/result

## Current Completed Capability

Completed phases are historical evidence. Do not rewrite their detailed acceptance records during future planning passes.

| Area | Current Capability |
| --- | --- |
| Workflow engine | CLI runner, workflow validation, status/watch/result/cancel, durable run folders. |
| Workflow catalog | `diff-review`, `repo-audit`, `implementation-plan`, `research-crosscheck`, `release-review`, `doc-refresh`. |
| Failure model | Worker fallback/degraded evidence, failure summaries, status/show visibility. |
| Gates | Approve/reject/resume for write-capable phases. |
| Write safety | `doc-refresh` is docs-only, gated, previewed, and runs through Codex SDK workspace-write after approval. |
| PR artifacts | Completed runs can produce local GitHub PR comment/review artifacts; posting requires explicit flags. |
| Workflow suggestions | Suggestions create validated YAML and are not installed or run automatically. |
| Desktop bridge | Completed runs can attempt explicit app-server result return; CLI remains reliable when app-server is unavailable. |
| Worker app threads | Selected workers can run in Codex Desktop-visible threads when app-server is available; worker JSON records thread and turn metadata. |

Completed ledger: `GOAL_CHECKLIST.md`.

## Target Runtime Shape

```text
Codex conversation or CLI
  -> CWF workflow resolver
  -> spec validator
  -> run store
  -> phase engine
      -> command phase
      -> Codex SDK worker
      -> optional Codex app-thread worker
      -> gate
      -> reducer
      -> artifact writer
  -> final result
      -> initiating Codex conversation when launched by a skill
      -> explicit known thread when --thread is provided
      -> explicit new coordinator/result thread when --new-thread is provided
      -> CLI result.md when no Desktop path exists
```

## Claude Dynamic Workflows Comparison

Similar effect:

- one higher-level request can fan out into focused workers;
- the main conversation does not need to hold every intermediate detail;
- progress and results can be inspected;
- evidence survives after the chat scrolls away;
- the final answer is reduced into one coherent result.

Different composition:

- Claude Dynamic Workflows are product-native inside Claude Code.
- Codex Flow is a public CLI/skill layer that must stay installable and auditable.
- Claude can rely on Claude's managed workflow surfaces.
- Codex Flow should reuse Codex SDK, app-server, skills, subagents, sandbox, approvals, and worktrees rather than pretending to own them.

Correct promise:

> Similar useful workflow effect for supported Codex workflows, different runtime and safety model.

Incorrect promise:

> Full Claude Dynamic Workflows parity.

## Remaining Plan

### v1.7 Worker App Threads

Done.

Outcome:

- workflows may opt into `codex-app-thread`;
- one Desktop-visible Codex thread is created per selected worker when app-server is available;
- worker output is normalized into the existing worker envelope;
- final result still returns to the initiating Codex conversation when launched by a skill;
- CLI-only users keep working without Desktop.

Detailed plan: `WORKER_APP_THREADS_PLAN.md`.

Historical goal prompt: `goal-prompts/v1.7-worker-app-threads.md`.

### v1.8 Managed-Agents-Style Scheduling Decision

Done. Decision: do not build a scheduler now.

Evidence reviewed:

- v1.7 proved app-server-backed worker threads can create Desktop-visible execution/evidence surfaces.
- Worker output still normalizes into the existing worker envelope and reducer path.
- Same-conversation final result return remains the skill wrapper's job.
- CLI-only users still have process-backed background runs, watch/status/result, cancellation, local run discovery, and artifacts without Desktop.
- No current evidence proves a queue, daemon, remote lifecycle service, nested worker runtime, or custom scheduler is required in public core.

Revisit criteria:

- durable queueing outside the current process becomes a real user need;
- cancellation across many long-running worker threads cannot be handled through existing run state and host controls;
- nested workers are required by a concrete workflow and cannot be delegated to Codex host subagents;
- shared run ownership across users or machines becomes a real product requirement;
- a future public workflow registry creates lifecycle needs that local filesystem discovery cannot cover.

Until one of those criteria is proven, scheduler work remains out of scope.

Decision record: `../GOAL_PROMPT.md`.

Archived phase prompt: `goal-prompts/v1.8-managed-agents-decision.md`.

### v1.9 Public Workflow Registry

Do not build yet.

Only revisit after v1.7 and the v1.8 decision. A registry adds trust and supply-chain risk, so it needs its own plan.

Minimum future requirements:

- local install path and remote source path are distinct;
- workflow specs are validated before install;
- checksums or signatures are considered;
- generated JavaScript remains out of public core;
- write-capable workflows require gates and visible warnings;
- bundled/local/remote trust levels are clear in CLI output.

## Guardrails For Future Plans

- Separate completed evidence from unfinished implementation.
- Do not make Desktop required for normal CLI use.
- Do not claim live Desktop worker-thread support without recorded thread ids and turn ids.
- Do not turn roadmap prose into acceptance evidence.
- Do not use `thread/list` to guess the active conversation.
- Do not add process or doc ceremony without saying when it applies and when it should be skipped.

## Verification For Plan Updates

Docs-only plan updates should run:

```bash
git diff --check
```

Also run a source-audit grep for stale old-goal wording before committing. Keep the searched phrases outside this file or the audit will match its own instructions.

Code-adjacent plan updates should also run:

```bash
npm run check
bash scripts/smoke-cli.sh
```
