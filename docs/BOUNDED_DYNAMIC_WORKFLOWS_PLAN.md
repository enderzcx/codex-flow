---
half_life: 30d
archive_at: 2026-07-08
scope_type: phase
scope_name: bounded-dynamic-workflows
coverage: Complete delivery contract for making CWF closer to Claude-style dynamic workflows while staying native, bounded, and safe.
not_complete_for: Hosted scheduler, hundreds-agent swarm, external JS runtime, marketplace, non-Codex model routing, or full Claude Dynamic Workflows parity.
verification_level: local
real_smoke_status: requires_approval
review_status: approved
reviewer: reasonix-v4pro
review_command: crb review --background failed because Reasonix delegate rejected forwarded --mode; fallback used reasonix run -m deepseek-v4-pro:cloud --effort high --transcript /tmp/cwf-bounded-dynamic-review.jsonl
review_notes: Reasonix final review returned GO with no blocker/high findings; local evidence gaps it requested were npm pack dry run, negative run_experience guard, and old-runtime absence check, all verified in this delivery pass.
review_owner: Ender
review_due: 2026-06-09
---

# Bounded Dynamic Workflows Plan

## Alignment Snapshot

This planning pass helps Codex users get the useful parts of Claude Dynamic Workflows in CWF by producing a bounded dynamic workflow contract, updated core docs, an adversarial verification template, acceptance criteria, and a copy-ready goal prompt, using the current `codex-workflows` repo plus Anthropic's May 28, 2026 dynamic workflow announcement as source of truth, while avoiding an unbounded agent swarm or standalone runtime rebuild.

Building:

- CWF's product definition as a bounded dynamic workflow system.
- Scope-first run planning before any fan-out.
- Small dynamic run-plan generation from a saved template or current goal.
- Parallel native Codex subagents for independent work.
- Adversarial verifier workers as first-class workflow citizens.
- Token budget, preview, status, cancel, resume, and stop rules as mandatory run controls.
- Quarantine and privileged-boundary rules for untrusted input.
- Clear "when to use / when not to use" guidance.

Not building:

- No standalone Node orchestration runtime.
- No unrestricted workflow script execution.
- No default hundreds-agent swarm.
- No hidden background scheduler.
- No hosted workflow UI.
- No non-Codex model router.
- No production deploy or external write surface.

Source of truth:

- `README.md`
- `README.zh-CN.md`
- `docs/CORE.md`
- `docs/RUN_EXPERIENCE.md`
- `docs/WORKFLOW_JS.md`
- `skills/codex-workflows/SKILL.md`
- `workflows/*.workflow.js`
- `scripts/check-core.mjs`
- `docs/NATIVE_RUNNER_ADAPTER_PLAN.md`
- Anthropic announcement: `https://claude.com/blog/introducing-dynamic-workflows-in-claude-code`
- User-provided research summary in the current conversation, including the "loop > prompt" and "bounded dynamic workflow" conclusions.

Deliverables:

- PRD
- SPEC
- Evidence-bound acceptance matrix
- Phase plan
- Copy-ready `/goal` prompt

Phase scope:

- Phase-level plan for `bounded-dynamic-workflows`.
- Complete for the next implementable CWF phase after preview/state helpers.
- Not a complete CWF whole-product roadmap.

Verification level:

- Default: local.
- Real Desktop-thread smoke: requires Ender approval.
- No prod or external write verification in this phase.

Review requirement:

- Reasonix/v4Pro review required before treating this plan as final.
- Current status: `approved`.

Historical context:

- Earlier CWF work had a heavier CLI/runtime path, including a historical `cwf dynamic generate` Phase A implementation and global run store ideas.
- Current `main` has intentionally reset to the native core: no `src/`, no package bin, no TypeScript CLI runtime, and no YAML registry.
- This plan may borrow lessons from historical Phase A, but it must not assume that the old CLI/runtime still exists.
- If run-plan generation is implemented again, it must be rebuilt as a native helper/skill path in the current core, not by restoring the removed runtime.

State path relationship:

