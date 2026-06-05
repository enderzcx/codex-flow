---
half_life: 30d
archive_at: 2026-07-05
scope_type: version
scope_name: v1.10 Safe Write Workers
coverage: Complete delivery contract for the first general write-worker version after the existing docs-only doc-refresh path.
not_complete_for: Full Claude Managed Agents parity, platform scheduler, remote write-capable workflow registry, production deploy automation, database writes, secrets, payments, permissions, or app-thread write execution.
verification_level: fixture-local
real_smoke_status: requires_approval
review_status: reviewed
reviewer: reasonix-v4pro
review_command: crb review --scope working-tree --mode final-review --json --timeout-ms 180000 --context "Very final targeted review..."
review_notes: Reasonix approved after allowed_paths enforcement, direct-docs definition, and stop/pause wording fixes.
review_owner: Codex resolves blocker/high findings before implementation goal starts
review_due: resolved 2026-06-05
---

# v1.10 Safe Write Workers Plan

Status: implementation in progress; fixture-local patch mode is implemented, controlled real-smoke still requires Ender approval.

## Alignment Snapshot

- Building: a safe, general write-worker path for Codex Flow that can propose and apply file changes only after preview, explicit approval, drift checks, and verification.
- Not building: direct app-thread writes, managed-agent scheduling, remote write-capable workflow enablement, non-Codex model routing, production deploy/database/payment/permission writes, or broad autonomous repo rewriting.
- Source of truth: existing `doc-refresh` gated write path, workflow schema write gates, `codex-write` SDK worker, run-store artifacts, reducer contracts, and the v1.8 decision to avoid a custom scheduler.
- Deliverables: PRD, SPEC, acceptance matrix, phase plan, copy-ready `/goal` prompt, and the v1.10 fixture-local implementation slice.
- Phase scope: version-level contract for v1.10. It is complete for the first general write-worker slice, not for a future v2 managed-agent platform.
- Completeness: enough to start a goal-mode implementation without re-litigating architecture.
- Verification level: fixture-local implementation evidence is required; controlled real-smoke remains approval-gated.
- Review requirement: Reasonix/v4Pro final review is required before marking this plan final.
- Verification: `git diff --check`, `npm run check`, `bash scripts/smoke-cli.sh`, Reasonix review, and future implementation evidence listed below.
- Open decisions: none blocking. The chosen first implementation is `write_policy.mode: patch`, which runs the writer in a disposable local clone/copy, extracts `artifacts/proposed.patch`, scans policy paths, then applies with `git apply --check --3way` and `git apply --3way`.

Capability sentence:

This planning pass helps public Codex Flow users and maintainers build safe general file-writing workflows by producing a v1.10 delivery contract, using the existing gated `doc-refresh` path as source of truth, while avoiding direct ungated writes, app-thread write execution, and platform-scheduler scope.

## Plain-Language Result

Today CWF can review code well and has one narrow write workflow: `doc-refresh`.
That write path is intentionally limited to documentation and already has the right bones:

- preview artifacts before write;
- approval gate;
- target diff hash check before writing;
- Codex SDK `workspace-write` execution after approval;
- rollback and verification artifacts.

v1.10 turns that from "one docs-only write workflow" into a reusable safe write-worker model.

The first version should feel like this:

1. A workflow asks one or more workers to propose changes.
2. CWF writes a patch plan and dry-run preview into the run folder.
3. CWF pauses and asks for explicit approval.
4. After approval, CWF verifies the repo did not drift.
5. CWF applies changes through Codex-controlled write execution, preferably in an isolated worktree/temp target for non-doc writes.
6. CWF captures changed files, diff summary, verification output, rollback guidance, worker results, and final reducer output.

The important shift: workers can help write code, but CWF remains the foreman.

## PRD

### Problem

Codex Flow is useful for read-only review, audit, release review, and implementation planning. But real workflows often need the next step: "fix the issue", "update docs", "apply the recommended patch", or "make the small code change and verify it".

The existing `doc-refresh` proves a safe write pattern, but it is not general enough:

