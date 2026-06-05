# Codex Flow

A lightweight, Codex-native workflow layer for multi-agent engineering review.

中文文档: [README.zh-CN.md](README.zh-CN.md)

Codex Flow lets you run repeatable multi-worker workflows using only Codex-native surfaces: no external LLM routers, no private adapters, no separate agent platform. The public pack is read-only by default: review workflows start Codex workers in parallel and aggregate their findings into a stable reduced JSON envelope plus a readable Markdown report. v1.4 ships one narrow gated write workflow, `doc-refresh`, for documentation-only edits after preview and explicit approval. v1.10 adds a safer general write-worker path for bounded patch-mode workflows: a writer works in an isolated target, Codex Flow extracts `artifacts/proposed.patch`, checks `write_policy` paths, runs `git apply --check --3way`, then applies only after the existing approval gate and drift check.

The long-term shape (post-v1) is a thin layer over Codex itself: Codex owns threads, subagents, sandbox, approvals, permissions, skills, plugins, and worktrees; Codex Flow owns workflow specs, run-state evidence, gates, reducer output, and artifact manifests.

It is designed for engineers who already use Codex and want repeatable, inspectable review runs. A workflow writes state, events, gate decisions, worker outputs, logs, and final results to disk, so a run can be polled, audited, cancelled, approved, rejected, resumed, and revisited later.

This is the v1.0 public CLI release. It is intentionally narrow: CLI-first, filesystem-backed state, readable status, local workflow discovery, and read-only review by default.

## What It Does

The default catalog includes:

- `diff-review`: correctness, tests, and safety review for a tracked git diff
- `repo-audit`: maintainability, project hygiene, and release-risk audit
- `implementation-plan`: scope, sequencing, and verification review for plan or implementation diffs
- `research-crosscheck`: source fidelity and unsupported-claim review for research or documentation diffs
- `release-review`: ship readiness, rollout, rollback, and regression review
- `doc-refresh`: gated documentation-only write workflow with dry-run preview, approval, diff summary, rollback, and verification artifacts

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
cwf run doc-refresh --target <repo>
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

Return a completed run to Codex:

```bash
cwf desktop check
cwf desktop result <run-id> --print
cwf desktop result <run-id>
cwf desktop result <run-id> --new-thread
cwf desktop result <run-id> --thread <thread-id>
cwf github-pr <run-id> --format comment
cwf github-pr <run-id> --format review
cwf github-pr <run-id> --post --repo <owner/repo> --pr <number>
cwf suggest-workflow --goal "Review docs changes" --target <repo>
cwf suggest-workflow --from-run <run-id>
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

Gated workflows can pause before a risky or write-capable phase. `cwf status` and `cwf show` explain the waiting gate and print the exact approve/reject commands. `cwf approve <run-id> <gate-id>` records the approval, and `cwf resume <run-id>` continues only pending phases. `cwf reject <run-id> <gate-id> --reason <text>` stops the run cleanly. Write workflows write `artifacts/write-plan.md`, `artifacts/dry-run-preview.md`, `artifacts/verification-plan.md`, and `artifacts/rollback.md` before approval. After approval the writer runs in an isolated target, CWF stores `artifacts/proposed.patch`, checks `write_policy` paths and `git apply --check --3way`, applies the patch, and records diff, verification, and rollback artifacts. The bundled `doc-refresh` workflow uses `direct-docs` only as a docs/readme/release-note policy preset; it still goes through the same isolated patch apply path.

`cwf desktop result` bridges completed filesystem runs back into Codex. When CWF is launched by a Codex skill from an active conversation, the primary UX is for the skill to read the completed run and answer in that same conversation. `--print` prints a concise handoff prompt for that path. Without app-server, the command still writes `artifacts/handoff-prompt.md`. `--new-thread` and `--thread <thread-id>` require a Codex CLI with app-server support, a running app-server daemon, and remote control enabled:

```bash
codex app-server daemon start
codex app-server daemon enable-remote-control
```

If multiple Codex CLIs are installed, set `CWF_CODEX_PATH=/path/to/codex` for the app-server-capable CLI. With app-server available, `--new-thread` explicitly creates a separate coordinator/result thread and `--thread <thread-id>` posts to a known thread. Codex Flow confirms new threads with `thread/read`, falls back to `thread/list`, and never guesses the current thread from `thread/list`.

`cwf github-pr <run-id>` turns a completed local run into PR-ready artifacts. Without `--post`, it only writes `artifacts/github-pr-comment.md` and `artifacts/github-pr-review.json`. Posting to GitHub requires explicit `--post --repo <owner/repo> --pr <number>` and uses the local `gh` CLI.

`cwf suggest-workflow` drafts a constrained YAML workflow spec and validates it immediately. Suggestions are saved under `~/.codex-workflows/suggestions/` by default, are not installed in the workflow registry, and are never run automatically. `--output` will not overwrite an existing file. To use a suggestion, run it by explicit path or move it manually into a workflow search path.

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
    write-plan.md
    dry-run-preview.md
    verification-plan.md
    proposed.patch
    proposed-patch.md
    diff-summary.md
    rollback.md
    verification.md
    github-pr-comment.md
    github-pr-review.json
    reduced-result.json
    manifest.json
  result.md
```

