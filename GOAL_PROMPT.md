---
half_life: 30d
archive_at: 2026-07-05
---

# Current Goal Prompt

This file is the current goal-mode entrypoint. Historical phase prompts live in
`docs/goal-prompts/`.

Current phase:

- v1.11 JS Dynamic Runtime MVP is planned as the next implementation contract.

Latest decisions:

- v1.8 Managed-Agents-Style Scheduling Decision: do not build a scheduler now.
- v1.9 Public Workflow Registry Planning: use source trust levels plus required
  SHA-256 pinning for remote install; do not implement registry runtime commands
  in the planning goal.
- v1.10 Safe Write Workers: generalize the existing gated docs-only `doc-refresh`
  path into safe bounded file-writing workflows, but keep writes gated,
  previewed, drift-checked, reversible, and Codex-controlled. Patch-mode writes
  run in an isolated target, emit `artifacts/proposed.patch`, and apply only
  policy-approved paths to the real target after approval.
- v1.11 JS Dynamic Runtime MVP: use JavaScript as the Claude-like dynamic
  workflow harness surface, but execute it only through a static AST policy gate,
  permissioned child process, and CWF runtime APIs. Codex workers can use
  `read-only`, `safePatch`, or trusted local `inherit-session` permission
  profiles. Trusted local means `generated-current-session` origin with matching
  SHA-256 in v1.11. CWF must never grant more authority than the parent Codex
  session already has. Generated scripts must be previewed and approved before
  execution.

Archived phase prompts:

- `docs/goal-prompts/v0.3-run-discovery.md`
- `docs/goal-prompts/v1.7-worker-app-threads.md`
- `docs/goal-prompts/v1.8-managed-agents-decision.md`
- `docs/goal-prompts/v1.9-public-workflow-registry.md`
- `docs/goal-prompts/v1.10-safe-write-workers.md`
- `docs/goal-prompts/v1.11-js-dynamic-runtime.md`

When a new phase starts, replace this file with the active goal prompt and add
or update the matching historical prompt under `docs/goal-prompts/`.

## v1.11 Goal Prompt

Canonical copy: `docs/goal-prompts/v1.11-js-dynamic-runtime.md`.

Do not duplicate the full prompt here. Reasonix review flagged duplicated goal
blocks as a drift risk. When starting v1.11, copy the canonical prompt from that
file.

## v1.10 Goal Prompt

```text
/goal Implement Codex Flow v1.10 Safe Write Workers in /Users/sunny/Work/CODEX/codex-workflows.

Outcome:
- Generalize the existing gated docs-only `doc-refresh` write path into a safe write-worker model for bounded file changes.
- Add `write_policy` support for non-doc write-capable workflows while preserving backward compatibility with existing `doc-refresh`.
- Support preview-before-apply artifacts: write plan, dry-run preview, proposed patch or isolated-worktree diff, changed files, verification plan, and rollback guidance.
- Keep all target writes behind an explicit CWF approval gate, target diff drift check, forbidden-path checks, and Codex-controlled workspace-write or isolated-worktree execution.
- Prove first whether Codex SDK write execution can target a disposable worktree/copy; if not, narrow v1.10 to patch-first plus documented copy-target fallback.
- Preserve read-only workflow behavior and current reducer/worker/result contracts.

Boundaries:

Allowed writes:
- src/ workflow schema, phase engine, writer adapter, run-store/status/result surfaces, and helpers needed for v1.10.
- tests/ fixtures and regression coverage for write_policy, preview, approve/reject/resume, drift, forbidden paths, apply, verification, rollback, and app-thread write refusal.
- fixtures/workflows/ safe write fixtures.
- workflows/ only if adding a clearly gated bundled safe write example is part of the accepted slice.
- docs/WRITE_WORKERS_PLAN.md, docs/SPEC.md, docs/PHASE_CONTRACTS.md, docs/POST_V1_PLAN.md, docs/WORKER_APP_THREADS_PLAN.md, README.md, README.zh-CN.md, skills/codex-workflows/SKILL.md when behavior/docs must stay aligned.
- GOAL_PROMPT.md and docs/goal-prompts/ only for status/handoff updates.

Do not edit:
- Do not allow write-capable phases or workers without a prior gate.
- Do not let Desktop app-thread workers write files in v1.10.
- Do not add scheduler, queue, daemon, managed-agent platform, recursive fan-out, marketplace, remote lifecycle, or non-Codex model routing.
- Do not enable remote-installed write-capable workflows.
- Do not touch production deploys, databases, credentials, payments, permissions, external messages, or irreversible systems.
- Do not apply patches that fall outside allowed_paths, touch forbidden paths, leave the target repo, or overwrite unrelated user changes.
- Do not claim real-smoke/prod proof from fixture or mock evidence.

Constraints:
- Reuse existing CWF gates, run-store artifacts, reducer contracts, workflow schema validation, target diff hash checks, and Codex SDK workspace-write path.
- Keep `doc-refresh` behavior compatible unless tests prove a safe migration.
- New non-doc write workflows must declare a `write_policy`.
- Patch/apply behavior must be reversible and artifact-backed: scan paths, reject outside-allowed/forbidden/out-of-repo paths, run `git apply --check --3way`, then `git apply --3way`, and stop on conflicts without auto-resolution.
- `direct-docs` is only the existing docs-only `doc-refresh` compatibility mode; it still requires a gate, target diff drift check, and forbidden-path checks, and must not become the default source-code write mode.
- If verification fails after apply, final verdict must not be PASS.
- Public docs must describe the feature as safe bounded writes, not autonomous unrestricted repo editing.

Verification:
- `git diff --check`
- `npx vitest run tests/workflow-schema.test.ts tests/phase-engine.test.ts`
- `npm run check`
- `bash scripts/smoke-cli.sh`
- `npm pack --dry-run`
- Source audit that app-thread write workers remain blocked.
- Source audit that every write-capable path requires a prior gate.
- Source audit that `doc-refresh` remains compatible.
- Local feasibility spike proving Codex SDK writer can target a disposable worktree/copy, or an explicit documented fallback decision before implementing isolated mode.
- Fixture proving conflicting patches stop at `git apply --check --3way` and leave target unchanged.
- Controlled real-smoke after Ender GO: run a v1.10 write workflow against a disposable local git repo, inspect preview artifacts, approve, resume, verify expected files changed, and inspect rollback/result artifacts. If Ender does not approve this smoke, stop at fixture/local evidence and report real-smoke not run.
- Reasonix/DeepSeek final review of implementation diff and docs; apply blocker/high findings before finalizing.
- GitHub CI green after push if pushed.

Iteration policy:
- Start by auditing existing `doc-refresh`, workflow schema gates, phase-engine write tests, `codex-write` adapter, README/SPEC wording, and current smoke commands.
- Implement one vertical slice at a time: feasibility spike -> schema/policy -> preview artifacts -> approval/apply -> verification/rollback -> docs.
- After each slice, run the narrow relevant tests before broadening.
- Keep status updates in plain Chinese: what this slice lets CWF do, what it still refuses, and what evidence passed.
- Do not chase broad managed-agent parity; keep every change tied to the v1.10 acceptance matrix.
- If a validation failure repeats twice, pause and inspect root cause before retrying.

Hard stops:
- Stop before changing scheduler/daemon/managed-agent scope.
- Stop before enabling direct app-thread writes.
- Stop if isolated write target feasibility fails and no safe fallback is accepted.
- Stop before touching production, credentials, deploys, databases, payments, permissions, or external messages.
- Stop if safe apply would require writing outside allowed_paths or overwriting unrelated user changes.
- Stop if patch conflicts would require auto-resolution.
- Stop after three repeated no-progress attempts on the same blocker and report the exact blocker.

Pause if:
- Pause and ask Ender before running the controlled real-smoke.
- Pause and ask Ender if isolated write target feasibility fails but a copy-target fallback would still be viable.
- Pause and report exact evidence if Reasonix raises blocker/high findings after implementation.

Stop when:
- Stop when v1.10 acceptance is implemented, tests/smoke pass, Reasonix review is handled, docs are updated, and commit/push/CI status is reported.

Final response:
- Explain in human terms what write workers can now do and what they still refuse to do.
- List files changed, verification commands, live/fixture evidence, Reasonix review result, commit hash, push status, and CI status if pushed.
```

