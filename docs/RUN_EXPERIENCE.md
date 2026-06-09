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
  -> run foreground workers, background workers, and selected Desktop-thread workers
  -> show compact status
  -> adapt, cancel, or resume when needed
  -> final synthesis returns to the originating conversation
```

## Runtime Modes

CWF has three user-facing runtime shapes:

- `foreground`: the main conversation waits because the workflow is short enough.
- `background`: the workflow writes `.cwf/runs/RUN_ID/` state and result files so the user or coordinator can poll/resume later.
- `background+heartbeat`: the workflow runs in the background, then CWF schedules a heartbeat follow-up for the originating Codex conversation. It is delivered only after the coordinator observes the expected marker reply in that conversation.

The main conversation does not need to stay blocked for long runs. It should return the run id, what is running, how to check status, and whether heartbeat return is scheduled. A scheduled heartbeat is not completion evidence by itself.

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

SDK/background workers are not guaranteed to appear in the Codex Desktop left sidebar. When sidebar visibility matters, use the `desktop-thread` worker path and record the Desktop thread id in the run evidence.

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
.cwf/runs/RUN_ID/run-plan.md
.cwf/runs/RUN_ID/return-envelope.json
.cwf/runs/RUN_ID/final.md
.cwf/runs/RUN_ID/worker-packets/*.md
.cwf/runs/RUN_ID/worker-results/*.json
```

Initialize the full controller artifact set with:

```bash
node scripts/cwf-start.mjs workflows/repo-audit.workflow.js --objective "audit this repo" --run-id demo
```

The smallest safe resume checkpoint is the phase after the last fully completed phase boundary. If no phase completed cleanly, restart from Phase 1.

Use the state helper for local fixture proof:

```bash
node scripts/cwf-run-state.mjs init --run-id demo --workflow workflows/repo-audit.workflow.js
node scripts/cwf-run-state.mjs phase --run-id demo --phase scope --status completed --evidence "scope complete"
node scripts/cwf-run-state.mjs status --run-id demo
node scripts/cwf-run-state.mjs resume-plan --run-id demo
```

The return envelope records `final_destination`, `return_mode`, `final_summary_path`, `evidence_path`, `verifier_status`, deferred items, and completion status. `return_mode=coordinator_synthesis` is the proven default. Platform automatic callback remains deferred until a real platform smoke proves it.

For async runs, also record `runtime_mode`, adapter status, `sdk_thread_ids`, and `desktop_thread_ids` when known. `return_mode=heartbeat_synthesis` means the background run completed, a follow-up in the originating conversation read the local result, and the coordinator observed the expected marker reply before recording delivery. It is not the same as platform automatic callback.

Heartbeat state must stay honest:

- `heartbeat-fixture`: local artifact proof only.
- `heartbeat-scheduled`: automation is scheduled, no delivery observed yet.
- `heartbeat-scheduled-not-returned`: scheduling window passed without the marker in the originating thread.
- `heartbeat-unavailable`: host heartbeat is unavailable.
- `heartbeat_synthesis`: real marker observed in the originating thread.

Adapter helpers record evidence without overstating platform support:

- `cwf-native-subagent.mjs`: host-native result or `native-subagent-unavailable`.
- `cwf-worker-sdk.mjs`: SDK fixture result or real read-only fixed-marker SDK result through `@openai/codex-sdk`.
- `cwf-worker-desktop-thread.mjs`: failure fixture, pending approval, or approved visible-thread smoke.
- `cwf-return-heartbeat.mjs`: heartbeat fixture, scheduled, scheduled-not-returned, real-smoke, or unavailable state. It must not record `heartbeat_synthesis` until a marker was actually observed in the originating thread.

## Output

The final output always returns to the conversation that launched the workflow. It should include:

- a plain-language conclusion first;
- what ran;
- what workers mattered;
- what changed, if anything;
- verification evidence;
- verifier or challenger conclusion, when relevant;
- remaining blockers or risks;
- the plain-language result.

## Non-Goals

CWF does not currently implement a standalone run database, hosted scheduler, unrestricted external CLI runtime, or `/workflows` UI. Those can be future adapters after the native skill contract is stable. The bounded async adapter is allowed only as a thin Codex-native execution and return layer.
