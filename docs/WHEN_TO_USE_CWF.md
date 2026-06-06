---
half_life: 30d
archive_at: 2026-07-06
scope_type: roadmap
scope_name: CWF usage decision and adoption plan
coverage: Complete for deciding where Codex Flow should be used, which workflow surface to choose, and what follow-up docs/product work should make that decision easier.
not_complete_for: Runtime implementation, exact Claude Dynamic Workflows parity, hosted scheduling, marketplace execution, non-Codex model routing, production deploy automation, or broad autonomous writes.
verification_level: docs-only
real_smoke_status: not_required
review_status: reviewed
reviewer: reasonix-v4pro
review_command: crb delegate --mode final-review --json review-payload-for-cwf-planning-docs-after-trq212-minli
review_notes: Approved; no blocker/high/real medium issues after integrating trq212/MinLi failure modes, pattern library, quarantine, and use-case guidance.
review_owner: Codex
review_due: resolved 2026-06-06
---

# When To Use Codex Flow

## Alignment Snapshot

- **Building**: a decision plan and public-facing usage guide for where CWF fits in real Codex work.
- **Not building**: new runtime features, a Claude clone, hosted queues, marketplace execution, model routing, or broader autonomous write behavior.
- **Source of truth**: `README.md`, `docs/PRD.md`, `docs/SPEC.md`, `docs/workflow-catalog.md`, `docs/claude-vs-codex-workflows.md`, `docs/JS_DYNAMIC_WORKFLOWS_PLAN.md`, `docs/POST_V1_PLAN.md`, and the current v1.10/v1.11 implementation evidence.
- **Deliverables**: PRD, SPEC, usage matrix, acceptance criteria, phase plan, and a copy-ready goal prompt for productizing this usage guide.
- **Phase scope**: roadmap-level usage and adoption contract, not one implementation slice.
- **Completeness**: complete for deciding when CWF should be used across stable, preview, and planned surfaces; not complete for implementing new CWF runtime features.
- **Verification level**: docs-only for this file. Runtime claims below are tied to existing local/CI evidence where available.
- **Review requirement**: Reasonix/v4Pro review required before this plan is treated as final; initial findings were resolved by adding availability and evidence labels.
- **Verification**: `git diff --check`, delivery-doc validator, docs/readability audit, Reasonix review, and optional future `npm run check` if this guide is wired into README/package docs.
- **Open decisions**: none blocking. The selected framing is "CWF is for repeatable, inspectable multi-step Codex work, not a default wrapper around every Codex action."

Capability sentence:

This planning pass helps Codex Flow users decide when to use CWF by producing a usage decision contract, workflow-selection guide, and adoption roadmap, using the current CWF docs/runtime evidence, while avoiding new runtime scope, Claude parity claims, and unsafe write expansion.

## Availability Labels

This guide uses these labels so users do not confuse today's supported surface with future product work:

- **Stable public core**: available in the current CLI/package surface and protected by CI-safe smoke.
- **Implemented preview**: implemented and tested on the current v1.11 PR branch, but not treated as fully productized public UX until the PR is merged/released.
- **Planned**: documented direction only; do not use as a shipped command or safety guarantee.

Current evidence as of 2026-06-06 on branch `codex/v1.11-js-dynamic-runtime`:

| Surface | Availability | Evidence |
|---|---|---|
| Static read-only workflows | Stable public core | `bash scripts/smoke-cli.sh` validates registry/list/show/validate without live workers. |
| Background/status/watch/result/list/show | Stable public core | CLI smoke covers command surface; tests cover formatting and run-store behavior. |
| GitHub PR artifact generation | Stable public core | CLI smoke generates local `github-pr-comment.md` and `github-pr-review.json` without posting. |
| GitHub PR posting with `--post` | Explicit external action, not default smoke surface | Command requires explicit `--post --repo --pr`; CI smoke does not post. Treat each real post as requiring Ender GO and real-smoke evidence. |
| Desktop result handoff | Stable public core with fallback | README/SPEC document fallback; app-server-dependent posting remains explicit. |
| `doc-refresh` and patch-mode safe write | Stable public core for gated bounded writes | `npm run check` covers safe-write, phase-engine, schema, and run-store tests. Custom patch-mode YAML workflows must still prove their own allowed paths, forbidden paths, and verification commands. |
| Dynamic JavaScript `cwf dynamic run` | Implemented preview | Local verification covers preview, approval, child runtime, template execution, and dynamic safePatch smoke. |
| Generated dynamic workflow authoring from a user request | Implemented preview | `cwf dynamic generate --goal "<task>" --target <repo>` writes a local script, preview metadata, and stops at `approve-dynamic`; it is not an automatic trigger. |
| Saved dynamic workflow templates | Implemented preview | `cwf dynamic save <workflow.js> --id <id>` writes a local SHA-bound trust record; remote URL run remains forbidden. |
| Claude-like native `/workflows` UI | Planned / out of current scope | CWF currently uses CLI status/watch/artifacts and Codex handoff, not a native panel. |

