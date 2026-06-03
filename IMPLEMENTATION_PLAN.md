---
half_life: 7d
archive_at: 2026-06-09
---

# Implementation Plan

## Goal

Build the first public `codex-workflows` skill and runner as a Codex-native dynamic workflow MVP. The first workflow is `diff-review`.

## Product Shape

`codex-workflows` has two public pieces:

1. Skill instructions
   - Teaches Codex when to use workflows.
   - Keeps scope explicit.
   - Routes users to the CLI runner.
   - Explains that this is Codex-native, not a third-party model router.

2. CLI runner
   - Executes workflow specs.
   - Starts Codex SDK worker threads.
   - Persists run state and worker outputs.
   - Renders final results.

## Proposed Folder Layout

```text
/Users/sunny/Work/CODEX/codex-workflows/
  package.json
  tsconfig.json
  README.md
  PLAN.md
  ACCEPTANCE.md
  IMPLEMENTATION_PLAN.md
  docs/
    claude-vs-codex-workflows.md
  skills/
    codex-workflows/
      SKILL.md
  workflows/
    diff-review.yaml
  src/
    cli.ts
    workflow-schema.ts
    workflow-loader.ts
    run-store.ts
    phase-engine.ts
    adapters/
      codex-worker.ts
      command-step.ts
    reducers/
      diff-review-reducer.ts
    renderers/
      markdown-result.ts
  fixtures/
    diff-review/
  tests/
    workflow-schema.test.ts
    run-store.test.ts
    diff-review-reducer.test.ts
```

## Skill Contract

The skill should trigger when the user asks Codex to:

- run a workflow
- audit a diff
- review a branch with multiple perspectives
- coordinate multiple Codex workers
- perform a repeatable repo audit
- compare Codex workflow behavior to Claude Dynamic Workflows

The skill should not trigger for:

- small direct code fixes
- single-file typo changes
- private model routing
- UI/copy collaborator routing
- generic project management

## Workflow Spec Contract

`workflows/diff-review.yaml` should describe:

- workflow id and version
- required target repo
- phase list
- worker list
- worker prompts
- output schema
- reducer name
- default sandbox: read-only
- expected artifacts

MVP can support only the fields needed by `diff-review`. Do not design a giant generic DSL before the first workflow runs.

## CLI Contract

Commands:

```bash
cwf --help
cwf run workflows/diff-review.yaml --target <repo>
cwf status <run-id>
cwf watch <run-id>
cwf result <run-id>
cwf cancel <run-id>
```

Behavior:

- `run` creates a run folder and returns a run id.
- `status` reads `state.json`.
- `watch` refreshes the status view until the run reaches a terminal state.
- `result` prints `result.md`.
- `cancel` marks pending workers cancelled. It does not need perfect process interruption in MVP if workers already finished.

## Run Store Contract

Each run writes:

```text
~/.codex-workflows/runs/<run-id>/
  workflow.json
  state.json
  events.jsonl
  workers/
    correctness.json
    tests.json
    safety.json
  result.md
```

Minimum `state.json`:

```json
{
  "id": "run_xxx",
  "workflow": "diff-review",
  "status": "running",
  "target": "/abs/path/to/repo",
  "phases": [
    { "id": "collect", "status": "completed" },
    { "id": "review", "status": "running" },
    { "id": "reduce", "status": "pending" }
  ],
  "created_at": "ISO",
  "updated_at": "ISO"
}
```

## Codex Worker Contract

Each Codex worker runs independently and returns structured JSON:

```json
{
  "worker_id": "correctness",
  "summary": "short summary",
  "findings": [
    {
      "severity": "high",
      "title": "short title",
      "evidence": "file/line or diff reference",
      "reason": "why this matters",
      "suggested_fix": "specific next action"
    }
  ],
  "verification": ["command or manual check"],
  "confidence": "high"
}
```

If structured output fails, preserve raw output and mark the worker result as `raw_fallback`.

