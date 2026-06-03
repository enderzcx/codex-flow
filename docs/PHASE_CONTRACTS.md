---
half_life: 30d
archive_at: 2026-07-03
---

# Codex Flow Phase Contracts

This document turns the full roadmap into execution-ready phase contracts. Each phase has:

- PRD: why users need it and what must change
- SPEC: concrete behavior and interfaces
- Acceptance: evidence required before calling the phase done
- Goal Prompt: copyable prompt for Codex goal mode

Public core rules apply to every phase:

- Keep Codex Flow Codex-native.
- Do not add MiMo, Reasonix, DeepSeek, Ollama, private adapters, or third-party model routing.
- Do not claim Claude Dynamic Workflows parity unless the specific capability exists.
- Keep docs aligned with implementation.
- Prefer read-only workflows until a phase explicitly introduces write-capable gates.

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
- Chinese and English README

## v0.3: Run Discovery And Observability

### PRD

Users can start background runs today, but they still need to save the run id manually. Once a few runs exist, it becomes hard to answer simple questions:

- What did I run recently?
- Which runs are still active?
- Which run was for this repo?
- Where is the latest result?
- Can I open the last run without copying the id?

v0.3 makes Codex Flow feel like a real long-running workflow tool instead of a hidden process plus scattered run folders.

### Goals

- Add a run index.
- Let users list recent runs.
- Let users inspect one run without remembering artifact paths.
- Keep `watch` as the live progress view.
- Do not add a daemon yet.
- Do not add new workflow types yet.

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

Index entry fields:

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

Behavior:

- `RunStore.create` writes a new index entry.
- State-changing operations update the index best-effort.
- If the index is missing or stale, `cwf list` can rebuild it from `~/.codex-workflows/runs/*/state.json`.
- `cwf list` prints a compact table: id, status, workflow, age, target.
- `cwf show` prints the same human-readable summary as `status`, plus artifact paths and last event.
- `cwf latest` prints the newest matching run id and a one-line summary.

Out of scope:

- daemon
- web UI
- Desktop task panel
- new workflow registry
- non-Codex workers

### Acceptance

- [ ] A user can list recent runs.
  - Evidence: `cwf list`

- [ ] A user can filter by status.
  - Evidence: `cwf list --status running`

- [ ] A user can filter by target.
  - Evidence: `cwf list --target <repo>`

- [ ] A user can inspect a run without reading JSON.
  - Evidence: `cwf show <run-id>` includes status, `Now:`, workers, artifacts, and last event

- [ ] A user can get the latest run id.
  - Evidence: `cwf latest` and `cwf latest --target <repo>`

- [ ] The index survives stale/missing cases.
  - Evidence: test deletes `index.json`, then `cwf list` rebuilds from run folders

- [ ] Existing commands still work.
  - Evidence: `npm run check`, `cwf validate`, foreground smoke, background smoke, watch smoke, cancel smoke

### Goal Prompt

```text
Build Codex Flow v0.3 Run Discovery And Observability in /Users/sunny/Work/CODEX/codex-workflows.

Scope:
- Keep public core Codex-native.
- Do not add private adapters or non-Codex model routing.
- Do not add new workflow types.
- Keep existing diff-review behavior working.

Required:
- Add run index under ~/.codex-workflows/index.json.
- Add cwf list [--limit <n>] [--status <status>] [--target <path>].
- Add cwf show <run-id>.
- Add cwf latest [--target <path>].
- Make list resilient when index.json is missing or stale by rebuilding from run folders.
- Update README, README.zh-CN, SPEC, PRD, SKILL_PLAN, ACCEPTANCE, and PHASE_CONTRACTS if behavior changes.
- Add tests for index creation/update/rebuild and CLI formatting.

Verification:
- npm run check
- npm pack --dry-run
- cwf validate workflows/diff-review.yaml
- fixture foreground smoke
- fixture background smoke
- cwf watch smoke
- cwf list/show/latest smoke
- cancel smoke

Final response:
- Explain in human terms what users can now do.
- Include commands run, pass/fail, commit hash, and push status.
```

## v0.4: Workflow Registry

### PRD

One hardcoded workflow is enough for MVP, but not enough for a dynamic workflow layer. Users need a predictable way to discover, validate, and run saved workflows from a project or global location.

v0.4 makes workflows reusable objects instead of one bundled YAML file.

### Goals

- Introduce project and global workflow discovery.
- Keep workflow specs declarative and constrained.
- Let users list and validate available workflows.
- Keep `diff-review` as the first registry workflow.
- Do not add arbitrary generated scripts.

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
version: 0.4.0
title: Diff Review
description: Review a git diff with independent Codex worker perspectives.
tags:
  - review
  - read-only
inputs:
  target:
    type: path
    required: true
    description: Target git repo.
