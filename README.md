# Codex Flow

A lightweight, Codex-native workflow runner for multi-agent code review.

中文文档: [README.zh-CN.md](README.zh-CN.md)

Codex Flow lets you run multi-worker workflows using only the OpenAI Codex SDK and CLI: no external LLM routers, no private adapters, no heavy orchestration framework. The MVP ships one workflow, `diff-review`, which starts three Codex workers in parallel and aggregates their findings into structured JSON and a readable Markdown report.

It is designed for engineers who already use Codex and want repeatable, inspectable review runs. A workflow writes state, events, worker outputs, logs, and final results to disk, so a run can be polled, audited, cancelled, and revisited later.

This is an early public release. It is intentionally narrow: one workflow, CLI-first, filesystem-backed state, readable status, and read-only review by default.

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

Validate the workflow before starting workers:

```bash
cwf validate workflows/diff-review.yaml
```

Run in the foreground:

```bash
cwf run workflows/diff-review.yaml --target <repo>
```

Run in the background:

```bash
cwf run workflows/diff-review.yaml --target <repo> --background
cwf status <run-id>
cwf watch <run-id>
cwf result <run-id>
cwf cancel <run-id>
```

`cwf status` is meant to be readable during a real run. It tells you what is happening now, how many workers completed, whether raw fallback happened, and where to find the state, events, worker JSON, result, and log files.

`cwf watch <run-id>` refreshes the same status view until the run reaches `completed`, `failed`, or `cancelled`. Use `--interval <ms>` to tune the refresh rate, or `--once` for one non-clearing snapshot.

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
cwf watch run_...
cwf result run_...
```

Example status:

```text
Run ID: run_...
Workflow: diff-review
Status: completed
Now: done; open the result report
Target: /path/to/repo
Workers: 3/3 completed, 0 fallback
Phases:
- collect: completed (1s)
- review: completed (14s)
- reduce: completed (0s)
Workers:
- correctness: completed (12s), findings=1
- tests: completed (14s), findings=0
- safety: completed (11s), findings=0
Artifacts:
- State: ~/.codex-workflows/runs/run_.../state.json
- Events: ~/.codex-workflows/runs/run_.../events.jsonl
- Workers: ~/.codex-workflows/runs/run_.../workers/*.json
- Result: ~/.codex-workflows/runs/run_.../result.md
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
- Codex Desktop app-server handoff is planned, but not part of the stable CLI core yet.

## Verification

```bash
npm run check
npm pack --dry-run
```

The MVP has been smoke-tested on:

- a fixture diff
- a real larger repo diff
- foreground and background runs
- cancellation
- mocked Codex SDK worker failure
- workflow validation and human-readable status formatting

## Docs

- [PRD](docs/PRD.md)
- [Spec](docs/SPEC.md)
- [Full plan](docs/FULL_PLAN.md)
- [Skill plan](docs/SKILL_PLAN.md)
- [Claude comparison](docs/claude-vs-codex-workflows.md)
