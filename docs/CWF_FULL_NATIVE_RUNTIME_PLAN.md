---
half_life: 30d
archive_at: 2026-07-08
scope_type: version
scope_name: cwf-full-native-runtime-v1
coverage: Complete delivery contract for making CWF eat the available Codex-native subagent, thread, SDK, heartbeat, state, verifier, and safe-write surfaces.
not_complete_for: Full Claude platform parity, hosted scheduler, marketplace service, non-Codex model routing, unrestricted JavaScript execution, npm publish, git tag, deploy, or any external irreversible action.
verification_level: real-smoke
real_smoke_status: requires_approval_for_visible_desktop_thread_and_safe_write; required_for_sdk_and_heartbeat_fixture_or_local_smoke
review_status: reviewed
reviewer: reasonix-v4pro
review_command: reasonix run -m deepseek-v4-pro:cloud --effort high
review_notes: GO after fixing phase plan completeness, repo-audit dependency, SDK fixture versus real-smoke split, package-lock boundary, safe-write bypass fixture, Desktop-thread false-claim audit, Desktop preflight failure acceptance, and code/check/fixture deliverables.
review_owner: Ender
review_due: 2026-06-09
---

# CWF Full Native Runtime Plan

## Alignment Snapshot

This planning pass will help future Codex goal sessions build the complete Codex-native CWF runtime experience by producing PRD, SPEC, acceptance criteria, phase plan, and a goal prompt, using the current `codex-workflows` repo, official Codex SDK/App Server/Subagents/Workflows/Automations documentation, and existing CWF evidence as source of truth, while avoiding old external runtime creep, unrestricted workflow JavaScript, false platform callback claims, and sidebar spam.

Building:

- A thin CWF run controller that turns a `workflow.js` harness plus user objective into a concrete run record.
- A host-native subagent path that uses Codex's real subagent tools when the current host exposes them.
- A Codex SDK background worker adapter for quiet long-running workers that do not need left-sidebar visibility.
- A Codex Desktop app-thread adapter for selected workers that should appear in the left sidebar.
- A heartbeat return path that requests a wake-up in the originating Codex conversation and summarizes local CWF results only after a real marker reply is observed.
- A unified state, status, result, verifier, budget, and safe-write evidence model under `.cwf/runs/RUN_ID/`.

Not building:

- No full Claude Dynamic Workflows clone.
- No hosted scheduler, marketplace, daemon service, package `bin`, or background cloud platform.
- No arbitrary execution of `workflow.js` as Node code.
- No one-thread-per-worker sidebar flood.
- No direct Desktop-thread write bypassing the safe-write gate.
- No claim that SDK workers automatically inject results into the originating Desktop thread.

Source of truth:

- Current repo docs: `README.md`, `README.zh-CN.md`, `docs/CORE.md`, `docs/RUN_EXPERIENCE.md`, `docs/CWF_ASYNC_RUNTIME.md`, `docs/CWF_CLAUDE_COMPARISON.md`, `docs/CWF_MVP_EVIDENCE.md`, `docs/CWF_RELEASE_READINESS.md`, `skills/codex-workflows/SKILL.md`.
- Current helpers: `scripts/cwf-run-preview.mjs`, `scripts/cwf-run-plan.mjs`, `scripts/cwf-run-state.mjs`, `scripts/cwf-return-envelope.mjs`, `scripts/cwf-safe-write.mjs`, `scripts/cwf-generate-workflow.mjs`, `scripts/cwf-catalog.mjs`.
- Current workflow templates: `workflows/repo-audit.workflow.js`, `workflows/safe-fix-loop.workflow.js`, `workflows/adversarial-verify.workflow.js`, `workflows/classify-and-act.workflow.js`, `workflows/pipeline.workflow.js`, `workflows/tournament.workflow.js`, `workflows/ui-copy-review.workflow.js`.
- Official docs verified on 2026-06-08: `https://developers.openai.com/codex/sdk`, `https://developers.openai.com/codex/subagents`, `https://developers.openai.com/codex/workflows`, `https://developers.openai.com/codex/app-server`, `https://developers.openai.com/codex/automations`.

Deliverables:

- PRD and SPEC in this document.
- Evidence-bound acceptance matrix.
- Phase plan that can be implemented in goal mode.
- Copy-ready goal prompt in `docs/goals/CWF_FULL_NATIVE_RUNTIME_GOAL.md`.
- README/skill/doc links updated so future sessions find this plan.

Phase scope:

- Complete for `cwf-full-native-runtime-v1`.
- Not a complete whole-product plan for hosted CWF, npm publish, marketplace, or future Codex APIs not currently exposed.

Completeness:

- This document is complete when Reasonix review is `reviewed` or `reviewed_with_findings` with findings applied/waived, and local delivery-doc checks pass.
- Runtime implementation is not complete until the goal prompt's verification matrix passes.

Verification level:

- Docs: local.
- SDK worker: fixture for schema/state behavior; real-smoke with API access for actual SDK thread id and marker.
- Desktop thread: real-smoke only after Ender approves creating a visible thread.
- Heartbeat: local/real-smoke depending on current Codex automation support; scheduled heartbeats remain pending until a marker is observed, missed windows become `heartbeat-scheduled-not-returned`, and unavailable support records `heartbeat-unavailable` honestly. Do not use `FREQ=MINUTELY;INTERVAL=1;COUNT=1` for Gate E proof; use an interval heartbeat such as `FREQ=MINUTELY;INTERVAL=1`, then pause or delete it after the marker returns.
- Safe write: real-smoke only against disposable `/tmp` target after explicit approval.

Review requirement:

- Reasonix/v4Pro final review is required because this is a reusable G2 workflow/agent-system plan.

Open decisions:

- Whether the first implementation exposes command names as separate scripts such as `cwf-start.mjs`, `cwf-worker-sdk.mjs`, and `cwf-worker-desktop-thread.mjs`, or one `cwf-runtime.mjs` with subcommands. Recommended: separate focused helpers, no package `bin`.
- Whether heartbeat is executed by a Codex App automation tool call or by a generated user-visible follow-up prompt. Recommended: use the native heartbeat automation when available, but record success only after the originating-thread marker is observed; otherwise produce an explicit resume prompt and keep the state scheduled, scheduled-not-returned, or unavailable.

## Phase Index

| Phase | Name | Depends On | Complete When |
|---|---|---|---|
| 0 | Contract Sync | Current docs and helper scripts. | Planning docs, goal prompt, README links, and guard checks are synchronized and reviewed. |
| 1 | Run Controller | Phase 0. | A local controller smoke creates all required run artifacts without real workers. |
| 2 | Host-Native Subagent Adapter | Phase 1. | Native subagent smoke passes or records `native-subagent-unavailable` honestly. |
| 3 | SDK Background Adapter | Phase 1. | SDK fixture passes and real SDK smoke passes or records unavailable. |
| 4 | Desktop-Thread Adapter | Phase 1. | Failure fixture passes; approved visible-thread smoke passes or records requires approval/unavailable. |
| 5 | Heartbeat Return | Phase 1 return envelope plus Phase 3 or any background result artifact. | Heartbeat return smoke passes only after a real originating-thread marker is observed; otherwise record `heartbeat-scheduled`, `heartbeat-scheduled-not-returned`, or `heartbeat-unavailable` with a resume prompt. |
| 6 | Safe-Write Runtime Integration | Phases 1 and 3/4 result schema. | Non-coordinator worker patch proposals cannot bypass safe-write; approved disposable smoke passes. |
| 7 | Verifier/Budget/Resume/Status Gates | Phases 1 and 6. | Blocking, waiver, advisory, budget, resume, and human status fixtures pass. |
| 8 | Dynamic Generation And Catalog Integration | Phases 1 and 7. | Generated and catalog workflows feed the controller and unsafe content fails closed. |
| 9 | End-To-End Evidence And Public Readiness | Phases 1-8. | Evidence docs, release-readiness docs, package dry-run, and Reasonix final review pass. |

## PRD

### Problem

CWF currently has strong pieces: workflow harnesses, preview, run plan, local state/resume, return envelope, safe-write gate, dynamic generation, catalog, and Desktop-thread smoke evidence. But using it still requires the main Codex session to manually glue the pieces together. The missing product is the native runtime loop: start a workflow, dispatch the right kind of worker, track results, optionally go async, and return to the originating conversation without pretending unsupported platform callback exists.

