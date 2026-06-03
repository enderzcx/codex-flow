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
cwf validate workflows/diff-review.yaml
cwf workflows list
cwf workflows show diff-review
cwf workflows validate
cwf run diff-review --target <repo> --background
cwf status <run-id>
cwf latest --target <repo>
cwf show <run-id>
cwf approve <run-id> <gate-id>
cwf reject <run-id> <gate-id> --reason <text>
cwf resume <run-id>
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
- run `cwf workflows validate` or `cwf validate <workflow-id-or-path>` before starting workers
- prefer workflow ids like `diff-review` when the registry can resolve them
- prefer background mode for large diffs

During running:

- use `cwf status <run-id>` instead of waiting blindly
- read the `Now:` line first; it is the plain-language summary of current work
- if status is `waiting`, use the printed approve/reject commands; do not edit `state.json`
- after approval, use `cwf resume <run-id>` so completed phases are skipped
- check fallback count before trusting structured findings blindly
- inspect `artifacts/reduced-result.json` for machine-readable verdict, worker provenance, verification gaps, and degraded status
- inspect `artifacts/manifest.json` when you need to reconstruct the run evidence
- inspect `events.jsonl` when status looks stale
- cancel only when the user asks or when the run clearly cannot complete

When the run id is unknown:

- use `cwf latest --target <repo>` for the most recent run on a repo
- use `cwf list --limit <n>` for recent runs
- use `cwf list --status failed` to find failed runs
- trust discovery to rebuild `~/.codex-workflows/index.json` from run folders when needed

When the workflow is unknown:

- use `cwf workflows list`
- inspect metadata with `cwf workflows show <workflow-id-or-path>`
- treat duplicate workflow id errors as blocking until one duplicate spec is removed or renamed

After running:

- summarize final findings
- point to `result.md`
- mention worker failures or raw fallback if any
- mention failure summary and next step for failed runs
- mention gate decisions for waiting/approved/rejected runs
- verify the target diff hash did not change when read-only review was expected

## Completion Evidence

The skill should ask Codex to report:

- run id
- final status
- worker statuses
- result path
- artifact manifest path
- whether fallback occurred
- whether the reducer verdict is degraded
- worker provenance when findings or failures matter
- failure policy and summary when status is `failed`
- gate id, gate status, and decision reason when relevant
- whether the target diff changed
- short human summary of what the run did, not only raw artifact paths

## Future Skill Expansions

Only after `diff-review` is stable:

- repo audit workflow
- migration plan workflow
- research cross-check workflow
- generated workflow spec suggestions
