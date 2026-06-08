---
half_life: 30d
archive_at: 2026-07-08
scope_type: roadmap
scope_name: cwf-post-mvp-enhancements
coverage: Complete post-MVP enhancement roadmap for making CWF a stronger Codex-native dynamic workflow experience after the current MVP evidence state.
not_complete_for: Hosted scheduler, marketplace operation, non-Codex model routing, unrestricted JavaScript execution, production deployment, paid-user release, or full Claude platform parity that Codex does not expose.
verification_level: local
real_smoke_status: enhancement_local_helpers_fixture_pass_safe_write_disposable_real_smoke_pass_desktop_deferred_with_fixture_only_auto_callback_deferred
review_status: reviewed_with_findings_applied
reviewer: reasonix-v4pro
review_command: reasonix run -m deepseek-v4-pro:cloud --effort high --transcript /tmp/cwf-full-implementation-review-2.jsonl
review_notes: Reasonix full implementation second pass returned GO after E8 expensive-run warning and unbounded-workflow refusal fixtures were implemented, and after E2 was labeled deferred_with_fixture_only.
review_owner: Ender
review_due: 2026-06-09
---

# CWF Post-MVP Enhancement Roadmap

## Alignment Snapshot

This planning pass helps Ender and future Codex goal sessions turn CWF from a proven MVP into a smoother Codex-native dynamic workflow product by producing a roadmap, PRD, SPEC, acceptance matrix, phase plan, and staged goal prompts, using the current `codex-workflows` repo, MVP evidence, and native Codex worker/thread constraints as source of truth, while avoiding a return to the removed external runtime, unbounded agent swarm, or platform features Codex does not expose yet.

Implementation update:

- E1/E3/E5/E6/E7/E8/E9 now have local helper and fixture coverage in `scripts/` plus `npm run check`.
- E4 has an approval-gated safe-write evaluator, positive/negative fixtures, and one disposable `/tmp` git-repo real-smoke with `git apply --check`, apply, verification, changed-file, and rollback evidence.
- E2 enhanced execution preflight is `deferred_with_fixture_only` until Ender approves a new visible Desktop-thread smoke. The existing MVP Desktop-thread smoke proves one visible thread and manual coordinator synthesis, not platform automatic callback.
- E10 has local release-readiness evidence in `docs/CWF_RELEASE_READINESS.md`; publish/tag/deploy remain out of scope.

Building:

- More reliable same-conversation result return with an explicit return envelope and evidence mirror.
- More stable selective Desktop-thread workers with execution preflight, clear fallback, and no sidebar spam.
- Stronger resume/checkpoint semantics for interrupted or partially completed runs.
- Real safe write worker flow with approval, isolated patch generation, policy scanning, apply checks, verification, and rollback notes.
- Dynamic workflow generation from a user objective into a bounded `workflow.js` harness or run plan.
- A small built-in workflow catalog plus user-defined workflow discovery, without reviving YAML registry or marketplace scope.
- Stronger adversarial verifier behavior that can block completion, demand waivers, and track evidence gaps.
- Budget, token, worker-count, and stop-rule controls that make expensive dynamic runs visible before execution.
- Compact run-status UX and evidence artifacts that explain what happened in human language.
- Package/release readiness for a public skill repo: version, tag, package dry-run, docs sync, and install guidance.

Not building:

- No standalone TypeScript runtime, package `bin`, or hidden scheduler.
- No unrestricted Node execution of user workflow files.
- No YAML registry as the core product surface.
- No external model routing as core CWF behavior.
- No default Desktop thread per worker.
- No platform-level automatic callback claim unless Codex exposes and a real smoke proves it.
- No deploy, credentials, databases, payments, permissions, or irreversible external writes.
- No full Claude Dynamic Workflows parity claim; CWF targets the native Codex version of the useful experience.

Source of truth:

- `README.md`
- `README.zh-CN.md`
- `docs/CORE.md`
- `docs/RUN_EXPERIENCE.md`
- `docs/WORKFLOW_JS.md`
- `docs/CWF_COMPLETION_ROADMAP.md`
- `docs/CWF_MVP_EVIDENCE.md`
- `docs/NATIVE_RUNNER_ADAPTER_PLAN.md`
- `docs/BOUNDED_DYNAMIC_WORKFLOWS_PLAN.md`
- `skills/codex-workflows/SKILL.md`
- `workflows/*.workflow.js`
- `scripts/*.mjs`

Deliverables:

- PRD
- SPEC
- Evidence-bound acceptance matrix
- Phase plan
- Staged goal prompts in `docs/goals/CWF_ENHANCEMENT_GOALS.md`