```

Validation must check:

- unique workflow ids across active search path
- required fields
- supported phase kinds
- valid reducer name
- worker ids unique inside a workflow
- workflow declares whether it is read-only or write-capable

Out of scope:

- user-generated JavaScript workflows
- marketplace publishing
- remote workflow fetching
- non-Codex model providers

### Acceptance

- [ ] A user can discover local workflows.
  - Evidence: `cwf workflows list`

- [ ] A user can inspect a workflow before running it.
  - Evidence: `cwf workflows show diff-review`

- [ ] A user can validate all discovered workflows.
  - Evidence: `cwf workflows validate`

- [ ] A user can run by workflow id.
  - Evidence: `cwf run diff-review --target <repo> --background`

- [ ] Duplicate workflow ids fail clearly.
  - Evidence: fixture test with duplicate project/global ids

- [ ] Existing direct path usage still works.
  - Evidence: `cwf run workflows/diff-review.yaml --target <repo>`

### Goal Prompt

```text
Build Codex Flow v0.4 Workflow Registry in /Users/sunny/Work/CODEX/codex-workflows.

Scope:
- Keep public core Codex-native.
- Do not add private adapters, non-Codex routing, remote marketplace, or generated JS workflows.
- Keep diff-review working by path and by workflow id.

Required:
- Add workflow search paths: ./.codex-flow/workflows, ./workflows, ~/.codex-flow/workflows.
- Add cwf workflows list/show/validate.
- Allow cwf run <workflow-id-or-path> --target <repo>.
- Extend workflow schema with title, tags, inputs, and read-only/write-capable metadata.
- Add duplicate-id detection and clear field-level validation errors.
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

## v0.5: Gates, Resume, And Safer Writes

### PRD

Dynamic workflows become risky once they can write files or continue after partial failure. Users need a way to pause before dangerous steps, inspect state, approve continuation, and resume without restarting everything.

v0.5 adds the safety model required before Codex Flow can support write-capable workflows.

### Goals

- Add explicit `gate` phases.
- Add resumable run state.
- Let users approve a paused gate.
- Preserve read-only default.
- Make write-capable phases opt-in only.

### SPEC

New commands:

```bash
cwf resume <run-id>
cwf approve <run-id> <gate-id>
cwf reject <run-id> <gate-id> [--reason <text>]
```

New statuses:

```text
waiting
approved
rejected
```

New phase kind:

```yaml
- id: approve-write
  kind: gate
  prompt: Review the planned file changes before Codex writes.
  requires_approval: true
```

Resume contract:

- Completed phases are not rerun by default.
- Pending phases after an approved gate may continue.
- Failed phases expose whether they are resumable.
- Rejected gates stop the run and write a clear final state.
- Read-only workflows do not require gates.

Safety contract:

- Any worker or phase that writes files must declare `writes: true`.
- Any workflow with `writes: true` must include at least one gate before the first write-capable phase.
- A workflow that declares writes without a gate fails validation.

Out of scope:

- automatic code modification workflow library
- GitHub writeback
- remote approval UI
- Desktop task approval UI

### Acceptance

- [ ] A read-only workflow still runs without gates.
  - Evidence: `diff-review` smoke passes

- [ ] A write-capable workflow without a gate fails validation.
  - Evidence: fixture schema test

- [ ] A workflow can pause at a gate.
  - Evidence: smoke workflow reaches `waiting`

- [ ] A user can approve and resume.
  - Evidence: `cwf approve <run-id> <gate-id>` then `cwf resume <run-id>`

- [ ] A user can reject and stop.
  - Evidence: `cwf reject <run-id> <gate-id> --reason ...` produces stopped state

- [ ] Completed phases are not rerun on resume.
  - Evidence: event log shows only pending phases continue

### Goal Prompt

```text
Build Codex Flow v0.5 Gates, Resume, And Safer Writes in /Users/sunny/Work/CODEX/codex-workflows.

Scope:
- Keep public core Codex-native.
- Do not add a write-capable production workflow yet.
- Implement the safety primitives first.
- Keep diff-review read-only and unchanged in behavior.

Required:
- Add gate phase kind.
- Add waiting/approved/rejected statuses where needed.
- Add cwf approve, reject, and resume.
- Add validation rule: workflows with writes:true must include a gate before first write-capable phase.
- Ensure completed phases do not rerun on resume.
- Persist gate decisions in state.json and events.jsonl.
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

## v0.6: Workflow Families

### PRD

Codex Flow starts feeling like Dynamic Workflows only when it has more than one useful workflow. v0.6 adds several read-only workflow families that cover common engineering tasks without introducing file writes.

### Goals

- Add practical read-only workflows beyond diff review.
- Reuse the registry from v0.4.
- Reuse status/watch/list from v0.3.
- Reuse safety rules from v0.5.
- Keep every workflow evidence-based.

### SPEC

New workflows:

```text
repo-audit
implementation-plan
research-crosscheck
release-review
```

Workflow contracts:

`repo-audit`:

- Inputs: `target`
- Workers: structure, tests, docs, risk
- Output: repo health report, priority findings, verification gaps

`implementation-plan`:

- Inputs: `target`, `goal`
- Workers: architecture, implementation, tests, rollout
- Output: plan, files likely touched, acceptance matrix, risks

`research-crosscheck`:

- Inputs: `question`, optional `target`, optional `sources`
- Workers: source-finder, skeptic, synthesizer
- Output: sourced answer, disagreement notes, confidence

`release-review`:

- Inputs: `target`
- Workers: tests, docs, rollout, rollback
- Output: release verdict, blockers, checks, rollback notes

Reducer requirements:

- Each workflow has its own reducer or reducer mode.
- Every finding keeps worker provenance.
- Every claim that depends on a file cites a path or artifact.
- Every workflow returns verification gaps.

Out of scope:

- file modification
- deployment automation
- browser/UI automation workflows
- non-Codex research providers

### Acceptance

- [ ] `repo-audit` passes fixture and real smoke.
  - Evidence: `cwf run repo-audit --target <repo>`

- [ ] `implementation-plan` passes fixture and real smoke.
  - Evidence: `cwf run implementation-plan --target <repo> --goal "..."`

- [ ] `research-crosscheck` passes fixture and at least one live-source constrained smoke when network is allowed.
  - Evidence: result includes sources or explicitly marks unavailable sources

- [ ] `release-review` passes fixture and real smoke.
  - Evidence: result includes blockers/checks/rollback notes

- [ ] Each workflow is documented with when-to-use and when-not-to-use.
  - Evidence: README or docs workflow catalog

- [ ] Existing `diff-review` remains green.
  - Evidence: existing smoke and tests

### Goal Prompt

```text
Build Codex Flow v0.6 Workflow Families in /Users/sunny/Work/CODEX/codex-workflows.

