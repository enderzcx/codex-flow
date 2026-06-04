# Codex Flow Skill Plan

## Skill Name

`codex-workflows`

## Purpose

Teach Codex when and how to use the local `cwf` runner for repeatable Codex-native workflows.

The skill is the main path for returning workflow results to the current Codex conversation: run `cwf`, read the result artifact, and summarize it in the active thread.

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
- run a gated documentation refresh
- generate GitHub PR-ready artifacts from a completed run
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
cwf workflows show repo-audit
cwf workflows show doc-refresh
cwf workflows validate
cwf run diff-review --target <repo> --background
cwf run repo-audit --target <repo> --background
cwf run implementation-plan --target <repo> --background
cwf run research-crosscheck --target <repo> --background
cwf run release-review --target <repo> --background
cwf run doc-refresh --target <repo>
cwf status <run-id>
cwf latest --target <repo>
cwf show <run-id>
cwf desktop check
cwf desktop result <run-id> --print
cwf github-pr <run-id> --format comment
cwf github-pr <run-id> --format review
cwf suggest-workflow --goal "<task>" --target <repo>
cwf suggest-workflow --from-run <run-id>
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
- choose from `docs/workflow-catalog.md` when the user asks for audit, planning, research, or release review
- choose `doc-refresh` only for documentation-only writes after the user accepts a gate
- prefer background mode for large diffs

During running:

- use `cwf status <run-id>` instead of waiting blindly
- read the `Now:` line first; it is the plain-language summary of current work
- if status is `waiting`, use the printed approve/reject commands; do not edit `state.json`
- for `doc-refresh`, inspect `artifacts/write-plan.md`, `artifacts/dry-run-preview.md`, and `artifacts/rollback.md` before approving
- after approval, use `cwf resume <run-id>` so completed phases are skipped
- check fallback count before trusting structured findings blindly
- inspect `artifacts/reduced-result.json` for machine-readable verdict, worker provenance, verification gaps, and degraded status
- inspect `artifacts/manifest.json` when you need to reconstruct the run evidence
- inspect `events.jsonl` when status looks stale
- use `cwf github-pr <run-id> --format comment|review` when a PR-ready artifact is needed
- use `cwf github-pr <run-id> --post --repo <owner/repo> --pr <number>` only when the user explicitly asks to post
- use `cwf suggest-workflow --goal "<task>" --target <repo>` when the user wants a draft workflow spec
- after a suggestion, report the saved path and validation diagnostics; do not run or install it unless the user explicitly asks
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
- when the user wants the result returned to Codex, use `cwf desktop result <run-id> --print` or read `artifacts/handoff-prompt.md`; use `--new-thread` or `--thread <thread-id>` only when Desktop/app-server return is explicitly requested
- mention worker failures or raw fallback if any
- mention worker runtime adapter/fallback metadata when native worker mode was requested
- mention failure summary and next step for failed runs
- mention gate decisions for waiting/approved/rejected runs
- for write-capable runs, mention write plan, dry-run preview, diff summary, rollback, verification, and changed files
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
- worker runtime adapter, requested adapter, fallback status, and transcript-read status when native worker mode was requested
- failure policy and summary when status is `failed`
- gate id, gate status, and decision reason when relevant
- write artifact paths and rollback note when `capabilities.writes` is true
- whether the target diff changed
- short human summary of what the run did, not only raw artifact paths
- package/version when release readiness matters
- release smoke status when release readiness matters: `npm run check`, `npm pack --dry-run`, and `bash scripts/smoke-cli.sh`
- desktop handoff path and app-server fallback status when result return matters
- GitHub PR artifact paths and whether anything was posted when PR output matters
- workflow suggestion path, validation result, and explicit run command when suggestion output matters

## Future Skill Expansions

Only after v1.0 release readiness is stable:

- live worker agent thread integration when app-server/subagent execution is exposed
- migration plan workflow
- richer generated workflow spec suggestions

See [POST_V1_PLAN.md](POST_V1_PLAN.md) for post-v1 PRDs, specs, acceptance criteria, and goal prompts.