Phase scope:

- Roadmap-level contract for post-MVP CWF enhancements.
- Complete for the next enhancement sequence after current MVP evidence and commit `37b53d3`.
- Not a complete whole-product plan for hosted marketplace, scheduler, non-Codex model routing, or future Codex platform APIs.

Completeness:

- Complete for planning all currently requested enhancements.
- Not proof that any enhancement is already implemented.

Verification level:

- Default: local.
- Desktop-thread robustness: real-smoke after Ender GO when a visible thread is created.
- Desktop-thread execution preflight: pending for E2; the existing MVP Desktop thread smoke remains historical evidence, not proof that the enhanced preflight phase is complete.
- Safe write worker: real-smoke only against a disposable local target after explicit approval.
- Package/release: local package dry-run unless Ender explicitly requests publish/tag.

Review requirement:

- Reasonix/v4Pro review required before treating this roadmap as final.
- Current status is recorded in frontmatter.

Open decisions:

- Whether platform-level automatic callback becomes possible through a stable Codex app API; until proven, CWF uses coordinator synthesis.
- Whether safe write worker should promote to Desktop thread by default for inspectability; recommended default is `auto`, resolving to `desktop-thread` for non-trivial writes.
- Whether user-defined workflow discovery should be project-local only or also user-home skill-local; recommended sequence is project-local first, then skill-local.

## Plain-Language Target State

After these enhancements, CWF should feel like this:

1. You tell Codex: "Use CWF to audit/fix/plan this."
2. Codex writes or selects a bounded workflow.
3. Codex previews scope, workers, write boundaries, cost, verifier, and stop rules.
4. Short read-only workers run inline and return quietly.
5. Important long or write workers can become visible Desktop threads only when useful.
6. The main conversation receives the final answer, with evidence and verifier objections included.
7. Interrupted runs can resume from a safe checkpoint.
8. Write workers can modify files only through an approval-gated patch path.
9. Useful workflows can be saved and reused.

## PRD

### Problem

The current CWF MVP proves the native direction: run plans, inline worker evidence, selective Desktop-thread smoke, adversarial fixtures, and package checks. But the experience still needs polishing before it can be a reliable daily tool. The gaps are not about adding a huge runtime; they are about making the native workflow loop predictable, resumable, writable within boundaries, and easy to reuse.

### Target Users

- Ender using Codex Desktop for repo audits, bug hunts, UI/copy review, migration planning, and safe fix loops.
- Future Codex users installing CWF as a public skill.
- Future goal-mode Codex sessions that need exact phase contracts instead of rediscovering the design.

### Goals

- Make final results consistently land in the originating conversation through a standardized coordinator return contract.
- Make Desktop-thread workers selective, testable, and honest about fallback.
- Make resume safe after interruption or partial failure.
- Let write workers perform bounded local file changes through explicit approval and patch verification.
- Let Codex generate bounded workflows dynamically from objectives.
- Provide an understandable workflow catalog and user workflow path.
- Strengthen verifier and evidence rules so CWF does not call partial work complete.
- Keep cost and worker count visible before execution.
- Make the run experience readable for humans, not only machine-checkable.
- Prepare a public release path without overclaiming current capabilities.

### Non-Goals

- Do not rebuild Claude's hosted platform.
- Do not create hundreds-agent swarm behavior as a success metric.
- Do not ship a general sandboxed JavaScript runtime.
- Do not hide worker execution behind opaque background services.
- Do not write real files without explicit approval and patch evidence.
- Do not publish/tag/release without a separate explicit user request.

### User Stories

- As a user, I can ask CWF to run a complex task and see a compact preview before work starts.
- As a user, I can tell whether a worker will run inline or become a Desktop thread.
- As a user, I can resume a run without repeating completed unsafe work.
- As a user, I can approve a safe write worker and inspect the proposed patch before it touches the target.
- As a user, I can say a rough objective and let Codex draft the workflow.
- As a user, I can reuse built-in workflows or add my own project-local workflow.
- As a maintainer, I can verify claims through local commands, evidence files, and real-smoke labels.

### Success Criteria

- Every enhancement phase has a copy-ready goal prompt.
- Every meaningful acceptance criterion has a verification level and evidence surface.
- Docs never label dry-run, fixture, or manual synthesis as platform automatic callback.
- Safe write worker real-smoke modifies only an approved disposable target.
- Package checks prove `.cwf/` artifacts and old runtime files stay out.

## SPEC

### 1. Return Contract

CWF final output belongs in the originating conversation.

