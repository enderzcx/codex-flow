---
half_life: 30d
archive_at: 2026-07-03
---

# Codex Flow Full Plan

## Plain Summary

Codex Flow should become a Codex-native workflow engine for inspectable, resumable, multi-worker engineering workflows.

The full product is not "Claude Dynamic Workflows, copied line by line." It should match the useful effect:

- one command starts a complex task
- the task is split into phases
- focused Codex workers run in parallel or sequence
- progress and failures are visible outside the chat
- intermediate evidence is saved
- unsafe steps can pause for approval
- a reducer turns worker output into one actionable result

The important word is **engine**. Codex Flow should first become a reliable workflow runtime, then grow a workflow registry and example workflow packs.

## What "Dynamic" Means

To avoid overclaiming, Codex Flow uses a staged definition of dynamic behavior.

### v1.0 Dynamic

For v1.0, "dynamic" means:

- workflow execution can branch through explicit phases and gates
- failed runs can explain what happened and what can resume
- a user or Codex skill can choose a workflow for a task
- workflow specs can be discovered, validated, and reused
- worker outputs can influence reducer verdicts and next actions

### Not v1.0 Dynamic

The following are not v1.0 promises:

- Codex automatically generating arbitrary executable workflow scripts
- a native Codex Desktop `/workflows` task panel
- automatic keyword triggers that start workflows without explicit user/tool intent
- non-Codex model routing
- private model adapters

If future versions add generated workflow specs, they must generate constrained YAML/JSON and pass validation before execution. Arbitrary generated JavaScript is deliberately not part of the public core.

## v1.0 Promise

> Codex Flow is a Codex-native workflow engine for running inspectable, resumable, multi-worker engineering workflows from reusable specs.

This is the public promise. It is strong enough to be useful and narrow enough to verify.

## Target Effect

Users should be able to run:

```bash
cwf run diff-review --target .
cwf run repo-audit --target .
cwf run implementation-plan --target . --goal "migrate auth module"
cwf watch <run-id>
cwf result <run-id>
```

And Codex skills should be able to say:

```text
Use Codex Flow to review this branch with correctness, tests, and safety perspectives.
```

The user should not need to manually copy prompts into several sessions or hunt through chat history for intermediate findings. A run folder becomes the evidence trail.

## Claude Dynamic Workflows Comparison

### Similar Useful Effect

- A user starts one higher-level task.
- The system runs multiple steps and workers.
- The main agent stays in a supervisor role.
- Intermediate state is outside the main chat.
- Progress can be inspected.
- Final output is a reduced, actionable answer.

### Different Substrate

- Claude has a native workflow runtime; Codex Flow is a public CLI/SDK runtime.
- Claude can lean on generated scripts; Codex Flow starts with constrained specs.
- Claude has native UI surfaces; Codex Flow starts with CLI, run store, and skills.
- Claude is product-integrated; Codex Flow must keep its public core installable and auditable.

The correct positioning is:

> Same workflow principle, similar useful effect for supported workflows, different runtime and safety model.

## Core Architecture

```text
User / Codex skill
  -> Workflow Resolver
  -> Workflow Validator
  -> Run Store
  -> Failure Model
  -> Phase Engine
      -> command
      -> codex-parallel
      -> codex-sequential
      -> reducer
      -> gate
      -> handoff
  -> Status / Watch / List / Show / Result
```

## Core Concepts

### Workflow Resolver

Maps user intent or CLI input to a workflow spec.

Early versions should prefer explicit workflow ids:

```bash
cwf run diff-review --target .
```

Natural-language workflow choice can live in the Codex skill layer first. The core runner should not guess silently.

### Workflow Validator

Checks specs before model time is spent:

- schema validity
- supported phase kinds
- unique worker ids
- valid reducer
- valid inputs
- sandbox and approval settings
- write-capable phases are gated
- failure behavior is declared or defaults are clear

### Run Store

Every run writes a durable folder:

```text
~/.codex-workflows/runs/<run-id>/
  workflow.json
  state.json
  events.jsonl
  inputs/
  workers/
  artifacts/
  result.md
  run.log
```

Later versions add:

- artifact manifest
- resume metadata
- parent/child run links
- worker usage metadata when Codex exposes it

### Failure Model

Every phase needs predictable failure behavior.

v0.3 stores a default failure policy in each run:

- worker failures continue when at least one Codex worker succeeds
- all-worker failure fails the run
- target diff changes fail the run
- unhandled errors fail the run

Failed runs also store a readable failure summary with the failed phase, failed workers when known, and a next-step hint.

Supported failure policies:

- `abort`: stop the run
- `retry`: retry within configured limits
- `continue`: keep going and mark degraded
- `fallback`: accept raw or partial output
- `gate`: pause for user decision

Default for unknown failures should be `abort`, with a clear status and event trail.

### Phase Engine

Supported phase kinds over time:

- `command`: local context collection
- `codex-parallel`: focused Codex workers in parallel
- `codex-sequential`: dependent Codex workers in sequence
- `reducer`: merge results
- `gate`: wait for approval or rejection
- `handoff`: produce a prompt, PR note, GitHub comment, or follow-up task

### Worker Model

Workers are Codex-only in the public core.

Each worker declares:

- id
- role
- prompt
- inputs
- output schema
- timeout
- sandbox
- failure policy
- whether it writes files

Default worker mode is read-only.

### Reducer Model

Reducers are product-critical. They must:

- merge duplicates
- preserve strongest evidence
- mark disagreement
- lower confidence for weak claims
- keep worker provenance
- output verification gaps
- output next actions

Codex Flow is not useful if reducer output is just pasted worker text.

## Revised Milestones

