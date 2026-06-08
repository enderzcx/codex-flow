---
half_life: 30d
archive_at: 2026-07-08
scope_type: roadmap
scope_name: cwf-post-mvp-enhancement-goals
coverage: Copy-ready staged goal prompts for implementing the CWF post-MVP enhancement roadmap.
not_complete_for: One-shot goal to implement every future idea at once, hosted scheduler, marketplace, non-Codex routing, or full Claude platform parity.
verification_level: local
real_smoke_status: requires_approval_for_desktop_thread_and_safe_write
review_status: reviewed_with_findings_applied
reviewer: reasonix-v4pro
review_command: reasonix run -m deepseek-v4-pro:cloud --effort high --transcript /tmp/cwf-enhancement-compact-review.jsonl
review_notes: Reasonix final compact review returned GO; earlier findings on E2 deferral, E4 apply-check ambiguity, E5 unsafe scanner and scope breadth, and E9 summary example were already applied.
review_owner: Ender
review_due: 2026-06-09
---

# CWF Enhancement Goal Prompts

Use these goals one phase at a time. They are staged so Codex can finish, verify, and stop cleanly instead of turning the roadmap into an open-ended backlog.

If you want one all-in goal that implements every phase, use [CWF_FULL_IMPLEMENTATION_GOAL.md](CWF_FULL_IMPLEMENTATION_GOAL.md). That file explicitly forbids docs-only completion.

## Goal E1: Return Envelope And Same-Conversation Result Contract

```text
/goal
Outcome:
Implement the CWF return envelope and same-conversation result contract for /Users/sunny/Work/CODEX/codex-workflows so every run can state where the final result went, whether it returned by coordinator synthesis or true platform callback, what evidence supports the result, and what remains deferred.

Source of truth:
- /Users/sunny/Work/CODEX/codex-workflows/docs/CWF_ENHANCEMENT_ROADMAP.md
- /Users/sunny/Work/CODEX/codex-workflows/docs/CWF_MVP_EVIDENCE.md
- /Users/sunny/Work/CODEX/codex-workflows/docs/RUN_EXPERIENCE.md
- /Users/sunny/Work/CODEX/codex-workflows/skills/codex-workflows/SKILL.md
- /Users/sunny/Work/CODEX/codex-workflows/scripts/cwf-run-state.mjs

Allowed writes:
- docs/*.md
- skills/codex-workflows/SKILL.md
- scripts/*.mjs
- README.md
- README.zh-CN.md

Forbidden:
- Do not claim platform-level automatic callback unless a real smoke proves it.
- Do not add external runtime, package bin, YAML registry, hosted scheduler, or non-Codex routing.
- Do not create Desktop threads in this goal.
- Do not touch credentials, deploys, databases, payments, permissions, or external systems.
- Do not commit .cwf/ run artifacts.

Verification:
- npm run check
- git diff --check
- npm pack --dry-run --json
- Create or update a fixture run artifact that records return destination, return mode, final summary path, evidence path, and deferred platform callback status.
- Source audit: docs and README must distinguish coordinator synthesis from platform automatic callback.

Constraints:
- Same-conversation final answer is required.
- Return envelope may be a documented artifact shape or helper-generated local JSON, but it must stay project-local and ignored.
- Evidence labels must distinguish local, fixture, dry-run, real-smoke, and deferred.

Iteration policy:
- First update the contract and artifact shape.
- Then add the smallest helper/check regression needed.
- Do not retry the same failing check more than twice without changing the hypothesis.

Stop/Pause conditions:
- Stop when return mode is explicit in docs/artifacts and checks pass.
- Pause if the implementation requires a Codex platform API that is not available.
- Pause before any Desktop-thread creation or external write.
```

## Goal E2: Desktop-Thread Robustness

