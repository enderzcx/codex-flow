---
half_life: 30d
archive_at: 2026-07-08
scope_type: roadmap
scope_name: cwf-completion
coverage: Complete roadmap and goal contracts for the remaining work after the native core, preview/state helpers, bounded dynamic contract, and adversarial template are already shipped.
not_complete_for: Hosted scheduler, workflow marketplace, non-Codex model routing, unrestricted JavaScript execution, production deployment, or full Claude Dynamic Workflows parity.
verification_level: local
real_smoke_status: inline_native_and_desktop_thread_passed_auto_callback_deferred
review_status: reviewed_with_findings_applied
reviewer: reasonix-v4pro
review_command: crb delegate --mode final-review failed because Reasonix CLI rejected forwarded --mode; fallback used reasonix run -m deepseek-v4-pro:cloud --effort high
review_notes: Reasonix requested safe-fix-loop inventory clarity and Phase 5 evidence-level split; both required changes are applied.
review_owner: Ender
review_due: 2026-06-09
---

# CWF Completion Roadmap

## Alignment Snapshot

This planning pass helps Ender and future Codex goal sessions finish the remaining CWF native workflow experience by producing a roadmap, PRD, SPEC, acceptance matrix, phase plan, and staged goal prompts, using the current `codex-workflows` repo and existing CWF plans as source of truth, while avoiding a return to the removed external runtime, unbounded agent swarm, or platform features Codex does not expose yet.

Building:

- Run-plan generation and persistence for `.cwf/runs/RUN_ID/run-plan.md`.
- A thin native runner adapter that turns a workflow template into preview, state, worker instructions, status, and final synthesis.
- Native fan-out smoke with read-only workers and verifier/challenger output.
- Optional Desktop-thread smoke after Ender GO.
- End-to-end proof across `repo-audit`, `adversarial-verify`, and a write-shaped `safe-fix-loop` fixture.
- Release-readiness checks for public docs, package contents, and CI.

Not building:

- No standalone CLI runtime or `src/` TypeScript runner.
- No package `bin` command.
- No YAML workflow registry.
- No unrestricted Node execution of workflow files.
- No hosted scheduler, workflow marketplace, or non-Codex model routing.
- No production deploy, credentials, payments, databases, permissions, or irreversible external systems.
- No claim of full Claude Dynamic Workflows parity.

Already complete:

- Native core reset: `skills/codex-workflows/SKILL.md`, `docs/*.md`, `workflows/*.workflow.js`, and `scripts/check-core.mjs`.
- Preview helper: `scripts/cwf-run-preview.mjs`.
- Run state helper: `scripts/cwf-run-state.mjs`.
- Project-local `.cwf/runs/RUN_ID/` state convention.
- Bounded dynamic workflow contract.
- `workflows/adversarial-verify.workflow.js`.
- Local package/check proof for 7 templates.

Template inventory:

- `workflows/adversarial-verify.workflow.js`: challenge/verify plans, claims, diffs, or artifacts.
- `workflows/classify-and-act.workflow.js`: classify heterogeneous items and route actions.
- `workflows/pipeline.workflow.js`: move items through ordered stages.
- `workflows/repo-audit.workflow.js`: read-only repo audit fan-out.
- `workflows/safe-fix-loop.workflow.js`: write-shaped bounded fix flow; current remaining roadmap uses it only as dry-run/fixture evidence unless a future goal explicitly approves writes.
- `workflows/tournament.workflow.js`: pairwise or comparative evaluation.
- `workflows/ui-copy-review.workflow.js`: UI/copy/design review.

Source of truth:

- `README.md`
- `README.zh-CN.md`
- `docs/CORE.md`
- `docs/RUN_EXPERIENCE.md`
- `docs/WORKFLOW_JS.md`
- `docs/NATIVE_RUNNER_ADAPTER_PLAN.md`
- `docs/BOUNDED_DYNAMIC_WORKFLOWS_PLAN.md`
- `skills/codex-workflows/SKILL.md`
- `scripts/cwf-run-preview.mjs`
- `scripts/cwf-run-state.mjs`
- `scripts/check-core.mjs`
- `workflows/*.workflow.js`