- Current core uses project-local `.cwf/runs/RUN_ID/` for preview/state helper artifacts.
- Older `~/.codex-workflows/runs/RUN_ID/` references are historical CLI-runner state and are not the current default.
- Future adapters may import or migrate old global run stores, but this phase should keep project-local `.cwf/` as the active convention.

Companion plan relationship:

- `docs/NATIVE_RUNNER_ADAPTER_PLAN.md` defines the thin native run experience: preview, local state, inline workers, selective Desktop threads, cancel/resume, and final same-conversation synthesis.
- This plan is layered on top: it defines the bounded dynamic doctrine, run-plan contract, adversarial verification template, and when CWF should be used.
- If the two plans conflict, keep the native runner adapter as the lower-level execution contract and this document as the higher-level workflow strategy.

Open decisions:

- Whether the first new implementation should generate run plans only in the main session or also save generated run plans under `.cwf/runs/RUN_ID/run-plan.md`.
- Whether adversarial verification should be mandatory for every non-trivial workflow or only for high-risk patterns.
- Whether Desktop-thread smoke should be rerun in this phase or deferred to the native runner adapter phase.

Recommended defaults:

- Save generated run plans as `.cwf/runs/RUN_ID/run-plan.md` for resume and audit when a run id exists.
- Require an adversarial verifier for repo audit, migration, safe-fix-loop, claim checking, and public/reusable docs.
- Keep Desktop-thread smoke approval-gated; do not create new sidebar threads by default.

## PRD

### Problem

Claude Dynamic Workflows made the core insight clear: the value is not just "more subagents." The value is moving orchestration into an explicit workflow layer that can scope, fan out, verify, iterate, preserve progress, and summarize one coordinated result.

CWF already has native workflow templates, preview, state helpers, and Codex subagent semantics. It also has historical lessons from an older Phase A `cwf dynamic generate` implementation, but that old CLI/runtime path is no longer present on current `main`. The current product still reads too much like "pick a template and run workers." To compete on the right axis, CWF needs a stronger bounded dynamic contract: dynamically produce a run plan for the current task, run only the workers that earn their cost, route untrusted input safely, and use adversarial verification before claiming completion.

### Target Users

- Ender and other Codex Desktop users running complex repo audits, bug hunts, migrations, research, and UI/copy reviews.
- Skill authors who want reusable workflow patterns without building a full external agent platform.
- Future CWF contributors who need a clear boundary between native Codex orchestration and standalone runtime creep.

### Goals

- Make "bounded dynamic workflow" the core CWF concept.
- Add explicit run-plan generation before non-trivial fan-out.
- Make adversarial verification a reusable template and default pattern for high-risk workflows.
- Strengthen docs and skill instructions around scope-first, budget-first, quarantine-first execution.
- Keep CWF native: main Codex session coordinates; subagents execute; final result returns to the originating conversation.

### Non-Goals

- Do not claim CWF has Claude's platform-level dynamic workflow engine.
- Do not pursue hundreds of agents as a success metric.
- Do not add unrestricted JavaScript execution.
- Do not resurrect the old TypeScript CLI runner.
- Do not make every worker a Desktop thread.
- Do not automate writes to deploys, credentials, payments, databases, permissions, or irreversible external systems.

### User Stories

- As a Codex user, I can ask for a workflow and first see the scope, pattern, workers, verifier, budget, and stop rules.
- As a Codex user, I can use CWF for big audits, migrations, bug hunts, and research without paying workflow overhead for trivial edits.
- As a Codex user, I can see which worker is the challenger/verifier, not just the implementer.
- As a Codex user, I can trust that raw web/issue/ticket/X input is not handed to privileged write workers.
- As a Codex user, I can resume or cancel a workflow without the system pretending partial work is complete.

### Success Criteria

- README, docs, and skill all define CWF as a bounded dynamic workflow system.
- `adversarial-verify.workflow.js` exists and passes `npm run check`.
- `check-core` mechanically guards the bounded dynamic contract.
- The next `/goal` can implement run-plan generation without changing scope again.
- Local validation proves docs/templates/package remain coherent.