```text
/goal
Outcome:
Harden CWF Desktop-thread workers for /Users/sunny/Work/CODEX/codex-workflows so the system does a real execution preflight, creates at most one approved visible smoke thread, records thread id and marker, and falls back or blocks honestly when the Desktop model channel is unavailable.

Source of truth:
- docs/CWF_ENHANCEMENT_ROADMAP.md
- docs/CWF_MVP_EVIDENCE.md
- docs/NATIVE_RUNNER_ADAPTER_PLAN.md
- docs/RUN_EXPERIENCE.md
- skills/codex-workflows/SKILL.md

Allowed writes:
- docs/*.md
- skills/codex-workflows/SKILL.md
- scripts/*.mjs
- README.md
- README.zh-CN.md

Forbidden:
- Do not create a visible Desktop thread until Ender explicitly says GO in the goal thread.
- Do not create more than one smoke thread.
- Do not mutate global Codex config.
- Do not add external runtime, package bin, or app-server simulation as the main path.
- Do not touch production, credentials, deploys, databases, payments, permissions, or external writes.

Verification:
- npm run check
- git diff --check
- If Ender GO: create one Desktop thread, require a fixed marker response, record thread id and marker.
- If no GO or execution fails: record `desktop-thread-execution-unavailable` or `requires_approval` and do not claim real-smoke pass.
- Evidence must state whether result return was coordinator synthesis or platform automatic callback.
- If E1, E3, and E9 are complete and Ender still has not approved Desktop-thread smoke, record `deferred_with_fixture_only` and continue downstream inline-only.

Constraints:
- Desktop thread is a visibility upgrade, not per-worker default.
- Inline fallback is allowed only when safe and read-only.
- Failure must be visible to the final summary.

Iteration policy:
- Probe capability once.
- If smoke fails, retry at most once with a changed hypothesis.
- Keep all evidence labels honest.

Stop/Pause conditions:
- Stop after one successful approved smoke or a clear approval/API blocker.
- Pause if thread creation would create sidebar noise beyond the approved smoke.
- Do not let lack of Desktop-thread approval block E4-E10; close E2 as `deferred_with_fixture_only` after the E1/E3/E9 milestone.
```

## Goal E3: Resume And Checkpoint Hardening

```text
/goal
Outcome:
Harden CWF resume/checkpoint behavior for /Users/sunny/Work/CODEX/codex-workflows so interrupted runs resume only from the last contiguous completed safe boundary from Phase 1, never skip missing or blocked earlier phases, and report resume/restart/blocked status in human language.

Source of truth:
- docs/CWF_ENHANCEMENT_ROADMAP.md
- docs/CWF_COMPLETION_ROADMAP.md
- docs/CWF_MVP_EVIDENCE.md
- scripts/cwf-run-state.mjs
- scripts/check-core.mjs

Allowed writes:
- docs/*.md
- scripts/*.mjs
- skills/codex-workflows/SKILL.md
- README.md
- README.zh-CN.md

Forbidden:
- Do not commit .cwf/ run artifacts.
- Do not add old runtime files: src/, package-lock.json, tsconfig.json.
- Do not create Desktop threads or write real target files.
- Do not touch credentials, deploys, databases, payments, permissions, or external systems.

Verification:
- npm run check
- git diff --check
- Fixtures for completed, blocked, failed, skipped, missing, and partial phase states.
- Regression proving Phase 2 completed with Phase 1 incomplete does not resume from Phase 2.
- Final status artifact or helper output says resumed, safely restarted, or blocked.

Constraints:
- Correctness beats speed.
- Write phases require patch/evidence integrity before resume.
- Missing evidence means blocked or safe restart, not PASS.

Iteration policy:
- Add failing fixtures first.
- Fix state logic second.
- Update docs last to match behavior.

Stop/Pause conditions:
- Stop when unsafe resume paths are covered by tests/checks.
- Pause if resume correctness depends on unavailable platform state.
```

## Goal E4: Safe Write Worker Real Smoke