Plan hierarchy:

| Document | Role | Relationship |
|---|---|---|
| `docs/BOUNDED_DYNAMIC_WORKFLOWS_PLAN.md` | Product doctrine | Defines bounded dynamic workflow semantics and adversarial verification. |
| `docs/NATIVE_RUNNER_ADAPTER_PLAN.md` | Execution substrate | Defines preview, state, inline workers, Desktop-thread visibility, cancel/resume, and final synthesis. |
| `docs/CWF_COMPLETION_ROADMAP.md` | Remaining delivery roadmap | Combines both into staged implementation goals and evidence gates. |

Deliverables:

- PRD
- SPEC
- Evidence-bound acceptance matrix
- Phase plan
- Five staged `/goal` prompts

Phase scope:

- Roadmap-level contract for remaining CWF work.
- Complete for the next implementation sequence after commit `55d0c09`.
- Not a whole-product roadmap for scheduler/marketplace/non-Codex extensions.

Completeness:

- This document is complete for planning and staged goal handoff.
- It is not proof that native fan-out, Desktop-thread smoke, or automatic return are already implemented.

Verification level:

- Default: local.
- Native worker smoke: real-smoke when the host exposes native subagent/thread tools.
- Desktop-thread smoke: real-smoke only after Ender GO.
- No prod verification.

Review requirement:

- Reasonix/v4Pro review required before treating this roadmap as final.
- Current status: `reviewed_with_findings_applied`.

Open decisions:

- Whether native worker execution should be purely procedural in the skill or supported by a helper script that emits worker prompts/status artifacts.
- Whether `run-plan.md` should be generated by `cwf-run-state.mjs`, a new `cwf-run-plan.mjs`, or kept as main-session prose until a stable Codex API exists.
- Whether Desktop-thread smoke should happen in the same phase as native fan-out smoke or as a separate approval-gated phase.

Recommended defaults:

- Add a small `scripts/cwf-run-plan.mjs` helper only if it can stay data-only and not become a runtime.
- Keep worker spawning native/procedural in the Codex main session until Codex exposes a stable public workflow API.
- Split Desktop-thread smoke into its own goal to avoid polluting the sidebar during normal development.

## PRD

### Problem

CWF now has a strong public core and good contracts, but the user still has to manually translate a workflow template into a live run. The remaining gap is operational: CWF needs a reliable path from "I want a workflow" to "here is the scoped run plan, workers ran, verifier challenged, evidence passed, and the originating conversation got the final answer."

Without this, CWF is a good skill template library. With it, CWF becomes a usable Codex-native bounded dynamic workflow experience.

### Target Users

- Ender using Codex Desktop for repo audits, bug hunts, migration planning, UI/copy review, and adversarial verification.
- Future users installing the public `codex-flow` / `codex-workflows` repo as a Codex skill.
- Future Codex agents entering goal mode and needing exact boundaries instead of rediscovering the roadmap.

### Goals

- Generate a bounded run plan from a workflow template and user objective.
- Persist preview, state, run plan, final summary, and evidence under `.cwf/runs/RUN_ID/`.
- Run a native read-only fan-out workflow in the originating Codex conversation.
- Include an adversarial verifier/challenger before final synthesis for high-risk workflows.
- Optionally create a Desktop-thread worker only with explicit approval.
- Prove package/docs remain core-only and do not resurrect the old runtime.

### Non-Goals

- Do not implement hosted background jobs.
- Do not create a general JavaScript execution engine.
- Do not add a CLI command advertised as the main user interface.
- Do not use external model routing or Reasonix/MiMo as core worker infrastructure.
- Do not make every worker a left-sidebar thread.
- Do not claim production-grade Claude parity.