## SPEC

### Product Model

CWF should behave like this:

```text
User goal
  -> scope first
  -> choose or draft workflow.js template
  -> generate bounded run plan
  -> preview cost, workers, verifier, quarantine, stop rules
  -> run native inline workers and selected Desktop-thread workers
  -> adversarially verify important claims or changes
  -> iterate only while stop conditions allow
  -> synthesize final answer in the originating conversation
```

The run plan is not an external runtime. It is a compact local contract produced by the main Codex session for the current task.

CWF adopts Claude's architecture insights: explicit orchestration, parallel fan-out, adversarial verification, progress preservation, and final synthesis. It does not adopt Claude's agent-count scale as the goal.

### Run Plan Contract

A generated run plan must include:

- user objective;
- selected or drafted workflow template;
- exact scope and out-of-scope areas;
- phases;
- planned workers and roles;
- which worker is verifier/challenger;
- visibility decisions;
- write scopes;
- untrusted input route;
- budget and stop rule;
- verification evidence required before closeout;
- resume checkpoint.

Small workflows may keep the run plan inline. Non-trivial workflows should write it under `.cwf/runs/RUN_ID/run-plan.md` when a run id exists. This is the current project-local convention, distinct from the historical global `~/.codex-workflows/runs/RUN_ID/` store used by the removed CLI runner.

### Pattern Defaults

Use CWF for:

- migration planning and migration slices;
- repo audit, release review, and risk scan;
- broad bug hunt or root-cause search;
- source-backed research with conflicting evidence;
- adversarial review of plans, diffs, claims, or public docs;
- safe-fix-loop with bounded write scope;
- tournament or multi-candidate evaluation.

Do not use CWF for:

- trivial edits;
- one command;
- one small file change;
- normal implementation that one Codex turn can finish;
- vague "make it better" tasks without verification;
- anything whose only success signal is taste.

### Verification Defaults

Every non-trivial workflow must identify at least one of:

- test command;
- package/check command;
- fixture;
- preview artifact;
- state artifact;
- browser screenshot;
- source citation;
- Desktop-thread id after Ender GO;
- Reasonix/v4Pro review result.

High-risk workflows require a verifier/challenger role before closeout.

### Safety Invariants

- Untrusted raw input goes only to read-only workers.
- Privileged workers receive sanitized summaries and approved write scopes.
- Workers that can write must inherit the current Codex permission model; CWF must not invent a stronger permission.
- Repeated no-progress loops stop after two same-root-cause attempts.
- Cancelled workflows are partial and must say so.
- Final synthesis always returns to the originating conversation.

### Error And Fallback Behavior

- If native subagents are unavailable, stop and say CWF cannot run natively in this host.
- If Desktop threads are unavailable, downgrade to inline only when safe.
- If a verifier blocks the result, report the blocker and do not claim completion.
- If budget pressure is high, pause before spawning more workers.
- If run state is missing, restart from the smallest safe checkpoint and say what evidence was lost.

## Acceptance Matrix