```text
/goal
Outcome:
Implement and real-smoke CWF safe write workers for /Users/sunny/Work/CODEX/codex-workflows so an approved worker can generate a patch in an isolated disposable target, pass path policy and apply checks, run verification, apply only allowed changes, and report rollback evidence without allowing unrestricted Desktop-thread writes.

Source of truth:
- docs/CWF_ENHANCEMENT_ROADMAP.md
- docs/CWF_COMPLETION_ROADMAP.md
- workflows/safe-fix-loop.workflow.js
- docs/RUN_EXPERIENCE.md
- skills/codex-workflows/SKILL.md

Allowed writes:
- docs/*.md
- workflows/*.workflow.js
- scripts/*.mjs
- skills/codex-workflows/SKILL.md
- README.md
- README.zh-CN.md
- disposable local target under /tmp only after Ender approves the smoke; target must be `git init`'d before `git apply --check`, or the goal must use `patch --dry-run` plus `diff --check` as the non-git equivalent

Forbidden:
- Do not write real project target files without explicit `approve-write` or equivalent Ender approval.
- Do not allow Desktop app-thread workers to write files directly.
- Do not touch credentials, deploys, databases, payments, permissions, production, or external systems.
- Do not apply patches touching forbidden paths.
- Do not claim PASS after failed verification.

Verification:
- npm run check
- git diff --check
- npm pack --dry-run --json
- After Ender approval, run real-smoke against a disposable /tmp target and record changed file list, policy result, `git apply --check` result for a temporary git repo or `patch --dry-run` plus `diff --check` for a non-git target, verification output, and rollback command.
- Negative fixtures: no prior gate, forbidden path, out-of-scope path, conflict patch, and verification failure all refuse PASS.

Constraints:
- Safe write workers must use bounded patch flow.
- Coordinator owns final apply decision.
- Write scope must be previewed before execution.

Iteration policy:
- Build dry-run and negative fixtures before real-smoke.
- Run real-smoke only on disposable local target.
- Stop after two same-root-cause patch failures and report the blocker.

Stop/Pause conditions:
- Stop when positive and negative write paths are evidenced.
- Pause before any non-disposable write.
- Pause if safe writes require unrestricted worker filesystem access.
```

## Goal E5: Dynamic Workflow Generation

```text
/goal
Outcome:
Make CWF dynamically generate bounded workflows for /Users/sunny/Work/CODEX/codex-workflows for the first covered fixture families: repo-audit style read-only workflows and safe-fix-loop style bounded write workflows. Codex should turn a user objective in those families into a schema-checked workflow.js harness or ephemeral run plan with scope, exclusions, workers, visibility, write scopes, quarantine, verifier, budget, and stop rules.

Source of truth:
- docs/CWF_ENHANCEMENT_ROADMAP.md
- docs/BOUNDED_DYNAMIC_WORKFLOWS_PLAN.md
- docs/WORKFLOW_JS.md
- scripts/cwf-run-plan.mjs
- scripts/cwf-run-preview.mjs
- workflows/*.workflow.js

Allowed writes:
- docs/*.md
- workflows/*.workflow.js
- scripts/*.mjs
- skills/codex-workflows/SKILL.md
- README.md
- README.zh-CN.md

Forbidden:
- Do not execute generated workflow files as unrestricted Node.
- Do not allow generated imports, process/network/file APIs, child processes, eval, or hidden side effects.
- Do not add a package bin CLI or old runtime.
- Do not create Desktop threads or write real target files in this goal.
- Do not touch credentials, deploys, databases, payments, permissions, or external systems.

Verification:
- npm run check
- git diff --check
- Generated repo-audit style workflow fixture passes preview/run-plan checks.
- Generated safe-fix-loop style workflow fixture passes preview/run-plan checks without real writes.
- Concrete scanner/guard rejects negative fixtures for imports, `require`, `process`, `child_process`, `fs`, `fetch`, `eval`, `Function`, and hidden execution patterns.

Constraints:
- Dynamic means objective-adapted planning, not unbounded code execution.
- Preview before non-trivial execution remains mandatory.
- Generated workflow must preserve budget and verifier rules.
- General-purpose generation beyond the two covered fixture families is future scope, not completion for this goal.

Iteration policy:
- Start with ephemeral run-plan generation.
- Save generated workflow only after the shape is stable.
- Keep unsafe-token checks close to existing `check-core` guards.

Stop/Pause conditions:
- Stop when generated workflows are useful and safe in fixtures.
- Pause if generation quality depends on unavailable model/tool APIs.
- Pause if the implementation claims general-purpose workflow generation without fixture coverage.
```

## Goal E6: Workflow Catalog And User Workflows

