---
half_life: 30d
archive_at: 2026-07-06
scope_type: roadmap
scope_name: CWF complete Claude-like dynamic workflow state
coverage: Complete roadmap for moving Codex Flow from the current v1.11 preview state to a Claude-like, Codex-native complete state, including usage boundaries, native Codex host return, visible write-proposal workers, and phase acceptance criteria.
not_complete_for: Exact Claude product parity, hosted platform scheduling, unrestricted JavaScript, non-Codex model routing, production deploy automation, direct app-thread mutation of original targets, database writes, credentials, payments, permissions, or unreviewed autonomous writes.
verification_level: docs-only
real_smoke_status: requires_approval
review_status: reviewed
reviewer: reasonix-v4pro
review_command: crb delegate --mode final-review --background --json review-mq4gvwrl-uml18p
review_notes: Reasonix approved Phase H docs; medium wording issue about proposal apply path resolved by making app-thread write proposals safePatch-only.
review_owner: Codex
review_due: resolved 2026-06-06
---

# CWF Complete State Plan

## Alignment Snapshot

- **Building**: the full roadmap for making CWF feel like Claude Dynamic Workflows while staying Codex-native, including current-conversation result return and Desktop-visible write-proposal workers.
- **Not building**: a one-step next-phase plan only, an unrestricted Node runtime, an exact Claude clone, hosted queues, model routing, or broad autonomous writes.
- **Source of truth**: current CWF docs and implementation state, especially `README.md`, `docs/POST_V1_PLAN.md`, `docs/JS_DYNAMIC_WORKFLOWS_PLAN.md`, `docs/WHEN_TO_USE_CWF.md`, `docs/WORKER_APP_THREADS_PLAN.md`, `docs/WRITE_WORKERS_PLAN.md`, and PR #1 state on `codex/v1.11-js-dynamic-runtime`.
- **External references**: trq212's "A harness for every task" article and MinLi's Chinese annotated breakdown, both cached under `.superx/articles/`.
- **Deliverables**: complete-state definition, current-vs-target gap table, roadmap phases, PRD, SPEC, acceptance criteria, usage matrix, and staged goal prompts.
- **Phase scope**: roadmap. It contains multiple implementable phases; it is not itself one goal-mode slice.
- **Completeness**: complete for deciding what "CWF complete" means and how to get there; not complete for implementation until each phase is opened as its own goal.
- **Verification level**: docs-only for this plan. Each implementation phase below has its own required local, CI, controlled real-smoke, and review evidence.
- **Review requirement**: Reasonix/v4Pro review required before this plan is treated as final.
- **Verification**: `git diff --check`, delivery-doc validator, Reasonix review, then per-phase commands listed in acceptance.
- **Open decisions**: none blocking. A-G remain the core complete-state roadmap; Phase H is the native Codex host integration layer that makes the UX feel natural in Codex Desktop without direct hidden writes.

Capability sentence:

This planning pass helps Codex Flow reach a complete Claude-like dynamic workflow experience by defining the finished product, roadmap phases, usage boundaries, and verification gates, using the current CWF runtime/docs evidence, while avoiding unsafe writes, exact Claude parity claims, and duplicated Codex-native infrastructure.

## Direct Answer

The list below is the **complete-state roadmap**, not just the next stage:

1. Codex generates `workflow.js` for the user's task instead of making the user hand-write scripts.
2. Results return to the initiating Codex conversation by default.
3. Workers become visible when useful: read-only workers can run as Desktop threads, write workers stay behind `safePatch` or trusted `inherit-session`.
4. CWF ships built-in dynamic modes such as deep research, repo audit, migration planning, adversarial review, and safe fix loop.
5. Good dynamic workflows can be saved, reused, and packaged as workflow templates or skills.
6. Codex host integration makes result return and Desktop-visible write proposals feel native: the host wrapper returns results to the active conversation, while app-thread writers propose patches that CWF applies through `safePatch`.

The first vertical slice of that roadmap is:

> Given a user request, Codex produces a previewable `workflow.js`, CWF validates it, asks for approval, runs it safely, and returns the result to the same Codex conversation.

Current implementation note: the current working tree already contains a Phase A MVP for `cwf dynamic generate`. Treat Phase A docs as acceptance/hardening guidance unless that code is reverted or rejected.

## Delivery Pack

For implementation handoff, use the split delivery pack instead of copying sections out of this long roadmap:

- `docs/cwf-complete-state/PRD.md`
- `docs/cwf-complete-state/SPEC.md`
- `docs/cwf-complete-state/CURRENT_VS_COMPLETE.md`
- `docs/cwf-complete-state/ACCEPTANCE.md`
- `docs/cwf-complete-state/GOAL_PROMPTS.md`

The roadmap here explains why and how the pieces fit together. The delivery pack is the sharper surface for goal-mode execution.

## Why CWF Exists: Failure Modes To Prevent

The strongest Claude Dynamic Workflows breakdowns frame workflow as a way to move control flow out of one long chat context. CWF should use the same product logic, with Codex-native safety.

