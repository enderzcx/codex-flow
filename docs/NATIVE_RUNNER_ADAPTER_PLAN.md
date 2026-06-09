---
half_life: 30d
archive_at: 2026-07-08
scope_type: phase
scope_name: native-runner-adapter
coverage: Complete delivery contract for the next CWF phase that turns the current skill + workflow.js templates into a thin native run experience.
not_complete_for: Full Claude Dynamic Workflows parity, hosted scheduler, external CLI runtime, workflow marketplace, production app-store release, or non-Codex model routing.
verification_level: local
real_smoke_status: requires_approval
review_status: reviewed_with_findings_applied
reviewer: reasonix-v4pro
review_command: crb delegate --mode final-review --input docs/NATIVE_RUNNER_ADAPTER_PLAN.md failed because Reasonix CLI rejected forwarded --mode; fallback used reasonix run -m deepseek-v4-pro:cloud --effort high
review_notes: Reasonix approved with required clarifications; ratified defaults, auto visibility, preview skip, checkpoint resume, quarantine, timeout, and gitignore evidence are applied.
review_owner: Ender
review_due: 2026-06-09
---

# Native Runner Adapter Plan

## Alignment Snapshot

This planning pass helps Codex users run CWF as a native dynamic workflow experience by producing a PRD, SPEC, acceptance matrix, phase plan, and goal prompt for a thin runner adapter, using the current CWF core docs and workflow templates as source of truth, while avoiding a standalone CLI/runtime rebuild.

Building:

- A thin native runner adapter that interprets `workflows/*.workflow.js` specs inside the Codex main session.
- Harness preview before non-trivial runs.
- Compact status reporting during long runs.
- `visibility` routing: default inline subagents, selective Desktop threads for long/writable/follow-up-worthy workers.
- Run state artifacts that support cancel/resume semantics without becoming a new database product.
- Verification gates proving native subagent fan-out, Desktop-thread creation when selected, package cleanliness, and docs/skill sync.

Not building:

- No standalone Node workflow runtime.
- No YAML registry.
- No safePatch engine as the default path.
- No hosted scheduler or recurring `/loop`.
- No workflow marketplace.
- No full `/workflows` UI clone.
- No automatic model routing beyond what native Codex subagents already support.

Source of truth:

- `README.md`
- `README.zh-CN.md`
- `docs/CORE.md`
- `docs/WORKFLOW_JS.md`
- `docs/RUN_EXPERIENCE.md`
- `skills/codex-workflows/SKILL.md`
- `workflows/*.workflow.js`
- `scripts/check-core.mjs`
- Codex app-server v2 protocol evidence from the left-sidebar smoke thread `019ea506-e05d-74b3-a747-d0ec552d2f4b`

Workflow templates in scope:

- `workflows/adversarial-verify.workflow.js`
- `workflows/code-review.workflow.js`
- `workflows/classify-and-act.workflow.js`
- `workflows/pipeline.workflow.js`
- `workflows/repo-audit.workflow.js`
- `workflows/safe-fix-loop.workflow.js`
- `workflows/tournament.workflow.js`
- `workflows/ui-copy-review.workflow.js`

Deliverables:

- PRD
- SPEC
- Evidence-bound acceptance matrix
- Phase plan
- Copy-ready `/goal` prompt

Phase scope:

- Phase-level plan for `native-runner-adapter`.
- Complete for the next implementable phase.
- Not a complete CWF whole-product roadmap.

Verification level:

- Default: local.
- Real smoke: requires Ender approval for creating another visible Desktop thread.
- No prod surface.

Review requirement:

- Reasonix/v4Pro review required before treating this as final.
- Current status: `reviewed_with_findings_applied`.

Ratified decisions:

- Local run state uses `.cwf/runs/RUN_ID/`, and `.cwf/` is ignored.
- First implementation supports all eight templates mechanically.
- First real smoke validates `repo-audit` as the read-only path and one selected Desktop-thread workflow only after Ender GO.
- Existing left-sidebar thread evidence is sufficient for plan-level proof; implementation still needs a fresh smoke before claiming adapter-level Desktop proof.

## PRD

### Problem

CWF now has the right core: a native Codex skill, readable `workflow.js` templates, budget/quarantine/visibility contracts, and run experience docs. But the product still depends on the main agent manually following those contracts. It does not yet provide a repeatable run shape with preview, status, cancel/resume semantics, and selected Desktop-thread visibility.

This gap makes CWF useful as a design pattern, but weaker than Claude Dynamic Workflows as an actual repeatable experience.

### Target Users