### Target Users

- Ender using Codex Desktop for audits, safe fixes, research, UI/copy review, and migration planning.
- Future Codex users installing CWF as a public skill.
- Future goal-mode Codex sessions that need exact implementation and verification boundaries.

### Goals

- Let a user run a bounded workflow from one objective without hand-stitching preview, state, worker packets, and final result.
- Use Codex-native subagents when available for true parallel clean contexts.
- Use Codex SDK for quiet background workers where sidebar visibility is not needed.
- Use Codex Desktop app-server threads for selected workers that should be visible in the left sidebar.
- Use heartbeat to avoid making the main conversation wait for long background runs.
- Keep final synthesis in the originating conversation.
- Preserve safe-write, verifier, budget, and quarantine invariants.
- Give every claimed capability a local, fixture, or real-smoke evidence label.

### Non-Goals

- No hosted scheduler or cloud service.
- No npm publish, git tag, deploy, or marketplace.
- No non-Codex model routing.
- No replacement for Codex's own subagent/thread/automation features.
- No secret handling, production writes, database writes, payment, permission, or customer-data work.

### User Stories

- As a user, I can ask CWF to run `repo-audit` and see the run id, preview, workers, budget, and stop rule.
- As a user, I can let read-only explorer workers run as native subagents and receive a coordinated summary.
- As a user, I can run long background workers through SDK without blocking the main thread.
- As a user, I can promote one important worker into a visible Codex Desktop thread.
- As a user, I can have a completed background run summarized back in the original conversation by heartbeat.
- As a user, I can inspect `.cwf/runs/RUN_ID/` to understand what happened and resume safely.
- As a user, I can approve safe writes and see path policy, patch check, verification, changed files, and rollback evidence.

### Success Criteria

- A small CWF run can execute end-to-end using native subagents and local state.
- A background SDK worker can write a result into run state and be summarized by the coordinator.
- A selected Desktop-thread worker can be created and read back after explicit approval.
- Heartbeat either posts the result back to the originating conversation or records an honest unavailable/deferred state.
- Safe write remains approval-gated and cannot be bypassed by Desktop-thread or SDK workers.
- `npm run check`, `git diff --check`, package dry-run, delivery-doc check, goal-prompt check, and Reasonix review all pass.

## SPEC

### Runtime Model

The runtime is a thin native adapter, not a standalone platform.

```text
User objective
  -> workflow selection or generation
  -> preview + bounded run plan
  -> run state initialized
  -> worker dispatch by visibility/runtime mode
  -> worker results recorded under .cwf/runs/RUN_ID/
  -> verifier/budget/safe-write gates evaluated
  -> foreground summary or background+heartbeat return
```

Components:

| Component | Responsibility | Implementation Surface |
|---|---|---|
| Run controller | Create run id, preview, run plan, state, return envelope, worker queue. | `scripts/cwf-start.mjs` or equivalent helper. |
| Host-native subagent adapter | Use current Codex host's `spawn_agent`/wait/result surface when exposed. | Skill procedure plus state update helper; Node must not fake host tools. |
| SDK background adapter | Start/resume Codex SDK worker, stream or collect result, write result to state. | `@openai/codex-sdk` helper script. |
| Desktop-thread adapter | Create/resume visible Codex Desktop thread and run worker prompt. | Codex app-server `thread/start` + `turn/start` helper with preflight. |
| Heartbeat return adapter | Wake originating conversation later to read `.cwf/runs/RUN_ID/final.md` and summarize. | Codex automation heartbeat when available; otherwise generated resume prompt with honest unavailable status. |
| Verifier gate | Turn verifier findings into `pass`, `blocked`, `needs-waiver`, or `advisory`. | Existing `cwf-safe-write.mjs` evaluator extended if needed. |
| Safe-write gate | Bound writes by approval, allowed paths, patch check, verification, changed files, rollback. | Existing `cwf-safe-write.mjs` plus run integration. |
| Status/result UX | Human-readable `status` and `result` output. | Existing `cwf-run-state.mjs` extended if needed. |

### Worker Dispatch Contract

Worker runtime is selected from workflow visibility, risk, task length, and user intent.