```text
/goal
Outcome:
Add a small CWF workflow catalog and user workflow discovery path for /Users/sunny/Work/CODEX/codex-workflows so built-in workflows are easy to choose and project-local workflows can be validated without editing package internals.

Source of truth:
- docs/CWF_ENHANCEMENT_ROADMAP.md
- README.md
- README.zh-CN.md
- docs/WORKFLOW_JS.md
- workflows/*.workflow.js
- skills/codex-workflows/SKILL.md

Allowed writes:
- docs/*.md
- workflows/*.workflow.js
- optional workflow catalog data/doc under workflows/ or docs/
- scripts/*.mjs
- skills/codex-workflows/SKILL.md
- README.md
- README.zh-CN.md

Forbidden:
- Do not add YAML registry as the core product surface.
- Do not add hosted marketplace, package bin CLI, or external runtime.
- Do not execute user workflows as unrestricted JavaScript.
- Do not touch credentials, deploys, databases, payments, permissions, or external systems.

Verification:
- npm run check
- git diff --check
- npm pack --dry-run --json
- Catalog lists all current built-ins with purpose, inputs, visibility, write policy, verifier policy, and evidence level.
- Fixture project-local workflow is discovered and validated.
- Invalid custom workflow fixture fails with a clear error.

Constraints:
- Catalog is readable and small.
- Project-local discovery must not require modifying installed package internals.
- Invalid workflows fail closed.

Iteration policy:
- Document built-ins first.
- Add discovery fixture second.
- Keep marketplace/non-Codex routing out of scope.

Stop/Pause conditions:
- Stop when built-ins and one user workflow path are validated.
- Pause if discovery requires a persistent daemon or hosted service.
```

## Goal E7: Stronger Verifier And Evidence Gates

```text
/goal
Outcome:
Strengthen CWF verifier semantics for /Users/sunny/Work/CODEX/codex-workflows so verifier output can explicitly pass, block, require waiver, or mark advisory notes, and final synthesis cannot claim completion when verifier evidence blocks it.

Source of truth:
- docs/CWF_ENHANCEMENT_ROADMAP.md
- docs/BOUNDED_DYNAMIC_WORKFLOWS_PLAN.md
- workflows/adversarial-verify.workflow.js
- skills/codex-workflows/SKILL.md
- scripts/cwf-run-state.mjs

Allowed writes:
- docs/*.md
- workflows/*.workflow.js
- scripts/*.mjs
- skills/codex-workflows/SKILL.md
- README.md
- README.zh-CN.md

Forbidden:
- Do not treat advisory notes as blockers without evidence.
- Do not allow blocked verifier output to produce PASS.
- Do not create Desktop threads or write real target files.
- Do not touch credentials, deploys, databases, payments, permissions, or external systems.

Verification:
- npm run check
- git diff --check
- Blocked verifier fixture prevents PASS.
- Needs-waiver fixture requires explicit waiver text and owner.
- Advisory fixture does not block but appears in final summary.

Constraints:
- Verifier must cite evidence gaps or concrete counterexamples.
- Final summary separates required fixes, waivers, advisories, and unknowns.
- Missing evidence means partial or blocked.

Iteration policy:
- Implement taxonomy in docs and fixtures first.
- Wire final summary behavior second.
- Keep changes template/check focused.

Stop/Pause conditions:
- Stop when pass/block/waiver/advisory are evidenced.
- Pause if a verifier outcome requires user risk acceptance.
```

## Goal E8: Budget And Cost Controls

```text
/goal
Outcome:
Add CWF budget and cost controls for /Users/sunny/Work/CODEX/codex-workflows so dynamic workflows preview worker count, phase count, token or rough budget, timeout, and stop rules, warn before expensive runs, and refuse unbounded workflows.

Source of truth:
- docs/CWF_ENHANCEMENT_ROADMAP.md
- docs/CORE.md
- docs/RUN_EXPERIENCE.md
- scripts/cwf-run-preview.mjs
- scripts/check-core.mjs
- workflows/*.workflow.js

Allowed writes:
- docs/*.md
- workflows/*.workflow.js
- scripts/*.mjs
- skills/codex-workflows/SKILL.md
- README.md
- README.zh-CN.md

Forbidden:
- Do not create Desktop threads or write real target files.
- Do not add external runtime, hosted scheduler, package bin, or model routing.
- Do not touch credentials, deploys, databases, payments, permissions, or external systems.

Verification:
- npm run check
- git diff --check
- Expensive-run preview fixture shows warning before workers run.
- Missing budget or stop-rule fixture fails check.
- Over-worker or over-phase fixture fails or warns according to documented threshold.

Constraints:
- Budget enforcement may be estimated when host token accounting is unavailable.
- Preview must say whether budget was enforced, estimated, or not measurable.
- Unbounded workflows fail closed.

Iteration policy:
- Add thresholds and docs first.
- Add preview/check fixtures second.
- Keep output human-readable.

Stop/Pause conditions:
- Stop when expensive and unbounded cases are both covered.
- Pause if exact token accounting is unavailable and the plan would require pretending it is exact.
```

