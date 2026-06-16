---
name: codex-workflows
description: Use when the user asks Codex to run a dynamic workflow, CWF, workflow.js harness, native subagent orchestration, repo audit/fix/review with multiple agents, adversarial verification, tournament evaluation, safe fix loop, or reusable workflow template. Not for trivial edits, ordinary single-agent coding, ordinary single-pass diff review, project status audits, PRD/SPEC planning, /goal prompt writing, generic thread orchestration, background reminders, or external model routing.
metadata:
  short-description: Codex-native bounded dynamic workflow skill
skill_package_type: library
---

# Codex Workflows

Codex Workflows is a native Codex bounded dynamic workflow skill.

Skill package type: `library`. This skill is public/reusable, ships workflow templates and helper checks, and has route-confusion risk with planning, goal-writing, project-status, and thread-orchestration skills.

The main session is the coordinator. Workflow JavaScript files are harness specs for Codex to read, adapt, and execute with native subagents. Do not execute these files with Node.

The goal is not to spawn many agents for its own sake. The goal is to move complex orchestration into a small bounded run plan: scope first, fan out only where useful, challenge important results, verify, and return one coordinated answer.

## Parent Routing Contract

If your Codex environment defines a parent work contract or routing policy, apply that policy before selecting CWF.

CWF is an execution backend, not the default entry point. Before selecting CWF, the coordinator must satisfy a CWF Trigger Boundary and document the CWF Self-Check: which boundary is met and why direct, skill-only, or thread-only execution is insufficient.

If CWF is selected without a valid self-check, treat it as a contract violation and fall back to the smaller route. For durable run plans, fill the `CWF Self-Check` section in `templates/run-plan.md` before spawning workers.

When a task is in `/goal` / Goal Mode, says `目标模式`, asks to "run until complete", or is likely to need more than one CWF episode, Goal Mode is the outer supervisor and CWF is the inner bounded execution engine. The coordinator must attach a Goal Anchor before the first CWF run and make each run return `goal_delta`.

## Core Contract

```text
Goal Anchor when needed
  -> choose or draft workflow.js
  -> scope and draft bounded run plan
  -> spawn native Codex subagents
  -> optionally promote important workers to Desktop threads
  -> wait or run in background
  -> adapt if needed
  -> verify with checker-owned state
  -> preserve recurring failures as regression artifacts when applicable
  -> emit goal_delta when goal-anchored
  -> answer in this same conversation
```

## Agent-readable Skill Registry

For this repository, `scripts/cwf-skills.mjs` is the current-version skill registry entrypoint. Use it when an agent or maintainer needs to discover the installed CWF skill surface before reading detailed SOP:

```bash
node scripts/cwf-skills.mjs list --format markdown
node scripts/cwf-skills.mjs list codex-workflows --format markdown
node scripts/cwf-skills.mjs read codex-workflows
node scripts/cwf-skills.mjs read codex-workflows/references/routing.md
node scripts/cwf-skills.mjs validate codex-workflows --format markdown
```

The registry exposes only agent-readable SOP content: `SKILL.md`, `references/`, `templates/`, and `evals/`. It deliberately refuses `scripts/`, assets, absolute paths, and dot-segment escapes. Treat it as discovery and documentation access, not as workflow execution.

## When To Use

First apply any parent work contract or local routing policy. Use this skill only after the task passes the CWF Trigger Boundary.

Use this skill when at least one is true:

- The task benefits from separate clean contexts.
- The task is a migration, repo audit, bug hunt, source-backed research, adversarial review, or safe fix loop.
- The user asks for CWF-backed code review, PR review, or diff review with multiple independent reviewer perspectives.
- Multiple independent perspectives should run in parallel.
- The task needs adversarial verification.
- A long task has an unknown amount of work and needs a stop condition.
- The task is heterogeneous and needs classify-and-act routing.
- The task should stream items through ordered stages instead of waiting for one global barrier.
- The user explicitly asks for a workflow, dynamic workflow, CWF, subagents, parallel agents, tournament, or loop.
- The user explicitly asks for Goal Mode plus CWF, or a hard completion target that needs repeated bounded CWF episodes.
- The task should be saved as a reusable `workflow.js` harness.

Do not use this skill for:

- small direct edits;
- single test/lint commands;
- normal implementation work that one Codex turn can finish;
- ordinary single-pass diff review that does not need multiple independent reviewer perspectives;
- writing PRD/SPEC/acceptance docs without running a workflow;
- creating a `/goal` prompt without workflow execution;
- reading project status or progress;
- coordinating arbitrary Desktop threads without a CWF run plan;
- background scheduling;
- external model routing;
- CI-only automation.
- tasks where the workflow overhead is larger than the work.

