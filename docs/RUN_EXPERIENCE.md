# Run Experience

CWF should feel like a native dynamic workflow, not a noisy collection of chat threads.

The main Codex conversation remains the control room. It previews the workflow, runs the useful workers, reports compact status, and returns the final result in the same conversation.

## Lifecycle

```text
request
  -> scope first
  -> generate bounded run plan
  -> preview harness
  -> user or coordinator confirms scope
  -> run inline workers and selected Desktop-thread workers
  -> show compact status
  -> adapt, cancel, or resume when needed
  -> final synthesis returns to the originating conversation
```

## Preview

Before a non-trivial workflow runs, Codex should show a short preview:

- selected pattern;
- scope and explicit exclusions;
- phases;
- planned agents;
- verifier or challenger role;
- worker visibility: `inline`, `desktop-thread`, or `auto`;
- write scopes;
- token budget;
- quarantine rules;
- stop conditions.

Preview is skipped only for small, obvious workflows where the user explicitly asked to run immediately.

Small means all of these are true:

- phase count is 3 or less;
- planned worker count is 5 or less;
- `budget.max_tokens` is 100000 or less;
- no worker has a non-empty write scope;
- no worker has `visibility: "desktop-thread"`;
- no untrusted raw content is routed to privileged workers.

Generate a mechanical preview with:

```bash
node scripts/cwf-run-preview.mjs workflows/repo-audit.workflow.js
```

For non-trivial workflows, save or display a generated run plan. If a run id exists, the planned future path is:

```text
.cwf/runs/RUN_ID/run-plan.md
```

The run plan is a compact local contract, not a standalone runtime script.

## Status

Status should be compact and human-readable:

- running phase;
- workers started / completed / blocked;
- elapsed time;
- budget used or rough budget pressure;
- current blocker, if any.
- verifier state, when the workflow has a challenger.

Inline workers should not flood the main conversation with raw logs. Desktop-thread workers are visible only when the workflow marks them as worth following separately.

For `visibility: "auto"`, resolve to `desktop-thread` when any of these are true:

- `budget.max_tokens` is greater than 50000;
- any planned worker has a non-empty `write_scope`;
- any phase id, phase label, worker id, or worker prompt mentions deploy, release, migrate, or publish;
- the user explicitly asks to inspect, continue, or hand off that worker separately.

Otherwise, resolve `auto` to `inline`.

## Cancel

Cancel means stop spawning new workers, let already-completed results remain usable, and summarize what is known. Do not pretend a cancelled workflow completed.

## Resume

Resume means continue from the last known phase, worker outputs, and stop conditions. If exact state is unavailable, Codex must say so and restart from the smallest safe checkpoint.

Local state is stored under `.cwf/runs/RUN_ID/`:

```text
.cwf/runs/RUN_ID/state.json
.cwf/runs/RUN_ID/preview.md
.cwf/runs/RUN_ID/final.md
```

The smallest safe resume checkpoint is the phase after the last fully completed phase boundary. If no phase completed cleanly, restart from Phase 1.

Use the state helper for local fixture proof:

```bash
node scripts/cwf-run-state.mjs init --run-id demo --workflow workflows/repo-audit.workflow.js
node scripts/cwf-run-state.mjs phase --run-id demo --phase scope --status completed --evidence "scope complete"
node scripts/cwf-run-state.mjs resume-plan --run-id demo
```

## Output

The final output always returns to the conversation that launched the workflow. It should include:

- what ran;
- what workers mattered;
- what changed, if anything;
- verification evidence;
- verifier or challenger conclusion, when relevant;
- remaining blockers or risks;
- the plain-language result.

## Non-Goals

CWF does not currently implement a standalone run database, hosted scheduler, external CLI runtime, or `/workflows` UI. Those can be future adapters after the native skill contract is stable.
