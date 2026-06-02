# Codex Flow Skill Plan

## Skill Name

`codex-workflows`

## Purpose

Teach Codex when and how to use the local `cwf` runner for repeatable Codex-native workflows.

## Current Skill Path

```text
skills/codex-workflows/SKILL.md
```

## Trigger Cases

Use this skill when the user asks to:

- run a workflow
- review a diff with multiple perspectives
- audit a branch or PR-like diff
- coordinate multiple Codex workers
- run a repeatable repo review
- compare Codex workflow behavior with Claude Dynamic Workflows

## Non-Trigger Cases

Do not use this skill for:

- small direct code fixes
- typo-only edits
- ordinary `npm test` / lint commands
- generic project management
- private model routing
- non-Codex collaborator delegation

## Default Workflow

```bash
cwf run workflows/diff-review.yaml --target <repo> --background
cwf status <run-id>
cwf result <run-id>
```

Foreground mode is acceptable for small diffs:

```bash
cwf run workflows/diff-review.yaml --target <repo>
```

## Agent Behavior

Before running:

- confirm the target is a git repo
- note whether the diff includes untracked files
- prefer background mode for large diffs

During running:

- use `cwf status <run-id>` instead of waiting blindly
- inspect `events.jsonl` when status looks stale
- cancel only when the user asks or when the run clearly cannot complete

After running:

- summarize final findings
- point to `result.md`
- mention worker failures or raw fallback if any
- verify the target diff hash did not change when read-only review was expected

## Completion Evidence

The skill should ask Codex to report:

- run id
- final status
- worker statuses
- result path
- whether fallback occurred
- whether the target diff changed

## Future Skill Expansions

Only after `diff-review` is stable:

- repo audit workflow
- migration plan workflow
- research cross-check workflow
- generated workflow spec suggestions

