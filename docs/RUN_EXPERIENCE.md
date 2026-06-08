# Run Experience

CWF should feel like a native dynamic workflow, not a noisy collection of chat threads.

The main Codex conversation remains the control room. It previews the workflow, runs the useful workers, reports compact status, and returns the final result in the same conversation.

## Lifecycle

```text
request
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
- phases;
- planned agents;
- worker visibility: `inline`, `desktop-thread`, or `auto`;
- write scopes;
- token budget;
- quarantine rules;
- stop conditions.

Preview is skipped only for small, obvious workflows where the user explicitly asked to run immediately.

## Status

Status should be compact and human-readable:

- running phase;
- workers started / completed / blocked;
- elapsed time;
- budget used or rough budget pressure;
- current blocker, if any.

Inline workers should not flood the main conversation with raw logs. Desktop-thread workers are visible only when the workflow marks them as worth following separately.

## Cancel

Cancel means stop spawning new workers, let already-completed results remain usable, and summarize what is known. Do not pretend a cancelled workflow completed.

## Resume

Resume means continue from the last known phase, worker outputs, and stop conditions. If exact state is unavailable, Codex must say so and restart from the smallest safe checkpoint.

## Output

The final output always returns to the conversation that launched the workflow. It should include:

- what ran;
- what workers mattered;
- what changed, if anything;
- verification evidence;
- remaining blockers or risks;
- the plain-language result.

## Non-Goals

CWF does not currently implement a standalone run database, hosted scheduler, external CLI runtime, or `/workflows` UI. Those can be future adapters after the native skill contract is stable.
