---
half_life: 30d
archive_at: 2026-07-03
---

# Codex Flow Phase Contracts

This document turns the roadmap into execution-ready contracts. Each phase includes:

- PRD
- SPEC
- Acceptance
- Goal Prompt

Global rules for every phase:

- Keep public core Codex-native.
- Do not add MiMo, Reasonix, DeepSeek, Ollama, private adapters, or third-party model routing.
- Do not claim Claude Dynamic Workflows parity unless the specific capability exists.
- Keep docs aligned with implementation.
- Prefer read-only workflows until write-capable workflows are explicitly gated.
- Do not add domain-specific workflow logic to the core runtime.

## Current Baseline

Already shipped:

- `cwf validate`
- `cwf run`
- `cwf status`
- `cwf watch`
- `cwf list`
- `cwf show`
- `cwf latest`
- `cwf approve`
- `cwf reject`
- `cwf resume`
- `cwf workflows list`
- `cwf workflows show`
- `cwf workflows validate`
- `cwf result`
- `cwf cancel`
- read-only workflow catalog: `diff-review`, `repo-audit`, `implementation-plan`, `research-crosscheck`, `release-review`
- run store under `~/.codex-workflows/runs/<run-id>/`
- run index under `~/.codex-workflows/index.json`
- default failure policy metadata and readable failure summaries
- gate phase kind and persisted gate decisions
- validation that `writes:true` phases/workers require a prior gate
- local workflow registry search paths and duplicate-id detection
- workflow metadata: title, tags, inputs, capabilities
- standardized worker result envelope
- standardized reduced result envelope in `artifacts/reduced-result.json`
- artifact manifest in `artifacts/manifest.json`
- degraded reducer verdicts for partial evidence
- worker provenance in final output
- readable status/watch output
- English and Chinese README

## v0.3: Run Discovery And Failure Model

### PRD

Users can start and watch background runs, but they still need to remember run ids manually. When a run fails, they need a human-readable explanation before opening raw JSON.

v0.3 makes Codex Flow easier to operate: find recent runs, inspect one run, open the latest run, and understand failures.

### Goals

- Add run discovery.
- Add a rebuildable run index or equivalent discovery path.
- Make failed/degraded runs easier to understand.
- Define default failure policies.
- Keep `diff-review` as the only workflow.

Status: implemented in v0.3.0.

### SPEC

New commands:

```bash
cwf list [--limit <n>] [--status <status>] [--target <path>]
cwf show <run-id>
cwf latest [--target <path>]
```

Run index:

```text
~/.codex-workflows/index.json
```

Index entry:

```json
{
  "id": "run_...",
  "workflow": "diff-review",
  "status": "completed",
  "target": "/abs/path/to/repo",
  "created_at": "ISO",
  "updated_at": "ISO",
  "run_dir": "/abs/path",
  "result_path": "/abs/path/result.md",
  "log_path": "/abs/path/run.log"
}
```

Failure policy defaults:

- worker failures continue when at least one Codex worker succeeds
- all-worker failure fails the run
- target diff changes fail the run
- unhandled errors fail the run

Status/show should include:

- failed phase or worker
- failure policy used
- artifact paths

Index behavior:

- `RunStore.create` records a new index entry.
- State changes update the index best-effort.
- If the index is missing, stale, or corrupt, `cwf list` rebuilds from `~/.codex-workflows/runs/*/state.json`.
- If JSON index is corrupted, CLI should explain the repair path or rebuild automatically from run folders.

Out of scope:

- daemon
- web UI
- workflow registry
- gates/resume implementation
- new workflow types

### Acceptance

- [ ] A user can list recent runs.
  - Evidence: `cwf list`

- [ ] A user can filter runs.
  - Evidence: `cwf list --status running`, `cwf list --target <repo>`

- [ ] A user can inspect a run without reading JSON.
  - Evidence: `cwf show <run-id>` includes status, `Now:`, workers, failure policy, failure summary when failed, and artifacts

- [ ] A user can get the latest run.
  - Evidence: `cwf latest`, `cwf latest --target <repo>`

- [ ] Missing or stale index can recover.
  - Evidence: test deletes `index.json`, then `cwf list` rebuilds from run folders

- [ ] Failure output is human-readable.
  - Evidence: mocked failed worker run shows failed phase, failed workers, failure policy, and next step

- [ ] Existing commands still work.
  - Evidence: `npm run check`, validate smoke, foreground smoke, background smoke, watch smoke, cancel smoke

### Goal Prompt

Archived prompt: [v0.3 run discovery](goal-prompts/v0.3-run-discovery.md).

## v0.4: Gates And Resume

