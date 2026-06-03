---
half_life: 30d
archive_at: 2026-07-03
---

# Codex Native Capability Audit

Date: 2026-06-03
Local Codex CLI checked: `codex-cli 0.133.0`

Plain Chinese summary:

- Codex Flow should not build its own hidden agent platform.
- Codex already has App Server threads, turns, approvals, sandboxing, skills, plugins, and subagents.
- For Desktop users, workflow work should appear as Codex threads in the left sidebar.
- Results should come back to the Codex conversation through a known thread id or through the Codex skill wrapper.
- Write-capable workflows should run through Codex's own sandbox, approval, and worktree/thread model, not through a custom file editor.

## What Exists Now

| Need | Codex-native capability | Evidence checked | Codex Flow decision |
|---|---|---|---|
| Visible left-sidebar work | App Server `thread/start`, `thread/list`, `thread/read`, `thread/name/set`, `turn/start`, `turn/steer`; generated schema includes `thread/started` and `thread/status/changed` notifications | Official manual plus local `codex app-server generate-ts --experimental`; read-only `thread/list` smoke passed | Build an app-server adapter instead of inventing a sidebar/task UI |
| Result back into Codex | App Server can start/steer turns and inject items into a known thread with `thread/inject_items`; Codex skill calls can also read `cwf result` and answer in the current conversation | Generated schema includes `thread/inject_items`; current session can return CLI output through normal Codex response | Support both: structured CLI result for skill return, and explicit app-server post to a known thread id |
| Parallel subagents | Codex subagents are enabled by default, surfaced in Codex app and CLI, and inherit sandbox/approval controls | Official Subagents manual; current tool surface exposes `spawn_agent`, `wait_agent`, `send_input`, `close_agent` | Prefer Codex subagents/threads for future worker execution instead of only SDK headless workers |
| Code/file edits | Codex App, CLI, SDK, and app-server support workspace-write/full-access sandbox modes, approval policy, permissions profiles, worktrees, file-change events, and diff updates | Official approvals/sandbox/app-server schema; schema includes file-change notifications and sandbox/permissions params | Write-capable workflows must run as Codex threads/worktrees with approvals, not as raw `fs.writeFile` workflow steps |
| Workflow source | Codex skills are repo/user/admin/system scoped; plugins distribute skills and integrations | Official Skills/Plugins manual | Keep built-in YAML workflows, support user workflows, and later package Codex Flow as a Codex skill/plugin |
| Safety boundary | Codex sandbox, permissions profiles, approval policy, auto-review, protected paths, network policy, and subagent inheritance | Official security and permissions docs | Reuse Codex safety controls; Codex Flow adds spec validation/gates but does not replace the sandbox |
| Git review | App Server exposes `review/start` with `delivery: "inline"` or `"detached"` and returns `reviewThreadId` | Generated local schema | Use detached native review threads where a workflow is really just Codex review |

## Current Codex Flow Gap

Codex Flow v1.0 uses `@openai/codex-sdk` to start read-only SDK threads for workers. That is valid for a stable CLI engine, but it has three limits:

- worker activity is not guaranteed to appear as left-sidebar Codex App threads;
- result return is file/CLI based, not current-conversation based;
- write workflows are intentionally blocked and cannot yet reuse Codex worktree/thread safety.

So the next integration should be additive:

1. Keep the v1.0 CLI run store as the durable evidence trail.
2. Add a Codex App Server adapter for Desktop-visible threads.
3. Add a Codex skill wrapper that runs `cwf`, reads the result, and returns the human summary in the current Codex conversation.
4. Add write-capable workflows only through Codex thread/worktree execution with explicit gates.

## Required Architecture Direction

### Desktop Thread Mode

When a user asks for Desktop integration, `cwf` should:

1. probe `codex app-server` compatibility;
2. create a visible supervisor thread with `thread/start`;
3. set a readable name, for example `Codex Flow: diff-review <run-id>`;
4. start a turn that contains the run result, artifact paths, and next action;
5. record `thread_id`, `turn_id`, app-server version, and fallback status in the run folder.

Per-worker live sidebar threads are desirable, but they should use Codex-native subagent/thread behavior. Do not fake them with custom process logs.

### Current Conversation Return

There are two valid return paths:

- Skill path: Codex invokes the `codex-flow` skill, the skill runs `cwf`, reads `result.md` or `result --json`, and the parent Codex session summarizes the result directly to the user.
- Thread path: a caller passes an explicit thread id, and `cwf` posts or steers the result into that known Codex thread through App Server.

Do not guess the "current" thread from `thread/list` unless the host passes a thread id or a future stable current-thread API exists.

### Write-Capable Workflow Path

Write workflows must follow the subagent safety shape:

- workflow spec declares `capabilities.writes: true`;
- a gate appears before any write phase;
- write phase runs in a Codex thread or worktree with `workspace-write` or a named permissions profile;
- approval policy comes from Codex, not a custom bypass;
- final artifact includes diff summary, changed files, tests run, and rollback note;
- no credentials, production deploy, database mutation, or irreversible external write in the public default pack.

### Workflow Sources

Supported sources should stay simple:

- built-in workflow pack shipped with Codex Flow;
- repo workflows under `.codex-flow/workflows` or `workflows`;
- user workflows under `~/.codex-flow/workflows`;
- later Codex skill/plugin distribution for installable packs.

User-created workflows must be YAML/JSON specs that pass validation before execution. Generated JavaScript remains out of scope.

## Non-Goals

- Do not create a separate Desktop UI.
- Do not clone the Codex subagent scheduler.
- Do not bypass Codex approvals or sandboxing.
- Do not silently post into arbitrary Codex threads.
- Do not make CLI-only usage depend on Codex Desktop.

## Verification Needed For v1.2

- `codex app-server generate-ts --experimental` works in CI or documented local smoke.
- A read-only app-server `thread/list` smoke passes.
- A controlled `thread/start` smoke creates a named thread and records its id.
- A `turn/start` smoke posts a result summary and reaches `turn/completed`.
- `cwf desktop result <run-id>` records thread/turn metadata.
- If app-server is unavailable, `cwf` keeps the local result and reports a clear fallback.
- Existing `cwf run/status/watch/result` continues to pass without Desktop.
