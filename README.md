# Codex Flow

A lightweight, Codex-native workflow runner for multi-agent code review.

Codex Flow lets you run multi-worker workflows using only the OpenAI Codex SDK and CLI: no external LLM routers, no private adapters, no heavy orchestration framework. The MVP ships one workflow, `diff-review`, which starts three Codex workers in parallel and aggregates their findings into structured JSON and a readable Markdown report.

It is designed for engineers who already use Codex and want repeatable, inspectable review runs. A workflow writes state, events, worker outputs, logs, and final results to disk, so a run can be polled, audited, cancelled, and revisited later.

This is an MVP. It is intentionally narrow: one workflow, CLI-first, filesystem-backed state, read-only review by default.

## What It Does

`diff-review` reviews the current tracked git diff from three independent perspectives:

- `correctness`: behavior regressions, broken assumptions, edge cases
- `tests`: missing tests, weak assertions, verification gaps
- `safety`: security, permissions, data loss, rollback risk

The reducer merges duplicate findings, drops weak unsupported claims, ranks severity, and writes a final report.

## Install

```bash
npm install
npm run build
npm link
```

The linked CLI is:

```bash
cwf --help
```

## Usage

Run in the foreground:

```bash
cwf run workflows/diff-review.yaml --target <repo>
```

Run in the background:

```bash
cwf run workflows/diff-review.yaml --target <repo> --background
cwf status <run-id>
cwf result <run-id>
cwf cancel <run-id>
```

Run artifacts are stored under:

```text
~/.codex-workflows/runs/<run-id>/
  workflow.json
  state.json
  events.jsonl
  run.log
  workers/
    correctness.json
    tests.json
    safety.json
  result.md
```

## Example

```bash
cwf run workflows/diff-review.yaml --target fixtures/diff-review --background
cwf status run_...
cwf result run_...
```

Example status:

```text
Run ID: run_...
Workflow: diff-review
Status: completed
Phases:
- collect: completed
- review: completed
- reduce: completed
Workers:
- correctness: completed
- tests: completed
- safety: completed
```

## How It Differs From Claude Dynamic Workflows

Codex Flow borrows the useful operating principle: move orchestration out of a single chat context and into a small runner that owns phases, worker fan-out, state, and reduction.

It does not attempt exact product parity with Claude Code Dynamic Workflows:

- no native `/workflows` UI
- no automatic `workflow` keyword trigger
- no generated JavaScript workflow scripts
- no non-Codex model routing
- no web UI

See [docs/claude-vs-codex-workflows.md](docs/claude-vs-codex-workflows.md).

## Current Limitations

- Only one workflow: `diff-review`.
- Reviews tracked git diffs; untracked file contents are not included.
- Background mode is process-based, not a daemon or queue.
- Cancellation sends `SIGTERM` to the background process, then marks pending work cancelled.
- Successful runs usually have an empty `run.log`; progress lives in `events.jsonl`.

## Verification

```bash
npm run check
npm pack --dry-run
```

The MVP has been smoke-tested on:

- a fixture diff
- a real large Reasonix diff
- foreground and background runs
- cancellation
- mocked Codex SDK worker failure

## Docs

- [PRD](docs/PRD.md)
- [Spec](docs/SPEC.md)
- [Skill plan](docs/SKILL_PLAN.md)
- [Claude comparison](docs/claude-vs-codex-workflows.md)