| Failure mode | What happens in one long agent conversation | CWF answer |
|---|---|---|
| Agentic laziness | The agent stops after partial progress and calls the task done. | Use explicit phases, worker counts, stop conditions, and artifacts. |
| Self-preferential bias | The agent prefers its own theory, patch, or ranking when asked to judge it. | Use independent verifier, challenger, tournament, or reducer workers. |
| Goal drift | Edge constraints disappear after many turns or compaction. | Keep the approved workflow script, preview, budget, and stop rules as external state. |
| Context pollution | Worker findings, raw logs, and irrelevant detail crowd the main conversation. | Store worker outputs in run artifacts and return only a reduced result to Codex. |
| Privilege mixing | The same worker reads untrusted input and performs high-permission actions. | Use quarantine: read untrusted content in read-only workers; gated actor workers perform any action. |
| Budget runaway | Many workers or loops spend too much time/tokens. | Put max agents, max concurrency, timeout, output bytes, and future token budget in preview. |

This means CWF is not just "parallel Codex." It is the layer that holds the plan, evidence, budget, gates, and reducer outside the main conversation.

## What "Complete" Means

CWF is complete when a user can say:

> Run a dynamic workflow to audit this repo for auth risks and fix only the small safe issues after review.

And the system does this:

1. Codex chooses whether CWF is appropriate.
2. Codex drafts a task-specific `workflow.js`.
3. CWF shows a readable preview: purpose, phases, agents, budgets, permissions, write policy, stop rules.
4. The user approves or rejects.
5. CWF runs the script through a constrained runtime and Codex-native workers.
6. Read-only workers can appear as Codex Desktop threads when app-server execution is available.
7. Write work uses only approved paths:
   - `safePatch` for public/auditable patch mode;
   - `inherit-session` only for trusted generated scripts and never beyond the parent Codex permission cap.
   - `app-thread-write-proposal` only for Desktop-visible workers that write in isolation and return a patch artifact for CWF to apply.
8. CWF stores full evidence: script, SHA, preview, events, workers, findings, patches, verification, rollback, result.
9. The initiating Codex conversation receives a short human result and links to artifacts through a Codex skill wrapper, host-provided callback, or explicit known thread id.
10. The user can save the workflow as a reusable local workflow template or skill.

Complete does not mean:

- CWF replaces Codex conversation mode.
- CWF automatically runs on every large task.
- CWF becomes a hosted agent platform.
- Dynamic JavaScript can touch files, network, process, shell, or target repo directly.
- Writes happen without approval, policy, verification, and rollback evidence.
- Desktop app-thread workers directly mutate the original target repo by default.
- CWF guesses the active Codex thread from `thread/list`.

## Current State vs Complete State

| Layer | Current state | Complete state |
|---|---|---|
| Static workflows | Stable CLI workflows exist | Still supported as the reliable repeatable base |
| Safe writes | v1.10 patch-mode path exists | Used as the default write path for dynamic workflows |
| Dynamic JS runtime | v1.11 preview branch supports local `workflow.js` with preview, gate, AST policy, child runtime, and CWF APIs | Codex can generate the script from user intent and run it through the same guarded path |
| Same-conversation return | Skill wrapper/manual result handoff is the intended default; explicit `--thread` and `--new-thread` exist | CWF invocation from Codex reliably returns a plain result to the initiating thread through wrapper/callback/known thread id |
| Worker visibility | app-thread worker path exists with capability/probe constraints | Read-only workers can be visible Desktop worker threads when available; SDK fallback remains explicit |
| Write worker visibility | Safe writes run through isolated patch application, not Desktop app-thread writes | Desktop-visible write workers can propose patches in isolation; proposal apply to the original target is safePatch-only, while trusted non-proposal `inherit-session` remains a separate path |
| Built-in modes | Static catalog plus dynamic fixture | Dynamic catalog: deep-research, repo-audit, migration-plan, adversarial-review, safe-fix-loop, root-cause-investigation, rule-mining, tournament-selection, triage-quarantine, eval-and-rubric |
| Save/reuse | Local YAML registry and suggestions exist; dynamic JS is preview execution | Approved dynamic scripts can become templates, local workflows, or skills with trust metadata |
| Native UI parity | CLI status/watch/artifacts; no Claude `/workflows` panel | Codex-native best effort: same-conversation summaries, visible worker threads, artifact links, optional explicit new thread |

## Where CWF Should Be Used

Use CWF when the work benefits from orchestration, evidence, and repeatability.