### PRD

Before Codex Flow supports write-capable workflows or long multi-stage runs, users need a safe pause/resume model. A workflow should be able to stop before risk, wait for approval, and continue without rerunning completed phases.

### Goals

- Add explicit gates.
- Add approve/reject/resume.
- Preserve read-only defaults.
- Make write-capable phases impossible without a prior gate.
- Avoid adding production write workflows in this phase.

Status: implemented in v0.4.0.

### SPEC

New commands:

```bash
cwf approve <run-id> <gate-id>
cwf reject <run-id> <gate-id> [--reason <text>]
cwf resume <run-id>
```

New phase kind:

```yaml
- id: approve-write
  kind: gate
  prompt: Review the planned file changes before Codex writes.
  requires_approval: true
```

New statuses:

```text
waiting
approved
rejected
```

Resume rules:

- Completed phases do not rerun by default.
- Pending phases after an approved gate can continue.
- Rejected gates stop the run.
- Gate decisions are written to `state.json` and `events.jsonl`.
- `cwf show` explains why a run is waiting and how to approve/reject.
- `context.json` preserves collected diff context so resume does not need to rerun completed collection.

Validation rules:

- Any phase or worker with `writes: true` must appear after a gate.
- Any write-capable workflow without a gate fails validation.
- Read-only workflows do not require gates.

Out of scope:

- automatic code modification workflow pack
- GitHub writeback
- remote approval UI
- Desktop approval panel

### Acceptance

- [ ] Read-only `diff-review` still runs without gates.
  - Evidence: diff-review smoke

- [ ] Write-capable workflow without gate fails validation.
  - Evidence: schema fixture test

- [ ] A workflow can pause at a gate.
  - Evidence: gate fixture reaches `waiting`

- [ ] A user can approve and resume.
  - Evidence: `cwf approve <run-id> <gate-id>` then `cwf resume <run-id>`

- [ ] A user can reject and stop.
  - Evidence: `cwf reject <run-id> <gate-id> --reason ...`

- [ ] Completed phases are not rerun on resume.
  - Evidence: event log shows only pending phases continue

### Goal Prompt

```text
Build Codex Flow v0.4 Gates And Resume in /Users/sunny/Work/CODEX/codex-workflows.

Scope:
- Keep public core Codex-native.
- Do not add a production write-capable workflow.
- Implement safety primitives only.
- Keep diff-review read-only and behavior-compatible.

Required:
- Add gate phase kind.
- Add waiting/approved/rejected statuses where needed.
- Add cwf approve, reject, and resume.
- Add validation rule: workflows with writes:true must include a gate before the first write-capable phase.
- Ensure completed phases do not rerun on resume.
- Persist gate decisions in state.json and events.jsonl.
- Make status/show explain waiting gates in human terms.
- Update docs and tests.

Verification:
- npm run check
- npm pack --dry-run
- diff-review smoke still passes
- gate fixture pauses
- approve/resume fixture completes
- reject fixture stops cleanly
- validation fails for write workflow without gate

Final response:
- Explain the new safety model in plain language.
- Include commands run, pass/fail, commit hash, and push status.
```

## v0.5: Workflow Registry

### PRD

One bundled workflow is not enough for a reusable engine. Users need to discover, inspect, validate, and run workflows by id from project or global folders.

v0.5 makes workflows reusable specs, while keeping execution constrained and auditable.

### Goals

- Add project/global workflow discovery.
- Run workflows by id or path.
- Keep specs declarative.
- Keep `diff-review` as the first registry workflow.
- Do not add generated scripts or marketplace.

Status: implemented in v0.5.0.

### SPEC

Workflow search paths:

```text
./.codex-flow/workflows/
./workflows/
~/.codex-flow/workflows/
```

New commands:

```bash
cwf workflows list
cwf workflows show <workflow-id-or-path>
cwf workflows validate [<workflow-id-or-path>]
cwf run <workflow-id-or-path> --target <repo> [--background]
```

Workflow metadata:

```yaml
id: diff-review
version: 0.5.0
title: Diff Review
description: Review a git diff with independent Codex worker perspectives.
tags:
  - review
  - read-only
capabilities:
  writes: false
inputs:
  target:
    type: path
    required: true
```

Validation checks:

- unique workflow ids
- required metadata
- input declarations
- supported phase kinds
- valid reducer
- unique worker ids
- gate before write-capable phase
- clear duplicate-id errors

Out of scope:

- remote workflow install
- marketplace
- arbitrary generated JavaScript workflows
- non-Codex model providers

### Acceptance

- [ ] A user can discover workflows.
  - Evidence: `cwf workflows list`