## Goal E9: Human Run Status UX

```text
/goal
Outcome:
Improve CWF human run status UX for /Users/sunny/Work/CODEX/codex-workflows so status and final summaries show current phase, worker state, blockers, evidence, next action, final destination, and a plain-language explanation of what happened.

Source of truth:
- docs/CWF_ENHANCEMENT_ROADMAP.md
- docs/RUN_EXPERIENCE.md
- skills/codex-workflows/SKILL.md
- scripts/cwf-run-state.mjs

Allowed writes:
- docs/*.md
- scripts/*.mjs
- skills/codex-workflows/SKILL.md
- README.md
- README.zh-CN.md

Forbidden:
- Do not add web dashboard, hosted scheduler, package bin, or external runtime.
- Do not create Desktop threads or write real target files.
- Do not touch credentials, deploys, databases, payments, permissions, or external systems.

Verification:
- npm run check
- git diff --check
- Fixture status output includes phase, worker status, blocker, evidence, next action, and final destination.
- Final summary sample starts with human-language conclusion before technical evidence.
- Include this sample shape in docs or fixture output: `结论：这次 CWF 已完成 repo-audit 的只读检查。它完成了 correctness/tests/maintainability 三个 worker，当前没有 blocker，证据在 docs/CWF_MVP_EVIDENCE.md 和 npm run check。下一步是按 verifier 建议决定是否进入 safe write。`

Constraints:
- Status should be compact enough for normal conversation.
- Artifacts should mirror enough detail for continuation sessions.
- Technical logs belong below the human summary.

Iteration policy:
- Define status shape first.
- Add helper/check fixture second.
- Update docs last.

Stop/Pause conditions:
- Stop when another session can understand a run from the status artifact and final summary.
- Pause if a richer visual dashboard becomes necessary; that is out of this goal.
```

## Goal E10: Public Release Readiness

```text
/goal
Outcome:
Prepare CWF public release readiness for /Users/sunny/Work/CODEX/codex-workflows without publishing: docs synchronized, package dry-run clean, old runtime absent, version/tag decision documented, and Reasonix/v4Pro final review recorded.

Source of truth:
- docs/CWF_ENHANCEMENT_ROADMAP.md
- docs/CWF_MVP_EVIDENCE.md
- README.md
- README.zh-CN.md
- package.json
- skills/codex-workflows/SKILL.md
- workflows/*.workflow.js
- scripts/*.mjs

Allowed writes:
- README.md
- README.zh-CN.md
- docs/*.md
- skills/codex-workflows/SKILL.md
- workflows/*.workflow.js
- scripts/*.mjs
- package.json only for version metadata if Ender explicitly approves the version

Forbidden:
- Do not publish to npm.
- Do not create git tags unless Ender explicitly asks.
- Do not deploy anything.
- Do not add old runtime files: src/, package-lock.json, tsconfig.json.
- Do not touch credentials, databases, payments, permissions, or external systems.

Verification:
- npm run check
- git diff --check
- npm pack --dry-run --json
- Old-runtime absence check: src, package-lock.json, tsconfig.json absent.
- README and README.zh-CN link to roadmap, evidence, and goal docs.
- Reasonix/v4Pro final review returns GO or findings are applied/waived with evidence.

Constraints:
- Public docs must not overclaim full Claude parity or platform automatic callback.
- Release readiness is not release.
- Version/tag/publish remain explicit separate decisions.

Iteration policy:
- Verify current package first.
- Update docs second.
- Run review last and apply required findings.

Stop/Pause conditions:
- Stop when local release-readiness evidence is complete.
- Pause before version bump, tag, publish, deploy, or external write.
```