| Work type | Use CWF? | Best mode | Availability |
|---|---:|---|---|
| Code diff review | Yes | `diff-review` | Current stable |
| Broad repo health audit | Yes | `repo-audit`; later dynamic repo-audit | Current stable for static workflow; dynamic version planned |
| PRD/SPEC/plan review | Yes | `implementation-plan` | Current stable |
| Factual/source-fidelity review | Yes | `research-crosscheck` | Current stable |
| Release readiness | Yes | `release-review` | Current stable |
| Documentation-only bounded write | Yes | `doc-refresh` | Current stable gated write |
| Small safe code fix with known paths | Sometimes | patch-mode write; later safe-fix-loop | Current stable for custom patch-mode with per-workflow verification; dynamic loop planned |
| Large migration planning | Yes | `migration-plan` dynamic mode | Planned |
| Adversarial review before merge | Yes | `adversarial-review` dynamic mode | Planned |
| Deep research with many independent sources | Sometimes | `deep-research` dynamic mode; source retrieval still belongs to `superx`, browser, or read tools | Planned |
| Flaky test or intermittent failure investigation | Yes | `root-cause-investigation` dynamic mode | Planned |
| Mining repeated corrections from sessions/reviews | Yes | `rule-mining` dynamic mode | Planned |
| Naming, ranking, or selecting among many candidates | Sometimes | `tournament-selection` dynamic mode | Planned |
| Large queue triage over untrusted public input | Sometimes | `triage-quarantine` dynamic mode | Planned with quarantine safety |
| Skill/model/prompt eval against a rubric | Yes | `eval-and-rubric` dynamic mode | Planned |
| One-file bug fix | Usually no | direct Codex | Current direct Codex path |
| UI taste, visual design, copywriting | Usually no | MiMo/design/Reasonix, then Codex implements | Current adjacent skills, not CWF |
| Production deploy, DB migration, credentials, payments, permissions | No by default | separate high-risk plan with explicit approval | Out of CWF public core |

Short rule:

> Use CWF when you need multiple workers, durable evidence, gates, repeatability, or dynamic orchestration. Stay in direct Codex when the task is small, taste-driven, or faster as one conversation.

## PRD

### Problem

The current CWF engine is powerful but still feels tool-shaped. Users have to know whether to run YAML workflows, dynamic JS, safe writes, desktop handoff, or GitHub artifacts.

Claude Dynamic Workflows feel stronger because the user can state an intent and the system creates the harness. The user reviews the plan, approves, and gets one final answer.

CWF needs to keep that experience but with Codex-native boundaries:

- Codex writes and judges;
- CWF orchestrates and records evidence;
- Codex-owned sandbox, approvals, subagents, threads, skills, plugins, and worktrees are reused instead of reimplemented.

### Target Users

- Codex users doing complex engineering work.
- Maintainers who need repeatable review, audit, migration, or release workflows.
- Skill authors who want reusable workflow templates.
- Public users comparing CWF to Claude Dynamic Workflows.

### Goals

- Make intent-to-workflow possible: user request to generated `workflow.js`.
- Keep preview and approval mandatory.
- Return results to the initiating Codex conversation by default.
- Make read-only worker visibility native where possible.
- Keep write workers behind `safePatch` or parent-capped `inherit-session`.
- Add built-in dynamic workflow modes for the common high-value cases.
- Save and reuse approved dynamic workflows.
- Preserve artifacts, reducer output, and run evidence as the source of truth.

### Non-Goals

- No exact Claude product parity.
- No unrestricted JavaScript runtime.
- No hidden writes.
- No direct JS filesystem, network, shell, package import, or target repo access.
- No non-Codex model routing in the public core.
- No hosted scheduler or managed-agent platform in this roadmap.
- No external production writes without a separate high-risk plan and explicit approval.

## SPEC

### Complete Runtime Flow

```text
user asks for complex workflow
  -> Codex decides CWF is appropriate
  -> Codex generates workflow.js from intent
  -> CWF validates AST and capability use
  -> CWF renders preview and budget/write summary
  -> user approves approve-dynamic
  -> CWF child runtime executes through cwf APIs only
  -> workers run through Codex-native adapters
  -> safe writes go through safePatch, capped inherit-session, or visible write-proposal workers
  -> reducer produces result and artifacts
  -> Codex skill wrapper or known host callback returns summary + artifact links to the initiating conversation
  -> user may save workflow as template/skill
```

### Complete Capability Surface

Required `cwf` APIs:

- `cwf.git.changedFiles`
- `cwf.git.diff`
- `cwf.agent.run`
- `cwf.map`
- `cwf.artifacts.write`
- `cwf.report.summarize`
- `cwf.write.safePatch`
- `cwf.verify.run`
- `cwf.classify.route`
- `cwf.tournament.run`
- `cwf.loop.until`
- `cwf.quarantine.read`
- `cwf.template.save`

Host-facing APIs:

- `cwf result RUN_ID --json`: stable machine-readable result for a Codex skill wrapper.
- `cwf desktop result RUN_ID --print`: plain handoff prompt for current-conversation return.
- `cwf desktop result RUN_ID --thread THREAD_ID`: post to a host-provided known thread id.
- `cwf desktop result RUN_ID --new-thread`: explicitly create a separate coordinator/result thread.

Required runtime controls:

- source SHA binding;
- origin trust enum;
- AST policy gate;
- Node Permission Model child;
- no target repo read from child;
- max agents;
- max concurrency;
- wall-clock timeout;
- output byte limit;
- token usage recording where available;
- gate before dynamic execution;
- gate before writes;
- failure summary.

### Result Return Contract

Default:

- result returns to the initiating Codex conversation when launched from Codex through the invoking skill wrapper or host-provided callback.

Optional:

- a host may pass a known current `threadId` or callback handle to post the result;
- `--new-thread` creates a separate coordinator/result thread only when explicitly requested;
- worker app threads are visible only when app-server execution is available and preflight proves real execution;
- CLI-only users still get `cwf result RUN_ID`.

Forbidden:

- do not guess the current thread from `thread/list`;
- do not claim platform-level automatic backfill unless the Codex host explicitly provides the current thread or callback.

### Write Contract

Dynamic JS never writes directly.

Allowed write routes:

1. `safePatch`
   - isolated writer target;
   - proposed patch artifact;
   - `allowed_paths`;
   - `forbidden_paths`;
   - drift check;
   - `git apply --check --3way`;
   - verification;
   - rollback artifact.

2. `inherit-session`
   - generated-current-session origin only;
   - approved script SHA only;
   - never exceeds parent sandbox or approval policy;
   - records runtime metadata;
   - still bounded by task prompt and CWF artifacts.

3. `app-thread-write-proposal`
   - Desktop-visible Codex worker thread;
   - may receive copied parent permission metadata only as an upper bound, not as proof of true platform inheritance;
   - writes only inside an isolated target or worktree;
   - returns `artifacts/proposed.patch` plus changed-file metadata;
   - CWF applies to the original target only through `safePatch`;
   - final result records thread id, turn id, patch path, verification, and rollback evidence.

Forbidden:

- direct Desktop app-thread mutation of the original target repo in public/default workflows;
- direct Desktop app-thread writes without a stable Codex approval path;
- remote untrusted dynamic scripts with write permissions;
- external irreversible writes.

### Quarantine Contract

Quarantine is mandatory whenever a workflow reads untrusted public content, customer messages, third-party issues, Slack/Discord exports, web pages, or arbitrary uploaded files.

Worker classes:

1. **Reader workers**
   - read untrusted content;
   - run read-only;
   - cannot call write, shell, external post, or high-permission APIs;
   - output structured observations and evidence only.

2. **Verifier workers**
   - check reader outputs against rubric, source quality, duplication, or policy;
   - run read-only;
   - can reject weak or unsafe claims.

3. **Actor workers**
   - perform any proposed action;
   - require gate, path policy, safePatch, or explicit external approval;
   - never receive raw untrusted content unless needed and sanitized.

Safety invariant:

> The worker that reads untrusted content is not the worker that writes, posts, deletes, merges, deploys, or changes permissions.

### Pattern Library

CWF should treat these as first-class patterns for generated dynamic workflows:

| Pattern | Use when | CWF implementation shape |
|---|---|---|
| Classify-and-act | Items need routing by type, severity, ownership, or next action. | Classifier worker produces labels; branch executes specific read-only or gated actions. |
| Fan-out-and-synthesize | Many independent files, claims, items, or hypotheses need separate context. | `cwf.map` spawns workers; reducer waits at a barrier and merges. |
| Adversarial verification | The main output needs skeptical checking. | Each proposal gets a verifier/challenger worker before final synthesis. |
| Generate-and-filter | Many ideas or candidate fixes need dedupe and rubric filtering. | Generator workers propose; filter workers score; reducer keeps survivors. |
| Tournament | Ranking/naming/design/solution selection benefits from comparison. | Agents compete on same task; judges run pairwise comparisons until top candidates remain. |
| Loop-until-done | The amount of work is unknown. | Workflow repeats until explicit stop condition: no new findings, no failing tests, no new logs, or budget cap. |
| Quarantine triage | Inputs are untrusted and action may be high privilege. | Reader workers are isolated/read-only; actor workers require gate and sanitized instructions. |
| Rule mining | Repeated corrections should become durable rules. | Mine sessions/reviews, cluster candidates, adversarially verify, then propose AGENTS/skill updates. |

## Roadmap Phases

### Phase A: Intent To Previewed `workflow.js`

Purpose:

Turn the user's request into a generated workflow harness and preview, without requiring the user to hand-write JS.

Deliverables:

- command or skill path that asks Codex to generate `workflow.js`;
- preview artifact that explains phases, agents, permissions, budgets, and stop rules in human language;
- validation that generated script passes AST and capability policy;
- no execution before approval.

Acceptance:

- [ ] A user request can produce a saved `workflow.js` artifact.
  - Evidence: fixture or local run creates script plus preview.
- [ ] Generated script cannot run before `approve-dynamic`.
  - Evidence: run pauses at gate.
- [ ] Invalid generated script fails before execution.
  - Evidence: tests cover forbidden imports/process/fetch/shell.
- [ ] Existing local dynamic workflow smoke still passes.
  - Evidence: `npm run check`, `bash scripts/smoke-cli.sh`, controlled dynamic real-smoke.

### Phase B: Same-Conversation Result Return

Purpose:

Make the default UX feel like Codex did the work in this conversation, not like the user has to inspect CLI files.

Deliverables:

- skill wrapper or app integration that reads completed run result;
- concise human summary;
- artifact links;
- explicit fallback when host thread cannot be addressed.