Each worker JSON uses the same envelope: status, confidence, summary, findings, verification checks, referenced artifacts, retry count, raw fallback flag, timing, prompt, raw output, and optional usage/error. `artifacts/reduced-result.json` stores the reducer envelope: verdict, summary, findings, verification gaps, next actions, worker provenance, and artifact references. `artifacts/manifest.json` lists the run evidence needed to reconstruct what happened, including `run.log` for background runs.

Worker execution is adapter-based but still Codex-only. The default adapter is `codex-sdk-headless`. Workflow specs may ask for `codex-app-thread`, `codex-subagent`, or `codex-review-detached` with `runtime.preferred_worker_adapter`, and may declare `runtime.fallback_worker_adapter: codex-sdk-headless`. `codex-app-thread` uses Codex app-server thread lifecycle methods to create one Desktop-visible read-only thread per worker when available; reducers keep the same worker envelope and preserve runtime metadata in worker provenance. The final result still returns to the initiating conversation when launched from Codex; worker threads are inspection/evidence surfaces.

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

- Bundled review workflows are read-only examples; they review tracked git diffs and do not crawl the entire repo.
- `doc-refresh` remains the only bundled user-facing write workflow. It is documentation-only, gated, reversible, and applies through the isolated patch path after explicit approval.
- General non-doc write-capable workflows must declare `write_policy` and use patch mode. CWF refuses paths outside `allowed_paths`, forbidden paths, target drift after preview, `git apply --check --3way` conflicts, and failed workflow verification commands. If patch-mode verification fails after apply, CWF attempts to reverse-apply the same proposed patch before returning a failed run.
- `direct-docs` is a compatibility policy for `doc-refresh`; source/config write workflows must use explicit patch-mode policy with their own allowed paths and verification commands.
- GitHub PR output is local by default. Nothing is posted unless `cwf github-pr` is run with explicit `--post --repo <owner/repo> --pr <number>`.
- Workflow suggestions are YAML specs only. They are validated after generation, but they are not installed or run automatically.
- Reviews tracked git diffs; untracked file contents are not included.
- Background mode is process-based, not a daemon or queue.
- Cancellation sends `SIGTERM` to the background process, then marks pending work cancelled.
- Successful runs usually have an empty `run.log`; progress lives in `events.jsonl`.
- Run discovery is local and rebuildable.
- Workflow registry is local filesystem discovery only; there is no remote marketplace.
- Gates are safety primitives for specs, fixtures, and the narrow `doc-refresh` workflow.
- Codex App result handoff is explicit and fallback-safe; app-thread workers depend on host app-server availability and fall back only when the workflow config says so.

## Verification

```bash
npm run check
npm pack --dry-run
bash scripts/smoke-cli.sh
```

Release CI runs the same non-live command smoke on push to `main` and on pull requests. The smoke validates the local workflow registry, validates `diff-review` plus gated write fixtures, and confirms write-capable specs still require a prior gate without starting live Codex workers.

The v1.0 release has been smoke-tested on:

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
- gated doc-refresh preview, approve/resume, reject, rollback, and verification artifact coverage
- patch-mode safe write fixture preview, approve/resume, proposed patch, policy rejection, apply, rollback, and verification failure coverage
- GitHub PR comment/review artifact generation and mocked `gh` post success/failure
- workflow suggestion generation, invalid diagnostics, registry non-installation, and explicit-path run with mocked worker
- documented command surface and install/build/link flow

For release preparation, use [Release checklist](docs/RELEASE_CHECKLIST.md).

## Docs

- [Release notes](RELEASE_NOTES.md)
- [Release checklist](docs/RELEASE_CHECKLIST.md)
- [PRD](docs/PRD.md)
- [Spec](docs/SPEC.md)
- [Full plan](docs/FULL_PLAN.md)
- [Phase contracts](docs/PHASE_CONTRACTS.md)
- [Post-v1 plan](docs/POST_V1_PLAN.md)
- [Codex native capability audit](docs/CODEX_NATIVE_CAPABILITY_AUDIT.md)
- [Skill plan](docs/SKILL_PLAN.md)
- [Workflow catalog](docs/workflow-catalog.md)
- [Claude comparison](docs/claude-vs-codex-workflows.md)