| Phase | Criterion | Evidence | Level |
|---|---|---|---|
| 1 | Core docs define CWF as bounded dynamic workflows, not generic multi-agent fan-out. | `rg -n "bounded dynamic|scope first|adversarial|unbounded agent swarm" README.md README.zh-CN.md docs/*.md skills/codex-workflows/SKILL.md` | local |
| 1 | Public docs state when CWF should and should not be used. | `rg -n "When To Use|Do not use|不适合|适合" README.md README.zh-CN.md skills/codex-workflows/SKILL.md` | local |
| 1 | Official Claude research input is cited without overclaiming parity. | `rg -n "Anthropic|Claude Dynamic Workflows|not.*parity|full Claude" docs/*.md README.md` | local |
| 1 | Historical Phase A and removed CLI/runtime are acknowledged without becoming dependencies. | `rg -n "historical|cwf dynamic generate|no package bin|no TypeScript CLI runtime|\\.cwf/runs" docs/BOUNDED_DYNAMIC_WORKFLOWS_PLAN.md` | local |
| 2 | `adversarial-verify` workflow template exists and is package-included. | `node scripts/cwf-run-preview.mjs workflows/adversarial-verify.workflow.js`; `npm pack --dry-run --json` | local |
| 2 | `adversarial-verify` uses current `.workflow.js` harness schema, not old YAML. | `node scripts/cwf-run-preview.mjs workflows/adversarial-verify.workflow.js --format json`; `npm run check` | local |
| 2 | `check-core` rejects loss of required workflow run controls. | `npm run check`; negative temp-copy removal of `run_experience` still fails. | fixture |
| 3 | Run-plan generation contract is documented with allowed state path. | `rg -n "run-plan.md|Run Plan Contract|generated run plan" docs/*.md skills/codex-workflows/SKILL.md` | local |
| 3 | Quarantine boundary is documented for untrusted sources and privileged workers. | `rg -n "raw.*read-only|sanitized summaries|privileged" docs/*.md skills/codex-workflows/SKILL.md` | local |
| 4 | Real native fan-out is proven only after host support is available. | Native subagent smoke with verifier result in originating conversation; if unavailable, mark blocked. | real-smoke |
| 4 | Desktop-thread smoke is not claimed without Ender GO. | After Ender GO, record thread id and final marker; otherwise `real_smoke_status=requires_approval`. | real-smoke |

## Phase Plan

### Phase 1: Contract Sync

Deliverables:

- README / zh README bounded dynamic wording.
- CORE / RUN_EXPERIENCE / WORKFLOW_JS updates.
- Skill instruction updates.
- This plan.

Verification:

- `npm run check`
- `git diff --check`
- `rg` source audit for bounded dynamic terms.

Stop condition:

- CWF reads as "bounded dynamic workflow" across public docs and skill docs.

### Phase 2: Adversarial Template

Deliverables:

- `workflows/adversarial-verify.workflow.js`
- `scripts/check-core.mjs` coverage for the new template.
- README template list update.

Verification:

- `node scripts/cwf-run-preview.mjs workflows/adversarial-verify.workflow.js`
- `npm run check`
- `npm pack --dry-run --json`

Stop condition:

- Adversarial verification is a real workflow template, not only prose.

### Phase 3: Run-Plan Generation

Deliverables:

- Generated run-plan contract in docs and skill.
- Optional helper support for `.cwf/runs/RUN_ID/run-plan.md`.
- Preview includes verifier/challenger role when present.
- Explicit non-dependency on the removed `cwf dynamic generate` CLI/runtime path.

Verification:

- Run-plan fixture for `repo-audit`.
- Run-plan fixture for `adversarial-verify`.
- State artifact contains preview and run-plan path.
- `for p in src package-lock.json tsconfig.json; do [ ! -e "$p" ] && echo "ABSENT $p"; done`

Stop condition:

- A future goal can run scope -> run-plan -> preview -> worker fan-out without inventing new fields or restoring the old runtime.

### Phase 4: Native Smoke

Deliverables:

- One read-only native fan-out smoke.
- One adversarial verification smoke.
- Optional Desktop-thread smoke after Ender GO.

Verification:

- Native subagent results return to originating conversation.
- Verifier/challenger result is included before final synthesis.
- Desktop-thread id is recorded only if approved.

Stop condition:

- CWF demonstrates the Claude-inspired shape at small scale without claiming full Claude parity.

## Goal Prompt