### User Stories

- As a user, I can ask CWF to audit a repo and first see the run plan in plain language.
- As a user, I can see which workers will run inline and which would need a Desktop thread.
- As a user, I can cancel or resume from saved project-local run state.
- As a user, I can see verifier/challenger conclusions before the final answer.
- As a user, I can approve a Desktop-thread smoke only when I actually want sidebar visibility.
- As a maintainer, I can run `npm run check` and package dry-run to prove the skill remains small and native.

### Success Criteria

- A goal session can implement each phase without opening a new design debate.
- Each phase has concrete allowed writes, forbidden paths, verification commands, and stop conditions.
- Local checks distinguish fixture/local proof from real Desktop-thread proof.
- The final state is a usable CWF MVP, not a revived old runtime.

## SPEC

### Completion Model

```text
request
  -> select/adapt workflow.js
  -> generate run-plan.md
  -> preview plan and state
  -> run native inline workers when host support exists
  -> run verifier/challenger
  -> update .cwf/runs/RUN_ID/state.json
  -> synthesize final.md
  -> answer in the originating Codex conversation
  -> optionally create Desktop thread after Ender GO
```

### Run Artifacts

Use project-local state only:

```text
.cwf/runs/RUN_ID/state.json
.cwf/runs/RUN_ID/preview.md
.cwf/runs/RUN_ID/run-plan.md
.cwf/runs/RUN_ID/final.md
.cwf/runs/RUN_ID/evidence.json
```

Artifacts must remain ignored by git and excluded from npm package output.

### Native Worker Contract

Native workers are not simulated by a standalone runtime. The main Codex session should create worker instructions from the run plan and use native subagent/thread tools when the host exposes them.

Worker instruction must include:

- role and phase;
- objective;
- source paths or inputs;
- read/write scope;
- quarantine boundary;
- expected output format;
- verification requirement;
- stop condition;
- return channel to originating conversation.

If native subagent tools are unavailable, the phase must stop with `native-worker-unavailable` instead of faking success.

### Desktop Thread Contract

Desktop-thread workers are optional visibility upgrades. They are not required for normal inline fan-out.

Create a Desktop thread only when:

- Ender explicitly says GO for the smoke, or
- a future user explicitly asks to inspect/continue a worker separately.

The smoke must record:

- thread id;
- target worker id;
- final marker;
- whether the result returned to the originating conversation manually or automatically.

If Codex Desktop cannot automatically post worker results back to the originating conversation, the acceptable MVP behavior is: main session reads/receives the worker output and summarizes it back. Do not claim platform-level automatic callback unless the host provides it.

### Automatic Return Contract

Same-conversation final output is required. Platform-level automatic return is not currently proven.

MVP return path:

- worker output is captured by the main session;
- final synthesis is written in the originating conversation;
- `.cwf/runs/RUN_ID/final.md` mirrors the human summary.

Future platform return:

- only implement after Codex exposes a stable API/event that can post or stream worker results into the originating thread;
- until then, mark as blocked or deferred, not failed product work.

### Safety Invariants

- No external runtime resurrection.
- No untrusted raw input to privileged workers.
- No overlapping write scopes.
- No external write, deploy, credential, database, payment, permission, or irreversible action.
- No mock/fixture evidence presented as real smoke.
- No Desktop-thread creation without explicit approval.
- No final PASS if verifier blocks or evidence is missing.

## Acceptance Matrix