- [ ] A user can inspect a workflow.
  - Evidence: `cwf workflows show diff-review`

- [ ] A user can validate workflows.
  - Evidence: `cwf workflows validate`

- [ ] A user can run by id.
  - Evidence: `cwf run diff-review --target <repo> --background`

- [ ] Direct path usage still works.
  - Evidence: `cwf run workflows/diff-review.yaml --target <repo>`

- [ ] Duplicate ids fail clearly.
  - Evidence: fixture test

### Goal Prompt

```text
Build Codex Flow v0.5 Workflow Registry in /Users/sunny/Work/CODEX/codex-workflows.

Scope:
- Keep public core Codex-native.
- Do not add private adapters, non-Codex routing, remote marketplace, or generated JS workflows.
- Keep diff-review working by path and by workflow id.

Required:
- Add workflow search paths: ./.codex-flow/workflows, ./workflows, ~/.codex-flow/workflows.
- Add cwf workflows list/show/validate.
- Allow cwf run <workflow-id-or-path> --target <repo>.
- Extend workflow schema with title, tags, inputs, and capabilities metadata.
- Add duplicate-id detection and clear field-level validation errors.
- Preserve gate validation from v0.4.
- Update docs and tests.

Verification:
- npm run check
- npm pack --dry-run
- cwf workflows list
- cwf workflows show diff-review
- cwf workflows validate
- cwf run diff-review --target <fixture> smoke
- cwf run workflows/diff-review.yaml --target <fixture> smoke

Final response:
- Explain what workflow discovery now enables.
- Include commands run, pass/fail, commit hash, and push status.
```

## v0.6: Worker And Reducer Contract Hardening

### PRD

Before adding many workflows, the engine needs stable worker and reducer contracts. Otherwise each workflow will invent its own output shape and failure behavior, creating a pile of incompatible scripts.

v0.6 makes outputs predictable across workflows.

### Goals

- Standardize worker result envelope.
- Standardize reducer result envelope.
- Add artifact manifest.
- Make degraded/partial results explicit.
- Test retry/fallback/partial worker failure behavior.

Status: implemented in v0.6.0.

### SPEC

Worker result envelope:

```json
{
  "worker_id": "tests",
  "status": "completed",
  "confidence": "high",
  "summary": "string",
  "findings": [],
  "verification": [],
  "artifacts": [],
  "started_at": "ISO",
  "completed_at": "ISO",
  "duration_ms": 1000,
  "prompt": "string",
  "raw": "string",
  "raw_fallback": false,
  "fallback_reason": null,
  "retry_count": 0,
  "error": null,
  "usage": null
}
```

Reduced result envelope:

```json
{
  "verdict": "pass|review|fail|degraded",
  "summary": "string",
  "findings": [],
  "verification_gaps": [],
  "next_actions": [],
  "worker_provenance": [],
  "artifacts": []
}
```

Artifact manifest:

```text
~/.codex-workflows/runs/<run-id>/artifacts/manifest.json
```

Reduced result JSON:

```text
~/.codex-workflows/runs/<run-id>/artifacts/reduced-result.json
```

Must record:

- state path
- events path
- worker output paths
- result path
- input context paths
- generated artifacts
- reduced-result path
- run log path when background mode created one

Out of scope:

- new workflow pack
- generated specs
- Desktop UI
- non-Codex workers

### Acceptance

- [ ] Partial worker failure is unambiguous.
  - Evidence: fixture where one worker fails and result is `degraded` or continues by declared policy

- [ ] Raw fallback is visible.
  - Evidence: malformed worker output fixture shows fallback in status/result

- [ ] Artifact manifest reconstructs the run.
  - Evidence: manifest includes state/events/workers/result/input context

- [ ] Reducers keep provenance.
  - Evidence: final result maps findings to worker ids

- [ ] Existing diff-review remains green.
  - Evidence: smoke and tests

### Goal Prompt

```text
Build Codex Flow v0.6 Worker And Reducer Contract Hardening in /Users/sunny/Work/CODEX/codex-workflows.

Scope:
- Keep public core Codex-native.
- Do not add new workflow families yet.
- Do not add private adapters or non-Codex model routing.
- Focus on stable output contracts and artifact evidence.

Required:
- Standardize worker result envelope.
- Standardize reduced result envelope.
- Add artifact manifest.
- Make partial failure, degraded verdicts, retry/fallback, and raw fallback visible.
- Preserve worker provenance in final output.
- Update docs and tests.

Verification:
- npm run check
- npm pack --dry-run
- diff-review smoke
- partial worker failure fixture
- malformed output fallback fixture
- artifact manifest fixture

Final response:
- Explain why workflow outputs are now more trustworthy.
- Include commands run, pass/fail, commit hash, and push status.
```

