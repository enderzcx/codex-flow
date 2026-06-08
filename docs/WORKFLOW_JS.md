# Workflow JavaScript

`workflow.js` files are Codex-readable harness specs.

They are intentionally not executable Node programs. They describe how the Codex main session should coordinate native subagents.

For non-trivial work, the main session should adapt the template into a bounded run plan before workers start. The run plan is task-specific; the template is reusable.

## Shape

```js
export default {
  name: "repo-audit",
  goal: "Audit this repo from multiple perspectives.",
  pattern: "fan-out-and-synthesize",
  budget: {
    max_tokens: 10000,
    stop_when: "All audit agents returned or a blocker is explicit.",
  },
  phases: [
    {
      id: "fanout",
      agents: [
        { id: "correctness", type: "explorer", visibility: "inline", prompt: "Find bugs." },
        { id: "tests", type: "explorer", visibility: "inline", prompt: "Find test gaps." },
      ],
    },
    {
      id: "synthesize",
      coordinator: "Wait for agents and merge findings.",
    },
  ],
};
```

## Interpreter

The interpreter is the current Codex session:

1. Read the workflow.
2. Adapt it to the user's goal.
3. Scope the task and draft a bounded run plan.
4. Spawn native subagents.
5. Wait for results.
6. Dynamically spawn follow-up agents only when needed.
7. Verify with a separate challenger when risk justifies it.
8. Summarize in the current conversation.

The helper scripts parse workflow specs as plain data. They reject executable tokens and do not provide a general Node runtime for workflow files.

```bash
node scripts/cwf-run-preview.mjs workflows/repo-audit.workflow.js
node scripts/cwf-run-preview.mjs workflows/repo-audit.workflow.js --format json
```

## Visibility

`visibility` controls whether a worker should appear as its own Codex Desktop sidebar thread.

```js
{ id: "quick-check", type: "explorer", visibility: "inline" }
{ id: "implementation", type: "worker", visibility: "desktop-thread" }
{ id: "long-research", type: "explorer", visibility: "auto" }
```

Default to `inline`. Use `desktop-thread` only for workers that are long, writable, or likely to need user follow-up. Use `auto` when the main Codex session should decide at runtime.

`auto` is deterministic:

- route to `desktop-thread` when `budget.max_tokens > 50000`;
- route to `desktop-thread` when any worker has a non-empty `write_scope`;
- route to `desktop-thread` when phase ids, labels, worker ids, or prompts mention deploy, release, migrate, or publish;
- route to `desktop-thread` when the user explicitly asks to inspect, continue, or hand off that worker separately;
- otherwise route to `inline`.

The launched workflow always closes out in the originating conversation, even when some workers have visible Desktop threads.

## Budget

Saved workflow templates should include a visible budget:

```js
budget: {
  max_tokens: 10000,
  stop_when: "Verification passes or a concrete blocker is reached",
}
```

This keeps dynamic workflows from quietly becoming open-ended token sinks.

## Run Plan

A generated run plan should include:

- objective and scope;
- chosen pattern;
- phases and workers;
- verifier/challenger role;
- write scopes;
- quarantine path;
- budget and stop rule;
- verification evidence;
- resume checkpoint.

When persisted, use `.cwf/runs/RUN_ID/run-plan.md`. Do not treat it as executable code.

## Quarantine

When a workflow reads untrusted external content, keep raw readers read-only and pass only sanitized summaries to privileged workers.

```js
quarantine_rules: [
  "Reader agents that see raw public content cannot write files.",
  "Write workers receive sanitized summaries and approved paths only.",
]
```

Verification should record whether raw untrusted text reached any privileged actor. If it did, stop before write/deploy/payment/database/credential/permission/external actions.

## Local Run State

The native runner adapter uses local state only:

```text
.cwf/runs/RUN_ID/state.json
.cwf/runs/RUN_ID/preview.md
.cwf/runs/RUN_ID/final.md
```

`.cwf/` is ignored and must not be packaged. State is enough for compact status, cancel summaries, and resume checkpoint selection; it is not a product database.

## Save As Skill

When a workflow proves useful, save it in a skill as a template. The Codex main session should adapt the template to the current task instead of treating it as a verbatim script.

## Why Keep JavaScript

The JS-harness pattern is intentional: CWF keeps the idea of a readable, shareable workflow spec, but removes the external runtime path until Codex exposes a stable workflow JS execution API.

For now, JavaScript is a portable, shareable, readable workflow template format.
