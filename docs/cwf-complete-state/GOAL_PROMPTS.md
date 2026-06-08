---
half_life: 30d
archive_at: 2026-07-06
scope_type: roadmap
scope_name: CWF complete-state staged goal prompts
coverage: Copy-ready staged goal prompts for implementing the complete-state roadmap from Phase A through Phase H.
not_complete_for: A single all-in-one goal, exact Claude parity, unrestricted JS, hosted scheduling, non-Codex routing, direct app-thread mutation of original targets, production deploys, database/credential/payment/permission writes.
verification_level: docs-only
real_smoke_status: requires_approval
review_status: reviewed
reviewer: reasonix-v4pro
review_command: crb delegate --mode final-review --background --json review-mq4gvwrl-uml18p
review_notes: Reasonix approved Phase H docs; medium wording issue about proposal apply path resolved by making app-thread write proposals safePatch-only.
review_owner: Codex
review_due: resolved 2026-06-06
---

# Goal Prompts: CWF Complete-State

Use one goal at a time. The whole roadmap is intentionally not a single `/goal`.

## Phase A: Intent To Preview

Current state:

- Local dynamic `workflow.js` execution already exists on the v1.11 preview branch.
- The existing runtime already covers preview, approval gate, AST policy, child execution, and initial CWF APIs.
- The current working tree already contains a Phase A MVP for `cwf dynamic generate`, pending acceptance/commit/release.
- This phase adds or hardens the missing Codex-generated authoring step from user intent to previewable script.
- Do not rebuild the dynamic execution runtime unless a failing test proves a gap in the existing path.
- If `cwf dynamic generate` already exists, treat this goal as acceptance hardening, docs alignment, and verification rather than a rewrite.

```text
/goal
Outcome:
Build Phase A of the CWF complete-state roadmap in /Users/sunny/Work/CODEX/codex-workflows: given a user request, Codex can generate a preview-first workflow.js artifact for CWF, validate it, render a human-readable preview, and stop at approve-dynamic before execution.

Boundaries:
Allowed writes:
- src/dynamic-workflow.ts
- src/cli.ts
- src/workflow-suggestion.ts or a new focused generator module
- tests for dynamic workflow generation and validation
- fixtures/dynamic/
- docs/CWF_COMPLETE_STATE_PLAN.md
- docs/cwf-complete-state/
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

## Phase B: Same-Conversation Result Return

```text
/goal
Outcome:
Build Phase B of the CWF complete-state roadmap in /Users/sunny/Work/CODEX/codex-workflows: a CWF run launched from Codex returns a concise result summary and artifact links to the initiating Codex conversation by default, while keeping --new-thread explicit.

Boundaries:
Allowed writes:
- skills/codex-workflows/SKILL.md
- src/cli.ts
- src/desktop-bridge.ts
- tests for handoff/result behavior
- docs/CWF_COMPLETE_STATE_PLAN.md
- docs/cwf-complete-state/
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
- Stop as blocked after three repeated failures with the same root cause.
```

## Phase C: Worker Visibility

```text
/goal
Outcome:
Build Phase C of the CWF complete-state roadmap in /Users/sunny/Work/CODEX/codex-workflows: read-only CWF workers can use Codex Desktop-visible worker threads when app-server execution is actually available, and fall back explicitly when it is not.

Boundaries:
Allowed writes:
- src/adapters/worker-adapter.ts
- src/desktop-bridge.ts
- src/cli.ts
- tests/worker-adapter.test.ts
- tests/desktop-bridge.test.ts
- docs/CWF_COMPLETE_STATE_PLAN.md
- docs/cwf-complete-state/
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

## Phase D: Write-Capable Dynamic Workers

```text
/goal
Outcome:
Build Phase D of the CWF complete-state roadmap in /Users/sunny/Work/CODEX/codex-workflows: dynamic workflows can request safe write work only through a guarded safePatch path or parent-capped inherit-session, with no direct JavaScript writes.

Boundaries:
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
- docs/cwf-complete-state/
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

## Phase E-F: Built-In Modes And Save/Reuse

Sequencing note:

Implement built-in modes and fixture coverage first. Add save/reuse only after template execution is stable enough that trust metadata has something concrete to bind to.

```text
/goal
Outcome:
Build Phases E and F of the CWF complete-state roadmap in /Users/sunny/Work/CODEX/codex-workflows: ship reusable dynamic workflow templates for high-value tasks and allow approved workflows to be saved/reused with trust metadata.

Boundaries:
Allowed writes:
- workflows/ or a dedicated dynamic templates directory
- src/workflow-registry.ts
- src/dynamic-workflow.ts
- tests for templates, registry, trust metadata, SHA mismatch, and no direct URL run
- docs/workflow-catalog.md
- docs/CWF_COMPLETE_STATE_PLAN.md
- docs/cwf-complete-state/
- README.md and README.zh-CN.md

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
- Stop as blocked after three repeated failures with the same root cause.
```

## Phase G: Public Polish And Release

```text
/goal
Outcome:
Build Phase G of the CWF complete-state roadmap in /Users/sunny/Work/CODEX/codex-workflows: public docs, Chinese docs, workflow catalog, skill routing, release notes, and smoke coverage present CWF's complete-state UX clearly without overclaiming shipped capabilities.

Boundaries:
Allowed writes:
- README.md
- README.zh-CN.md
- RELEASE_NOTES.md
- docs/CWF_COMPLETE_STATE_PLAN.md
- docs/WHEN_TO_USE_CWF.md
- docs/cwf-complete-state/
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

## Phase H: Native Host Return And Visible Write Proposals

```text
/goal
Outcome:
Build Phase H of the CWF complete-state roadmap in /Users/sunny/Work/CODEX/codex-workflows: make CWF feel native in Codex Desktop by adding a Codex skill-wrapper result return path and a Desktop-visible write-proposal worker path, without allowing hidden direct app-thread writes to the original target.

Boundaries:
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

Do not edit:
- Same as Forbidden above; keep direct app-thread original-target writes, thread-list current-thread guessing, Desktop-only behavior, and weakened write gates out of scope.

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

Stop when:
- Same-conversation return and write-proposal safePatch flow are verified, docs are aligned, and Reasonix has no blocker/high findings.

Pause if:
- True current-thread callback support requires a Codex host feature outside this repo, or implementation needs direct app-thread writes to the original target.
```