Current proven path:

- inline worker output returns to the coordinator;
- Desktop-thread output can be read by the coordinator;
- coordinator synthesizes the final result into the originating conversation.

Enhanced path:

- every run writes a `return-envelope.json` or equivalent evidence artifact;
- final answer includes status, result summary, verifier state, evidence paths, deferred items, and whether return was coordinator synthesis or platform automatic callback;
- platform automatic callback remains deferred until Codex exposes a stable API and a real smoke proves it.

### 2. Desktop-Thread Worker Contract

Desktop threads are visibility upgrades, not the default execution unit.

Required behavior:

- preflight checks thread creation and model execution, not just schema access;
- if thread creation or execution fails, CWF downgrades to inline when safe or stops with `desktop-thread-execution-unavailable`;
- the evidence records thread id, worker id, marker, return path, and fallback reason;
- no more than the approved number of visible threads are created.
- if Ender has not approved a Desktop-thread smoke by the time E1, E3, and E9 are complete, E2 can close as `deferred_with_fixture_only` and downstream phases continue with inline-only behavior.

### 3. Resume And Checkpoint Contract

Resume must prefer correctness over speed.

Required behavior:

- checkpoint can resume only from the last contiguous completed safe boundary from Phase 1;
- blocked, failed, skipped, or missing earlier phases prevent jumping forward;
- write phases require patch/evidence integrity before resume;
- final status explains whether the run resumed, restarted safely, or stopped.

### 4. Safe Write Worker Contract

Safe write workers are allowed only through gated bounded writes.

Required behavior:

- preview write scope before any write;
- require explicit `approve-write` or equivalent user approval for real writes;
- generate patch in an isolated target or disposable fixture first;
- scan changed paths against `allowed_paths` and `forbidden_paths`;
- run `git apply --check` or equivalent before apply;
- if the disposable target is not already a git repo, either initialize a temporary git repo before `git apply --check` or use `patch --dry-run` plus `diff --check` as the documented equivalent;
- run the declared verification commands after apply;
- report changed files and rollback command;
- refuse PASS if verification fails.

Desktop app-thread direct writing remains disallowed until a stable permission/approval model is proven. A Desktop thread may plan or propose the patch; the coordinator applies only through safe write gates.

### 5. Dynamic Workflow Generation Contract

Dynamic generation means Codex drafts a bounded workflow for the current objective.

Required behavior:

- user objective produces either a saved `workflow.js` harness or a run-plan-only ephemeral workflow for covered fixture families first: `repo-audit` style read-only workflows and `safe-fix-loop` style bounded write workflows;
- generated workflow must pass schema/shape checks;
- generated workflow must include scope, exclusions, worker roles, visibility, write scopes, quarantine, verifier, budget, and stop rules;
- generated workflow cannot contain executable tokens, unrestricted imports, network/process/file APIs, or hidden side effects;
- unsafe generated content must be rejected by a concrete scanner or guard, such as a blocklist or AST pass in `scripts/check-core.mjs` or a focused helper that rejects imports, `require`, `process`, `child_process`, `fs`, `fetch`, `eval`, and `Function`;
- Codex previews the generated workflow before non-trivial execution.

### 6. Workflow Catalog Contract

The catalog is a readable set of reusable workflow harnesses.

Required behavior:

- built-in workflow inventory lists purpose, when to use, inputs, visibility defaults, write policy, verifier policy, and verification level;
- project-local user workflows are discoverable without editing package internals;
- invalid workflows fail closed with clear error messages;
- catalog remains docs/data-driven, not a hosted marketplace.

### 7. Verifier Contract

Verifier output is a gate, not decoration.

Required behavior:

- verifier can return `pass`, `blocked`, `needs-waiver`, or `advisory`;
- `blocked` prevents final PASS;
- `needs-waiver` requires explicit waiver text in the final answer;
- verifier must cite evidence gaps or concrete counterexamples;
- final synthesis separates required fixes, waived risks, advisories, and unknowns.

### 8. Budget And Cost Contract

Dynamic workflows must show cost pressure before execution.

Required behavior:

- each workflow declares max workers, max phases, max tokens or rough token budget, timeout, and stop rule;
- preview warns when the run is expensive;
- CWF can refuse unbounded workflows;
- evidence records whether the budget was enforced, estimated, or not measurable in the current host.

### 9. Run Status UX Contract

Human-readable status is part of the product.

Required behavior:

- run status shows current phase, worker status, blockers, evidence, next action, and final result destination;
- final summaries use human language first, with technical evidence below;
- artifacts mirror the conversation summary so another session can resume.

