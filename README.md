# Codex Flow

A lightweight, Codex-native workflow runner for multi-agent code review.

中文文档: [README.zh-CN.md](README.zh-CN.md)

Codex Flow lets you run multi-worker workflows using only the OpenAI Codex SDK and CLI: no external LLM routers, no private adapters, no heavy orchestration framework. The public pack ships read-only workflows that start Codex workers in parallel and aggregate their findings into a stable reduced JSON envelope plus a readable Markdown report.

It is designed for engineers who already use Codex and want repeatable, inspectable review runs. A workflow writes state, events, gate decisions, worker outputs, logs, and final results to disk, so a run can be polled, audited, cancelled, approved, rejected, resumed, and revisited later.

This is an early public release. It is intentionally narrow: CLI-first, filesystem-backed state, readable status, local workflow discovery, and read-only review by default.

## What It Does

The default catalog includes:

- `diff-review`: correctness, tests, and safety review for a tracked git diff
- `repo-audit`: maintainability, project hygiene, and release-risk audit
- `implementation-plan`: scope, sequencing, and verification review for plan or implementation diffs
- `research-crosscheck`: source fidelity and unsupported-claim review for research or documentation diffs
- `release-review`: ship readiness, rollout, rollback, and regression review

The reducer merges duplicate findings, drops weak unsupported claims, ranks severity, preserves worker provenance, and writes a final report. If a worker fails or falls back from malformed structured output, the final verdict can be `DEGRADED` and the report says which evidence is partial.

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
cwf workflows validate
```

Discover and inspect workflows:

```bash
cwf workflows list
cwf workflows show diff-review
cwf workflows show repo-audit
```

Run by workflow id or path:

```bash
cwf run diff-review --target <repo>
cwf run repo-audit --target <repo>
cwf run implementation-plan --target <repo>
cwf run research-crosscheck --target <repo>
cwf run release-review --target <repo>
cwf run workflows/diff-review.yaml --target <repo>
```

Run in the background:

```bash
cwf run workflows/diff-review.yaml --target <repo> --background
cwf status <run-id>
cwf watch <run-id>
cwf latest --target <repo>
cwf list --target <repo>
cwf show <run-id>
cwf approve <run-id> <gate-id>
cwf reject <run-id> <gate-id> --reason <text>
cwf resume <run-id>
cwf result <run-id>
cwf cancel <run-id>
```

Workflow discovery searches these local paths in order:

```text
./.codex-flow/workflows/
./workflows/
~/.codex-flow/workflows/
```

Duplicate workflow ids fail clearly instead of picking one silently.

`cwf status` is meant to be readable during a real run. It tells you what is happening now, how many workers completed, whether raw fallback happened, and where to find the state, events, worker JSON, reduced JSON, manifest, result, and log files.

`cwf watch <run-id>` refreshes the same status view until the run reaches `completed`, `failed`, or `cancelled`. Use `--interval <ms>` to tune the refresh rate, or `--once` for one non-clearing snapshot.

`cwf list`, `cwf latest`, and `cwf show` help you find and inspect older runs without remembering run ids. Discovery uses `~/.codex-workflows/index.json`, but run folders remain the source of truth. If the index is missing, stale, or corrupt, Codex Flow rebuilds it from `~/.codex-workflows/runs/*/state.json`.

Gated workflows can pause before a risky or write-capable phase. `cwf status` and `cwf show` explain the waiting gate and print the exact approve/reject commands. `cwf approve <run-id> <gate-id>` records the approval, and `cwf resume <run-id>` continues only pending phases. `cwf reject <run-id> <gate-id> --reason <text>` stops the run cleanly. This is a safety primitive only; the public package ships read-only workflows and no production write-capable workflow.

Run artifacts are stored under:

```text
~/.codex-workflows/index.json
~/.codex-workflows/runs/<run-id>/
  workflow.json
  state.json
  events.jsonl
  context.json
  run.log
  workers/
    correctness.json
    tests.json
    safety.json
  artifacts/
    reduced-result.json
    manifest.json
  result.md
```

Each worker JSON uses the same envelope: status, confidence, summary, findings, verification checks, referenced artifacts, retry count, raw fallback flag, timing, prompt, raw output, and optional usage/error. `artifacts/reduced-result.json` stores the reducer envelope: verdict, summary, findings, verification gaps, next actions, worker provenance, and artifact references. `artifacts/manifest.json` lists the run evidence needed to reconstruct what happened, including `run.log` for background runs.

## Examples

```bash
cwf run workflows/diff-review.yaml --target fixtures/diff-review --background
cwf watch run_...
cwf result run_...
```

See [Workflow catalog](docs/workflow-catalog.md) for when to use and when not to use each bundled workflow.

Example status:

```text
Run ID: run_...
Workflow: diff-review
Status: completed
Now: done; open the result report
Target: /path/to/repo
Failure policy: worker failures are tolerated when at least one Codex worker succeeds; all-worker failure, target diff changes, and unhandled errors fail the run.
Workers: 3/3 completed, 0 fallback
Phases:
- collect: completed (1s)
- review: completed (14s)
- reduce: completed (0s)
Workers:
- correctness: completed (12s), findings=1, artifacts=0
- tests: completed (14s), findings=0, artifacts=0
- safety: completed (11s), findings=0, artifacts=0
Artifacts:
- State: ~/.codex-workflows/runs/run_.../state.json
- Events: ~/.codex-workflows/runs/run_.../events.jsonl
- Workers: ~/.codex-workflows/runs/run_.../workers/*.json
- Result: ~/.codex-workflows/runs/run_.../result.md
- Manifest: ~/.codex-workflows/runs/run_.../artifacts/manifest.json
```

Example discovery:

```bash
cwf list --limit 5
cwf list --status failed
cwf latest --target fixtures/diff-review
cwf show run_...
```

Failed runs include a readable failure summary in `status` and `show`, including the failed phase, failed workers when known, and the next artifact or connectivity check to inspect.

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

- Bundled workflows are read-only examples; they review tracked git diffs and do not crawl the entire repo.
- Reviews tracked git diffs; untracked file contents are not included.
- Background mode is process-based, not a daemon or queue.
- Cancellation sends `SIGTERM` to the background process, then marks pending work cancelled.
- Successful runs usually have an empty `run.log`; progress lives in `events.jsonl`.
- Run discovery is local and rebuildable.
- Workflow registry is local filesystem discovery only; there is no remote marketplace.
- Gates are safety primitives for specs and fixtures; no production write-capable workflow ships in this release.
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
- partial worker failure with degraded reducer output
- malformed worker output fallback visibility
- artifact manifest and reduced-result envelope generation
- run discovery, latest lookup, index rebuild, and show formatting
- gate pause, approve/resume, reject, and write-without-gate validation
- workflow registry list/show/validate, duplicate-id detection, and id-or-path runs
- workflow validation and human-readable status formatting
- bundled workflow catalog and example workflow registry validation

## Docs

- [PRD](docs/PRD.md)
- [Spec](docs/SPEC.md)
- [Full plan](docs/FULL_PLAN.md)
- [Phase contracts](docs/PHASE_CONTRACTS.md)
- [Skill plan](docs/SKILL_PLAN.md)
- [Workflow catalog](docs/workflow-catalog.md)
- [Claude comparison](docs/claude-vs-codex-workflows.md)