## v0.7: Example Workflow Pack

### PRD

Once the engine is reliable, examples can show what it is for. These workflows should prove usefulness without becoming hardcoded core logic.

### Goals

- Add read-only example workflows.
- Keep examples outside the runtime core.
- Document when to use and when not to use each workflow.
- Preserve evidence and provenance.

Status: implemented in v0.7.0.

### SPEC

Example workflows:

```text
workflows/repo-audit.yaml
workflows/implementation-plan.yaml
workflows/research-crosscheck.yaml
workflows/release-review.yaml
```

Contracts:

- `repo-audit`: structure, tests, docs, risk
- `implementation-plan`: architecture, implementation, tests, rollout
- `research-crosscheck`: source-finder, skeptic, synthesizer
- `release-review`: tests, docs, rollout, rollback

Rules:

- examples are read-only
- examples use registry path
- examples use shared worker/reducer envelopes
- examples have fixture tests
- examples do not add special runtime code unless generalized

Out of scope:

- file modification
- deployment automation
- GitHub writeback
- browser/UI workflow automation
- non-Codex research providers

### Acceptance

- [ ] `repo-audit` works as an example workflow.
  - Evidence: fixture and real smoke

- [ ] `implementation-plan` works as an example workflow.
  - Evidence: fixture and real smoke

- [ ] `research-crosscheck` works with constrained sources or clearly marks unavailable sources.
  - Evidence: fixture and smoke

- [ ] `release-review` works as an example workflow.
  - Evidence: fixture and real smoke

- [ ] Workflow catalog documents boundaries.
  - Evidence: when-to-use and when-not-to-use docs

- [ ] Core runtime remains generic.
  - Evidence: source review shows no hardcoded example special cases

### Goal Prompt

```text
Build Codex Flow v0.7 Example Workflow Pack in /Users/sunny/Work/CODEX/codex-workflows.

Scope:
- Keep public core Codex-native.
- Add read-only examples only.
- Do not add file writes, deployment automation, private adapters, or non-Codex model routing.
- Do not hardcode example-specific logic into the core runtime.

Required:
- Add example workflows: repo-audit, implementation-plan, research-crosscheck, release-review.
- Add workflow catalog docs with when-to-use and when-not-to-use.
- Use the registry, gates, and worker/reducer contracts already built.
- Add fixture tests and at least one real smoke per example.
- Preserve worker provenance and verification gaps in every result.

Verification:
- npm run check
- npm pack --dry-run
- cwf workflows validate
- smoke each example workflow
- smoke existing diff-review
- source review for no example-specific core special casing

Final response:
- Explain which examples users can now run.
- Include commands run, pass/fail, commit hash, and push status.
```

## v1.0: Stable Codex Workflow Engine

### PRD

v1.0 is the stable public release of Codex Flow as a workflow engine. It should be installable, inspectable, resumable, and honest about what it does.

### Goals

- Stabilize CLI.
- Stabilize workflow schema.
- Stabilize run discovery and registry.
- Stabilize gate/resume safety model.
- Stabilize worker/reducer contracts.
- Ship a read-only example workflow pack.
- Keep Claude comparison honest.

Status: implemented in v1.0.0.

### SPEC

Stable commands:

```bash
cwf --help
cwf validate <workflow>
cwf run <workflow> --target <repo> [--background]
cwf status <run-id>
cwf watch <run-id>
cwf list
cwf show <run-id>
cwf latest
cwf result <run-id>
cwf cancel <run-id>
cwf approve <run-id> <gate-id>
cwf reject <run-id> <gate-id>
cwf resume <run-id>
cwf workflows list
cwf workflows show <workflow>
cwf workflows validate
cwf github-pr <run-id> --format comment|review
cwf suggest-workflow --goal "<task>" [--target <repo>]
```

Stable docs:

- RELEASE_NOTES
- README
- README.zh-CN
- PRD
- SPEC
- FULL_PLAN
- PHASE_CONTRACTS
- SKILL_PLAN
- Claude comparison
- workflow catalog
- acceptance matrix

Out of scope:

- marketplace
- remote workflow install
- full Desktop task panel parity
- arbitrary generated JS execution
- non-Codex model collaboration
- private adapters

### Acceptance

- [ ] A new user can install and run from docs alone.
  - Evidence: fresh clone smoke

- [ ] All documented commands work.
  - Evidence: command checklist

- [ ] Workflows are discoverable and reusable.
  - Evidence: `cwf workflows list`, `cwf run <workflow-id>`