When routing is ambiguous, read `references/routing.md` and prefer the narrower neighboring skill.

## Native Execution Rules

1. The current Codex main session owns orchestration.
2. Use native subagents when the host exposes them.
3. Subagents inherit the current Codex sandbox and approval policy.
4. Prefer `explorer` for read-heavy work and `worker` for implementation.
5. Give every writable worker a disjoint write scope.
6. Tell writable workers they are not alone in the codebase and must not revert unrelated changes.
7. Keep most workers inline; promote only important workers to Desktop threads.
8. Set an explicit budget for non-trivial saved workflows.
9. Quarantine untrusted input before any privileged action.
10. Preview non-trivial workflow shape before running.
11. Report compact status for long-running workflows.
12. Wait for worker results only when needed for the next critical-path step.
13. Summarize results back in the current conversation.
14. For long runs, prefer background + heartbeat instead of making the main conversation wait.
15. Treat maker and verifier state separately: workers can report attempted/proposed/changed, but only a verifier, test, replay, or human review may mark verified/passed/done.
16. When a workflow, helper, route, connector, or harness failure is likely to recur, preserve the failing input or trace and add a regression artifact, fixture, eval, or explicit skip reason before calling the repair complete.

If native subagent tools are unavailable, stop and say the workflow cannot run natively in this host. Do not silently fall back to an external runner.

## Workflow Harness Shape

Workflow files live under `workflows/*.workflow.js`.

They are readable JavaScript specs, not executable Node scripts. They may use plain objects and arrays to describe:

- `name`
- `goal`
- `when_to_use`
- `phases`
- `agents`
- `visibility`
- `budget`
- `run_experience`
- `write_scopes` for workflow-level write boundaries, or per-agent `write_scope` for worker ownership
- `verification`
- `verified_state`
- `failure_to_regression`
- `stop_conditions`
- `quarantine_rules`
- `failure_policy`

When a template is useful, read it and adapt it in the main session before spawning agents. If no template fits, draft a small workflow inline and optionally save it when the user asks.

For non-trivial workflows, draft a bounded run plan before spawning workers. It should include scope, exclusions, phases, workers, verifier/challenger role, write scopes, quarantine path, budget, stop rule, evidence, resume checkpoint, and Goal Anchor / Goal Delta fields when the workflow is goal-anchored. If a run id exists, the future persisted path is `.cwf/runs/RUN_ID/run-plan.md`.

Use `templates/run-plan.md` as the skeleton when the run plan needs a durable artifact.

The run plan's `CWF Self-Check` section is required before spawning workers. If it is missing or cannot name a CWF Trigger Boundary, do not run CWF.

## External Review Receipts

CWF is not external model routing. Do not use CWF to dispatch an external advisor, model, or review tool as a worker/executor.

When a task contract has already approved an external advisory review, a CWF run may reference that result as a receipt-only review checkpoint. The coordinator owns the external call outside CWF worker dispatch, then maps the result into the run plan and return envelope.

Use external review receipts only for high-value advisory review: long-document architecture review, cross-document state contradiction detection, phase-gate risk review, release blocker discovery, or Goal/CWF delta proposals.

Never let an external review receipt:

- write files or mutate repo state;
- mark `verified`, `passed`, `done`, `regression_locked`, or Stage transition state;
- replace local tests, external final review, checker-owned verification, or operator approval;
- carry secrets, credentials, customer data, raw production logs, or unapproved confidential payloads.

Minimum CWF mapping:

```yaml
external_review_receipts:
  - surface:
    trigger:
    readiness_receipt:
    input_summary:
    prompt_hash:
    transcript_ref:
    verdict:
    confidence:
    findings:
    accepted_findings:
    rejected_findings:
    needs_checker_verification:
    goal_delta_proposed:
    failure_to_regression_candidates:
    verified_state_impact: none_until_checker_accepts
```

Accepted findings may become `goal_delta.proposed`, blockers, or failure-to-regression candidates only after the coordinator/checker explicitly accepts them. Rejected findings should keep a short reason so future runs do not resurrect the same advisory concern without new evidence.

## Recommended Patterns

- `fan-out-and-synthesize`: split independent questions across agents, then merge.
- `adversarial-verification`: ask a verifier to challenge an output against a rubric.
- `generate-and-filter`: produce many options, dedupe, and keep the best.
- `tournament`: let multiple approaches compete and judge pairwise.
- `pipeline`: move items through ordered stages without waiting for a global barrier.
- `loop-until-done`: keep spawning bounded workers until a clear stop condition is met.
- `classify-and-act`: classify items, then route to the right worker behavior.