- Ender / AI-native builders using Codex Desktop for complex coding, review, docs, UI/copy, research, and evaluation tasks.
- Codex users who want Claude-like dynamic workflows without installing a separate agent platform.
- Skill authors who want reusable workflow templates that remain adaptable per task.

### Goals

- Make CWF runnable as a native Codex workflow experience from a skill contract.
- Preserve the main conversation as the coordinator and final result destination.
- Keep worker output compact unless a worker is intentionally promoted to a Desktop thread.
- Make preview/status/cancel/resume behavior explicit and testable.
- Keep the implementation thin and reversible.

### Non-Goals

- Do not rebuild the deleted TypeScript CLI runner.
- Do not execute workflow files with unrestricted Node.
- Do not add a hosted scheduler or recurring automation.
- Do not make every worker a left-sidebar thread.
- Do not claim full Claude Dynamic Workflows parity.
- Do not ship unsafe write automation outside native Codex permissions.

### User Stories

- As a Codex user, I can ask CWF to run a repo audit and see a preview of phases, workers, visibility, budget, and stop conditions before it starts.
- As a Codex user, I can let short explorer workers run inline without polluting the sidebar.
- As a Codex user, I can promote a long or writable worker to a Desktop thread when I may want to inspect or continue it separately.
- As a Codex user, I can see compact workflow status without reading raw worker logs.
- As a Codex user, I can cancel a workflow and get a truthful partial summary.
- As a Codex user, I can resume from saved local state or be told when state is insufficient.

### Success Criteria

- A representative read-only workflow can run end-to-end with preview, inline worker fan-out, status, and final synthesis.
- A selected `desktop-thread` or `auto` worker can create a Codex Desktop thread when explicitly approved for smoke.
- Run state is inspectable locally and contains enough data for cancel/resume semantics.
- `npm run check` and package dry-run continue to prove that CWF stays core-only.
- Docs and skill behavior describe the same model.

## SPEC

### Runtime Model

CWF remains a native skill-driven system:

```text
User asks for CWF
  -> main Codex session selects or drafts workflow.js
  -> adapter parses workflow spec as data
  -> adapter builds preview
  -> main session confirms scope or proceeds when obvious
  -> adapter spawns inline native subagents
  -> adapter optionally starts Desktop-thread workers
  -> adapter records compact run state
  -> main session synthesizes final result
```

The adapter is not a standalone AI runtime. It is a small helper layer for repeatable preview/status/state behavior.

### Suggested Files

Allowed implementation paths:

- `scripts/check-core.mjs`
- `skills/codex-workflows/SKILL.md`
- `docs/*.md`
- `workflows/*.workflow.js`
- optional `scripts/cwf-run-preview.mjs`
- optional `scripts/cwf-run-state.mjs`
- optional `.gitignore` update for `.cwf/`

Forbidden by default:

- `src/` TypeScript runtime resurrection
- YAML workflow registry
- package `bin` CLI surface
- unrestricted Node execution of workflow files
- production deploys
- global Codex config mutation
- credentials, payments, databases, or external write systems

### Workflow Spec Contract

Every workflow template must include:

- `name`
- `goal`
- `pattern`
- `budget.max_tokens`
- `budget.stop_when`
- `run_experience.preview`
- `run_experience.status`
- `run_experience.cancel`
- `run_experience.resume`
- `run_experience.final_output`
- `phases`
- `visibility`
- `stop_conditions`
- `quarantine_rules`
- `visibility_policy`

`scripts/check-core.mjs` remains the mechanical guard.

### Preview Contract

Preview must show:

- workflow name and pattern;
- phases;
- planned agents and agent types;
- visibility decisions;
- write scopes;
- token budget and stop rule;
- quarantine rules;
- verification surface;
- stop/pause conditions.

Preview may be skipped only when:

- the workflow is small and read-only;
- the user explicitly asked to run immediately;
- no Desktop-thread or write worker is planned.

Small means all of these are true:

- phase count is 3 or less;
- planned worker count is 5 or less;
- `budget.max_tokens` is 100000 or less;
- no worker has a non-empty write scope;
- no worker has `visibility: "desktop-thread"`;
- no untrusted raw content is routed to privileged workers.

### Status Contract

Status must be compact:

- run id;
- current phase;
- worker counts: planned / running / completed / blocked;
- elapsed time;
- budget pressure;
- current blocker;
- last verified evidence.

Raw worker logs remain out of the main conversation unless the user asks.

### State Contract

Use local state only:

```text
.cwf/runs/RUN_ID/state.json
.cwf/runs/RUN_ID/preview.md
.cwf/runs/RUN_ID/final.md
```