- [ ] Long-running lifecycle works.
  - Evidence: run, watch, list, show, result, cancel/resume where applicable

- [ ] Public core remains Codex-native.
  - Evidence: dependency/source audit

- [ ] Docs are honest.
  - Evidence: claim audit for README/docs

- [ ] Package is releasable.
  - Evidence: `npm pack --dry-run`

### Goal Prompt

```text
Prepare Codex Flow v1.0 Stable Codex Workflow Engine in /Users/sunny/Work/CODEX/codex-workflows.

Scope:
- Stabilize the public Codex-native workflow engine.
- Do not add marketplace, remote workflow install, full Desktop UI parity, generated JS workflow execution, private adapters, or non-Codex model routing.
- Focus on reliability, documentation honesty, installable quality, and public release readiness.

Required:
- Finalize CLI command surface.
- Finalize workflow schema and registry docs.
- Finalize run store artifact manifest.
- Ensure example workflows are documented and tested.
- Update README, README.zh-CN, PRD, SPEC, SKILL_PLAN, PHASE_CONTRACTS, FULL_PLAN, workflow catalog, and acceptance docs.
- Run source/dependency audit for private adapter or non-Codex routing leaks.
- Prepare release notes.

Verification:
- npm run check
- npm pack --dry-run
- all documented commands smoke
- fresh clone install/build/link smoke if feasible
- workflow library smoke
- docs claim audit

Final response:
- Explain whether Codex Flow is ready to call v1.0.
- Include commands run, pass/fail, remaining risks, commit hash, and push status.
```

## v1.1: Release Automation And CI Smoke

### PRD

v1.1 makes release checks repeatable. A maintainer should be able to rely on CI and one local smoke script for build, tests, package dry-run, and documented CLI command checks without starting live Codex workers.

### Goals

- Add release CI.
- Add a CI-safe CLI smoke script.
- Add a release checklist.
- Keep live Codex worker smoke manual.

Status: implemented.

### SPEC

Files:

```text
.github/workflows/ci.yml
scripts/smoke-cli.sh
docs/RELEASE_CHECKLIST.md
```

CI runs on:

- push to `main`
- pull request

CI commands:

```bash
npm ci
npm run check
npm pack --dry-run
bash scripts/smoke-cli.sh
```

Out of scope:

- npm publishing
- GitHub release publishing
- live Codex worker CI
- Desktop integration

### Acceptance

- [ ] CI-safe smoke works locally.
  - Evidence: `bash scripts/smoke-cli.sh`

- [ ] Package dry-run remains clean.
  - Evidence: `npm pack --dry-run`

- [ ] CI definition exists and covers build/test/pack/smoke.
  - Evidence: `.github/workflows/ci.yml`

- [ ] Release checklist exists.
  - Evidence: `docs/RELEASE_CHECKLIST.md`

- [ ] Public core remains Codex-native.
  - Evidence: source/dependency audit shows no private adapters or non-Codex routing

### Goal Prompt

```text
Build Codex Flow v1.1 Release Automation And CI Smoke in /Users/sunny/Work/CODEX/codex-workflows.

Required:
- Add scripts/smoke-cli.sh.
- Add docs/RELEASE_CHECKLIST.md.
- Add GitHub Actions CI for build, tests, pack dry-run, and non-live CLI smoke.
- Update README/README.zh-CN/docs if release workflow changes.

Verification:
- npm run check
- npm pack --dry-run
- bash scripts/smoke-cli.sh
- local inspection of .github/workflows/ci.yml
```

## v1.2: Native Runtime Bridge

### PRD

v1.2 returns completed workflow results to Codex without making Desktop mandatory. The filesystem run store remains the source of truth; Desktop/app-server is an explicit result-return path.

### Goals

- Add app-server capability checking.
- Add local result prompt handoff.
- Attempt coordinator-thread result return when requested.
- Record native runtime metadata for future worker thread phases.
- Keep CLI-only behavior unchanged.

Status: implemented with fallback.

### SPEC

Commands:

```bash
cwf desktop check
cwf desktop result <run-id> [--thread <thread-id>] [--new-thread] [--print]
cwf run <workflow-id-or-path> --target <repo> [--desktop-result]
```

Artifacts:

```text
~/.codex-workflows/runs/<run-id>/artifacts/handoff-prompt.md
~/.codex-workflows/runs/<run-id>/artifacts/desktop-handoff.json
```

Rules:

- `--print` writes and prints the handoff prompt.
- No app-server is required for local prompt handoff.
- `--new-thread` attempts `initialize`, `thread/start`, `thread/name/set`, `turn/start`, and confirmation through `thread/read` with `thread/list` as fallback.
- `--thread <thread-id>` attempts `initialize` and `turn/start` against an explicit thread id.
- Failed app-server attempts write fallback metadata and do not invalidate the completed run.
- Codex Flow never guesses the current thread from `thread/list`.

### Acceptance

- [ ] Capability check works.
  - Evidence: `cwf desktop check`

- [ ] Local prompt handoff works.
  - Evidence: `cwf desktop result <run-id> --print` and `artifacts/handoff-prompt.md`

- [ ] App-server fallback is safe.
  - Evidence: `cwf desktop result <run-id> --new-thread` writes `desktop-handoff.json` with fallback when daemon is unavailable

- [ ] Existing CLI lifecycle remains unaffected.
  - Evidence: run/watch/result smoke without Desktop

- [ ] No current-thread guessing.
  - Evidence: tests cover explicit-thread posting and thread-list verification only

## v1.7: Worker App Threads

Status: implemented with fake app-server coverage and live app-thread smoke evidence.

### PRD

v1.7 makes workflow workers visible in Codex Desktop when explicitly requested. It does not change the primary result-return UX: a workflow launched from an active Codex conversation should return its final summary to that same conversation through the skill wrapper.

The worker app threads are execution and evidence surfaces. They let users inspect each worker's prompt, context, and result in the Codex left sidebar while CWF still owns the run store, reducer, artifact manifest, and final report.

### Goals

- Add a live `codex-app-thread` worker adapter.
- Create one app-server thread per worker.
- Normalize app-thread output into the existing worker envelope.
- Record native runtime metadata for each worker.
- Keep result return to the initiating conversation primary.
- Keep `--new-thread` explicit for CLI/background/coordinator use.
- Defer managed-agent platform scheduling.

### SPEC

Runtime opt-in:

```yaml
runtime:
  preferred_worker_adapter: codex-app-thread
  fallback_worker_adapter: codex-sdk-headless
```

Rules:

- `codex-app-thread` uses app-server `thread/start`, `thread/name/set`, `turn/start`, and `thread/read` or equivalent result retrieval.
- Each worker gets its own thread id and turn id.
- Worker JSON remains the stable contract consumed by reducers.
- Runtime metadata records adapter, requested adapter, fallback adapter, fallback status, parent/coordinator ids when provided, worker thread id, turn id, transcript-read status, sandbox, and approval policy.
- Fallback to SDK headless happens only when configured.
- CWF never guesses parent/current thread id from `thread/list`.
- Write-capable app-thread workers are out of scope.
- Claude Managed Agents-style scheduling, queues, remote lifecycle, and marketplaces are out of scope.

### Acceptance

- [x] One app-thread worker can run through app-server.
  - Evidence: fake app-server test covers thread creation, turn start, and worker envelope normalization

- [x] A live multi-worker run records Desktop worker threads.
  - Evidence: live run `run_20260604084923_hqu0l8` records worker `thread_id` and `turn_id` for correctness/tests/safety with 3/3 workers completed and 0 fallback

- [x] Same-conversation result return remains primary.
  - Evidence: skill wrapper or documented manual path returns final result to the initiating conversation; `--new-thread` remains explicit

- [x] Reducer remains adapter-independent.
  - Evidence: mixed SDK/app-thread fixture passes

- [x] Fallback is explicit.
  - Evidence: tests cover configured fallback and no-fallback failure

- [x] Existing CLI lifecycle remains unaffected.
  - Evidence: `npm run check`, CLI smoke, and normal `diff-review` smoke pass without app-server

## v1.8: Managed-Agents-Style Scheduling Decision

Status: completed as a decision record. Do not implement a scheduler now.

### PRD

v1.8 answers whether Codex Flow should start building a Claude Managed Agents-style scheduler after v1.7 worker app threads.

The decision is no for now. Codex Flow should stay a thin Codex-native workflow layer. It owns workflow specs, run state, gates, worker envelopes, reducers, artifact manifests, and CLI/status surfaces. Codex should continue to own model execution, threads, subagents, sandbox, approvals, permissions, skills, plugins, and worktrees.

This keeps the public promise honest:

> Similar useful workflow effect for supported Codex workflows, different runtime and safety model.

It is not:

> Full Claude Dynamic Workflows parity.

### Evidence

- v1.7 app-thread workers are implemented and documented as completed.
- Live run `run_20260604084923_hqu0l8` recorded 3/3 completed app-thread workers with no SDK fallback and no raw fallback:
  - correctness: thread `019e91d2-ac76-7191-90b2-a7b2234f1c96`, turn `019e91d2-b4a6-7760-8f72-1e34aa73c96a`;
  - tests: thread `019e91d2-ac75-71a0-8186-764d87e9cdf1`, turn `019e91d2-b8be-7793-86c7-674a08bd9205`;
  - safety: thread `019e91d2-ac76-7191-90b2-a7a457bef8f2`, turn `019e91d2-b0d3-73f3-be0a-1060c7067178`.