- it is documentation-only;
- it has one writer shape;
- it does not define multi-worker patch proposals;
- it does not define isolated write execution for code changes;
- it does not define a reusable artifact contract for changed files, patch plans, verification, and rollback across arbitrary workflows.

At the same time, allowing worker agents to write directly into the user's main repository would be too risky. A failed or overbroad write could damage a working tree, hide unrelated user changes, or make it hard to understand what happened.

### Target Users

- Codex users who want CWF to go from review to safe implementation.
- Maintainers who want repeatable "plan -> preview -> approve -> write -> verify" workflows.
- Public workflow authors who need a standard write contract rather than bespoke file-editing scripts.
- Future Codex skill wrappers that want to call CWF for bounded edits and return a clear summary to the initiating conversation.

### Goals

- Generalize write-capable workflows beyond `doc-refresh` without weakening the existing gate model.
- Support write workers that produce patch plans, changed-file lists, verification commands, and rollback evidence.
- Keep human approval before target writes.
- Preserve target diff drift protection after preview and before apply.
- Run real writes through Codex-controlled `workspace-write` or isolated worktree execution, not ad hoc `fs.writeFile` workflow steps.
- Keep read-only workflows unchanged.
- Keep Desktop app-thread write execution out of scope until Codex exposes a stable interactive write/approval surface.
- Make status/result output explain write state in human language.
- Keep CLI-only usage reliable.

### Non-Goals

- No direct writes from `codex-app-thread` workers in v1.10.
- No auto-apply before approval.
- No hidden writes to production, databases, credentials, payments, permissions, deployment systems, or external messages.
- No scheduler, queue, daemon, or managed-agent platform.
- No remote write-capable workflow install/enablement.
- No generated JavaScript execution in workflow YAML.
- No non-Codex model routing.
- No automatic conflict resolution with user changes.
- No attempt to fully match Claude Managed Agents.

### User Stories

- As a user, I can run a write-capable workflow and see exactly what it plans to change before anything touches my repo.
- As a user, I can approve or reject a write gate with a clear command.
- As a user, I can trust CWF to stop if the target diff changed after preview.
- As a maintainer, I can author a safe write workflow using the same schema/gate model as `doc-refresh`.
- As a skill author, I can return a concise "what changed / what passed / what to inspect" summary to the active Codex conversation.
- As a cautious user, I can keep all non-doc code changes isolated until CWF shows me a patch and verification output.

### Success Criteria

- Write-capable workflows still cannot run without a prior gate.
- `doc-refresh` remains compatible and unchanged in user-facing behavior.
- A new general write fixture can propose, approve, apply, verify, and report a small code/doc change.
- Rejection before the gate leaves the target repo untouched.
- Drift after preview fails before writing.
- Failed write or failed verification leaves rollback guidance and clear artifacts.
- Result output lists changed files, verification status, rollback path, and whether evidence is fixture/local/real-smoke.

## SPEC

### Runtime Model

v1.10 has two write modes.

#### Mode A: Patch Write Worker

The worker writes only in an isolated temporary target. CWF extracts the resulting git diff as the structured patch proposal before applying anything to the original target:

- patch plan;
- intended changed files;
- unified diff in `artifacts/proposed.patch`;
- verification commands;
- rollback notes;
- risk notes.

CWF stores preview artifacts under the run folder and pauses at an approval gate before the writer runs. After approval, it generates the proposed patch in the isolated target, scans patch paths, runs `git apply --check --3way`, applies the patch to the original target, and records verification and rollback artifacts. If verification fails after apply, CWF attempts to reverse-apply the same proposed patch before returning a failed run.

Use this mode when:

- the workflow can express changes as a patch;
- the user needs maximum auditability;
- the change may touch source code or config but should not mutate the main worktree before approval.

Skip this mode when:

- the task is docs-only and the existing `doc-refresh` style is sufficient;
- the change cannot be represented as a patch without running a real formatter/generator;
- the user explicitly wants a read-only plan.

#### Mode B: Direct Docs Policy Preset

`direct-docs` is the compatibility policy preset for the existing bundled `doc-refresh` workflow.