State should include:

- workflow name;
- selected template path;
- user objective;
- start time / update time;
- phases and statuses;
- worker ids and visibility;
- Desktop thread ids when created;
- output summaries;
- verification evidence;
- cancel/resume markers.

`.cwf/` should be ignored and not packaged.

### Desktop Thread Contract

Default worker visibility is `inline`.

Create a Desktop thread only when:

- workflow says `visibility: "desktop-thread"`;
- the user explicitly asks to see a worker in the sidebar;
- a smoke test has explicit approval to create a visible thread.

For `visibility: "auto"`, resolve to `desktop-thread` when any of these are true:

- `budget.max_tokens` is greater than 50000;
- any planned worker has a non-empty `write_scope`;
- any phase id, phase label, worker id, or worker prompt matches `deploy`, `release`, `migrate`, or `publish`;
- the user explicitly asks to inspect, continue, or hand off that worker separately.

Otherwise, `visibility: "auto"` resolves to `inline`.

Desktop-thread creation must use Codex app-server `thread/start` + `turn/start` when available. If unavailable, fall back to inline only and report that Desktop visibility is unavailable.

### Cancel Contract

Cancel does not mean success.

On cancel:

- stop spawning new workers;
- record cancelled status;
- preserve completed outputs;
- summarize confirmed evidence and incomplete areas;
- do not run write/deploy follow-ups.

### Resume Contract

Resume must use saved state if available.

The smallest safe checkpoint is the last fully completed phase boundary recorded in state. If no phase completed cleanly, the smallest safe checkpoint is Phase 1.

If state is complete enough:

- continue from the phase after the last completed phase boundary;
- do not rerun completed workers unless their inputs changed.

If state is incomplete:

- say state is insufficient;
- restart from Phase 1 or from the last fully completed phase boundary if it is recorded and input hashes still match.

### Quarantine Contract

If a workflow reads untrusted content:

- raw readers are read-only;
- privileged workers receive sanitized summaries;
- write/deploy/payment/database/credential/permission/external actions require explicit user approval;
- verification must record whether raw untrusted text reached any actor.

### Error And Fallback Behavior

- Native subagents unavailable: stop and report CWF cannot run natively in this host.
- Desktop thread unavailable: continue inline only if safe and report downgraded visibility.
- Worker timeout or failure: mark worker blocked and synthesize partial evidence.
- Worker timeout or failure fallback must be visible in status and final output; the workflow may continue only if later phases do not depend on the blocked worker.
- Verification failure: do not claim done.
- Repeated same blocker: pause for user after two no-progress attempts.

## Acceptance Matrix

| Phase | Criterion | Evidence | Level |
|---|---|---|---|
| 1 | Core docs describe preview/status/cancel/resume consistently. | `rg -n "Run Experience|preview|cancel|resume" README.md README.zh-CN.md docs/*.md skills/codex-workflows/SKILL.md` | local |
| 1 | Every workflow template has `run_experience`, `budget`, `quarantine_rules`, and `visibility_policy`. | `npm run check` | local |
| 1 | Missing `run_experience` fails mechanical validation. | Negative test: remove `run_experience` in temp copy and run `node scripts/check-core.mjs`; expect non-zero. | fixture |
| 1 | Package contains only core skill/docs/workflows/scripts. | `npm pack --dry-run --json` and inspect file list. | local |
| 1 | Old runtime paths stay absent. | `for p in src tests fixtures dist .superx; do [ ! -e "$p" ] && echo ABSENT "$p"; done` | local |
| 1 | Preview artifact can be generated for at least one workflow. | Run the preview helper or documented manual preview against `workflows/repo-audit.workflow.js`. | local |
| 1 | Preview skip has a falsifiable threshold. | Fixture shows preview skipped only when phases <= 3, workers <= 5, budget <= 100000, read-only, no Desktop thread, and no privileged raw-content path. | fixture |
| 2 | `.cwf/` state is ignored and excluded from package. | `grep -q '^\\.cwf/' .gitignore && echo "IGNORED .cwf/"`; `npm pack --dry-run --json` excludes `.cwf/`. | local |
| 2 | Cancel semantics do not claim completion. | Simulated run state marked cancelled and final summary separates known evidence from incomplete work. | fixture |
| 2 | Resume uses the smallest safe checkpoint. | Simulated run state resumes from the phase after the last completed phase boundary; if no completed phase exists, it restarts Phase 1. | fixture |
| 3 | Inline worker fan-out can run without creating sidebar noise. | Native subagent smoke with two explorer workers, final synthesis in originating conversation. | local |
| 3 | Untrusted content stays quarantined. | Fixture proves raw untrusted text reaches read-only workers only; privileged/write workers receive sanitized summaries. | fixture |
| 3 | Worker timeout/failure fallback is explicit. | Fixture marks one worker blocked, status reports the blocker, and final output does not claim complete evidence. | fixture |
| 4 | `visibility: "auto"` resolves deterministically. | Fixture covers token budget > 50000, non-empty write scope, deploy/release/migrate/publish label, explicit user inspection request, and default inline fallback. | fixture |
| 4 | Desktop-thread worker path works when explicitly approved. | After Ender GO, run Codex app-server `thread/start` + `turn/start` smoke and record thread id + final marker. | real-smoke |
| 5 | End-to-end proof covers read-only and write-shaped workflows. | Run `repo-audit` read-only smoke and `safe-fix-loop` dry-run or fixture smoke with evidence pack. | local |