## Worker Visibility

Visibility controls whether a worker stays inside the main workflow or gets its own Codex Desktop sidebar thread.

- `inline`: default. Use for short read-only explorers, one-shot verifiers, and small helper tasks.
- `desktop-thread`: use for long-running work, writable implementation workers, or work the user may inspect, steer, or continue separately.
- `auto`: let the main session decide from task length, risk, write scope, and whether follow-up is likely.

Do not create a Desktop sidebar thread for every worker. The main conversation remains the coordinator and the final result destination.

Resolve `auto` to `desktop-thread` only when `budget.max_tokens > 50000`, any planned worker has a non-empty `write_scope`, deploy/release/migrate/publish appears in phase or worker text, or the user explicitly asks to inspect/continue a worker separately. Otherwise resolve `auto` to `inline`.

SDK/background workers are quiet execution contexts; do not promise that they appear in Codex Desktop's left sidebar. If the user asks to see a worker in the left sidebar, or the worker should be inspectable/continuable, use `desktop-thread` and record the Desktop thread id.

## Run Experience

Before a non-trivial workflow runs, show a concise preview:

- pattern and phases;
- planned agents and visibility;
- write scopes;
- token budget;
- quarantine rules;
- stop conditions.

Preview may be skipped only when the user explicitly asked to run immediately and the workflow is small, read-only, inline-only, budgeted at 100000 tokens or less, and has no privileged raw-content path.

Mechanical preview:

```bash
node scripts/cwf-run-preview.mjs workflows/repo-audit.workflow.js
```

Persist a bounded run plan:

```bash
node scripts/cwf-run-plan.mjs workflows/repo-audit.workflow.js --objective "audit this repo" --run-id demo
```

Initialize a controller run directory with preview, run-plan, state, return envelope, final placeholder, worker packets, and worker result slots:

```bash
node scripts/cwf-start.mjs workflows/repo-audit.workflow.js --objective "audit this repo" --run-id demo
```

During long workflows, report compact status: current phase, worker counts, elapsed time, budget pressure, and blockers. Do not dump raw worker logs.

Use `foreground` mode only when the workflow can finish inside the current interactive turn. Use `background` when the work may take longer; return the run id, state path, expected next check, and stop rule. Use `background+heartbeat` when the final result should come back to the originating conversation without the user polling manually, but treat it as scheduled until a real marker reply is observed in the originating thread.

Cancel means stop spawning new workers and summarize partial evidence. Resume means continue from the last known phase and worker outputs; if exact state is unavailable, restart from the smallest safe checkpoint and say so.

Local run state uses `.cwf/runs/RUN_ID/state.json`, `.cwf/runs/RUN_ID/preview.md`, `.cwf/runs/RUN_ID/run-plan.md`, `.cwf/runs/RUN_ID/return-envelope.json`, `.cwf/runs/RUN_ID/final.md`, `.cwf/runs/RUN_ID/worker-packets/*.md`, and `.cwf/runs/RUN_ID/worker-results/*.json`. The smallest safe resume checkpoint is the phase after the last completed phase boundary; if no phase completed cleanly, restart from Phase 1.

Each initialized run also writes `.cwf/runs/RUN_ID/return-envelope.json`. The envelope records final destination, return mode, final summary path, evidence path, verifier status, deferred items, and completion status. Treat `coordinator_synthesis` as the proven default return mode. Do not claim platform automatic callback unless a future real smoke proves it.

For async runs, record `runtime_mode`, adapter status, `sdk_thread_ids`, and `desktop_thread_ids` when known. `heartbeat_synthesis` means a follow-up in the originating conversation read local CWF state and posted the final summary, and the coordinator observed the expected marker reply before recording delivery; it is not platform automatic callback. `heartbeat-scheduled` and `heartbeat-scheduled-not-returned` are not success states.

Use the adapter helpers only as evidence recorders unless the host capability is genuinely available:

- `scripts/cwf-native-subagent.mjs` records host-native subagent output or `native-subagent-unavailable`.
- `scripts/cwf-worker-sdk.mjs` records SDK fixture status or real read-only fixed-marker SDK status through `@openai/codex-sdk`.
- `scripts/cwf-worker-desktop-thread.mjs` records failure fixture, approval-gated visible-thread smoke, or approved result.
- `scripts/cwf-return-heartbeat.mjs` records heartbeat fixture, scheduled, scheduled-not-returned, real-smoke, or unavailable state. Only real-smoke with an observed originating-thread id may record `heartbeat_synthesis`.