| Phase | Criterion | Evidence | Level |
|---|---|---|---|
| 1 | Run-plan helper or procedure generates a bounded plan for `repo-audit`. | `node scripts/cwf-run-plan.mjs workflows/repo-audit.workflow.js --objective "audit this repo" --run-id smoke` or documented manual equivalent; inspect `.cwf/runs/smoke/run-plan.md`. | local |
| 1 | Run-plan output includes scope, exclusions, workers, verifier/challenger, quarantine, budget, stop rules, and evidence. | `rg -n "Scope|Exclusions|Workers|Verifier|Quarantine|Budget|Stop|Evidence" .cwf/runs/smoke/run-plan.md` | local |
| 1 | Run-plan artifacts stay out of git/package. | `git status --ignored --short .cwf`; `npm pack --dry-run --json` excludes `.cwf/`. | local |
| 2 | Native inline fan-out smoke is real or honestly blocked. | Run a `repo-audit` fan-out with native subagent tools; if unavailable, final status is `native-worker-unavailable` and no PASS is claimed. | real-smoke |
| 2 | Worker prompts include role, scope, quarantine, expected output, and return channel. | Inspect generated worker instruction artifacts or final evidence pack. | local |
| 3 | Adversarial verifier/challenger participates in final synthesis. | Run `adversarial-verify` smoke; final summary includes verifier conclusion and required changes/waivers. | real-smoke |
| 3 | Verifier blocker prevents done claim. | Fixture or smoke where verifier blocks; final output marks blocked, not complete. | fixture |
| 4 | Desktop-thread worker smoke only runs after Ender GO. | After Ender GO, record Codex Desktop thread id and final marker; otherwise leave `real_smoke_status=requires_approval`. | real-smoke |
| 4 | Automatic return is not overclaimed. | Evidence states whether return was manual main-session synthesis or platform automatic callback. | real-smoke |
| 5 | End-to-end evidence pack covers `repo-audit` read-only path. | Evidence pack records whether `repo-audit` was real native smoke or blocked as `native-worker-unavailable`. | real-smoke |
| 5 | End-to-end evidence pack covers `adversarial-verify`. | Fixture or real smoke includes verifier conclusion and required changes/waivers. | fixture |
| 5 | End-to-end evidence pack covers `safe-fix-loop` as write-shaped proof without touching real targets. | Dry-run/fixture proves write scope, verifier gate, and no real file writes unless a separate future goal explicitly approves writes. | dry-run |
| 5 | Core remains small and native. | `npm run check`; `git diff --check`; `npm pack --dry-run --json`; `for p in src package-lock.json tsconfig.json; do [ ! -e "$p" ] && echo "ABSENT $p"; done`. | local |

## Phase Plan

### Phase 1: Run-Plan Generation

Deliverables:

- Run-plan generation contract implemented in helper or skill procedure.
- `.cwf/runs/RUN_ID/run-plan.md` artifact.
- Preview includes run-plan path.
- Docs updated if behavior differs from this roadmap.

Verification:

- `repo-audit` run-plan fixture.
- `adversarial-verify` run-plan fixture.
- `npm run check`.
- `git diff --check`.

Stop condition:

- A non-trivial workflow can show a concrete run plan before any worker is spawned.

### Phase 2: Native Inline Worker Smoke

Deliverables:

- Worker instruction generation.
- Native read-only `repo-audit` fan-out smoke when host tools exist.
- Honest blocked path when native subagent tools are unavailable.
- Compact final synthesis in originating conversation.

Verification:

- Native smoke evidence or `native-worker-unavailable` blocker.
- Worker prompt/evidence artifact.
- No Desktop-thread creation.

Stop condition:

- CWF can either run real inline workers or clearly prove why the host cannot.

### Phase 3: Adversarial Verification Loop

Deliverables:

- `adversarial-verify` smoke.
- Verifier/challenger result merged into final synthesis.
- Blocker/waiver behavior documented in final output.

Verification:

- Verifier participates in one real or fixture run.
- Blocked verifier fixture prevents PASS.
- `npm run check`.

Stop condition:

- CWF can challenge its own output before claiming completion.

### Phase 4: Desktop Thread Visibility Smoke

Deliverables:

- Approval-gated Desktop-thread smoke.
- Thread id and final marker recorded.
- Return-path evidence distinguishes manual synthesis from platform automatic callback.

