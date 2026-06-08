---
half_life: 30d
archive_at: 2026-07-08
scope_type: roadmap
scope_name: cwf-full-enhancement-implementation-goal
coverage: One copy-ready goal prompt for implementing every CWF post-MVP enhancement phase E1-E10, not just writing plans.
not_complete_for: Hosted scheduler, marketplace operation, non-Codex model routing, unrestricted JavaScript execution, production deployment, npm publish, git tag, or full Claude platform parity that Codex does not expose.
verification_level: local
real_smoke_status: requires_approval_for_desktop_thread_and_safe_write
review_status: not_reviewed
reviewer: reasonix-v4pro
review_status: reviewed_with_findings_applied
review_command: reasonix run -m deepseek-v4-pro:cloud --effort high --transcript /tmp/cwf-full-implementation-review-2.jsonl
review_notes: Reasonix first full implementation pass blocked on E8 expensive-run warning and unbounded-workflow refusal fixtures plus E2 label clarity. Fixes were applied; second pass returned GO.
review_owner: Ender
review_due: 2026-06-09
---

# CWF Full Enhancement Implementation Goal

This is the single all-in goal for implementing the complete CWF post-MVP enhancement roadmap.

Important: this goal is not satisfied by adding or editing planning docs. It is only complete when E1-E10 have implementation, checks, fixtures or real-smoke evidence, updated docs, and final review.