## Budget

For non-trivial saved workflows, define a budget before spawning agents:

- token cap or rough upper bound;
- stop rule;
- when to pause for the user;
- which pattern is expected to spend the most.

If the user asked for `/goal` or a hard completion target, pair `loop-until-done` with that Goal Anchor. Do not let an open-ended workflow run without a stop condition. Do not claim the goal is complete from one CWF episode unless the Goal Anchor acceptance is met.

## Quarantine

Use quarantine when a workflow reads untrusted user, web, support, issue, ticket, social, third-party API, or scraped content.

Rules:

- raw reader agents are read-only;
- agents exposed to raw untrusted text cannot write files, run deploys, touch credentials, or take irreversible actions;
- write workers receive sanitized summaries and approved paths only;
- privileged actions require explicit user approval when the source is untrusted.

## Save As Skill

When a workflow works repeatedly, save it as a skill template. Treat saved workflow files as adaptable harness specs, not scripts to run verbatim.

## Write Work

Writable workflows use approval-gated bounded patch flow. Desktop-thread and SDK workers may diagnose or propose patches, but they must not write directly outside the coordinator's approved path.

For write workers:

- preview write scope before any real write;
- require explicit `approve-write` or equivalent user approval;
- check changed paths against allowed and forbidden paths;
- run `git apply --check` in a temporary git repo, or `patch --dry-run` plus `diff --check` for a non-git equivalent, and pass command/evidence into the safe-write gate;
- run declared verification after apply;
- report changed files and rollback command;
- assign exact file/module ownership;
- prefer `visibility: "desktop-thread"` when the write task is long or needs user inspection;
- require a final changed-file list;
- require verification commands or manual evidence;
- avoid overlapping write scopes;
- stop and ask the user before credentials, payments, databases, deploys, permissions, or irreversible external writes.

## Closeout

Every workflow closeout must include:

- what workflow pattern ran;
- which agents were spawned and why;
- what changed, if anything;
- verification evidence;
- external review receipts and accepted/rejected/needs-check disposition when an approved external advisory review was used;
- who owns verified state, and which evidence allowed any `verified` / `passed` / `done` claim;
- regression artifact or skip reason when the run fixed a recurring workflow, helper, route, connector, or harness failure;
- `goal_delta` when the run is under Goal Mode or a Goal Anchor;
- remaining risks or stop condition;
- a short human-readable summary.

Do not dump raw worker logs unless the user asks.

## Output Contract

Every CWF response should include the smallest useful subset of this contract:

- `mode`: direct skip, preview, foreground workflow, background workflow, or background+heartbeat;
- `workflow`: chosen template or drafted `workflow.js` harness;
- `why CWF`: why this task needs workflow orchestration instead of one normal Codex turn;
- `run plan`: scope, exclusions, phases, workers, visibility, budget, stop rule, quarantine, verifier, evidence, and resume checkpoint;
- `goal anchor`: goal id, acceptance, current slice, continue/stop/pause conditions when applicable;
- `execution summary`: worker count, which workers ran, which were skipped, and why;
- `goal_delta`: `run_id`, `completed`, `evidence_added`, `blockers`, `next_slice`, `next_cwf_run`, `continue_or_stop`, and `progress_artifact_update` when applicable;
- `verified state`: maker-owned attempted/proposed state versus checker-owned verified/passed/done state;
- `external_review_receipts`: receipt-only advisory findings, their disposition, and any proposed `goal_delta`;
- `failure-to-regression`: failing input or trace, replay command, regression artifact, or explicit skip reason when applicable;
- `return path`: coordinator_synthesis or heartbeat_synthesis status;
- `write boundary`: no writes, proposed patch only, or approved safe write gate;
- `verification`: commands, artifacts, thread ids, screenshots, logs, or explicit not-verified reason;
- `human summary`: what happened in plain language, without raw worker log dumps.

If CWF is not appropriate, say so briefly and do the direct task or route to the narrower skill.

## References

- `references/routing.md`: trigger/exclusion boundaries against nearby skills.
- `templates/run-plan.md`: durable bounded run-plan skeleton.
- repo root `docs/EXTERNAL_REVIEW_RECEIPTS.md`: receipt-only external review contract.
- `evals/trigger_cases.json`: route examples for install/routing audits.
- `scripts/check_skill_install.py`: local install and package-shape smoke.
- repo root `scripts/cwf-skills.mjs`: current-version `skills list/read/validate` registry for agent SOP.