## Plain-Language Result

CWF is useful when one Codex conversation is no longer the cleanest place to hold all the work.

Use CWF when the task needs at least one of these:

- multiple independent review perspectives;
- durable progress and artifacts outside chat;
- a gate before risky or write-capable work;
- a repeatable command that can be rerun on another repo or diff;
- a reducer that merges worker outputs into one accountable result;
- a dynamic harness for a large task-specific investigation;
- adversarial verification against a rubric;
- a tournament or pairwise comparison across many candidates;
- quarantine between untrusted input readers and high-permission actors.

Do not use CWF just because the task is "important." Use it when workflow structure, evidence, repeatability, or parallelism earns its overhead.

## PRD

### Problem

Codex users now have several ways to work:

- ask Codex directly in the current conversation;
- call one-off skills such as `check`, `hunt`, `design`, `superx`, or `delivery-planner`;
- run CWF static workflows;
- run CWF safe write workflows;
- run CWF dynamic JavaScript workflows.

Without a decision guide, users may overuse CWF for trivial tasks or underuse it for work that needs separate worker contexts, durable evidence, and gates.

The product problem is not "make every task a workflow." The product problem is:

> Make it obvious when CWF is the right coordination layer, and make the wrong cases easy to reject.

### Target Users

- Codex users doing engineering review, release readiness, docs maintenance, research cross-checking, or controlled implementation slices.
- Maintainers who want a public package with clear boundaries and fewer overclaims.
- Skill authors who want to wrap CWF safely from Codex conversations.
- Advanced users comparing CWF with Claude Dynamic Workflows.

### Goals

- Define where CWF creates real value.
- Define where direct Codex or another skill is better.
- Map common tasks to the right CWF workflow surface.
- Keep write-capable paths explicitly gated.
- Keep dynamic JavaScript workflows preview-first and permission-scoped.
- Preserve "same-conversation result return" as the default Codex UX.
- Provide acceptance criteria for future docs/runtime changes that claim better CWF ergonomics.

### Non-Goals

- Do not auto-trigger CWF on vague keywords.
- Do not turn CWF into a replacement for Codex's own conversation, subagent, sandbox, approval, or skill systems.
- Do not introduce non-Codex model routing.
- Do not treat CWF as a general background job platform.
- Do not use CWF for arbitrary shell, network, deploy, database, credential, payment, or permission writes.
- Do not run generated JavaScript without preview, approval, AST policy, and permissioned child execution.
- Do not claim exact Claude Dynamic Workflows parity.

### User Stories

1. As a user, I can look at my task and decide whether CWF is worth the overhead.
2. As a user, I can pick `diff-review`, `repo-audit`, `implementation-plan`, `research-crosscheck`, `release-review`, `doc-refresh`, patch-mode write, or `dynamic-js` by task shape.
3. As a user, I can tell when to stay in the current Codex conversation instead.
4. As a cautious user, I can see which CWF modes are read-only, gated write, or inherited permission.
5. As a maintainer, I can reject future feature requests that duplicate Codex-native capabilities without adding workflow value.
6. As a skill author, I can wrap CWF without hiding approvals, artifacts, or failure states.

## The Decision Rule

Use CWF when the answer to at least two of these questions is yes:

| Question | If yes, CWF is likely useful |
|---|---|
| Do I need multiple independent angles? | Use read-only worker workflows or dynamic fan-out. |
| Do I need durable evidence outside chat? | Use CWF run artifacts and reducer output. |
| Do I need to pause before a risky phase? | Use gated workflows. |
| Do I need to repeat this on future diffs/repos? | Use bundled YAML or saved workflow specs. |
| Do I need progress visibility during a long run? | Use `--background`, `status`, `watch`, and artifacts. |
| Do I need controlled writes with rollback evidence? | Use `doc-refresh` or patch-mode safe write, not direct dynamic JS writes. |
| Do I need task-specific orchestration logic? | Use `dynamic-js` after preview and approval. |

If only one answer is yes, direct Codex or a narrower skill is usually better.

## When To Use CWF