### v0.2: Usable Public MVP

Status: done.

Includes:

- `validate`
- `run`
- `status`
- `watch`
- `result`
- `cancel`
- one workflow: `diff-review`
- readable status/watch output
- Chinese and English README

### v0.3: Run Discovery And Failure Model

Goal: make background runs easy to find and failures easy to understand.

Status: implemented.

Deliverables:

- `cwf list [--limit <n>] [--status <status>] [--target <path>]`
- `cwf show <run-id>`
- `cwf latest [--target <path>]`
- run index at `~/.codex-workflows/index.json`
- rebuild from run folders when the index is missing, stale, or corrupt
- explicit phase failure policy defaults
- human-readable failure summaries in `status`/`show`

Acceptance:

- users can find recent runs without remembering ids
- users can see why a run failed without reading raw JSON first
- index loss can be recovered from run folders
- no daemon required

### v0.4: Gates And Resume

Goal: make long or risky workflows resumable and safe before any write-capable workflow exists.

Status: implemented.

Deliverables:

- `gate` phase
- `approve`
- `reject`
- `resume`
- resumable state with persisted gate decisions
- completed phases are not rerun by default
- write-capable phases require a prior gate

Acceptance:

- read-only `diff-review` still works without gates
- a gate fixture can pause, approve, resume, reject
- invalid write-capable workflow without gate fails validation
- event log explains decisions

### v0.5: Workflow Registry

Goal: make workflows reusable by id and discoverable from project/global folders.

Deliverables:

- workflow search paths
- `cwf workflows list`
- `cwf workflows show`
- `cwf workflows validate`
- run by workflow id
- workflow metadata: title, tags, inputs, capabilities

Acceptance:

- `diff-review` works by path and by id
- duplicate ids fail clearly
- invalid workflow specs fail with field-level errors
- docs explain how to add a read-only workflow

### v0.6: Reducer And Worker Contract Hardening

Goal: make the engine safe for more workflow types before adding a large workflow library.

Deliverables:

- shared worker output envelope
- reducer base contract
- artifact manifest
- retry/fallback fixtures
- partial worker failure behavior
- degraded run verdicts
- structured verification gaps

Acceptance:

- one worker failing does not make outcomes ambiguous
- fallback output is visible in status/result
- artifact manifest can reconstruct what happened
- reducers preserve worker provenance

### v0.7: Example Workflow Pack

Goal: demonstrate usefulness without bloating the core runtime.

Deliverables:

- `examples/repo-audit`
- `examples/implementation-plan`
- `examples/research-crosscheck`
- `examples/release-review`
- workflow catalog docs

Rules:

- examples are read-only
- examples do not become special cases in the core engine
- every example has when-to-use and when-not-to-use docs

Acceptance:

- each example passes fixture tests
- at least one real smoke per example
- core runtime remains generic

### v1.0: Stable Codex Workflow Engine

Goal: public stable release.

Deliverables:

- stable CLI
- stable workflow schema
- run discovery
- watch/status/result/cancel/resume
- workflow registry
- gate safety model
- hardened worker/reducer contracts
- read-only example workflow pack
- clear Codex skill integration
- honest Claude comparison

Acceptance:

- a new user can install, validate, run, inspect, and reuse workflows from docs alone
- no private adapter required
- no non-Codex model routing
- workflow failures are inspectable
- docs do not claim unsupported Desktop or Claude parity

## Delayed Until After v1.0

These are valuable but not core v1.0:

- generated workflow spec suggestions
- generated executable scripts
- remote workflow marketplace
- Desktop task panel parity
- write-capable workflow pack
- GitHub PR writeback
- non-Codex collaborator routing

## Product Rules

### Do

- Keep public core Codex-native.
- Make state inspectable.
- Prefer read-only first.
- Define failure behavior early.
- Treat reducer quality as product quality.
- Make errors human-readable.
- Make every workflow answer: what happened, what evidence, what next.

### Do Not

- Do not add private model routing to the public core.
- Do not make arbitrary generated scripts the first workflow format.
- Do not claim Claude feature parity before the specific surface exists.
- Do not hide failures behind vague AI summaries.
- Do not let worker output overwrite user files unless explicitly allowed and gated.
- Do not put domain workflow logic into the core runtime.

## Full Acceptance Matrix

- [ ] A user can discover runs.
  - Evidence: `cwf list`, `cwf show`, `cwf latest`

- [ ] A user can discover workflows.
  - Evidence: `cwf workflows list`

- [ ] A user can validate a workflow without spending model time.
  - Evidence: `cwf validate <workflow>`

- [ ] A user can run long workflows in the background.
  - Evidence: `cwf run <workflow> --background`

- [ ] A user can watch progress without reading JSON.
  - Evidence: `cwf watch <run-id>`

- [ ] A user can inspect failure causes.
  - Evidence: failed run status/show includes phase, policy, error, failed workers when known, and next step

- [ ] A user can pause and resume gated work.
  - Evidence: gate fixture approve/reject/resume smoke

- [ ] A reducer produces one actionable final answer.
  - Evidence: final result contains verdict, findings, evidence, verification gaps, next actions, worker provenance

- [ ] Public core remains Codex-native.
  - Evidence: dependency and source audit shows no third-party model routers or private adapters

## Next Best Slice

The next useful implementation slice is v0.5:

1. Add workflow search paths.
2. Add workflow listing/showing/validation commands.
3. Keep `diff-review` path-based execution behavior working.
4. Preserve v0.4 gate validation before any write-capable workflow is accepted.

Why this next: discovery and gates are now in place, so the remaining engine gap is reusable workflow discovery without turning examples into core runtime special cases.