Acceptance:

- [ ] A CWF run launched from Codex returns a summary in the same conversation.
  - Evidence: local manual smoke with copied result or app-host-supported handoff.
- [ ] `--new-thread` remains explicit.
  - Evidence: docs and tests do not default to new threads.
- [ ] CLI-only users still work.
  - Evidence: `cwf result RUN_ID`.

### Phase C: Worker Visibility

Purpose:

Make worker activity visible when Codex Desktop supports real thread execution.

Deliverables:

- read-only workers can use `codex-app-thread` when app-server preflight succeeds;
- failed execution preflight falls back with a clear reason;
- worker JSON records thread ids, turn ids, fallback, sandbox, approval policy.

Acceptance:

- [ ] `cwf desktop check` distinguishes schema availability from real execution.
  - Evidence: probe thread returns fixed JSON.
- [ ] Read-only worker app threads appear in Desktop when available.
  - Evidence: controlled live smoke with thread ids.
- [ ] SDK fallback is explicit when app-thread execution is unavailable.
  - Evidence: status/result show fallback reason.

### Phase D: Write-Capable Dynamic Workers

Purpose:

Let dynamic workflows safely propose or apply small scoped code changes.

Deliverables:

- `cwf.write.safePatch` dynamic API;
- path policy binding for generated scripts;
- safe fix loop template;
- verification command binding;
- failure cannot be reported as pass.

Acceptance:

- [ ] Dynamic safePatch creates `artifacts/proposed.patch`.
  - Evidence: fixture run.
- [ ] Forbidden path patch is rejected before target changes.
  - Evidence: test.
- [ ] Verification failure marks run failed.
  - Evidence: test.
- [ ] Controlled real-smoke modifies only allowed paths.
  - Evidence: target diff summary and verification output.

### Phase E: Built-In Dynamic Modes

Purpose:

Make CWF useful without users designing workflows each time.

Modes:

- `deep-research`: source collection plan, independent source checks, synthesis.
- `repo-audit`: broad repo review with focused workers.
- `migration-plan`: inventory, risk map, staged migration proposal.
- `adversarial-review`: proposal worker plus challenger workers plus reducer.
- `safe-fix-loop`: find small issues, propose patch, verify, stop on conflict.
- `root-cause-investigation`: independent hypotheses from logs, files, tests, and data, followed by adversarial testing.
- `rule-mining`: mine repeated corrections from sessions or review comments, verify whether each rule would have prevented real mistakes, then propose durable rules.
- `tournament-selection`: generate/rank names, designs, plans, or candidates using pairwise comparison and rubric scoring.
- `triage-quarantine`: classify and dedupe untrusted queue items while isolating reader workers from high-permission actor workers.
- `eval-and-rubric`: evaluate prompts, skills, models, or generated outputs against a fixed rubric with independent graders.

Acceptance:

- [ ] Each mode has a template and plain-English preview.
  - Evidence: template files and docs.
- [ ] Each mode has fixture tests.
  - Evidence: test suite.
- [ ] At least two modes have controlled real-smoke evidence.
  - Evidence: run ids and result summaries.
- [ ] Untrusted-input modes enforce quarantine.
  - Evidence: tests show reader workers cannot perform gated writes or external actions.

### Phase F: Save, Reuse, Package

Purpose:

Turn good dynamic workflows into reusable local assets.

Deliverables:

- save approved dynamic workflow as local template;
- trust metadata with source SHA and origin;
- registry integration for local templates;
- skill packaging guidance.

Acceptance:

- [ ] Saved workflow cannot silently change without SHA mismatch warning.
  - Evidence: test.
- [ ] Saved workflow appears in local workflow discovery only after explicit enable.
  - Evidence: registry test.
- [ ] Remote workflows require inspect/install/enable before run.
  - Evidence: URL direct run remains invalid.

### Phase G: Public Polish And Release

Purpose:

Make the complete-state UX understandable to public users.

Deliverables:

- README/README.zh-CN integration;
- workflow catalog updates;
- skill routing updates;
- release notes;
- CLI smoke expansion;
- public examples.

Acceptance:

- [ ] Public docs explain current, preview, and planned surfaces.
  - Evidence: README and Chinese README.
- [ ] Smoke covers the stable command surface.
  - Evidence: `bash scripts/smoke-cli.sh`.
- [ ] CI passes.
  - Evidence: GitHub Actions success.

### Phase H: Native Host Return And Visible Write Proposals

Purpose:

Make CWF feel native inside Codex Desktop without turning Desktop worker threads into hidden direct writers.

Deliverables:

- Codex skill wrapper path that runs CWF, watches or reads result output, and replies in the initiating conversation;
- host callback/thread-id contract documented for future official current-thread support;
- `app-thread-write-proposal` adapter or equivalent mode that creates Desktop-visible worker threads but writes only in an isolated target/worktree;
- patch artifact extraction and `safePatch` apply reuse;
- status/result language that distinguishes proposal, apply, verification, rollback, fallback, and unsupported direct-write attempts.