Verification:

- Only after Ender GO: create one visible thread.
- If Ender does not approve, keep `requires_approval` and do not claim Desktop proof.

Stop condition:

- Sidebar visibility is proven or explicitly deferred without blocking inline MVP.

### Phase 5: End-To-End MVP Evidence

Deliverables:

- Evidence pack for read-only, adversarial, and write-shaped dry-run paths.
- Explicit template inventory covering all 7 current workflow templates.
- Docs synced with actual behavior.
- Public package dry-run.
- Final status table.

Verification:

- `npm run check`
- `git diff --check`
- `npm pack --dry-run --json`
- negative guard for missing `run_experience`
- old-runtime absence check
- `repo-audit` evidence labeled real-smoke or blocked
- `adversarial-verify` evidence labeled fixture or real-smoke
- `safe-fix-loop` evidence labeled dry-run/fixture unless separate write approval exists

Stop condition:

- CWF can be described honestly as a native bounded dynamic workflow MVP with known limits.

## Goal Prompts

### Goal 1: Run-Plan Generation

```text
/goal
Outcome:
Implement CWF run-plan generation for /Users/sunny/Work/CODEX/codex-workflows so a non-trivial workflow can produce a bounded `.cwf/runs/RUN_ID/run-plan.md` before workers run. The run plan must include scope, exclusions, phases, workers, verifier/challenger role, visibility, write scopes, quarantine path, budget, stop rules, verification evidence, and resume checkpoint.

Source of truth:
- /Users/sunny/Work/CODEX/codex-workflows/docs/CWF_COMPLETION_ROADMAP.md
- /Users/sunny/Work/CODEX/codex-workflows/docs/BOUNDED_DYNAMIC_WORKFLOWS_PLAN.md
- /Users/sunny/Work/CODEX/codex-workflows/docs/RUN_EXPERIENCE.md
- /Users/sunny/Work/CODEX/codex-workflows/docs/WORKFLOW_JS.md
- /Users/sunny/Work/CODEX/codex-workflows/scripts/cwf-run-preview.mjs
- /Users/sunny/Work/CODEX/codex-workflows/scripts/cwf-run-state.mjs

Allowed writes:
- docs/*.md
- skills/codex-workflows/SKILL.md
- scripts/check-core.mjs
- optional scripts/cwf-run-plan.mjs
- optional scripts/cwf-run-state.mjs
- README.md
- README.zh-CN.md

Forbidden:
- Do not add src/ TypeScript runtime.
- Do not add package bin CLI.
- Do not execute workflow files as unrestricted Node.
- Do not commit .cwf/ run artifacts.
- Do not touch credentials, deploys, databases, payments, permissions, or external systems.

Verification:
- npm run check
- git diff --check
- npm pack --dry-run --json
- Generate run plan for workflows/repo-audit.workflow.js with run id fixture.
- Generate run plan for workflows/adversarial-verify.workflow.js with run id fixture.
- Confirm .cwf/ is ignored and excluded from package.

Constraints:
- Helper may parse workflow specs as plain data only.
- Run plan is a local contract, not a runtime.
- Keep current project-local `.cwf/runs/RUN_ID/` convention.

Iteration policy:
- Start with repo-audit fixture, then adversarial-verify fixture.
- Update docs only when behavior differs.
- Do not retry a broken parser path more than twice without changing the hypothesis.

Stop/Pause conditions:
- Stop when run-plan fixtures and package checks pass.
- Pause if implementing run-plan requires reviving the old runtime.
- Pause before any external write or Desktop-thread creation.
```

### Goal 2: Native Inline Worker Smoke