Scope:
- Keep public core Codex-native.
- Add only read-only workflows.
- Do not add file writes, deployment automation, private adapters, or non-Codex model routing.
- Use the registry and run store already built in earlier phases.

Required:
- Add repo-audit, implementation-plan, research-crosscheck, and release-review workflows.
- Add or extend reducers for each workflow.
- Add workflow catalog docs with when-to-use and when-not-to-use.
- Add fixture tests and at least one real smoke per workflow.
- Preserve worker provenance and verification gaps in every result.

Verification:
- npm run check
- npm pack --dry-run
- cwf workflows validate
- smoke each new workflow
- smoke existing diff-review

Final response:
- Explain which new workflows users can now run.
- Include commands run, pass/fail, commit hash, and push status.
```

## v1.0: Codex-Native Dynamic Workflows

### PRD

v1.0 is the point where Codex Flow can be presented as a stable Codex-native workflow layer. It should be installable, discoverable, documented, inspectable, and safe enough for public use by people outside this machine.

### Goals

- Stabilize CLI and workflow schema.
- Stabilize workflow registry.
- Stabilize run store and artifact manifest.
- Provide a small read-only workflow library.
- Provide clear Codex skill integration.
- Document Desktop handoff as guarded future or experimental optional path.
- Remove stale MVP-only language.

### SPEC

Stable commands:

```bash
cwf --help
cwf validate <workflow>
cwf workflows list
cwf workflows show <workflow>
cwf workflows validate
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
```

Stable docs:

- README
- README.zh-CN
- PRD
- SPEC
- workflow catalog
- skill plan
- acceptance matrix
- Claude comparison
- phase contracts

Release checklist:

- dependency audit has no private adapters or non-Codex routing
- tests cover schema, registry, run store, reducers, CLI, failure paths
- package dry-run is clean enough for public release
- every documented command works
- examples are current
- docs do not claim Desktop UI parity unless implemented

Out of scope for v1.0:

- marketplace
- remote workflow install
- full Desktop task panel parity
- automatic generated script execution
- non-Codex model collaboration

### Acceptance

- [ ] A new user can install and run from docs alone.
  - Evidence: fresh clone smoke from README

- [ ] All documented commands work.
  - Evidence: command checklist output

- [ ] Workflow registry supports multiple workflows.
  - Evidence: `cwf workflows list` shows workflow library

- [ ] Long-running workflow lifecycle works end to end.
  - Evidence: run, watch, list, show, result, cancel/resume where applicable

- [ ] Public core remains Codex-native.
  - Evidence: source/dependency audit

- [ ] Docs are honest.
  - Evidence: no unsupported claims in README/docs

- [ ] Package is releasable.
  - Evidence: `npm pack --dry-run`

### Goal Prompt

```text
Prepare Codex Flow v1.0 in /Users/sunny/Work/CODEX/codex-workflows.

Scope:
- Stabilize the public Codex-native workflow layer.
- Do not add marketplace, remote workflow install, full Desktop UI parity, generated JS workflow execution, private adapters, or non-Codex model routing.
- Focus on public reliability, documentation honesty, and installable quality.

Required:
- Finalize CLI command surface.
- Finalize workflow schema and registry docs.
- Finalize run store artifact manifest.
- Ensure all workflow families are documented and tested.
- Update README, README.zh-CN, PRD, SPEC, SKILL_PLAN, PHASE_CONTRACTS, FULL_PLAN, workflow catalog, and acceptance docs.
- Run a source/dependency audit for private adapter or non-Codex routing leaks.
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