Acceptance:

- [ ] CWF launched from a Codex conversation returns the final result in the initiating conversation without requiring the user to inspect CLI files.
  - Evidence: skill-wrapper smoke or app-host callback smoke records run id, result path, and final same-conversation answer.
- [ ] CWF never chooses the parent/current thread from `thread/list`.
  - Evidence: source audit and unit test require wrapper/callback, explicit `--thread`, or explicit `--new-thread`.
- [ ] Desktop-visible write-proposal workers leave the original target unchanged before approval.
  - Evidence: fixture run shows patch artifact creation from an isolated target.
- [ ] App-thread proposed patches reuse the v1.10 safe-write checks.
  - Evidence: allowed/forbidden path, drift, `git apply --check --3way`, verification, and rollback fixtures pass.
- [ ] Direct app-thread mutation of the original target remains rejected by default.
  - Evidence: adapter/schema test and source audit.

## Staged Goal Prompts

### Goal 1: Intent To Preview

```text
/goal
Outcome:
Build Phase A of the CWF complete-state roadmap in this repository: given a user request, Codex can generate a preview-first workflow.js artifact for CWF, validate it, render a human-readable preview, and stop at approve-dynamic before execution.

Allowed writes:
- src/dynamic-workflow.ts
- src/cli.ts
- src/workflow-suggestion.ts or a new focused generator module
- tests for dynamic workflow generation and validation
- fixtures/dynamic/
- docs/CWF_COMPLETE_STATE_PLAN.md
- docs/JS_DYNAMIC_WORKFLOWS_PLAN.md only if wording must stay aligned

Forbidden:
- Do not add unrestricted Node.js execution.
- Do not run generated scripts without preview and approval.
- Do not add non-Codex model routing.
- Do not add hosted queues, marketplace execution, production deploys, credentials, payments, database writes, or permissions changes.

Verification:
- git diff --check
- npm run check
- bash scripts/smoke-cli.sh
- controlled dynamic real-smoke showing generated script preview, approval gate, successful read-only execution, and no target diff mutation
- Reasonix/v4Pro final review focused on overclaiming, sandbox escape, and approval bypass

Constraints:
- Generated workflow.js must use only the allowed cwf API surface.
- Preview must show agents, permissions, budget, stop rules, and write intent.
- Failure must happen before execution for forbidden APIs.
- Existing YAML workflows and v1.10 safe writes must remain compatible.

Iteration policy:
- Work in one vertical slice: generate -> preview -> approve gate -> existing dynamic execution.
- After every failing validation, fix the root cause and rerun the narrow test before broad tests.
- Keep user-facing text clear enough for non-CWF experts.

Stop/Pause conditions:
- Stop complete when verification passes and Reasonix has no blocker/high findings.
- Pause for Ender if implementation requires changing public positioning, expanding write permissions, or adding a new external dependency.
- Stop as blocked after three repeated failures with the same root cause.
```

### Goal 2: Same-Conversation Result Return

```text
/goal
Outcome:
Build Phase B of the CWF complete-state roadmap: a CWF run launched from Codex returns a concise result summary and artifact links to the initiating Codex conversation by default, while keeping --new-thread explicit.

Allowed writes:
- skills/codex-workflows/SKILL.md
- src/cli.ts
- src/desktop-bridge.ts
- tests for handoff/result behavior
- docs/CWF_COMPLETE_STATE_PLAN.md
- README.md and README.zh-CN.md if command docs change

Forbidden:
- Do not guess the current Codex thread from thread/list.
- Do not make Desktop required for CLI users.
- Do not default to creating a new Desktop thread.
- Do not change workflow execution semantics.

Verification:
- git diff --check
- npm run check
- bash scripts/smoke-cli.sh
- manual same-conversation handoff smoke or documented app-host fallback
- Reasonix/v4Pro final review

Constraints:
- CLI artifacts remain source of truth.
- App-server unavailable must produce clear fallback, not failure for completed CLI runs.
- Result summary must include run id, verdict, key findings, verification gaps, and artifact paths.

Iteration policy:
- Start from existing `cwf desktop result --print` and skill behavior.
- Add tests before broadening UX.
- Keep new-thread behavior opt-in.

Stop/Pause conditions:
- Stop complete when same-conversation result path is documented and verified.
- Pause if Codex host APIs cannot address the initiating thread safely.
```

### Goal 3: Worker Visibility