```text
/goal
Outcome:
Prove or honestly block CWF native inline worker execution for /Users/sunny/Work/CODEX/codex-workflows. A repo-audit workflow should either run real native Codex subagents and synthesize results in the originating conversation, or produce a clear `native-worker-unavailable` blocker without claiming success.

Source of truth:
- docs/CWF_COMPLETION_ROADMAP.md
- docs/NATIVE_RUNNER_ADAPTER_PLAN.md
- docs/RUN_EXPERIENCE.md
- skills/codex-workflows/SKILL.md
- workflows/repo-audit.workflow.js

Allowed writes:
- docs/*.md
- skills/codex-workflows/SKILL.md
- scripts/check-core.mjs
- optional helper scripts under scripts/
- README.md
- README.zh-CN.md

Forbidden:
- Do not create Desktop sidebar threads in this goal.
- Do not add external runtime, package bin, YAML registry, or src/ TypeScript runner.
- Do not touch production, credentials, databases, deploys, payments, permissions, or external writes.

Verification:
- npm run check
- git diff --check
- Generate/inspect run plan for repo-audit.
- Run native inline fan-out smoke if native subagent tools are available.
- If unavailable, record exact blocker and do not claim real-smoke pass.
- Final output must return to originating conversation.

Constraints:
- Inline workers are default.
- Worker instructions must include role, scope, quarantine, expected output, verification, and return channel.
- Mock/fixture evidence cannot be labeled as real native worker proof.

Iteration policy:
- Probe host capability first.
- Run the smallest read-only smoke.
- Stop after two same-root-cause native tool failures.

Stop/Pause conditions:
- Stop when real inline smoke passes or blocker is proven.
- Pause before Desktop-thread creation.
- Pause if implementation pressure pushes toward simulating workers with an external runtime.
```

### Goal 3: Adversarial Verification Loop

```text
/goal
Outcome:
Make CWF adversarial verification operational enough that `workflows/adversarial-verify.workflow.js` can participate in a real or fixture workflow run and prevent completion when verifier evidence blocks the result.

Source of truth:
- docs/CWF_COMPLETION_ROADMAP.md
- docs/BOUNDED_DYNAMIC_WORKFLOWS_PLAN.md
- workflows/adversarial-verify.workflow.js
- skills/codex-workflows/SKILL.md

Allowed writes:
- docs/*.md
- workflows/*.workflow.js
- skills/codex-workflows/SKILL.md
- scripts/check-core.mjs
- optional helper scripts under scripts/

Forbidden:
- Do not create Desktop threads unless Ender separately approves.
- Do not add external runtime or model routing.
- Do not treat verifier advisory notes as blockers unless evidence supports them.
- Do not touch credentials, deploys, databases, payments, permissions, or external writes.

Verification:
- npm run check
- git diff --check
- node scripts/cwf-run-preview.mjs workflows/adversarial-verify.workflow.js --format json
- Run one adversarial verification smoke or deterministic fixture.
- Demonstrate a blocked verifier case where final output does not claim PASS.

Constraints:
- Verifier/challenger output must be separated into required changes, waivers, advisories, and evidence gaps.
- Final synthesis must cite verifier conclusion.
- Missing evidence means blocked or partial, not done.

Iteration policy:
- Start with fixture if native worker tools are unavailable.
- Upgrade to real native smoke only when host support exists.
- Keep changes scoped to workflow/run-experience behavior.

Stop/Pause conditions:
- Stop when verifier can block completion and that behavior is evidenced.
- Pause if native tools are unavailable and no fixture can prove the behavior.
- Pause before external writes or Desktop-thread creation.
```

### Goal 4: Desktop Thread Visibility Smoke