Required behavior:

- write preview artifacts;
- pause for approval before touching target docs;
- run the writer in an isolated target;
- extract `artifacts/proposed.patch`;
- re-check target diff drift before apply;
- keep changes within docs/readme/release-note paths;
- reject forbidden paths before applying to the original target.

Feasibility rule:

- v1.10 proved that the existing Codex SDK writer can use an alternate `workingDirectory` by running against a disposable git target.
- General non-doc writes use `mode: patch`; `direct-docs` remains the docs-only compatibility policy preset.

Use this mode when:

- the workflow is the bundled docs-only `doc-refresh` compatibility path.

Skip this mode when:

- the workflow may touch source code, config, credentials, prod writes, database mutation, or external irreversible actions.

### Workflow Schema Additions

Existing concepts remain:

```yaml
capabilities:
  writes: true
```

Existing rule remains:

- any write-capable phase or worker requires a prior gate.

v1.10 should add a narrower write policy object for `codex-write` phases:

```yaml
write_policy:
  mode: patch | direct-docs
  allowed_paths:
    - docs/**
    - src/**
    - tests/**
  forbidden_paths:
    - .env*
    - "**/*secret*"
    - "**/*credential*"
    - .github/workflows/**
  verification_commands:
    - npm run check
```

Compatibility:

- Existing `doc-refresh` may be treated as `direct-docs` internally.
- If `write_policy` is absent on an existing `doc-refresh` workflow, behavior stays compatible.
- New non-doc write-capable workflows should require `write_policy`.

`direct-docs` definition:

- it is only the docs/readme/release-note policy preset for the existing `doc-refresh` path;
- it still requires the existing gate and target diff drift check;
- it still runs the writer in an isolated target and applies only a checked patch to the original target;
- it does not become the default mode for new source-code write workflows;
- it does not skip approval, drift checks, or forbidden-path checks.

### Phase Contract

Recommended general write workflow shape:

```yaml
phases:
  - id: collect
    kind: command

  - id: propose-write
    kind: write-preview
    prompt: Prepare patch plan, file list, verification, and rollback.

  - id: approve-write
    kind: gate
    prompt: Review planned file changes before applying.
    requires_approval: true

  - id: apply-write
    kind: codex-write
    writes: true
    worker:
      id: implement
      perspective: implementation
      prompt: Apply the approved bounded change and return worker JSON.
      writes: true

  - id: verify-write
    kind: command

  - id: reduce
    kind: reducer
    reducer: diff-review
```

### Artifacts

Before approval:

```text
artifacts/write-plan.md
artifacts/dry-run-preview.md
artifacts/verification-plan.md
artifacts/rollback.md
```

After approval/apply:

```text
artifacts/proposed.patch
artifacts/proposed-patch.md
artifacts/diff-summary.md
artifacts/verification.md
artifacts/rollback.md
workers/<worker-id>.json
result.md
```

### Patch Apply Contract

Patch application must be explicit and conservative.

Required apply sequence:

1. Parse the proposed patch and collect every touched path.
2. Reject any path outside the target repo.
3. Reject any path not matching `allowed_paths` when `allowed_paths` is defined.
4. Reject any path matching `forbidden_paths`.
5. Re-check the target diff hash captured at preview time.
6. Run `git apply --check --3way <proposed.patch>` from the target repo.
7. If check passes, run `git apply --3way <proposed.patch>`.
8. If `git apply --check` or `git apply --3way` reports conflicts, rejects, or partial apply risk, stop and do not claim success.
9. After apply, collect `git status --short`, changed files, and `git diff --check`.
10. Run configured verification commands.

Rules:

- CWF must not use `git am`, commit creation, `git reset --hard`, or checkout-based destructive rollback in v1.10.
- CWF must not auto-resolve conflicts.
- If the target has changed since preview, patch apply is not attempted.
- If the patch cannot be applied cleanly, the result should say "not applied" and point to `proposed.patch`.
- If verification fails after apply, CWF attempts to reverse-apply `artifacts/proposed.patch`; rollback guidance should explain whether the patch was reverted or manual cleanup is needed.

