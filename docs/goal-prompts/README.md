---
half_life: permanent
archive_at: never
---

# Goal Prompts

This folder stores copy-ready Codex goal-mode prompts by phase.

Root `GOAL_PROMPT.md` is only the current entrypoint. It should point to the
active or next phase and may include the full current prompt for convenience.
Completed or superseded prompts belong here so a future agent does not mistake an
old phase for the next implementation target.

Naming format:

```text
<phase>-<short-slug>.md
```

Examples:

- `v0.3-run-discovery.md`
- `v1.7-worker-app-threads.md`
- `v1.8-managed-agents-decision.md`

Update rule:

1. When a phase becomes current, add or update its file here.
2. Mirror the active prompt in root `GOAL_PROMPT.md`.
3. When the phase is completed, leave its prompt here as history.
4. Move root `GOAL_PROMPT.md` to the next active goal.