- Worker output returns through the existing worker envelope and reducer path.
- Same-conversation final result return remains the skill wrapper's job.
- CLI-only users keep process-backed background runs, `status`, `watch`, `result`, `cancel`, local discovery, and durable artifacts without Desktop.
- No current verified workflow requires Codex Flow to own a queue, daemon, remote lifecycle service, recursive worker runtime, or scheduler.

### SPEC

No runtime behavior is added in v1.8.

Rules:

- Do not add a scheduler, queue, daemon, marketplace, registry, remote lifecycle service, or nested worker execution in this phase.
- Do not add non-Codex model routing, private adapters, MiMo/Reasonix-specific behavior, or user-specific defaults to public Codex Flow.
- Do not change result routing: worker threads are evidence/execution surfaces, and same-conversation final result return remains the skill wrapper's job.
- Do not use `thread/list` to infer an initiating/current conversation.
- Revisit scheduling only with a new PRD/SPEC/acceptance plan.

Revisit criteria:

- durable queueing outside the current process becomes a real user need;
- cancellation across many long-running worker threads cannot be handled through existing run state and host controls;
- nested workers are required by a concrete workflow and cannot be delegated to Codex host subagents;
- shared run ownership across users or machines becomes a real product requirement;
- a public workflow registry creates lifecycle needs that local filesystem discovery cannot cover.

Any future scheduler plan must also say when it applies and when it should be skipped.

### Acceptance

- [x] v1.8 produces an evidence-backed decision.
  - Evidence: this section cites v1.7 live app-thread run evidence, existing CLI lifecycle behavior, and the absence of a proven scheduling gap.

- [x] v1.8 does not authorize scheduler implementation.
  - Evidence: docs keep scheduler/queue/daemon/remote lifecycle/nested worker runtime out of scope and require a future PRD/SPEC/acceptance contract.

- [x] v1.7 remains completed historical evidence.
  - Evidence: v1.7 section remains checked and references live run `run_20260604084923_hqu0l8`.

- [x] Public product promise remains honest.
  - Evidence: this section repeats the supported Codex workflow promise and rejects full Claude Dynamic Workflows parity.

## v1.9: Public Workflow Registry Planning

Status: planned as a contract. Do not implement registry runtime commands in this goal.

### PRD

v1.9 defines how Codex Flow can share public workflow specs without becoming a remote-code marketplace.

Users already have local workflow discovery:

- bundled workflows live in the package `workflows/` directory;
- project workflows may live under `.codex-flow/workflows`;
- user workflows may live under `~/.codex-flow/workflows`;
- `cwf workflows list/show/validate` validates local YAML specs before use.

The missing product surface is a safe path from a remote/public workflow source to a local, explicit, inspectable workflow. The core problem is trust, not transport.

Target users:

- Codex Flow users who want to reuse public workflow YAML from a known source;
- maintainers who want to publish workflow specs without shipping runtime code;
- teams that need a clear boundary between bundled, local, and remote-installed workflows.

Goals:

- Define trust levels for bundled, local, remote candidate, and remote-installed workflows.
- Require validation before install or enablement.
- Require SHA-256 integrity pinning for remote install in the first implementation slice.
- Allow signatures later without making them mandatory for v1.9.
- Keep remote workflows disabled until explicitly enabled.
- Keep running explicit: no URL is ever runnable directly.
- Refuse write-capable remote workflows in the first implementation slice.
- Preserve the existing workflow schema, gates, capability metadata, local registry behavior, and run-store contracts.

Non-goals:

- No runtime implementation in this planning goal.
- No generated JavaScript execution.
- No auto-running or auto-installing remote workflows.
- No marketplace search, ranking, publishing, payments, accounts, or remote lifecycle service.
- No scheduler, queue, daemon, or nested worker runtime.
- No private adapters or non-Codex model routing.
- No automatic enablement of write-capable workflows.

### Trust Model

Chosen model for v1.9: source trust levels plus required SHA-256 pinning for remote install.

Trust levels:

- `bundled`: shipped inside the npm package, validated by CI and package smoke, runnable by id.
- `local`: authored or placed by the user in local search paths, validated before list/show/run, runnable by id or path.
- `remote-candidate`: fetched or read for inspection only; untrusted, not installed, not enabled, not runnable.
- `remote-installed`: copied into Codex Flow's local registry cache with metadata after validation and SHA-256 match; not runnable until explicitly enabled.
- `remote-enabled`: a previously installed read-only workflow made available through the local search path after explicit enablement and duplicate-id validation.