## v1.9 Planning Summary

Codex Flow should plan a public workflow registry, but not implement registry
runtime commands in the planning goal.

Chosen trust model:

- `bundled`: package-shipped workflows, CI/package-smoke validated, runnable by
  id.
- `local`: user/project workflows in existing search paths, validated before
  list/show/run.
- `remote-candidate`: inspected only, untrusted, not installed, not enabled, not
  runnable.
- `remote-installed`: validated and SHA-256 pinned into a local cache, but not
  runnable yet.
- `remote-enabled`: explicitly enabled read-only workflow exposed through local
  discovery.

Smallest future implementation slice:

- inspect a remote/file workflow and print metadata, diagnostics, capabilities,
  and SHA-256;
- install only when the user supplies the expected SHA-256 digest;
- keep remote installs disabled until explicit enablement;
- refuse write-capable remote workflows in the first slice;
- keep direct URL execution via `cwf run URL` invalid.

What v1.9 planning does not add:

- no registry runtime commands yet;
- no remote install behavior yet;
- no generated JavaScript execution;
- no auto-run or direct URL run;
- no write-capable remote workflow enablement;
- no marketplace, daemon, scheduler, queue, remote lifecycle service, or nested
  worker runtime;
- no private adapters, non-Codex model routing, or user-specific defaults.

## v1.8 Decision Summary

Codex Flow should not implement a managed-agents-style scheduler in v1.8.

Evidence reviewed:

- v1.7 app-thread worker support is implemented and documented as completed.
- Live run `run_20260604084923_hqu0l8` recorded real app-thread metadata for
  3/3 workers, with no SDK fallback and no raw fallback:
  - correctness: thread `019e91d2-ac76-7191-90b2-a7b2234f1c96`, turn
    `019e91d2-b4a6-7760-8f72-1e34aa73c96a`
  - tests: thread `019e91d2-ac75-71a0-8186-764d87e9cdf1`, turn
    `019e91d2-b8be-7793-86c7-674a08bd9205`
  - safety: thread `019e91d2-ac76-7191-90b2-a7a457bef8f2`, turn
    `019e91d2-b0d3-73f3-be0a-1060c7067178`
- Existing CLI/background/watch/list/show/result/cancel surfaces already provide
  inspectable local lifecycle behavior without a daemon.
- Codex-native app-server threads, SDK workers, skills, sandbox/approval rules,
  worktrees, and host subagents remain the preferred execution boundary.

What v1.8 adds:

- an explicit roadmap decision;
- a tighter non-goal around schedulers, queues, daemons, marketplaces, remote
  lifecycle services, and nested worker execution;
- revisit criteria for a future scheduler decision.

What v1.8 does not add:

- no scheduler implementation;
- no queue, daemon, registry, marketplace, remote lifecycle service, or nested
  worker runtime;
- no private adapters, non-Codex model routing, or user-specific defaults;
- no change to same-conversation result-return semantics.