### 10. Release Contract

Public readiness is local-package proof unless the user asks to publish.

Required behavior:

- README and Chinese README stay aligned;
- package dry-run includes only intended files;
- version/tag/publish require explicit separate approval;
- docs state current limits without hiding deferred platform features.

## Acceptance Matrix

| Phase | Criterion | Evidence | Level |
|---|---|---|---|
| E1 | Return envelope exists and final output distinguishes coordinator synthesis from platform callback. | Inspect run artifact and final summary; `rg -n "return.*coordinator|platform.*callback|automatic callback" docs README.md README.zh-CN.md`. | local |
| E1 | No docs claim platform automatic callback as proven. | Source audit for `automatic callback` in docs and READMEs shows callback remains deferred unless a future platform API and real smoke prove it. | local |
| E2 | Desktop-thread execution preflight verifies a real agent response marker. | Approval-gated smoke creates one thread and records thread id plus fixed marker, or records `desktop-thread-execution-unavailable`. | real-smoke |
| E2 | Fallback path is honest. | Fixture or real smoke shows inline fallback or blocked status without PASS overclaim. | fixture |
| E2 | Lack of Desktop-thread approval does not block the roadmap forever. | If E1, E3, and E9 are complete and Ender has not approved smoke, E2 records `deferred_with_fixture_only` and downstream goals proceed inline-only. | local |
| E3 | Resume uses only contiguous completed checkpoints. | Regression fixture with Phase 2 completed but Phase 1 incomplete resumes from safe start, not Phase 2. | fixture |
| E3 | Interrupted run reports resume/restart/blocked clearly. | `cwf-run-state` fixture and final evidence include selected resume path. | local |
| E4 | Safe write worker modifies only approved disposable target. | After explicit approval, run safe write smoke on `/tmp` or fixture repo; inspect changed files and rollback evidence. | real-smoke |
| E4 | Forbidden path and conflict patches fail closed. | Fixtures for forbidden path, no prior gate, conflict patch, and verification failure all refuse PASS. | fixture |
| E5 | Codex can generate a bounded workflow from an objective. | Generated workflow or ephemeral run plan passes `npm run check` and preview guard. | local |
| E5 | Generated workflows reject executable or unsafe tokens. | Concrete scanner or guard rejects negative fixtures for imports, `require`, `process`, `child_process`, `fs`, `fetch`, `eval`, `Function`, and hidden execution patterns. | fixture |
| E6 | Built-in catalog documents all current workflows. | Catalog or docs list all templates with use case, inputs, visibility, write policy, verifier policy, and evidence level. | local |
| E6 | Project-local user workflows are discoverable. | Fixture project-local workflow appears in preview/discovery without editing package internals. | fixture |
| E7 | Verifier blocker prevents completion. | Adversarial fixture returns blocked and final status is not PASS. | fixture |
| E7 | Waiver path is explicit. | Fixture returns `needs-waiver`; final summary includes waiver text and owner. | fixture |
| E7 | Verifier participates in one live flow after a write/read surface exists. | Deferred real-smoke row: after E4, run verifier on a live safe write or repo-audit result and record whether it changed final status. | real-smoke |
| E8 | Expensive runs show budget warning before workers run. | Preview fixture over threshold displays warning and stop rule. | fixture |
| E8 | Unbounded workflow is refused. | Missing budget/stop-rule fixture fails check. | fixture |
| E9 | Run status is readable and resumable. | Status artifact includes phase, worker status, evidence, next action, and final destination. | local |
| E10 | Package remains native and small. | `npm run check`; `git diff --check`; `npm pack --dry-run --json`; old-runtime absence check. | local |
| E10 | Public docs are synchronized. | README links to roadmap/evidence; Chinese README has equivalent user-facing explanation. | local |
| E10 | Reasonix review is recorded. | Frontmatter review fields and review transcript/summary show GO or findings handled. | local |

## Phase Plan

### E1: Return Envelope And Same-Conversation Result Contract

Deliverables:

- Return envelope schema documented or implemented as artifact output.
- Final summary shape updated in skill docs.
- Evidence labels for coordinator synthesis versus platform callback.

Verification:

- `npm run check`
- `git diff --check`
- fixture run artifact contains return destination and return mode.

Stop condition:

- CWF can always say where the final answer went and how it got there.

### E2: Desktop-Thread Robustness

Deliverables:

- Real execution preflight for Desktop threads.
- Fallback/blocked status names.
- Evidence table for one approval-gated smoke.

Verification:

- Approval-gated Desktop-thread real smoke, or clear unavailable status.
- `npm run check`
- no more than approved thread count created.
- If Ender has not approved smoke after E1, E3, and E9 complete, record `deferred_with_fixture_only` and proceed inline-only.

Stop condition:

- Desktop thread visibility is useful without becoming noisy or overclaimed.

### E3: Resume And Checkpoint Hardening

Deliverables:

- State-machine fixtures for completed, blocked, skipped, missing, and partial phases.
- Resume policy docs and helper behavior aligned.

Verification:

- `npm run check`
- targeted state fixtures
- `git diff --check`

Stop condition:

- Resume never jumps over an unsafe missing boundary.

### E4: Safe Write Worker Real Smoke

Deliverables:

- Approval-gated safe write worker path.
- Isolated target patch generation.
- Policy scanner, apply-check, verification, rollback evidence.
- Negative fixtures for unsafe writes.

Verification:

- Real-smoke against disposable local target after Ender approval.
- Negative fixture suite.
- Disposable target is either initialized as a temporary git repo for `git apply --check`, or uses documented `patch --dry-run` plus `diff --check` equivalent.
- `npm run check`
- `git diff --check`

Stop condition:

- CWF can safely let a worker write code in a bounded local target.

### E5: Dynamic Workflow Generation

Deliverables:

- Objective-to-workflow or objective-to-run-plan generator for the first covered fixture families: `repo-audit` style read-only workflows and `safe-fix-loop` style bounded write workflows.
- Schema/guard checks for generated workflows.
- Concrete unsafe-token scanner/guard for generated workflow content.
- Preview-before-run requirement.

Verification:

- generated `repo-audit` style workflow fixture
- generated `safe-fix-loop` style workflow fixture
- unsafe generated workflow negative fixtures rejected by the scanner/guard
- `npm run check`

Stop condition:

- User no longer needs to hand-write the first covered workflow families, and broader generation remains explicitly future scope.

### E6: Workflow Catalog And User Workflows

Deliverables:

- Built-in catalog docs or data file.
- Project-local user workflow discovery.
- Validation errors for invalid custom workflows.

Verification:

- catalog covers all built-ins
- project-local fixture discovered
- invalid fixture rejected
- package dry-run clean

Stop condition:

- CWF has reusable workflows without becoming a hosted marketplace.

### E7: Stronger Verifier And Evidence Gates

Deliverables:

- Verifier status taxonomy.
- Blocker and waiver behavior in final synthesis.
- Evidence gap reporting.

Verification:

- blocked fixture
- waiver fixture
- advisory fixture
- `npm run check`

Stop condition:

- Verifier meaningfully changes whether CWF can claim completion.

### E8: Budget And Cost Controls

Deliverables:

- Budget thresholds and expensive-run warning.
- Worker/phase/token caps.
- Refusal path for unbounded workflows.

Verification:

- expensive preview fixture
- missing budget fixture fails
- over-worker/over-phase fixture fails or warns as designed

Stop condition:

- Dynamic workflows are bounded before they spend serious tokens.

### E9: Human Run Status UX

Deliverables:

- Compact status artifact and final summary format.
- Human-language status rules in skill docs.
- Evidence mirror for continuation sessions.

Verification:

- fixture status output
- final summary sample
- docs/source audit

Stop condition:

- A human can read a run summary and know what happened, what remains, and why.

### E10: Public Release Readiness

Deliverables:

- README/docs synchronized.
- Version/tag plan.
- Package dry-run evidence.
- Release checklist.

Verification:

- `npm run check`
- `git diff --check`
- `npm pack --dry-run --json`
- old-runtime absence check
- Reasonix final review

Stop condition:

- Repo is ready for an explicit release/tag/publish decision.

## Recommended Implementation Order

1. E1, E3, E9: make current runs more reliable and understandable.
2. E2: harden Desktop-thread behavior after the core return/status shape is stable.
3. E4: add safe write real-smoke only after return, status, and resume are solid.
4. E5, E6: make workflows dynamic and reusable.
5. E7, E8: strengthen verification and cost controls across all flows.
6. E10: package and release only when docs/evidence are aligned.

This order keeps CWF native and useful before adding more surface area.

## Stop / Pause Conditions For The Roadmap

- Pause before creating visible Desktop threads unless Ender approves the exact smoke.
- Pause before real write worker tests unless Ender approves the disposable target and write scope.
- Stop and report if an enhancement requires resurrecting the removed external runtime.
- Stop and report if Codex platform APIs needed for automatic callback are unavailable.
- Stop and report if verification cannot distinguish fixture/dry-run from real-smoke.