| Situation | Use CWF? | Best surface | Why |
|---|---:|---|---|
| Code diff needs correctness/tests/safety review | Yes | `diff-review` | Parallel perspectives produce cleaner findings than one pass. |
| Repo structure or maintainability changed | Yes | `repo-audit` | Broader worker roles catch hygiene and release-risk gaps. |
| PRD/SPEC/plan needs pressure test | Yes | `implementation-plan` | Focuses on scope, sequencing, verification, and risk. |
| Research/doc claims need source-fidelity review | Yes | `research-crosscheck` | Good for catching unsupported claims visible in diff. |
| Release is close and needs ship-readiness audit | Yes | `release-review` | Checks rollback, regression, release notes, and rollout gaps. |
| Docs need bounded updates after preview | Yes | `doc-refresh` | Gated write path with preview, patch, verification, rollback. |
| Code implementation can be expressed as bounded patch | Sometimes | patch-mode write workflow | Only with `write_policy`, gate, allowed paths, verification. |
| Large task needs task-specific fan-out/merge logic | Yes, on v1.11 preview branch | `dynamic-js` | Externalizes orchestration into approved JS harness; generated previews and local saved templates are available as implemented preview. |
| Flaky test needs several competing theories | Planned | future `root-cause-investigation` | Separate hypothesis workers prevent one theory from dominating too early. |
| Repeated Codex corrections should become rules | Planned | future `rule-mining` | Mine sessions/reviews, cluster rules, adversarially verify before updating AGENTS/skills. |
| Many candidates need qualitative ranking | Planned/sometimes | future `tournament-selection` | Pairwise comparison is more reliable than one huge ranking prompt. |
| Large backlog or public-input triage | Planned/sometimes | future `triage-quarantine` | Reader workers stay read-only; actor workers need gate/approval. |
| Prompt/skill/model output needs rubric eval | Planned | future `eval-and-rubric` | Independent graders and comparison workers reduce self-preferential bias. |
| One small bug in one file | Usually no | direct Codex | CWF overhead is not earned. |
| UI taste, copy, naming, or visual direction | Usually no | MiMo/Reasonix/design skill, then Codex | CWF is not a taste engine. |
| Live web/X research | Usually no | `superx`, `read`, browser | CWF reviews tracked artifacts; it should not replace research tools. |
| Production deploy, DB migration, credentials, payments | No by default | direct G3 plan + approvals | CWF public core does not own irreversible external writes. |
| Need Claude-like background mega-run | Maybe, preview only | `dynamic-js`, conservatively | Use only with budgets, gates, and clear artifact evidence; generated workflow UX is still planned. |

## Workflow Selection Matrix

| Need | Command shape | Write risk | Verification level |
|---|---|---:|---|
| Validate workflow before spending tokens | `cwf validate WORKFLOW` | none | local |
| Review current git diff | `cwf run diff-review --target REPO` | read-only | local / real-smoke |
| Audit repo health and release risk | `cwf run repo-audit --target REPO` | read-only | local / real-smoke |
| Review planning docs or implementation plan | `cwf run implementation-plan --target REPO` | read-only | local |
| Cross-check factual docs | `cwf run research-crosscheck --target REPO` | read-only | local |
| Release readiness | `cwf run release-review --target REPO` | read-only | local / CI |
| Documentation write | `cwf run doc-refresh --target REPO` then approve | gated write | local |
| Bounded implementation patch | custom YAML with `write_policy.mode: patch` | gated write | per-workflow local + narrow tests |
| Task-specific orchestration | `cwf dynamic generate --goal GOAL --target REPO` or `cwf dynamic run WORKFLOW_JS_OR_ID --target REPO` then approve | read-only by default; `safePatch` only with explicit write policy | implemented-preview local / controlled real-smoke |
| Return result to Codex conversation | `cwf desktop result RUN_ID --print` or skill wrapper | none | local |
| PR artifact generation | `cwf github-pr RUN_ID --format comment|review` | local artifact only | local |
| GitHub posting | `cwf github-pr RUN_ID --post --repo OWNER/REPO --pr NUMBER` | explicit external write, not CI-smoked | Ender GO + per-PR real-smoke |

## SPEC

### Product Boundary

CWF owns:

- workflow specs and dynamic harness metadata;
- local run state;
- gates and gate decisions;
- worker result envelopes;
- reducer output;
- artifact manifests;
- workflow discovery;
- CLI status/watch/result;
- optional handoff artifacts to Codex Desktop/GitHub.

Current-vs-planned split:

| CWF-owned surface | Availability |
|---|---|
| workflow specs, registry, validation, run state, events, reducer output, status/result/watch | Stable public core |
| gated write artifacts, patch checks, rollback and verification records | Stable public core for bounded patch-mode |
| GitHub PR artifact generation | Stable public core; posting requires explicit flags |
| dynamic JS preview, approval, child runtime, CWF JSON-RPC APIs | Implemented preview on v1.11 branch |
| generated dynamic workflow authoring and saved dynamic templates | Implemented preview |
| native Claude-like workflow panel | Planned / not current CWF-owned UI |

Codex owns:

- model execution;
- conversation context;
- subagents/threads where available;
- sandbox and approval controls;
- worktrees;
- tools and skills;
- final engineering judgment in the initiating conversation.

CWF should not duplicate Codex-native capabilities unless the duplication is only a thin adapter over saved run evidence.

### Usage Modes

#### 1. Direct Conversation Mode

Use direct Codex when the task is small, local, and does not need durable orchestration.

Examples:

- single-file bug fix;
- quick explanation;
- one narrow refactor;
- local command output;
- UI/copy iteration where taste is the main question.

#### 2. Read-Only Review Mode

Use CWF read-only workflows when multiple independent review perspectives are useful and the target diff should not change.

Safety invariant:

- target repo diff must not change because of CWF.

Evidence:

- worker JSON;
- reduced result;
- result markdown;
- artifact manifest;
- unchanged target diff.

#### 3. Gated Write Mode

Use CWF gated writes only when the write boundary is clear before execution.

Safety invariant:

- no write phase without a prior gate;
- no patch outside `allowed_paths`;
- forbidden paths stop the run;
- patch conflicts stop before target changes;
- verification failure cannot be reported as pass.

#### 4. Dynamic Harness Mode

Use dynamic JavaScript when a static workflow is too rigid and the task benefits from task-specific orchestration.

Safety invariant:

- script is copied and hashed;
- preview and approval are mandatory;
- script runs only through CWF APIs;
- no unrestricted Node.js target access;
- read-only agents fail if target diff changes;
- `inherit-session` never exceeds the parent Codex permission cap.

#### 5. Quarantine Mode

Use quarantine mode when a workflow reads untrusted public content and may later suggest an action.

Examples:

- public issue triage;
- support queue classification;
- Slack/Discord incident mining;
- web/X/source collection for research;
- resume or ticket ranking from uploaded files.

Safety invariant:

- reader workers that ingest untrusted content stay read-only;
- verifier workers check evidence, duplication, and policy;
- actor workers perform any write/post/escalation only after gate and sanitized instructions.

#### 6. Tournament And Rubric Mode

Use tournament/rubric workflows when the task is qualitative but still judgeable.

Examples:

- naming;
- design direction comparison;
- solution approach selection;
- candidate ranking;
- prompt/skill evaluation.

Safety invariant:

- the rubric must be written before judging starts;
- generated candidates and judges should be separate workers;
- final output must preserve why winners beat alternatives, not just list the winner.

### Error And Fallback Behavior

- If app-thread execution is unavailable, CWF can fall back to SDK workers or handoff artifacts, but must say so.
- If a dynamic script asks for forbidden APIs, validation fails before execution.
- If a write workflow lacks a gate or policy, validation fails.
- If GitHub posting fails, local PR artifacts remain the durable output.
- If a worker returns malformed JSON, raw fallback must be visible in status/result.
- If evidence is only fixture/dry-run, the final result must not claim real-smoke completion.

## Acceptance Criteria

- [ ] A user can decide whether CWF is appropriate from a task description.
  - Evidence: docs-only review confirms the decision rule and "when not to use" cases are explicit; future README wiring should add a link to this guide.

- [ ] Every bundled workflow has a plain-English use case.
  - Evidence: `docs/workflow-catalog.md` plus this guide cover `diff-review`, `repo-audit`, `implementation-plan`, `research-crosscheck`, `release-review`, `doc-refresh`, patch-mode write, and preview `dynamic-js`.

- [ ] The guide separates direct Codex, static CWF, gated write CWF, and dynamic JS CWF.
  - Evidence: SPEC usage modes define each separately; dynamic JS is labelled implemented preview, not fully productized automatic workflow UX.

- [ ] The guide explains why dynamic workflows exist, not just how to run them.
  - Evidence: use cases include adversarial verification, goal-drift prevention, tournament comparison, and quarantine for untrusted input.

- [ ] The guide does not imply CWF can safely do unrestricted writes.
  - Evidence: non-goals and safety invariants forbid ungated, direct, external, and production writes; write guidance points to gates, `write_policy`, patch checks, verification, and rollback.