Integrity:

- Remote install requires an expected SHA-256 digest supplied by the user or a trusted channel.
- `inspect` may print the computed SHA-256 digest, but `install` still requires the expected digest so mutable URLs do not become trust anchors.
- Signature metadata may be recorded later, but signatures are not required for the smallest v1.9 slice.
- Automatic update is out of scope; changing remote content requires a new inspect/install/enable cycle.

When to use:

- Use this registry path for public read-only YAML workflow specs that users want to reuse across projects.
- Use direct local paths for one-off local workflows or generated suggestions that are not being shared.

When to skip:

- Skip for workflows that need generated code, runtime plugins, private model adapters, non-Codex routing, secrets, deployment, irreversible writes, or write-capable remote behavior.
- Skip for bundled workflows; they already ship with the package.

### SPEC

Smallest useful future implementation slice:

```text
cwf registry inspect <url-or-file> [--sha256 <digest>]
cwf registry install <url-or-file> --sha256 <digest>
cwf registry list
cwf registry enable <installed-id-or-digest>
```

`inspect`:

- fetches or reads one workflow YAML file;
- parses and validates it with the existing workflow schema;
- prints id, version, title, description, tags, capabilities, required inputs, worker adapter preferences, write capability, computed SHA-256, and diagnostics;
- does not write to the registry cache unless a later explicit `install` runs;
- never runs workers.

`install`:

- requires `--sha256 <digest>`;
- fails if the computed digest does not match the supplied digest;
- fails if the workflow is invalid;
- fails for `capabilities.writes: true` in the first implementation slice;
- stores the original YAML and metadata under a local cache path such as `~/.codex-flow/registry/installed/<digest>/`;
- records source URL or source file path, SHA-256 digest, installed timestamp, workflow metadata, and trust level `remote-installed`;
- does not add the workflow to normal `cwf workflows list` yet.

`list`:

- lists installed registry entries and whether each entry is enabled;
- separates bundled/local workflow discovery from remote-installed entries.

`enable`:

- re-validates the installed workflow;
- refuses duplicate workflow ids already present in enabled search paths unless a future explicit conflict policy is accepted;
- refuses write-capable remote workflows in the first implementation slice;
- makes the workflow available through the existing local workflow search path;
- records trust level `remote-enabled` in metadata or show output.

Run rules:

- `cwf run <url>` is invalid.
- A remote workflow can run only after install and enable, or by explicit local path if the user manually places the file.
- `cwf workflows show` should display trust level and source metadata for remote-enabled workflows when that metadata exists.

Security rules:

- Workflow YAML remains data. No generated JavaScript, shell snippets, dynamic imports, plugin code, or remote execution hooks are allowed.
- Existing schema validation, gate validation, capability metadata, and adapter allow-list remain mandatory.
- Remote-installed write-capable workflows are inspectable but not enableable or runnable in the first slice.
- The registry cache is local filesystem state, not a daemon or service.

### Acceptance

- [ ] Remote inspect validates without installing or running.
  - Test: mocked remote/file workflow returns metadata, diagnostics, and SHA-256; registry cache and search paths remain unchanged.

- [ ] Remote install requires SHA-256 pinning.
  - Test: missing digest fails; mismatched digest fails; matching digest writes YAML plus metadata under the local registry cache.

- [ ] Remote install refuses write-capable workflows in the first slice.
  - Test: valid `capabilities.writes: true` workflow is inspectable but install/enable fails with a clear message.

- [ ] Enable is explicit and re-validates.
  - Test: installed read-only workflow is not visible in `cwf workflows list` before enable; after enable it appears and can be shown by id.

- [ ] Duplicate ids fail safely.
  - Test: enabling a workflow id already present in bundled/project/user search paths fails and lists conflicting paths.

- [ ] Direct URL run is impossible.
  - Test: `cwf run https://...` fails before fetch/run and tells the user to inspect/install/enable first.

- [ ] Trust metadata is visible.
  - Test: `cwf registry list` and `cwf workflows show <id>` show source, SHA-256, trust level, enabled status, and write capability when metadata exists.

- [ ] Existing registry behavior remains stable.
  - Test: `npm run check`, `bash scripts/smoke-cli.sh`, and current `cwf workflows list/show/validate` smoke pass.

### Goal Prompt

Archived prompt: [v1.9 public workflow registry](goal-prompts/v1.9-public-workflow-registry.md).