```text
/goal
Outcome:
Build Phase C of the CWF complete-state roadmap: read-only CWF workers can use Codex Desktop-visible worker threads when app-server execution is actually available, and fall back explicitly when it is not.

Allowed writes:
- src/adapters/worker-adapter.ts
- src/desktop-bridge.ts
- src/cli.ts
- tests/worker-adapter.test.ts
- tests/desktop-bridge.test.ts
- docs/CWF_COMPLETE_STATE_PLAN.md
- docs/WORKER_APP_THREADS_PLAN.md if behavior changes
- README.md and README.zh-CN.md if user commands change

Forbidden:
- Do not require Codex Desktop for normal CLI workflows.
- Do not guess the current thread from thread/list.
- Do not create hidden worker threads without recording metadata.
- Do not allow Desktop app-thread writes in this phase.
- Do not mask app-thread execution failure as success.

Verification:
- git diff --check
- npm run check
- bash scripts/smoke-cli.sh
- cwf desktop check
- controlled app-thread real-smoke when Codex Desktop app-server is available
- Reasonix/v4Pro final review

Constraints:
- Execution preflight must prove a thread can run and return the expected probe response.
- Worker runtime metadata must include adapter, thread id, turn id, sandbox, approval policy, fallback status, and fallback reason.
- SDK fallback must remain clear and safe.

Iteration policy:
- First harden fake app-server tests.
- Then verify local CLI behavior.
- Run live app-thread smoke only after deterministic tests pass.

Stop/Pause conditions:
- Stop complete when read-only workers create visible threads in controlled smoke or clearly fall back when unavailable.
- Pause for Ender if Codex host APIs do not expose a reliable execution path.
- Stop as blocked after three repeated app-server failures with the same root cause.
```

### Goal 4: Write-Capable Dynamic Workers

```text
/goal
Outcome:
Build Phase D of the CWF complete-state roadmap: dynamic workflows can request safe write work only through a guarded safePatch path or parent-capped inherit-session, with no direct JavaScript writes.

Allowed writes:
- src/dynamic-workflow.ts
- src/safe-write.ts
- src/phase-engine.ts only if safe-write integration requires it
- tests/dynamic-workflow.test.ts
- tests/safe-write.test.ts
- tests/phase-engine.test.ts
- fixtures/dynamic/
- fixtures/workflows/
- docs/CWF_COMPLETE_STATE_PLAN.md
- docs/WRITE_WORKERS_PLAN.md if behavior changes

Forbidden:
- Do not let dynamic JavaScript write files directly.
- Do not bypass approve-dynamic or approve-write gates.
- Do not allow patches outside allowed_paths.
- Do not touch credentials, deployments, databases, payments, permissions, or external messages.
- Do not report PASS after verification failure.

Verification:
- git diff --check
- npm run check
- bash scripts/smoke-cli.sh
- fixture showing dynamic safePatch creates `artifacts/dynamic-proposed.patch` and `artifacts/dynamic-safe-patch.json`
- fixture showing forbidden path rejection leaves target unchanged
- fixture showing verification failure fails the run
- controlled real-smoke modifying only allowed paths
- Reasonix/v4Pro final review

Constraints:
- safePatch must reuse v1.10 path policy, drift check, git apply --check --3way, verification, and rollback evidence.
- inherit-session must require generated-current-session origin, matching SHA, and known parent permission cap.
- All write results must appear in artifact manifest and final report.

Iteration policy:
- Implement safePatch before expanding inherit-session behavior.
- Keep every write test narrow and target-diff checked.
- Treat any ambiguous write boundary as a stop condition.

Stop/Pause conditions:
- Stop complete when write-capable dynamic workflows pass all safety tests and one controlled real-smoke.
- Pause for Ender if the implementation needs broader permissions than safePatch or parent-capped inherit-session.
- Stop as blocked after three repeated write-safety failures with the same root cause.
```

### Goal 5: Built-In Dynamic Modes And Save/Reuse

```text
/goal
Outcome:
Build Phases E and F of the CWF complete-state roadmap: ship reusable dynamic workflow templates for high-value tasks and allow approved workflows to be saved/reused with trust metadata.

Allowed writes:
- workflows/ or a dedicated dynamic templates directory
- src/workflow-registry.ts
- src/dynamic-workflow.ts
- tests for templates, registry, trust metadata, SHA mismatch, and no direct URL run
- docs/workflow-catalog.md
- README.md and README.zh-CN.md
- docs/CWF_COMPLETE_STATE_PLAN.md

Forbidden:
- Do not execute remote workflows directly by URL.
- Do not enable write-capable templates by default.
- Do not bypass inspect/install/enable.
- Do not add non-Codex model routing or hosted marketplace behavior.

Verification:
- git diff --check
- npm run check
- bash scripts/smoke-cli.sh
- fixture runs for every template
- controlled real-smoke for at least two templates
- Reasonix/v4Pro final review

Constraints:
- Templates must declare capabilities and budgets.
- Saved workflows must bind source SHA and origin.
- Dynamic templates must still pass preview, approval, AST policy, and child runtime constraints.

Iteration policy:
- Add one template at a time with tests.
- Do not add save/reuse until template execution is stable.
- Keep remote/public registry behavior inspect-first.

Stop/Pause conditions:
- Stop complete when templates are discoverable, test-covered, and safe by default.
- Pause if save/reuse needs a trust model change beyond existing registry docs.
```

### Goal 6: Public Polish And Release