- [ ] The guide does not claim exact Claude Dynamic Workflows parity.
  - Evidence: non-goals, availability labels, and `docs/claude-vs-codex-workflows.md` keep exact parity out of scope.

- [ ] Future README/skill docs can link to one decision surface.
  - Evidence: follow-up phase plan includes a docs integration slice with README, Chinese README, workflow catalog, and skill docs.

- [ ] G2/G3 planning quality is reviewed before final status.
  - Evidence: Reasonix/v4Pro review status in frontmatter records findings and resolution; final status requires no unresolved blocker/high findings.

## Phase Plan

### Phase 1: Canonical Usage Guide

Status: this document.

Deliverables:

- `docs/WHEN_TO_USE_CWF.md`
- decision rule;
- workflow selection matrix;
- safety boundaries;
- acceptance criteria.

Verification:

- `git diff --check`
- Reasonix/v4Pro review

Stop condition:

- blocker/high review finding remains unresolved.

### Phase 2: Wire Into Public Docs

Deliverables:

- README link near "What It Does" or "Usage";
- `README.zh-CN.md` matching link and summary;
- `docs/workflow-catalog.md` link to this guide.

Verification:

- `npm run check`
- `bash scripts/smoke-cli.sh`
- source audit that old wording does not imply CWF is for every task.

Stop condition:

- README starts claiming Claude parity, automatic trigger, or broad writes.

### Phase 3: Codex Skill Routing Copy

Deliverables:

- update `skills/codex-workflows/SKILL.md` with "use CWF when..." trigger boundaries;
- add anti-triggers for trivial fixes, UI/copy taste, live research, and external writes;
- keep same-conversation result return as default.

Verification:

- `git diff --check`
- manual trigger-case review against this guide
- `bash scripts/smoke-cli.sh` if package contents change.

Stop condition:

- the skill would route too many ordinary Codex tasks into CWF.

### Phase 4: Dynamic Workflow Productization

Deliverables:

- generated `workflow.js` preview flow;
- built-in dynamic templates for repo audit, adversarial review, migration planning, safe fix loop, root-cause investigation, rule mining, tournament selection, triage quarantine, and rubric evaluation;
- stronger docs for budget and cost expectations.

Verification:

- fixture dynamic runs;
- controlled real-smoke dynamic run;
- `npm run check`;
- `bash scripts/smoke-cli.sh`;
- Reasonix final review.

Stop condition:

- generated scripts can execute without preview/approval or exceed permission caps.

## Future Goal Prompt

Use this if the next step is to productize this guide into README/skill routing.

```text
/goal
Outcome:
Productize the CWF usage decision guide in /Users/sunny/Work/CODEX/codex-workflows so public users and Codex skills can tell when to use CWF, which workflow surface to choose, and when to stay in direct Codex.

Allowed writes:
- README.md
- README.zh-CN.md
- docs/workflow-catalog.md
- docs/WHEN_TO_USE_CWF.md
- skills/codex-workflows/SKILL.md
- tests/docs or lightweight validation files only if needed

Forbidden:
- Do not change runtime behavior, workflow execution code, package publishing config, GitHub Actions behavior, credentials, external posting, or generated artifacts outside the repo.
- Do not claim exact Claude Dynamic Workflows parity.
- Do not imply CWF should handle trivial tasks, UI/copy taste work, live research, unrestricted writes, deploys, databases, credentials, payments, or permissions.

Verification:
- git diff --check
- npm run check
- bash scripts/smoke-cli.sh
- Reasonix/v4Pro final review focused on overclaiming, trigger boundaries, and public-doc clarity

Constraints:
- Keep CWF framed as a Codex-native workflow/evidence layer, not a separate agent platform.
- Preserve same-conversation result return as the default Codex UX.
- Preserve safe write boundaries: gated writes, patch policy, approval, verification, rollback.
- Keep dynamic JS framed as preview-first and permission-scoped.

Iteration policy:
- First inspect current README, Chinese README, workflow catalog, and skill docs.
- Make the smallest docs edits that create one clear decision path.
- After each review finding, fix blocker/high issues before expanding copy.
- Do not add new runtime scope during this goal.

Stop/Pause conditions:
- Stop complete when docs are updated, validation passes, and Reasonix has no blocker/high findings.
- Pause and ask Ender if the docs would require changing product positioning, adding new runtime behavior, or approving external writes.
- Stop as blocked after three repeated validation/review failures with the same root cause.
```