### Safety Invariants

- Read-only workflows stay read-only by default.
- `writes: true` without a prior gate fails validation.
- New non-doc write workflows require `write_policy`.
- Target diff hash is captured during `collect`.
- Before apply, CWF re-checks target diff hash; drift fails the run.
- Patch apply must refuse paths outside `allowed_paths` when a policy defines them.
- Patch apply must refuse forbidden paths.
- Patch apply must refuse paths outside the target repo.
- Patch apply must preserve unrelated user changes.
- If verification fails, result is not "done"; it is "write applied, verification failed" with rollback instructions.
- CWF must not run deployment, database, credential, payment, permission, or external message writes.
- App-thread workers remain read-only in v1.10.
- Remote-installed write-capable workflows remain disabled unless a later registry contract changes this.

### Status And Result UX

`cwf status` should show:

- waiting gate and approval command;
- planned changed files;
- whether target writes have happened;
- whether drift check passed;
- verification status;
- rollback artifact path.

`cwf result` should include:

- changed files;
- applied or not applied;
- verification commands and pass/fail;
- rollback guidance;
- raw fallback/degraded evidence if any worker returned malformed output;
- clear evidence level: fixture/local/real-smoke.

### Error And Fallback Behavior

- User rejects gate: stop cleanly, target untouched.
- Target diff changed after preview: fail before write, ask user to rerun.
- Patch touches forbidden path: fail before write.
- Patch apply fails: fail with patch artifact and no success claim.
- Write worker fails: fail or degrade according to workflow failure policy, with worker JSON preserved.
- Verification fails: final verdict must be REVIEW or DEGRADED, not PASS.
- Isolated worktree creation fails: fail before target write.
- App-thread write requested: fail validation with a clear v1.10 out-of-scope message.

## Acceptance Matrix

- [ ] Existing `doc-refresh` remains green and user-facing behavior-compatible.
  - Verification level: fixture/local.
  - Evidence: existing gated doc-refresh tests pass; `bash scripts/smoke-cli.sh` passes.

- [ ] Write-capable workflow without gate still fails validation.
  - Verification level: fixture.
  - Evidence: existing write-without-gate fixture fails with clear `writes:true` message.

- [ ] New non-doc write workflow requires `write_policy`.
  - Verification level: fixture.
  - Evidence: schema test rejects `capabilities.writes: true` non-doc `codex-write` without policy.

- [ ] Patch preview writes only run-folder artifacts before approval.
  - Verification level: fixture/local.
  - Evidence: test compares target repo status before/after `propose-write`; target unchanged, run artifacts created.

- [ ] Rejecting the approval gate leaves target untouched.
  - Verification level: fixture/local.
  - Evidence: test rejects gate and asserts no target diff beyond pre-run state.

- [ ] Approving after target drift fails before apply.
  - Verification level: fixture/local.
  - Evidence: mutate target after preview, approve, resume, assert failure before write.

- [ ] Patch apply refuses forbidden paths.
  - Verification level: fixture.
  - Evidence: patch proposal touching `.env` or forbidden pattern fails before target write.

- [ ] Patch apply refuses paths outside `allowed_paths`.
  - Verification level: fixture/local.
  - Evidence: patch proposal touching a non-forbidden but non-allowed path fails before target write, and the result names the rejected path.

- [ ] Isolated worktree mode can produce a diff without mutating target before approval.
  - Verification level: local.
  - Evidence: feasibility spike proves Codex SDK writer can target a disposable worktree or copied repo; fixture run creates isolated diff artifacts; original target status unchanged before approval.

- [ ] Isolated write feasibility is proven before implementation proceeds.
  - Verification level: local.
  - Evidence: a disposable git fixture confirms `runCodexWriteWorker` can write using an alternate target path, or the implementation switches to the documented copy-target fallback and records the decision.

- [ ] Approved safe write applies only intended files.
  - Verification level: local.
  - Evidence: fixture repo approved run uses `git apply --check --3way` before apply, changes expected files only, and writes `proposed.patch`, `proposed-patch.md`, `diff-summary.md`, and `verification.md`.