## Phase Plan

### Phase 1: Contract And Preview

Deliverables:

- `docs/NATIVE_RUNNER_ADAPTER_PLAN.md`
- preview contract in docs/skill
- optional preview helper script

Verification:

- `npm run check`
- `npm pack --dry-run --json`
- preview output for one workflow

Stop condition:

- Preview shows phases, workers, visibility, budget, quarantine, and stop conditions.

### Phase 2: Local Run State

Deliverables:

- local ignored `.cwf/runs/RUN_ID/` state format
- state read/write helper
- cancel/resume state semantics

Verification:

- fixture run state can transition planned -> running -> completed / cancelled / blocked
- `grep -q '^\\.cwf/' .gitignore && echo "IGNORED .cwf/"`
- `.cwf/` is excluded from package

Stop condition:

- State is useful enough for status and resume without becoming a product database.

### Phase 3: Inline Native Workers

Deliverables:

- main-session procedure or helper for running inline subagents from workflow specs
- compact status summary
- final synthesis format

Verification:

- local read-only workflow smoke with native explorer fan-out
- final answer includes pattern, workers, evidence, blockers

Stop condition:

- Inline CWF feels useful without side effects or sidebar noise.

### Phase 4: Selective Desktop Threads

Deliverables:

- Desktop-thread adapter using Codex app-server when available
- `visibility: "desktop-thread"` and `auto` decision handling
- graceful inline fallback

Verification:

- real-smoke after Ender GO: create one visible thread, get final marker, record thread id
- no default creation for short inline explorers
- fixture proves `visibility: "auto"` routes by budget, write scope, deploy/release/migrate/publish labels, and explicit inspection request

Stop condition:

- Sidebar stays clean, and visible workers are intentional.

### Phase 5: End-To-End Proof

Deliverables:

- one repo-audit read-only run
- one safe-fix-loop dry-run or fixture run
- evidence pack
- docs updates if behavior differs from plan

Verification:

- `npm run check`
- `npm pack --dry-run --json`
- `git diff --check`
- native subagent smoke
- quarantine fixture
- timeout/failure fixture
- optional Desktop-thread smoke with approval

Stop condition:

- CWF has a credible MVP run experience without resurrecting the old runtime.

## Goal Prompt

