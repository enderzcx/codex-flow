# Workflow JavaScript

`workflow.js` files are Codex-readable harness specs.

They are intentionally not executable Node programs. They describe how the Codex main session should coordinate native subagents.

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
3. Spawn native subagents.
4. Wait for results.
5. Dynamically spawn follow-up agents only when needed.
6. Verify and summarize in the current conversation.

## Visibility

`visibility` controls whether a worker should appear as its own Codex Desktop sidebar thread.

```js
{ id: "quick-check", type: "explorer", visibility: "inline" }
{ id: "implementation", type: "worker", visibility: "desktop-thread" }
{ id: "long-research", type: "explorer", visibility: "auto" }
```

Default to `inline`. Use `desktop-thread` only for workers that are long, writable, or likely to need user follow-up. Use `auto` when the main Codex session should decide at runtime.

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

## Quarantine

When a workflow reads untrusted external content, keep raw readers read-only and pass only sanitized summaries to privileged workers.

```js
quarantine_rules: [
  "Reader agents that see raw public content cannot write files.",
  "Write workers receive sanitized summaries and approved paths only.",
]
```

## Save As Skill

When a workflow proves useful, save it in a skill as a template. The Codex main session should adapt the template to the current task instead of treating it as a verbatim script.

## Why Keep JavaScript

The JS-harness pattern is intentional: CWF keeps the idea of a readable, shareable workflow spec, but removes the external runtime path until Codex exposes a stable workflow JS execution API.

For now, JavaScript is a portable, shareable, readable workflow template format.