```text
/goal
Outcome:
Upgrade /Users/sunny/Work/CODEX/codex-workflows from "native workflow templates plus preview/state helpers" into a bounded dynamic workflow core: docs and skill define scope-first run planning, adversarial verification, budget/quarantine/stop rules, and safe same-conversation synthesis; the repo includes an adversarial verification workflow template; local checks prove the public package remains native and core-only.

Source of truth:
- /Users/sunny/Work/CODEX/codex-workflows/docs/BOUNDED_DYNAMIC_WORKFLOWS_PLAN.md
- /Users/sunny/Work/CODEX/codex-workflows/docs/NATIVE_RUNNER_ADAPTER_PLAN.md
- /Users/sunny/Work/CODEX/codex-workflows/README.md
- /Users/sunny/Work/CODEX/codex-workflows/README.zh-CN.md
- /Users/sunny/Work/CODEX/codex-workflows/docs/CORE.md
- /Users/sunny/Work/CODEX/codex-workflows/docs/RUN_EXPERIENCE.md
- /Users/sunny/Work/CODEX/codex-workflows/docs/WORKFLOW_JS.md
- /Users/sunny/Work/CODEX/codex-workflows/skills/codex-workflows/SKILL.md
- /Users/sunny/Work/CODEX/codex-workflows/workflows/*.workflow.js
- Official research input: https://claude.com/blog/introducing-dynamic-workflows-in-claude-code

Historical context:
- Older CWF work included `cwf dynamic generate` and a global run store, but current main has reset to the native core and removed the TypeScript CLI/runtime.
- Do not depend on historical `src/dynamic-workflow-generator.ts` or `~/.codex-workflows/runs/RUN_ID/`.
- Use current project-local `.cwf/runs/RUN_ID/` for any new run-plan/state artifacts.

Allowed writes:
- README.md
- README.zh-CN.md
- docs/*.md
- skills/codex-workflows/SKILL.md
- workflows/*.workflow.js
- scripts/check-core.mjs
- package.json only if package file inclusion must change

Forbidden:
- Do not resurrect src/ TypeScript runtime.
- Do not add package bin CLI.
- Do not execute workflow files as unrestricted Node programs.
- Do not add hosted scheduler, marketplace, or non-Codex model routing.
- Do not create new Desktop sidebar threads unless Ender explicitly says GO for smoke.
- Do not touch credentials, deploys, payments, databases, permissions, or irreversible external systems.
- Do not claim full Claude Dynamic Workflows parity.

Verification:
1. Core checks:
   - npm run check
   - git diff --check
   - npm pack --dry-run --json
   - for p in src package-lock.json tsconfig.json; do [ ! -e "$p" ] && echo "ABSENT $p"; done
2. Source audit:
   - rg -n "bounded dynamic|scope first|adversarial|unbounded agent swarm" README.md README.zh-CN.md docs/*.md skills/codex-workflows/SKILL.md
   - rg -n "run-plan.md|Run Plan Contract|generated run plan" docs/*.md skills/codex-workflows/SKILL.md
3. Template proof:
   - node scripts/cwf-run-preview.mjs workflows/adversarial-verify.workflow.js
   - node scripts/cwf-run-preview.mjs workflows/adversarial-verify.workflow.js --format json
4. Negative guard:
   - In a temp copy, remove run_experience from one workflow and confirm node scripts/check-core.mjs fails.
5. Review:
   - Run Reasonix/v4Pro final review for the delivery plan or mark review_status honestly if the bridge fails.

Constraints:
- CWF stays native: Codex main session coordinates, native subagents execute, final answer returns to originating conversation.
- Bounded dynamic workflow means small run plans, explicit budgets, and hard stop conditions.
- Adversarial verification is required for high-risk workflows, not for trivial edits.
- Untrusted raw input cannot reach privileged write/deploy/payment/database/credential/permission actors.
- Mock/fixture/local evidence must not be presented as real Desktop or production proof.

Iteration policy:
- Work in small phases: docs contract -> adversarial template -> check-core guard -> validation -> Reasonix review.
- After each phase, run the smallest relevant check.
- Apply required Reasonix findings or mark them as waived with reason.
- Do not retry the same failing command more than twice without changing the hypothesis.

Stop/Pause conditions:
- Stop when local verification passes and the plan review is reviewed or honestly marked not_reviewed/skipped.
- Pause if native subagent smoke is required but host tools are unavailable.
- Pause before creating Desktop threads unless Ender gives explicit GO.
- Pause if the implementation starts drifting toward a standalone runtime or unbounded agent swarm.
- Pause before any external write, deploy, credential, database, payment, permission, or production action.
```