```text
/goal
Outcome:
Implement the CWF native runner adapter MVP for /Users/sunny/Work/CODEX/codex-workflows so the current skill + workflow.js templates can run with a repeatable native experience: preview before non-trivial runs, compact status, local run state, cancel/resume semantics, inline native subagents by default, and selective Codex Desktop threads only when visibility requires it. Keep the final synthesis in the originating Codex conversation.

Source of truth:
- /Users/sunny/Work/CODEX/codex-workflows/docs/NATIVE_RUNNER_ADAPTER_PLAN.md
- /Users/sunny/Work/CODEX/codex-workflows/docs/CORE.md
- /Users/sunny/Work/CODEX/codex-workflows/docs/RUN_EXPERIENCE.md
- /Users/sunny/Work/CODEX/codex-workflows/docs/WORKFLOW_JS.md
- /Users/sunny/Work/CODEX/codex-workflows/skills/codex-workflows/SKILL.md
- /Users/sunny/Work/CODEX/codex-workflows/workflows/*.workflow.js

Ratified decisions:
- Local run state is .cwf/runs/RUN_ID/.
- .cwf/ must be gitignored and excluded from npm package output.
- Implement all eight existing workflow templates mechanically: adversarial-verify, code-review, classify-and-act, pipeline, repo-audit, safe-fix-loop, tournament, and ui-copy-review.
- First read-only proof uses repo-audit.
- Write-shaped proof uses safe-fix-loop dry-run or fixture smoke.
- Desktop-thread real smoke requires explicit Ender GO; existing left-sidebar evidence is plan-level proof only.

Allowed writes:
- README.md
- README.zh-CN.md
- docs/*.md
- skills/codex-workflows/SKILL.md
- workflows/*.workflow.js
- scripts/check-core.mjs
- optional scripts/cwf-run-preview.mjs
- optional scripts/cwf-run-state.mjs
- optional .gitignore entry for .cwf/

Forbidden:
- Do not resurrect src/ TypeScript runtime.
- Do not add a package bin CLI or standalone Node workflow runner.
- Do not add YAML workflow registry.
- Do not execute workflow files as unrestricted Node programs.
- Do not commit .cwf/, .superx/, or run artifacts.
- Do not mutate global Codex config.
- Do not touch credentials, payments, databases, deploys, permissions, or irreversible external systems.
- Do not create a new visible Codex Desktop thread unless Ender explicitly says GO for that smoke.

Verification:
1. Mechanical core:
   - npm run check
   - npm pack --dry-run --json
   - git diff --check
   - for p in src tests fixtures dist .superx; do [ ! -e "$p" ] && echo "ABSENT $p" || exit 1; done
   - grep -q '^\\.cwf/' .gitignore && echo "IGNORED .cwf/"
2. Negative checks:
   - In a temp copy, remove run_experience from one workflow and confirm node scripts/check-core.mjs fails.
   - In a temp copy, remove budget or quarantine_rules from one workflow and confirm node scripts/check-core.mjs fails.
3. Preview:
   - Generate or manually produce a preview for workflows/repo-audit.workflow.js showing pattern, phases, agents, visibility, budget, quarantine, and stop conditions.
   - Prove preview skip happens only when phases <= 3, workers <= 5, budget <= 100000, read-only, no desktop-thread, and no privileged raw-content path.
4. Local state:
   - Demonstrate a fixture run state with planned/running/completed and cancelled or blocked transitions.
   - Confirm .cwf/ is ignored or otherwise excluded from package/git.
   - Demonstrate resume from the phase after the last completed phase boundary; if no phase completed cleanly, restart from Phase 1.
5. Native execution:
   - Run one read-only native subagent fan-out smoke and return compact synthesis in the originating conversation.
   - Demonstrate quarantine: raw untrusted text reaches read-only workers only; privileged/write workers receive sanitized summaries.
   - Demonstrate timeout/failure fallback: blocked worker is visible in status and final output does not claim full completion.
6. Auto visibility:
   - Demonstrate auto routes to desktop-thread when budget.max_tokens > 50000.
   - Demonstrate auto routes to desktop-thread when any worker has non-empty write_scope.
   - Demonstrate auto routes to desktop-thread when phase or prompt mentions deploy, release, migrate, or publish.
   - Demonstrate auto routes to desktop-thread when user explicitly asks to inspect or continue the worker separately.
   - Demonstrate auto defaults to inline when none of those rules match.
7. Desktop-thread real smoke:
   - Only after Ender GO, create one Codex Desktop thread through app-server thread/start + turn/start, record thread id and final marker, then avoid further sidebar noise.
   - If Ender does not approve, mark this criterion real_smoke_status=requires_approval and do not claim full Desktop-thread proof.

Constraints:
- Preserve CWF's core direction: native Codex skill + readable workflow.js harness templates.
- Main conversation is the coordinator and final result destination.
- Inline workers are default.
- Desktop threads are selective, not per-worker default.
- visibility: "auto" is deterministic, not vibes-based.
- Quarantine applies to untrusted input.
- Cancelled workflows are partial, not complete.
- Resume must use the last completed phase boundary or restart Phase 1 when no clean phase boundary exists.

Iteration policy:
- Work in small phases: contract -> preview -> state -> inline smoke -> optional Desktop-thread smoke.
- After each phase, run the smallest relevant check and update docs if behavior differs.
- Do not keep retrying the same failing app-server or subagent path more than twice without changing the hypothesis.
- Keep implementation thin; prefer helper scripts and skill procedures over a new runtime.

Stop/Pause conditions:
- Stop when the MVP passes all local verification and Desktop-thread real smoke is either passed with Ender GO or explicitly marked requires_approval.
- Pause if native subagent tools are unavailable in the host.
- Pause if app-server thread creation fails twice with the same root cause.
- Pause if implementation pressure pushes toward resurrecting the deleted runtime/CLI.
- Pause before any external write, credential, deploy, database, permission, payment, or production action.
```
