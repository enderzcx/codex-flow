---
half_life: 7d
archive_at: 2026-06-09
---

# Claude Dynamic Workflows vs codex-workflows

## Verdict

`codex-workflows` can reproduce the most useful outcome of Claude Dynamic Workflows for supported workflows: phased multi-agent work, parallel checks, externalized state, result reduction, and repeatable runs.

It will not initially reproduce the whole Claude product experience: no native `/workflows` panel, no automatic `workflow` keyword trigger, no `ultracode`, and no built-in Claude-authored JavaScript workflow runtime.

So the right framing is:

> Same workflow principle, similar useful effect for supported workflows, different runtime and safety model.

## Finished Effect

What can be similar:

- A user runs one command for a complex task.
- The workflow splits the task into phases.
- Several Codex workers inspect different angles in parallel.
- Intermediate findings are stored outside the main Codex conversation.
- A reducer merges worker outputs into one answer.
- The final output contains findings, evidence, risks, and next actions.
- The run can be inspected later through saved logs.

What will be different in the public Codex Flow engine:

- Progress is shown through `cwf status <run-id>` or `cwf watch <run-id>`, not a native Codex background task pane.
- Runs are explicit commands or skill-triggered tool calls, not silent keyword triggers.
- Workflows are saved as constrained specs, not arbitrary generated JavaScript.
- Resume, gates, and failure policies are public engine features, not Desktop UI features.
- No third-party model routing.
- No automatic file edits unless the workflow explicitly opts in and passes gate validation.

## Component Comparison

| Layer | Claude Dynamic Workflows | Codex Flow public engine |
|---|---|---|
| Trigger | `workflow` keyword, saved commands, `/deep-research`, `ultracode` | explicit `cwf run <workflow>` or Codex skill call |
| Runtime | Claude Code native workflow runtime | external Node/TS runner |
| Worker | Claude subagents | Codex SDK threads |
| State | workflow script variables and runtime tracking | run folder with `state.json`, `events.jsonl`, worker outputs |
| Script/spec | Claude-written JavaScript script | constrained YAML/JSON spec first |
| Monitoring | `/workflows` UI and task panel | `cwf status`, `cwf watch`, log files |
| Output | final report in session | final report printed and saved |
| Permissions | Claude tool allowlist + workflow behavior | Codex sandbox/approval settings per worker |
| Reuse | saved workflow command under `.claude/workflows` or `~/.claude/workflows` | saved workflow specs under project/global workflow folders |

## Principle

The principle is the same:

1. Keep the main agent as the supervisor, not the place where all intermediate detail accumulates.
2. Move loop/branch/phase control into a runtime.
3. Give each worker a smaller, independent context.
4. Persist intermediate results outside the chat.
5. Use a reducer to merge results, reject weak claims, and produce a final answer.

The difference is where the runtime lives.

Claude's runtime is built into Claude Code. `codex-workflows` runtime would live as a public CLI/SDK layer that calls Codex SDK.

## Product Implication

Codex Flow should optimize for reliability and clarity before spectacle.

Do:

- Build explicit reusable workflows.
- Preserve evidence.
- Keep default workers read-only.
- Show phase status and saved outputs.
- Make reducer output structured and reviewable.
- Define failure, fallback, gate, and resume behavior before expanding workflow families.

Do not:

- Imitate Claude's keyword trigger before the engine is reliable.
- Let generated scripts run arbitrary logic in the public core.
- Add private model adapters to the public version.
- Claim exact parity with Claude Dynamic Workflows.

## Planned Codex App Thread Integration

Codex already has app-server thread lifecycle methods, turn events, review threads, skills, plugins, approvals, sandboxing, and subagent metadata. That is the substrate Codex Flow should reuse.

For `codex-workflows`, this should be a guarded integration on top of the stable CLI core:

- stable core: `cwf run`, `cwf status`, `cwf watch`, `cwf result`
- future Desktop mode: create named visible Codex threads from a workflow result
- current conversation return: use a Codex skill wrapper or an explicit app-server thread id
- write-capable workflows: reuse Codex worktrees, sandbox, approvals, permissions profiles, and subagents
- fallback: generate a local prompt/session handoff when app-server is unavailable