```text
/goal
Outcome:
After explicit Ender GO, prove CWF can create exactly one selected Codex Desktop worker thread and record its thread id/final marker, while keeping final synthesis in the originating conversation. If Ender does not give GO or Codex Desktop thread APIs fail, keep Desktop proof marked `requires_approval` or blocked without claiming success.

Source of truth:
- docs/CWF_COMPLETION_ROADMAP.md
- docs/NATIVE_RUNNER_ADAPTER_PLAN.md
- docs/RUN_EXPERIENCE.md
- skills/codex-workflows/SKILL.md

Allowed writes:
- docs/*.md
- skills/codex-workflows/SKILL.md
- scripts/check-core.mjs
- optional helper scripts under scripts/

Forbidden:
- Do not create any Desktop sidebar thread until Ender explicitly says GO in the goal thread.
- Do not create more than one smoke thread.
- Do not mutate global Codex config.
- Do not add external runtime or package bin.
- Do not touch production, credentials, databases, payments, permissions, deploys, or external writes.

Verification:
- npm run check
- git diff --check
- If Ender GO: create one Codex Desktop thread through the available native/app-server path, record thread id and final marker.
- If no GO: leave `real_smoke_status=requires_approval` and do not claim real Desktop proof.
- Final evidence states whether result return was manual main-session synthesis or true platform automatic callback.

Constraints:
- Desktop threads are selective visibility, not default worker execution.
- Same-conversation final answer is required.
- Platform-level automatic callback must not be claimed unless observed.

Iteration policy:
- Probe API once before smoke.
- If smoke fails, retry at most once with a changed hypothesis.
- Update docs with exact current limitation.

Stop/Pause conditions:
- Stop after one successful smoke or a clear approval/API blocker.
- Pause immediately if thread creation would create sidebar noise without approval.
```

### Goal 5: End-To-End MVP Evidence And Release Readiness

```text
/goal
Outcome:
Assemble final CWF MVP evidence for /Users/sunny/Work/CODEX/codex-workflows: read-only repo-audit path, adversarial verification path, write-shaped safe-fix-loop dry-run/fixture path, docs synchronized with actual behavior, package dry-run clean, 7-template inventory, and final status table that states what is real, fixture, dry-run, approval-gated, or deferred.

Source of truth:
- docs/CWF_COMPLETION_ROADMAP.md
- docs/NATIVE_RUNNER_ADAPTER_PLAN.md
- docs/BOUNDED_DYNAMIC_WORKFLOWS_PLAN.md
- README.md
- README.zh-CN.md
- skills/codex-workflows/SKILL.md
- workflows/*.workflow.js
- scripts/*.mjs

Allowed writes:
- README.md
- README.zh-CN.md
- docs/*.md
- skills/codex-workflows/SKILL.md
- workflows/*.workflow.js
- scripts/check-core.mjs
- optional evidence docs under docs/

Forbidden:
- Do not add old runtime files: src/, package-lock.json, tsconfig.json.
- Do not add package bin CLI.
- Do not commit .cwf/ run artifacts.
- Do not perform production deploys or external writes.
- Do not claim real Desktop-thread proof without Ender GO evidence.

Verification:
- npm run check
- git diff --check
- npm pack --dry-run --json
- negative temp-copy removal of run_experience must fail check-core
- old-runtime absence check: src, package-lock.json, tsconfig.json absent
- evidence table for all 7 workflow templates
- repo-audit evidence labeled real-smoke or blocked
- adversarial-verify evidence labeled fixture or real-smoke
- safe-fix-loop evidence labeled dry-run/fixture unless separate write approval exists
- Reasonix/v4Pro final review or honest not_reviewed status with command/error

Constraints:
- Evidence labels must distinguish local, fixture, dry-run, real-smoke, and requires_approval.
- `safe-fix-loop` is write-shaped only in this goal; do not modify real target files unless a separate future goal explicitly approves writes.
- Public docs must not overclaim Claude parity.
- Keep CWF native and small.

Iteration policy:
- Verify first, then update docs.
- Apply or waive Reasonix required findings explicitly.
- Do not chase hosted scheduler/marketplace/non-Codex routing in this goal.

Stop/Pause conditions:
- Stop when checks pass, evidence table is complete, and review state is honest.
- Pause if real-smoke requires Ender approval not yet given.
- Pause if release-readiness requires publishing/tagging beyond local package dry-run.
```