## `diff-review` Worker Perspectives

Worker 1: correctness

- behavior regressions
- edge cases
- broken assumptions
- missing error handling

Worker 2: tests

- missing test coverage
- weak assertions
- verification commands
- fixture gaps

Worker 3: safety

- security
- permissions
- data loss
- rollback
- unexpected file writes

## Reducer Contract

Reducer must:

- merge duplicate findings
- preserve the strongest evidence
- rank by severity
- downgrade unsupported claims
- include worker ids that contributed to each finding
- output final Markdown

Final result sections:

```text
Verdict
Findings
Verification Gaps
Suggested Next Actions
Artifacts
```

## Implementation Slices

### Slice 1: Static CLI And Store

Build `cwf --help`, `run`, `status`, `result`, and a fake worker path. This proves the run folder, state, events, and renderer work without invoking Codex SDK.

Acceptance:

- `cwf run workflows/diff-review.yaml --target fixtures/diff-review` creates a run id.
- `cwf status <run-id>` shows phase statuses.
- `cwf result <run-id>` prints a placeholder result.

### Slice 2: Spec Schema And Validation

Add minimal workflow schema validation for `diff-review`.

Acceptance:

- valid spec passes
- invalid spec fails with field path
- no unrelated DSL fields are required

### Slice 3: Codex SDK Connectivity

Add a minimal Codex SDK check that can run one read-only worker in a target repo.

Acceptance:

- worker can inspect a fixture diff
- worker output is saved
- raw fallback is saved if JSON parsing fails

Stop if Codex SDK is not reachable.

### Slice 4: Parallel Workers

Run correctness, tests, and safety workers.

Acceptance:

- three worker JSON files are created
- `events.jsonl` records worker start/completion
- failed worker does not erase completed worker output

### Slice 5: Reducer

Merge worker outputs into `result.md`.

Acceptance:

- duplicate fixture findings become one finding
- unsupported fixture finding is downgraded or dropped
- result includes artifacts path

### Slice 6: Skill File

Write `skills/codex-workflows/SKILL.md`.

### Future Slice: Codex Desktop Handoff

This is not part of the MVP acceptance path.

Explore the experimental Codex app-server protocol for Desktop-visible thread creation:

- confirm `thread/start`, `thread/list`, and thread status notifications against the installed Codex version
- add a guarded handoff command after core `diff-review` is stable
- record created thread ids in the run store
- keep CLI-only fallback behavior when app-server is unavailable

Acceptance:

- skill describes when to use `cwf`
- skill warns against using it for trivial fixes
- skill states public version is Codex-native
- skill references `ACCEPTANCE.md`

### Slice 7: Smoke And Docs

Run the MVP on a fixture repo or a small real repo with a harmless diff.

Acceptance:

- commands in `ACCEPTANCE.md` pass or failures are clearly documented
- README explains the Claude comparison
- final response includes exact commands

## Test Plan

Unit tests:

- schema validation
- run store creation
- reducer duplicate merge
- reducer unsupported-claim handling

Smoke tests:

- CLI help
- run/status/result on fixture
- read-only check on target repo
- no target repo mutation

Manual evidence:

- inspect run folder
- inspect worker outputs
- inspect result Markdown

## Risks

1. Codex SDK API changes.
   - Mitigation: isolate SDK behind `adapters/codex-worker.ts`.

2. Worker JSON is malformed.
   - Mitigation: preserve raw output and mark `raw_fallback`.

3. Workflow scope expands too early.
   - Mitigation: hard stop after `diff-review` passes smoke.

4. Runner accidentally mutates target repo.
   - Mitigation: default read-only sandbox and before/after `git diff` check.

5. Public skill becomes too Ender-specific.
   - Mitigation: implementation must not depend on private adapters, local private keys, or personal collaboration rules.

## Ready To Implement

No more product brainstorming is needed for the MVP. Implementation can start once the next goal says to build this plan.