```text
/goal
Outcome:
Build Phase G of the CWF complete-state roadmap: public docs, Chinese docs, workflow catalog, skill routing, release notes, and smoke coverage present CWF's complete-state UX clearly without overclaiming shipped capabilities.

Allowed writes:
- README.md
- README.zh-CN.md
- RELEASE_NOTES.md
- docs/CWF_COMPLETE_STATE_PLAN.md
- docs/WHEN_TO_USE_CWF.md
- docs/workflow-catalog.md
- docs/claude-vs-codex-workflows.md
- skills/codex-workflows/SKILL.md
- scripts/smoke-cli.sh only if stable commands are added
- tests for docs/CLI smoke only if needed

Forbidden:
- Do not change runtime semantics in this phase.
- Do not claim exact Claude Dynamic Workflows parity.
- Do not imply generated dynamic workflows, worker threads, safe writes, or GitHub posting are available beyond their verified availability label.
- Do not add non-Codex model routing.
- Do not add external writes or publishing automation.

Verification:
- git diff --check
- npm run check
- bash scripts/smoke-cli.sh
- source audit for overclaiming phrases such as exact parity, automatic trigger, unrestricted JavaScript, or ungated writes
- Reasonix/v4Pro final review
- GitHub CI success after push

Constraints:
- Public docs must separate current stable, implemented preview, and planned capabilities.
- Chinese README should be the default public entry if project convention keeps Chinese-first docs.
- Skill routing must say when not to use CWF.

Iteration policy:
- Update one public surface at a time.
- After each docs surface, check whether it contradicts the complete-state plan.
- Keep release notes evidence-backed.

Stop/Pause conditions:
- Stop complete when public docs and skill routing are aligned, local validation passes, and CI is green.
- Pause for Ender if product positioning changes or public release timing needs a decision.
- Stop as blocked after three repeated review findings about the same overclaim.
```

### Goal 7: Native Host Return And Visible Write Proposals

```text
/goal
Outcome:
Build Phase H of the CWF complete-state roadmap: make CWF feel native in Codex Desktop by adding a Codex skill-wrapper result return path and a Desktop-visible write-proposal worker path, without allowing hidden direct app-thread writes to the original target.

Allowed writes:
- src/cli.ts
- src/desktop-bridge.ts
- src/adapters/worker-adapter.ts or a focused new adapter module
- src/safe-write.ts only if proposal apply integration needs it
- tests for result-return routing, no thread-list parent guessing, write-proposal isolation, direct app-thread write rejection, and safePatch reuse
- fixtures/workflows/ or fixtures/dynamic/ for write-proposal smoke
- skills/codex-workflows/SKILL.md if the skill wrapper contract changes
- README.md
- README.zh-CN.md
- docs/CWF_COMPLETE_STATE_PLAN.md
- docs/cwf-complete-state/
- docs/workflow-catalog.md
- docs/CODEX_NATIVE_CAPABILITY_AUDIT.md

Forbidden:
- Do not let Desktop app-thread workers directly mutate the original target repo in public/default workflows.
- Do not guess the current Codex thread from `thread/list`.
- Do not make Codex Desktop mandatory for CLI users.
- Do not claim official platform-level automatic backfill unless the Codex host provides a stable current-thread/callback contract.
- Do not weaken approve-dynamic, approve-write, allowed_paths, forbidden_paths, drift check, verification, or rollback gates.
- Do not add hosted scheduling, non-Codex model routing, production deploys, database writes, credentials, payments, permissions, or external messages.

Verification:
- git diff --check
- npm run check
- bash scripts/smoke-cli.sh
- focused unit tests for current-conversation return routing and no current-thread inference
- focused unit tests proving write-proposal workers leave the original target unchanged before safePatch approval
- focused unit tests proving direct app-thread original-target writes are rejected
- fixture proving app-thread proposed patches reuse v1.10 safe-write checks: allowed/forbidden paths, drift, `git apply --check --3way`, verification, and rollback
- controlled local smoke showing a write-proposal worker creates a patch artifact and CWF applies it only after approval
- if app-server execution is locally available, controlled Desktop app-thread smoke records thread_id and turn_id; otherwise record exact fallback reason and do not claim live Desktop proof
- Reasonix/v4Pro final review

Constraints:
- Treat app-thread worker permissions as copied/capped metadata, not true platform inheritance, unless Codex host APIs explicitly provide inheritance.
- The original target may be changed only by CWF's parent apply path through safePatch or a separately reviewed trusted inherit-session path.
- Result return belongs to the Codex skill wrapper or host callback when launched from a conversation; CLI-only users still use `cwf result`.
- All proposal/apply/verification/rollback evidence must be stored in the run folder and summarized in the final result.

Iteration policy:
- First harden result-return contract and no-current-thread-guessing tests.
- Then implement write-proposal isolation and patch artifact capture.
- Then reuse safePatch apply and verification.
- Run live Desktop smoke only after deterministic tests pass.

Stop/Pause conditions:
- Stop complete when same-conversation return and write-proposal safePatch flow are verified, docs are aligned, and Reasonix has no blocker/high findings.
- Pause for Ender if true current-thread callback support requires a Codex host feature outside this repo.
- Pause for Ender if the implementation needs direct app-thread writes to the original target.
- Stop as blocked after three repeated failures with the same app-server execution/readback root cause.
```