```text
/goal
Outcome:
Fully implement the CWF post-MVP enhancement roadmap in /Users/sunny/Work/CODEX/codex-workflows across phases E1-E10. The final repo must support the complete native Codex workflow experience described in docs/CWF_ENHANCEMENT_ROADMAP.md: return envelope and same-conversation result contract, Desktop-thread execution preflight and fallback, hardened resume/checkpoint behavior, approval-gated safe write workers, dynamic workflow generation for the first supported workflow families, built-in catalog plus project-local workflow discovery, stronger verifier/evidence gates, budget/cost controls, human-readable run status UX, and public release-readiness checks.

This is an implementation goal, not a planning goal. Do not mark complete if the diff only changes README/docs/goals. Completion requires meaningful code/check/fixture changes under scripts/, skills/, workflows/, or a new test/fixture surface, plus synchronized docs.

Source of truth:
- /Users/sunny/Work/CODEX/codex-workflows/docs/CWF_ENHANCEMENT_ROADMAP.md
- /Users/sunny/Work/CODEX/codex-workflows/docs/goals/CWF_ENHANCEMENT_GOALS.md
- /Users/sunny/Work/CODEX/codex-workflows/docs/CWF_MVP_EVIDENCE.md
- /Users/sunny/Work/CODEX/codex-workflows/docs/RUN_EXPERIENCE.md
- /Users/sunny/Work/CODEX/codex-workflows/docs/WORKFLOW_JS.md
- /Users/sunny/Work/CODEX/codex-workflows/docs/CORE.md
- /Users/sunny/Work/CODEX/codex-workflows/skills/codex-workflows/SKILL.md
- /Users/sunny/Work/CODEX/codex-workflows/scripts/cwf-run-preview.mjs
- /Users/sunny/Work/CODEX/codex-workflows/scripts/cwf-run-plan.mjs
- /Users/sunny/Work/CODEX/codex-workflows/scripts/cwf-run-state.mjs
- /Users/sunny/Work/CODEX/codex-workflows/scripts/check-core.mjs
- /Users/sunny/Work/CODEX/codex-workflows/workflows/*.workflow.js

Required implementation phases:

1. E1 Return envelope and same-conversation result contract:
   - Implement or document-as-helper a concrete return envelope artifact, such as `.cwf/runs/RUN_ID/return-envelope.json`.
   - It must record run id, workflow, final destination, return mode, coordinator synthesis vs platform callback, final summary path, evidence path, verifier status, deferred items, and completion status.
   - It must be generated or validated by scripts/checks, not only described in prose.
   - Platform automatic callback remains deferred unless a real smoke proves it.

2. E2 Desktop-thread execution preflight and fallback:
   - Add a real preflight contract that checks both thread creation capability and actual agent/model response marker when Ender approves a visible smoke.
   - If Ender does not approve Desktop-thread smoke by the E1/E3/E9 milestone, record `deferred_with_fixture_only` and continue inline-only.
   - If execution is unavailable, record `desktop-thread-execution-unavailable` and do not claim real-smoke pass.
   - Create no visible Desktop thread unless Ender explicitly says GO inside this goal.

3. E3 Resume and checkpoint hardening:
   - Implement or strengthen state logic so resume only uses the last contiguous completed safe boundary from Phase 1.
   - Add fixtures/checks for completed, blocked, failed, skipped, missing, and partial phases.
   - Prove Phase 2 completed with Phase 1 incomplete does not resume from Phase 2.
   - Status must say resumed, safely restarted, or blocked.

4. E4 Safe write worker real-smoke:
   - Implement approval-gated bounded write behavior for `safe-fix-loop`.
   - Preview write scope before any write.
   - Require explicit `approve-write` or equivalent Ender approval before real writes.
   - Generate patch in an isolated disposable target under /tmp or a fixture target.
   - Check changed paths against allowed and forbidden paths.
   - Use a temporary git repo for `git apply --check`, or use `patch --dry-run` plus `diff --check` as the non-git equivalent.
   - Run declared verification after apply.
   - Record changed files and rollback command.
   - Negative fixtures must prove refusal for no prior gate, forbidden path, out-of-scope path, conflict patch, and verification failure.
   - Do not let Desktop app-thread workers write files directly.

5. E5 Dynamic workflow generation:
   - Implement objective-to-workflow or objective-to-run-plan generation for the first covered fixture families: repo-audit style read-only workflows and safe-fix-loop style bounded write workflows.
   - Generated output must include scope, exclusions, workers, visibility, write scopes, quarantine, verifier, budget, and stop rules.
   - Add a concrete unsafe-token scanner/guard for generated workflow content that rejects imports, `require`, `process`, `child_process`, `fs`, `fetch`, `eval`, `Function`, and hidden execution patterns.
   - General-purpose generation beyond these two families is future scope and must not be claimed complete.

6. E6 Workflow catalog and user workflows:
   - Add a small built-in catalog or catalog doc/data surface covering every current workflow template.
   - Each catalog entry must include purpose, when to use, inputs, visibility default, write policy, verifier policy, and evidence level.
   - Add project-local user workflow discovery without editing package internals.
   - Invalid custom workflows must fail closed with a clear error.
   - Do not add YAML registry as the core surface and do not add hosted marketplace behavior.

7. E7 Stronger verifier and evidence gates:
   - Implement verifier statuses: `pass`, `blocked`, `needs-waiver`, and `advisory`.
   - `blocked` must prevent final PASS.
   - `needs-waiver` must require explicit waiver text and owner in the final summary.
   - `advisory` must be visible but non-blocking.
   - Add fixtures for blocked, waiver, and advisory.
   - Add a deferred real-smoke row or evidence item for verifier participation in a live read/write flow after E4 exists.

8. E8 Budget and cost controls:
   - Implement or strengthen preview/check behavior for max workers, max phases, max tokens or rough budget, timeout, and stop rule.
   - Expensive runs must warn before workers run.
   - Missing budget or missing stop rule must fail closed.
   - If exact token accounting is unavailable, say `estimated` or `not measurable`; do not pretend exact enforcement.

9. E9 Human run status UX:
   - Implement compact status output or artifact showing phase, worker status, blockers, evidence, next action, and final destination.
   - Final summary must begin with human-language conclusion before technical evidence.
   - Include this sample shape in docs or fixtures: `结论：这次 CWF 已完成 repo-audit 的只读检查。它完成了 correctness/tests/maintainability 三个 worker，当前没有 blocker，证据在 docs/CWF_MVP_EVIDENCE.md 和 npm run check。下一步是按 verifier 建议决定是否进入 safe write。`
   - Artifacts must mirror enough detail for another session to resume.

10. E10 Public release readiness:
   - Synchronize README.md, README.zh-CN.md, docs, skill docs, workflow templates, scripts, and evidence docs with actual behavior.
   - Package dry-run must include intended docs/scripts/workflows and exclude `.cwf/`, `src/`, `package-lock.json`, and `tsconfig.json`.
   - Add or update release-readiness checklist/evidence.
   - Do not publish to npm, create git tags, or deploy unless Ender explicitly asks.
   - Run Reasonix/v4Pro final review and apply or explicitly waive blocker/high findings before complete.

Boundaries:
This goal may change the CWF repo implementation, checks, fixtures, workflow templates, skill instructions, README, and docs listed below. It may create disposable smoke targets under /tmp only after explicit approval for safe-write testing. It must not touch production, credentials, deploys, databases, payments, permissions, customer data, npm publish, git tags, or any irreversible external system.

Allowed writes:
- /Users/sunny/Work/CODEX/codex-workflows/README.md
- /Users/sunny/Work/CODEX/codex-workflows/README.zh-CN.md
- /Users/sunny/Work/CODEX/codex-workflows/docs/**
- /Users/sunny/Work/CODEX/codex-workflows/docs/goals/**
- /Users/sunny/Work/CODEX/codex-workflows/skills/codex-workflows/SKILL.md
- /Users/sunny/Work/CODEX/codex-workflows/workflows/*.workflow.js
- /Users/sunny/Work/CODEX/codex-workflows/scripts/*.mjs
- /Users/sunny/Work/CODEX/codex-workflows/package.json only if needed for scripts/files metadata, not for publish
- /Users/sunny/Work/CODEX/codex-workflows/fixtures/** or /Users/sunny/Work/CODEX/codex-workflows/test-fixtures/** if useful for deterministic checks
- Disposable local smoke targets under /tmp only after explicit approval for safe-write real smoke

Do not edit:
- Do not edit production systems, credentials, deploy configs, databases, payment or permission systems, customer data, external services, global Codex config, or unrelated repositories.
- Do not edit real project target files through safe-write smoke unless Ender explicitly approves that exact write scope.
- Do not edit package release metadata for publish/tag unless Ender explicitly approves the version/release action.

Forbidden:
- Do not mark complete if only README/docs/goals changed.
- Do not add or resurrect the old external runtime as the core product.
- Do not add `src/`, TypeScript runner, package `bin`, hosted scheduler, marketplace service, app-server simulation as the main path, or YAML registry as the core surface.
- Do not execute workflow files as unrestricted Node scripts.
- Do not allow generated workflows to use imports, network, process, filesystem, eval, Function, child processes, or hidden side effects.
- Do not create Desktop sidebar threads unless Ender explicitly approves the exact smoke.
- Do not write real project target files without explicit `approve-write` or equivalent Ender approval.
- Do not touch credentials, production, deploys, databases, payments, permissions, customer data, or irreversible external systems.
- Do not publish to npm, create git tags, merge PRs, or deploy anything.
- Do not claim full Claude Dynamic Workflows parity or platform automatic callback unless proven by real smoke.

Verification:
- `npm run check`
- `git diff --check`
- `npm pack --dry-run --json`
- Delivery docs check if available:
  - `python3 /Users/sunny/.agents/skills/delivery-planner/scripts/check_delivery_doc.py docs/CWF_ENHANCEMENT_ROADMAP.md`
  - `python3 /Users/sunny/.agents/skills/delivery-planner/scripts/check_delivery_doc.py docs/goals/CWF_ENHANCEMENT_GOALS.md`
- Goal prompt check if available:
  - `python3 /Users/sunny/.agents/skills/goal-writer/scripts/check_goal_prompt.py docs/goals/CWF_FULL_IMPLEMENTATION_GOAL.md`
- Source audit proving no false callback claim:
  - Build the forbidden regex from split shell fragments so the goal file does not self-match, then run it against README/docs/skills/workflows/scripts. It must return no false claim.
- Old runtime absence:
  - `for p in src package-lock.json tsconfig.json; do [ ! -e "$p" ] && echo "ABSENT $p"; done`
- E1 evidence: return envelope fixture or generated artifact includes destination, return mode, evidence, final path, verifier, deferred items.
- E2 evidence: approved Desktop-thread real-smoke marker, or explicit `requires_approval` / `deferred_with_fixture_only` / `desktop-thread-execution-unavailable` without overclaim.
- E3 evidence: resume fixtures cover completed, blocked, failed, skipped, missing, and partial phases; unsafe partial resume is rejected.
- E4 evidence: positive safe-write real-smoke on disposable target only after approval, plus negative fixtures for unsafe writes. If approval is not given, keep E4 real-smoke as `requires_approval` and complete only dry-run/fixture surfaces with honest status.
- E5 evidence: generated repo-audit and safe-fix-loop family fixtures pass; unsafe generated workflow fixtures fail closed.
- E6 evidence: catalog covers all built-in workflows and project-local custom workflow discovery works in fixture.
- E7 evidence: verifier blocked/waiver/advisory fixtures affect final status correctly.
- E8 evidence: expensive-run warning and unbounded-workflow refusal fixtures pass.
- E9 evidence: status artifact/final summary sample uses human-language conclusion and includes evidence/next action.
- E10 evidence: release-readiness checklist/evidence updated and Reasonix/v4Pro final review returns GO or all blocker/high findings are handled.

Constraints:
- CWF remains Codex-native: skill + workflow harnesses + scripts/checks + native worker/thread semantics.
- Same-conversation final synthesis remains the required product behavior.
- Desktop threads are selective visibility upgrades, not one thread per worker.
- Safe write workers must use bounded patch flow; direct unrestricted worker writes are forbidden.
- Fixture, dry-run, local, real-smoke, approval-gated, deferred, and prod labels must stay separate.
- If a platform capability is unavailable, implement detection/fallback/evidence and mark that capability deferred instead of pretending it works.
- Keep final user-facing summaries in plain Chinese first, with technical evidence below.

Iteration policy:
- Work phase by phase E1 through E10, but do not stop after only one phase unless blocked by a real platform/user-approval condition.
- After each phase, update implementation, checks/fixtures, docs, and evidence together.
- Run `npm run check` after each substantial phase or batch.
- When a phase depends on Ender approval for Desktop-thread or safe-write real-smoke, ask for approval at that point. If approval is not given, record `requires_approval` or `deferred_with_fixture_only` and continue with the remaining non-blocked phases.
- Do not retry the same failing approach more than twice without writing the root-cause hypothesis and changing tactics.
- If implementation scope grows beyond the allowed writes or requires a new runtime/service, stop and report before proceeding.

Stop when:
- E1-E10 are implemented or honestly deferred by explicit platform/user-approval blocker.
- All required checks pass.
- Docs and evidence match actual behavior.
- The final diff includes meaningful implementation/check/fixture changes, not only README/docs/goals.
- Reasonix/v4Pro final review has no unresolved blocker/high findings.

Pause if:
- Creating any visible Desktop thread would be necessary and Ender has not explicitly approved that exact smoke.
- Any real file write outside a disposable /tmp target would be necessary.
- A version bump, git tag, npm publish, deploy, or external system action would be necessary.
- Codex platform APIs needed for true automatic callback are unavailable; implement coordinator synthesis and mark platform callback deferred instead.
- Safe write real-smoke needs approval and Ender has not approved it; continue other phases with honest evidence labels.
- The only possible implementation path would resurrect the removed external runtime or unrestricted workflow execution; stop and report before proceeding.

Final response requirements:
- Say in human language what functionality was actually implemented, not just which docs changed.
- List changed code/check/fixture files separately from docs.
- Include a phase table E1-E10 with status: implemented, real-smoke passed, fixture/local passed, deferred with reason, or blocked.
- Include exact verification commands and pass/fail.
- Include Reasonix/v4Pro review result and transcript path or summary.
- Include commit/push status if commit/push was requested.
```