| Worker Type | Default Runtime | Promotion Rule |
|---|---|---|
| Short read-only explorer | host-native subagent | Stay inline unless user asks to inspect separately. |
| Long read-only research | SDK background worker | Promote to Desktop thread only if user wants left-sidebar continuity. |
| High-risk verifier | host-native subagent or Desktop thread | Desktop thread when preservation/inspection matters. |
| Write worker | safe-write gated flow | Desktop thread may propose or inspect patch; real apply stays coordinator-gated. |
| Follow-up-worthy worker | Desktop thread | Record `desktop_thread_id`. |

### State Contract

Each run uses `.cwf/runs/RUN_ID/`:

- `state.json`: phases, workers, runtime mode, statuses, ids, evidence, blockers.
- `preview.md`: human preview.
- `run-plan.md`: bounded run plan.
- `worker-packets/*.md`: prompts sent to workers.
- `worker-results/*.json`: normalized worker result records.
- `return-envelope.json`: destination, return mode, heartbeat status, SDK ids, Desktop thread ids, verifier status, final path.
- `final.md`: final human summary.

### Return Contract

Return modes:

- `coordinator_synthesis`: current conversation waits or later reads results and summarizes.
- `heartbeat_synthesis`: a heartbeat reply appears in the originating conversation, reads local final/result state, posts a human summary, and the coordinator observes the expected marker before recording delivery.
- `platform_callback`: forbidden to claim unless a future official API and real smoke prove it.

### Safety Invariants

- `workflow.js` is a harness/spec, not executable workflow code.
- Generated workflow text must fail closed on imports, require, process, child processes, fs, fetch, eval, Function, and hidden execution patterns.
- All untrusted raw content is quarantined before privileged workers.
- All write work requires approval and path policy.
- Desktop-thread and SDK workers cannot bypass safe-write.
- No visible Desktop thread is created without explicit approval when running smoke tests.

### Errors And Fallbacks

| Failure | Required Behavior |
|---|---|
| Native subagent unavailable | Stop with `native-subagent-unavailable` or use SDK only when the user approved that fallback. |
| SDK unavailable | Mark SDK worker unavailable and continue with host-native/foreground only if safe. |
| Desktop app-thread preflight fails | Do not create sidebar noise; mark `desktop-thread-execution-unavailable`. |
| Heartbeat scheduled but no marker returns | Keep `return_mode=coordinator_synthesis`, mark `heartbeat-scheduled-not-returned`, and keep the run blocked/partial until resumed or waived. |
| Heartbeat unavailable | Return run id/status instructions and mark `heartbeat-unavailable`. |
| Verifier blocked | Final result cannot be PASS. |
| Safe write gate fails | Do not apply patch; record reason and rollback status. |
| Budget/stop rule missing | Fail closed before worker dispatch. |

## Acceptance Matrix

