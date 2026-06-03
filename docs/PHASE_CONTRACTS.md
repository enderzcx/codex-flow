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
- `cwf result`
- `cwf cancel`
- one workflow: `diff-review`
- run store under `~/.codex-workflows/runs/<run-id>/`
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

- command phase: `abort`
- codex worker phase: `fallback` for malformed output, `abort` when all workers fail
- reducer phase: `abort`
- unknown phase error: `abort`

Status/show should include:

- last event summary
- failed phase or worker
- failure policy used
- whether the run is resumable
- artifact paths

Index behavior:

- `RunStore.create` records a new index entry.
- State changes update the index best-effort.
- If the index is missing or stale, `cwf list` rebuilds from `~/.codex-workflows/runs/*/state.json`.
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
  - Evidence: `cwf show <run-id>` includes status, `Now:`, workers, artifacts, and last event

- [ ] A user can get the latest run.
  - Evidence: `cwf latest`, `cwf latest --target <repo>`

- [ ] Missing or stale index can recover.
  - Evidence: test deletes `index.json`, then `cwf list` rebuilds from run folders

- [ ] Failure output is human-readable.
  - Evidence: mocked failed worker run shows failed phase/worker/policy/last event

- [ ] Existing commands still work.
  - Evidence: `npm run check`, validate smoke, foreground smoke, background smoke, watch smoke, cancel smoke

### Goal Prompt

```text
Build Codex Flow v0.3 Run Discovery And Failure Model in /Users/sunny/Work/CODEX/codex-workflows.

Scope:
- Keep public core Codex-native.
- Do not add private adapters or non-Codex model routing.
- Do not add new workflow types.
- Do not add workflow registry yet.
- Keep existing diff-review behavior working.

Required:
- Add run index under ~/.codex-workflows/index.json or an equivalent rebuildable discovery layer.
- Add cwf list [--limit <n>] [--status <status>] [--target <path>].
- Add cwf show <run-id>.
- Add cwf latest [--target <path>].
- Rebuild discovery data from run folders when index is missing/stale/corrupt.
- Add default failure policy metadata and human-readable failure summaries.
- Update README, README.zh-CN, PRD, SPEC, SKILL_PLAN, ACCEPTANCE, FULL_PLAN, and PHASE_CONTRACTS if behavior changes.
- Add tests for index/discovery creation, rebuild, filtering, latest, show formatting, and failure summaries.

Verification:
- npm run check
- npm pack --dry-run
- cwf validate workflows/diff-review.yaml
- fixture foreground smoke
- fixture background smoke
- cwf watch smoke
- cwf list/show/latest smoke
- mocked failure smoke
- cancel smoke

Final response:
- Explain in human terms what users can now do.
- Include commands run, pass/fail, commit hash, and push status.
```

## v0.4: Gates And Resume

### PRD

Before Codex Flow supports write-capable workflows or long multi-stage runs, users need a safe pause/resume model. A workflow should be able to stop before risk, wait for approval, and continue without rerunning completed phases.

### Goals

- Add explicit gates.
- Add approve/reject/resume.
- Preserve read-only defaults.
- Make write-capable phases impossible without a prior gate.
- Avoid adding production write workflows in this phase.

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
  "raw_fallback": false,
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

Must record:

- state path
- events path
- worker output paths
- result path
- input context paths
- generated artifacts

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

### SPEC

Example workflows:

```text
examples/repo-audit
examples/implementation-plan
examples/research-crosscheck
examples/release-review
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
```

Stable docs:

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