- [ ] Patch conflicts stop safely.
  - Verification level: fixture/local.
  - Evidence: conflicting patch fixture fails at `git apply --check --3way`; target status remains unchanged and result points to `proposed.patch`.

- [ ] Verification command output is captured and affects verdict.
  - Verification level: local.
  - Evidence: passing command yields completed result; failing command marks the run failed, records the verification failure, and attempts to reverse-apply the proposed patch.

- [ ] Rollback guidance is always present after any attempted write.
  - Verification level: fixture/local.
  - Evidence: `artifacts/rollback.md` exists for success and failure paths.

- [ ] App-thread write workers remain blocked.
  - Verification level: fixture.
  - Evidence: workflow requesting `codex-app-thread` with `writes: true` fails validation or adapter selection with a clear message.

- [ ] Public docs state the write boundary honestly.
  - Verification level: docs-only.
  - Evidence: README/SPEC mention general safe write workers only after implementation; before implementation, plan docs mark this as planned.

- [ ] Controlled real-smoke is run after Ender GO.
  - Verification level: real-smoke.
  - Evidence: run v1.10 write workflow against a disposable local git repo using actual `cwf` CLI, approve gate, resume, run verification, and report artifacts. If Ender does not approve real-smoke, stop at local fixture proof and mark real-smoke not run.

## Phase Plan

### Phase 0: Contract And Guardrails

Deliver:

- `WRITE_WORKERS_PLAN.md` reviewed and accepted.
- v1.10 goal prompt.
- docs identify current `doc-refresh` as baseline, not as full general write-worker support.

Verify:

- `git diff --check`
- Reasonix final review

Stop if:

- write scope expands into scheduler/managed-agent parity.
- app-thread direct writes become a requirement.

### Phase 1: Schema And Policy

Deliver:

- feasibility spike for alternate write target: either SDK writer works against disposable worktree/copy, or v1.10 narrows to patch-first plus documented copy-target fallback;
- `write_policy` parser and validation.
- compatibility path for existing `doc-refresh`.
- fixtures for missing gate, missing policy, forbidden paths, and app-thread write refusal.

Verify:

- `npx vitest run tests/workflow-schema.test.ts`
- `npm run check`

Stop if:

- schema changes require breaking existing workflow YAML.
- isolated write target feasibility fails and no safe fallback is accepted.

### Phase 2: Patch Preview Artifacts

Deliver:

- general preview artifact writer.
- `proposed.patch`, `proposed-patch.md`, `verification-plan.md`.
- status/result surfaces for planned changes before approval.

Verify:

- phase-engine fixture tests prove target unchanged before approval.
- `bash scripts/smoke-cli.sh`

Stop if:

- preview requires target writes.

### Phase 3: Apply And Verify

Deliver:

- safe patch apply using path scan, forbidden-path rejection, drift check, `git apply --check --3way`, and `git apply --3way`.
- isolated-worktree or copy-target diff apply only after feasibility is proven.
- drift check before apply.
- verification command runner with captured output.
- rollback artifact updates.

Verify:

- approved fixture applies expected files only.
- drift fixture fails before write.
- verification pass/fail fixture affects final verdict.

Stop if:

- patch apply would overwrite unrelated user changes.
- patch conflict handling would require auto-resolution.

### Phase 4: Packaged Workflow And Docs

Deliver:

- one bundled safe write fixture or example workflow.
- README/SPEC updates.
- skill guidance for running, approving, rejecting, and reading write runs.

Verify:

- `npm run check`
- `bash scripts/smoke-cli.sh`
- `npm pack --dry-run`
- controlled real-smoke after Ender GO
- Reasonix final review

Stop if:

- public docs imply writes are fully autonomous or production-safe.

## Goal Prompt

Copy-ready goal prompt lives in `docs/goal-prompts/v1.10-safe-write-workers.md` and is mirrored in `GOAL_PROMPT.md` when v1.10 becomes the active implementation goal.