| ID | Criterion | Verification Level | Evidence |
|---|---|---|---|
| A1 | Run controller creates preview, run-plan, state, return-envelope, worker packets, and final placeholder for a `repo-audit` run using the checked-in `workflows/repo-audit.workflow.js` template. | local | `npm run check`; direct run of the new start helper; inspect `.cwf/runs/RUN_ID/`. |
| A2 | Host-native subagent path runs at least two read-only explorers and records normalized results. | real-smoke | Use Codex host subagent tools; record agent ids/results in evidence; if unavailable, mark `native-subagent-unavailable`. |
| A3a | SDK background worker fixture writes a normalized result to `worker-results` without requiring a real API call. | fixture | `npm run check` fixture for SDK result schema, timeout/error shape, and state write. |
| A3b | SDK background worker real-smoke runs a tiny marker task and records actual SDK id/result when SDK credentials/model routing are available. | real-smoke | `node scripts/cwf-worker-sdk.mjs --run-id sdk-smoke --worker sdk-marker ...`; evidence includes SDK thread id and marker, or `sdk-unavailable`. |
| A4 | SDK worker is not claimed as left-sidebar visible or auto-callback capable. | local | Source audit over README/docs/skills/scripts. |
| A4b | Desktop-thread worker is not claimed as auto-injecting results into the originating conversation, and thread visibility is documented as explicit opt-in rather than default worker execution. | local | Source audit over README/docs/skills/scripts. |
| A5a | Desktop-thread worker preflight proves creation plus actual response marker after Ender GO. | real-smoke | App-server `thread/start` + `turn/start`; evidence records thread id and marker. |
| A5b | Desktop-thread preflight failure creates no sidebar noise and records `desktop-thread-execution-unavailable` with reason. | fixture | App-server unavailable/failing fixture in `npm run check`. |
| A6 | Heartbeat return either posts a final summary with an observed marker in the originating conversation, or records scheduled/scheduled-not-returned/unavailable status honestly. | local or real-smoke | Codex heartbeat automation evidence with observed marker, or scheduled/scheduled-not-returned/unavailable artifact with generated resume prompt. |
| A7 | Safe-write worker cannot apply without preview gate and approval. | fixture | Negative fixtures in `npm run check`. |
| A7b | Desktop-thread and SDK workers cannot bypass coordinator safe-write gate; their proposed patches require coordinator re-approval before apply. | fixture | Non-coordinator patch proposal fixture rejected or held for approval in `npm run check`. |
| A8 | Safe-write disposable target modifies only allowed files and records rollback after approval. | real-smoke | `/tmp` git repo smoke with `git apply --check`, apply, verification, changed files, rollback. |
| A9 | Verifier statuses block/pass/waive/advisory affect final status correctly. | fixture | `npm run check` verifier fixtures. |
| A10 | Budget and stop-rule missing/expensive-run cases fail closed or warn before dispatch. | fixture | `npm run check` budget fixtures. |
| A11 | Resume never jumps past an incomplete earlier phase. | fixture | `cwf-run-state` resume fixtures in `npm run check`. |
| A12 | Final result starts with plain Chinese conclusion and includes evidence paths. | local | `cwf result` or status/result helper output. |
| A13 | Package remains clean and old unrestricted runtime absent. | local | `npm pack --dry-run --json`; no old TypeScript runtime `src/` directory and no `tsconfig.json`. `package-lock.json` may exist if legitimate npm dependencies such as `@openai/codex-sdk` are added. |
| A14 | Reasonix/v4Pro review finds no unresolved blocker/high findings. | local | `reasonix run -m deepseek-v4-pro:cloud --effort high ...` review transcript or summary. |

## Phase Plan

### Phase 0: Contract Sync

Depends on:

- Current CWF docs and helpers on `main`.

Deliverables:

- Update this plan, README links, skill docs, and check guard.
- Goal prompt saved under `docs/goals/`.
- `scripts/check-core.mjs` guards this plan and goal prompt.
- Verify `workflows/repo-audit.workflow.js` exists and is package-included before using it in controller smoke.
- Update `package.json` files metadata only if needed for plan/goal packaging; do not add package `bin`.

Verification:

- `python3 /Users/sunny/.agents/skills/delivery-planner/scripts/check_delivery_doc.py docs/CWF_FULL_NATIVE_RUNTIME_PLAN.md`
- `python3 /Users/sunny/.agents/skills/goal-writer/scripts/check_goal_prompt.py docs/goals/CWF_FULL_NATIVE_RUNTIME_GOAL.md`
- Reasonix review.

### Phase 1: Run Controller

Depends on:

- Phase 0.

Deliverables:

- Start/status/result helper surface.
- Worker packet and normalized worker-result schema.
- Return envelope extended with `runtime_mode`, `heartbeat_status`, `sdk_thread_ids`, `desktop_thread_ids`.
- Controller smoke fixture under `fixtures/` or deterministic check code that validates run artifact creation without real workers.

Verification:

- Local fixture run creates all required artifacts.
- `npm run check`.

### Phase 2: Host-Native Subagent Adapter

Depends on:

- Phase 1 run state and worker-result schema.

Deliverables:

- Skill procedure that uses native Codex subagent tools when exposed.
- State update helper for recording host agent ids/results.
- Real-smoke repo-audit with two read-only explorers.

Verification:

- Real subagent evidence or honest `native-subagent-unavailable`.
- State artifact records agent ids/results when subagent smoke passes.

### Phase 3: SDK Background Adapter

Depends on:

- Phase 1 run state and worker-result schema.

Deliverables:

- SDK helper that starts a Codex SDK worker, records SDK id/result/status, and never claims sidebar visibility.
- Timeout, cancellation, and result normalization.
- SDK fixture path that does not require credentials.

Verification:

- SDK fixture for schema/state writes.
- Tiny SDK marker smoke when SDK credentials/model routing are available.
- Source audit for no auto-callback overclaim.

### Phase 4: Desktop-Thread Adapter

Depends on:

- Phase 1 run state and worker-result schema.

Deliverables:

- App-server stdio preflight and worker run helper.
- Visible-thread smoke after Ender GO.
- Fallback to inline/SDK or blocked status when unavailable.
- Failure fixture that records `desktop-thread-execution-unavailable` without creating a visible thread.

Verification:

- Thread id plus marker evidence, or honest blocked/unavailable status.
- Failure fixture passes in `npm run check`.

### Phase 5: Heartbeat Return

Depends on:

- Phase 1 return envelope.
- Phase 3 or any background result artifact.

Deliverables:

- Heartbeat scheduling procedure for the originating Codex conversation.
- `heartbeat_synthesis` return mode only after observed marker delivery.
- Resume prompt fallback when automation is unavailable.

Verification:

- Heartbeat smoke if current host supports it.
- Otherwise fixture plus explicit unavailable status.

### Phase 6: Safe-Write Runtime Integration

Depends on:

- Phase 1 run state.
- Phase 3/4 worker-result schema for non-coordinator patch proposals.

Deliverables:

- Safe-write worker connected to run controller.
- Patch/result artifacts under run dir.
- Disposable target smoke after approval.
- Non-coordinator patch proposal fixture proving SDK/Desktop-thread workers cannot apply directly.

Verification:

- Positive and negative safe-write fixtures.
- Non-coordinator bypass fixture.
- `/tmp` smoke after Ender GO.

### Phase 7: Verifier/Budget/Resume/Status Gates

Depends on:

- Phase 1 run state.
- Phase 6 safe-write integration.

Deliverables:

- Verifier statuses participate in final pass/block/waiver/advisory result.
- Budget and stop-rule fixtures block unbounded workflows.
- Resume fixtures cover partial, missing, skipped, failed, blocked, and completed phases.
- Human-readable status/result includes conclusion, evidence, next action, runtime mode, return mode, and verifier status.

Verification:

- `npm run check` verifier, budget, resume, and status fixtures.

### Phase 8: Dynamic Generation And Catalog Integration

Depends on:

- Phase 1 run controller.
- Phase 7 verifier/budget guard behavior.

Deliverables:

- Generated workflow can feed directly into start helper.
- Catalog and project-local workflows participate in runtime.
- Unsafe generated content fails closed.

Verification:

- Repo-audit and safe-fix-loop generated fixtures.

### Phase 9: End-To-End Runtime Smoke And Public Readiness

Depends on:

- Phases 1-8.

Deliverables:

- One read-only workflow using native subagents plus coordinator result.
- One background SDK workflow.
- One selected Desktop-thread worker after approval.
- One heartbeat or honest unavailable result.
- README/Chinese README/skill/docs updated to actual behavior.
- Release-readiness and comparison docs updated.
- Reasonix final review.

Verification:

- Evidence doc under `docs/evidence/`.
- `npm run check`
- `git diff --check`
- `npm pack --dry-run --json`
- Reasonix final review.

## Stop And Pause Conditions

Stop complete when all acceptance items are implemented, verified, and documented, or honestly deferred by platform/user-approval blocker with evidence.

Pause if:

- Any step needs a visible Desktop thread and Ender has not approved that exact smoke.
- Any step needs a real write outside disposable `/tmp`.
- SDK, app-server, heartbeat, or subagent APIs behave differently from docs and the fallback is not already defined.
- The implementation would require resurrecting the removed runtime, adding package `bin`, or executing workflow JS.

## Sources

- Official Codex SDK docs: https://developers.openai.com/codex/sdk
- Official Codex Subagents docs: https://developers.openai.com/codex/subagents
- Official Codex Workflows docs: https://developers.openai.com/codex/workflows
- Official Codex App Server docs: https://developers.openai.com/codex/app-server
- Official Codex Automations docs: https://developers.openai.com/codex/automations
