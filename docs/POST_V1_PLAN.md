---
half_life: 30d
archive_at: 2026-07-03
---

# Codex Flow Post-v1 Plan

Codex Flow v1.0 is the stable CLI workflow engine. Post-v1 work should not keep expanding runtime scope by default. The next phases should improve distribution, integration, and carefully gated advanced capabilities.

Plain English:

- v1.0 proves the engine works.
- v1.1 makes releases hard to break.
- v1.2 adds the native runtime bridge: coordinator thread, result return, and app-server adapter.
- v1.3 maps workflow workers to Codex agent threads/subagents.
- v1.4 introduces write-capable workflows behind Codex-native safety boundaries.
- v1.5 turns results into GitHub PR review artifacts.
- v1.6 lets Codex suggest workflow specs safely.
- v1.7 turns `codex-app-thread` into a live Desktop-visible worker-thread adapter.
- Managed-Agents-style platform scheduling is deferred until worker app threads are proven.
- Later work can explore remote workflow sharing.

Global rules:

- Keep public core Codex-native unless a later phase explicitly defines an optional adapter boundary.
- Do not make Codex Desktop required for CLI workflows.
- Do not duplicate Codex subagent, sandbox, approval, skill, or plugin mechanisms.
- Do not run generated workflow specs until they validate.
- Do not run generated JavaScript in the public core.
- Do not ship write-capable workflows without gates and dry-run evidence.
- Keep every new surface optional and gracefully degradable.

## v1.1: Release Automation And CI Smoke

Status: implemented. The CI-safe smoke path exists in `scripts/smoke-cli.sh`, the GitHub Actions workflow exists at `.github/workflows/ci.yml`, and release operators have `docs/RELEASE_CHECKLIST.md`.

### PRD

v1.0 is usable, but release quality still depends on a human remembering the right command sequence. v1.1 makes releases repeatable and harder to regress.

Users should trust that documented commands work after every push and before every release.

### Goals

- Add CI checks for build, tests, package dry-run, and CLI smoke.
- Add a release checklist that matches README claims.
- Add a command smoke script that can run locally and in CI.
- Keep workflow smoke lightweight enough for CI.

### SPEC

New files:

```text
scripts/smoke-cli.sh
docs/RELEASE_CHECKLIST.md
.github/workflows/ci.yml
```

`scripts/smoke-cli.sh` should run:

```bash
npm run check
npm pack --dry-run
node dist/cli.js --help
node dist/cli.js workflows list
node dist/cli.js workflows validate
node dist/cli.js validate workflows/diff-review.yaml
```

CI should run on:

- pull request
- push to `main`

CI should not require live Codex worker calls by default. Live workflow smoke stays manual unless a safe CI credential path is explicitly configured.

Release checklist should include:

- fresh clone install/build/test
- package dry-run
- CLI smoke
- source/dependency audit for private adapters and non-Codex routing
- docs claim audit
- optional live smoke on a local fixture

Out of scope:

- npm publish automation
- GitHub release publishing
- live Codex SDK worker CI
- Desktop integration

### Acceptance

- [ ] CI runs build and tests.
  - Evidence: GitHub Actions run passes on PR or push

- [ ] CI runs CLI smoke without live model calls.
  - Evidence: CI log includes `workflows validate` and `validate workflows/diff-review.yaml`

- [ ] Local smoke script works.
  - Evidence: `bash scripts/smoke-cli.sh`

- [ ] Release checklist exists and matches README claims.
  - Evidence: `docs/RELEASE_CHECKLIST.md`

- [ ] No private adapters or non-Codex routing are introduced.
  - Evidence: source/dependency audit command in checklist

### Goal Prompt

```text
Build Codex Flow v1.1 Release Automation And CI Smoke in /Users/sunny/Work/CODEX/codex-workflows.

Scope:
- Keep public core Codex-native.
- Do not add live Codex worker CI unless credentials and cost controls are explicitly configured.
- Do not add Desktop integration or new runtime features.

Required:
- Add scripts/smoke-cli.sh.
- Add docs/RELEASE_CHECKLIST.md.
- Add GitHub Actions CI for build, tests, pack dry-run, and non-live CLI smoke.
- Update README/README.zh-CN/docs if release workflow changes.
- Keep npm pack output clean enough for public package checks.

Verification:
- npm run check
- npm pack --dry-run
- bash scripts/smoke-cli.sh
- gh workflow list or local inspection of .github/workflows/ci.yml

Final response:
- Explain what is now protected by CI.
- Include commands run, pass/fail, commit hash, and push status.
```

## v1.2: Native Runtime Bridge

Status: implemented with fallback. `cwf desktop check` probes local Codex app-server capability. `cwf desktop result` writes `handoff-prompt.md`, prints the prompt with `--print`, and records `desktop-handoff.json` when `--new-thread` or `--thread` is attempted. If the app-server daemon is unavailable, completed CLI runs remain successful and the handoff artifact is the fallback.

### PRD

Today `cwf` runs are visible through CLI and files, not the Codex Desktop left sidebar. That is not enough for a Codex-native workflow experience.

v1.2 adds the bridge between the filesystem workflow engine and Codex's native conversation model. A workflow can return its result to a Codex conversation, explicitly create a visible coordinator/result thread when requested, and record app-server metadata beside the durable run artifacts.

The normal CLI engine must still work without Codex Desktop. A current Codex conversation should receive the final result through the skill wrapper; Desktop `--new-thread` is for explicit left-sidebar result threads, CLI/background runs, or user-requested separate coordination.

Reference: [CODEX_NATIVE_CAPABILITY_AUDIT.md](CODEX_NATIVE_CAPABILITY_AUDIT.md).

### Goals

- Add a Codex App Server capability probe.
- Return workflow results to the initiating Codex conversation through the skill wrapper when one exists.
- Create a named, visible Codex coordinator/result thread only when explicitly requested.
- Return workflow results to an explicit known thread id when the host/user provides one.
- Keep CLI result artifacts as the durable source of truth.
- Establish the native metadata contract that v1.3 worker agent threads and v1.4 write-capable workflows can reuse.
- Keep Desktop failure non-fatal for CLI-only users.

### SPEC

New commands:

```bash
cwf desktop check
cwf desktop result <run-id> [--thread <thread-id>] [--new-thread] [--print]
```

Optional run flag:

```bash
cwf run diff-review --target . --background --desktop-result
```

Artifacts:

```text
~/.codex-workflows/runs/<run-id>/artifacts/handoff-prompt.md
~/.codex-workflows/runs/<run-id>/artifacts/desktop-handoff.json
```

Behavior:

- `cwf desktop check` verifies local `codex app-server` availability and schema support.
- `cwf desktop result <run-id> --print` prints a concise result prompt.
- `cwf desktop result <run-id> --new-thread` explicitly creates a visible Codex App coordinator/result thread with `thread/start`, sets a readable name, starts a turn with the workflow result, and records thread/turn ids.
- `cwf desktop result <run-id> --thread <thread-id>` posts or steers the result into a known Codex thread.
- `--desktop-result` attempts the same after a run completes.
- Desktop failure records a warning and leaves `handoff-prompt.md`.
- Normal workflow run/result must not depend on Desktop availability.
- Do not guess the current Codex thread from `thread/list`; require an explicit thread id unless the host skill passes one.

Desktop result prompt should include:

- run id
- workflow id
- verdict
- top findings
- verification gaps
- artifact paths
- suggested next action

Native safety contract:

- Read-only workflows keep `read-only` sandbox defaults.
- Write-capable workflows are not enabled in v1.2; v1.4 enables the first gated docs-only write workflow. Any write-capable workflow must declare `capabilities.writes: true`, include a prior gate, and run write phases through Codex thread/worktree execution.
- Approval policy, permissions profile, sandbox mode, and network access come from Codex, not from a custom bypass.
- Worker-sidebar behavior is deferred to v1.7 and should use Codex app-server threads/subagents, not custom process logs pretending to be agents.

Out of scope:

- making CLI-only usage require Codex Desktop
- building a separate Desktop UI
- silently posting into arbitrary Codex threads
- replacing Codex subagent scheduling, approvals, sandbox, skills, or plugin packaging
- enabling production write-capable workflows in this phase

### Acceptance

- [ ] App-server capability check works.
  - Evidence: `cwf desktop check` reports Codex CLI version, app-server schema support, and whether thread APIs are available

- [ ] Result prompt can still be generated locally.
  - Evidence: `cwf desktop result <run-id> --print` prints a concise result prompt and `cwf desktop result <run-id>` creates `artifacts/handoff-prompt.md`

- [ ] A visible Codex coordinator thread can be created in Desktop mode.
  - Evidence: `cwf desktop result <run-id> --new-thread` creates a named thread, records `thread_id`, and confirms it through `thread/read` or `thread/list` fallback

- [ ] Result can return to a known Codex conversation.
  - Evidence: `cwf desktop result <run-id> --thread <thread-id>` records a posted/steered turn id, or the Codex skill wrapper returns the same result in the active conversation

- [ ] Existing CLI lifecycle remains unaffected.
  - Evidence: run, watch, result smoke still passes without Desktop

- [ ] Native metadata is ready for worker threads.
  - Evidence: run artifacts can record coordinator thread id, turn id, adapter name, app-server version, fallback status, and result return path

### Goal Prompt

```text
Build Codex Flow v1.2 Native Runtime Bridge in /Users/sunny/Work/CODEX/codex-workflows.

Scope:
- Keep CLI run store as the source of truth.
- Do not require Codex Desktop for normal workflows.
- Desktop `--new-thread` mode must create a real Codex coordinator/result thread visible through app-server thread/read and intended for Codex App left-sidebar visibility.
- Same-conversation result return through the Codex skill wrapper is the primary UX when a workflow is launched from an active Codex conversation.
- Do not duplicate Codex subagent scheduling, approvals, sandbox, skills, or plugin systems.
- Do not guess the current Codex thread; use an explicit thread id or a host-provided thread id.
- Desktop integration must be explicit, guarded, and fallback-safe for CLI-only users.

Required:
- Add docs/CODEX_NATIVE_CAPABILITY_AUDIT.md updates if implementation changes the contract.
- Add cwf desktop check.
- Add cwf desktop result <run-id> [--thread <thread-id>] [--new-thread] [--print].
- Generate artifacts/handoff-prompt.md from a completed run.
- Write artifacts/desktop-handoff.json when app-server integration is attempted.
- Implement app-server initialize, thread/start, thread/name/set, turn/start, thread/read confirmation, thread/list fallback, and fallback handling.
- Add optional --desktop-result to cwf run for completed runs.
- Keep result output structured enough for a Codex skill wrapper to return it in the current conversation.
- Add native runtime metadata fields that future worker agent threads can reuse.
- Document the write-capable workflow path through Codex sandbox/approval/worktree/subagent primitives, but do not enable write workflows yet.
- Update README, README.zh-CN, SPEC, PRD, SKILL_PLAN, POST_V1_PLAN.
- Add tests for result prompt generation, Desktop fallback, app-server message construction, explicit-thread posting, and no-current-thread guessing.

Verification:
- npm run check
- npm pack --dry-run
- completed run smoke
- cwf desktop check
- cwf desktop result <run-id> --print
- cwf desktop result <run-id> --new-thread
- app-server thread/read confirms the created thread id, with thread/list fallback only as secondary evidence
- cwf desktop result <run-id> --thread <thread-id> when a test thread id is available
- Desktop fallback smoke when app-server path is unavailable
- existing run/watch/result smoke without Desktop

Final response:
- Explain what appears in Codex Desktop left sidebar and what returns to the current Codex conversation.
- Include fallback behavior, commands run, pass/fail, commit hash, and push status.
```

## v1.3: Worker Adapter Contract

### PRD

v1.0 workers are reliable headless SDK runs, but they are not the same user experience as Codex subagents visible in the App or CLI.

v1.3 defines the worker adapter contract that native worker threads can use later. The workflow still owns phase order, run-store evidence, and reducer output. Codex owns subagent/thread execution, sandbox inheritance, approvals, and thread history.

### Goals

- Treat workflow worker definitions as agent roles.
- Validate worker adapter names and fail/fallback explicitly when native execution is unavailable.
- Preserve the same worker JSON envelope regardless of adapter.
- Record thread ids, agent roles, nicknames, turn ids, and transcript-read status.
- Support detached native review threads for review-shaped workflows.
- Keep `codex-sdk-headless` as fallback for CLI-only users.

### SPEC

Worker adapters:

```text
codex-sdk-headless
codex-app-thread
codex-subagent
codex-review-detached
```

New optional workflow defaults:

```yaml
runtime:
  preferred_worker_adapter: codex-subagent
  fallback_worker_adapter: codex-sdk-headless
```

Worker artifact metadata:

```json
{
  "adapter": "codex-subagent",
  "requested_adapter": "codex-subagent",
  "fallback_adapter": "codex-sdk-headless",
  "fallback_used": false,
  "thread_id": "thr_...",
  "turn_id": "turn_...",
  "agent_role": "correctness",
  "agent_nickname": "Atlas",
  "transcript_read": true,
  "sandbox": "read-only",
  "approval_policy": "never"
}
```

Behavior:

- Worker output still normalizes into `workers/<worker-id>.json`.
- Reducer must not care which adapter produced the worker.
- If native worker creation fails, fallback to SDK headless only when fallback is configured.
- If transcript read is unavailable, preserve final response and mark `transcript_read: false`.
- Worker thread creation must inherit or explicitly set sandbox/approval values.

Out of scope:

- custom subagent scheduler
- recursive fan-out beyond Codex's configured depth
- write-capable workers
- making CLI-only users depend on Codex App

Current implementation note: v1.3 ships the adapter abstraction, SDK fallback behavior, schema validation, runtime metadata envelope, and adapter-independent reducer provenance. Native app-thread, subagent, and detached-review adapters fail explicitly with `WorkerAdapterUnavailableError`; live app-thread execution is moved to v1.7 now that app-server thread creation has been proven.

### Acceptance

- [x] Worker adapter abstraction exists.
  - Evidence: tests cover SDK fallback and native metadata normalization

- [ ] Native worker thread smoke is covered by the v1.7 contract.
  - Evidence: v1.7 `codex-app-thread` smoke records `thread_id`, `turn_id`, adapter, and final output
  - Current status: not part of v1.3; v1.3 remains the adapter-contract phase

- [x] Reducer output is adapter-independent.
  - Evidence: reducer fixture passes with mixed SDK/native worker envelopes

- [ ] Detached review path is supported for review workflows.
  - Evidence: `review/start` detached response can be normalized into a worker artifact
  - Current status: adapter name and metadata seam exist; live detached review normalization remains pending until app-server review execution is available

### Historical Goal Prompt

```text
Build Codex Flow v1.3 Worker Adapter Contract in /Users/sunny/Work/CODEX/codex-workflows.

Scope:
- Keep v1.0 SDK worker behavior as fallback.
- Treat worker as role/config and thread as execution instance.
- Do not build a custom subagent scheduler.
- Do not enable write-capable workers.

Required:
- Add worker adapter abstraction.
- Add public native adapter names behind explicit runtime options, but fail them explicitly until implemented in a later phase.
- Add runtime metadata fields to worker envelopes.
- Add detached review worker adapter if feasible through app-server review/start.
- Keep reducer adapter-independent.
- Update PRD, SPEC, README, SKILL_PLAN, and comparison docs.

Verification:
- npm run check
- npm pack --dry-run
- SDK fallback smoke
- adapter unavailable/fallback smoke
- mixed-adapter reducer fixture

Final response:
- Explain which worker threads appear in Codex, what metadata is recorded, and which fallback path was used.
```

## v1.4: Gated Write-Capable Workflow Pack

### PRD

Once worker agent threads exist, Codex Flow can safely introduce small write-capable workflows. These workflows should use Codex's own thread/worktree sandbox and approvals, while Codex Flow owns phase gates, dry-run previews, artifacts, and reducer evidence.

### Goals

- Ship a small write-capable workflow pack.
- Require `capabilities.writes: true`.
- Require a gate before any write phase.
- Run write phases through Codex thread/worktree execution, not custom file writes.
- Produce preview, diff summary, rollback note, and verification evidence.

### SPEC

Candidate workflows:

```text
fix-with-review
doc-refresh
test-suggestion-apply
```

Required artifacts:

```text
artifacts/write-plan.md
artifacts/dry-run-preview.md
artifacts/diff-summary.md
artifacts/rollback.md
```

Out of scope:

- credentials
- database writes
- deployment
- irreversible external writes
- payment/permission/security-sensitive flows

Implementation status: v1.4 ships `doc-refresh`, a documentation-only workflow with `write-preview`, `approve-write`, and `codex-write` phases. The default write runner uses Codex SDK `workspace-write`; fixture tests inject a deterministic writer for approve/reject smoke.

### Acceptance

- [x] Write-capable specs without a gate fail validation.
  - Evidence: fixture test

- [x] Write workflow pauses before write phase.
  - Evidence: `cwf status` shows gate and exact approve/reject commands

- [x] Write phase uses Codex sandbox/approval/worktree boundary.
  - Evidence: worker metadata records permission profile or sandbox and changed files

- [x] Result includes rollback and verification evidence.
  - Evidence: artifact manifest includes write plan, diff summary, rollback, and test output

### Goal Prompt

```text
Build Codex Flow v1.4 Gated Write-Capable Workflow Pack in /Users/sunny/Work/CODEX/codex-workflows.

Scope:
- Use Codex thread/worktree execution for writes.
- Do not write target files directly from the workflow runner.
- Do not include credentials, database, deploy, payment, permission, or irreversible external write workflows.

Required:
- Add write workflow validation hardening.
- Add one small write-capable workflow with dry-run preview and approval gate.
- Add write artifacts and rollback evidence.
- Add tests and a real smoke on a disposable fixture repo.

Verification:
- npm run check
- npm pack --dry-run
- write-without-gate validation failure
- approved write workflow fixture smoke
- rejected write workflow fixture smoke

Final response:
- Explain what changed, which files changed, which approvals were required, and how rollback works.
```

## v1.5: GitHub PR Review Output

### PRD

Codex Flow produces useful reports, but maintainers often need to paste them into pull requests manually. v1.3 adds a PR-ready output format so results can become comments or review notes.

### Goals

- Generate GitHub-friendly Markdown.
- Optionally post a PR comment when `gh` is available and the user explicitly asks.
- Keep posting disabled by default.
- Preserve local artifacts as source of truth.

Status: implemented. `cwf github-pr` writes local comment/review artifacts by default and invokes `gh` only with explicit `--post --repo --pr`.

### SPEC

New command:

```bash
cwf github-pr <run-id> --format comment
cwf github-pr <run-id> --format review
cwf github-pr <run-id> --post --repo <owner/repo> --pr <number>
```

Artifacts:

```text
~/.codex-workflows/runs/<run-id>/artifacts/github-pr-comment.md
~/.codex-workflows/runs/<run-id>/artifacts/github-pr-review.json
```

Behavior:

- Without `--post`, only write artifacts and print path.
- With `--post`, require explicit repo and PR number.
- Use `gh` CLI when available.
- If `gh` is missing or auth fails, leave artifacts and return a clear error.

Out of scope:

- inline file comments with exact line mapping
- automatic posting after every workflow
- GitHub App integration
- mutating PR state without explicit `--post`

### Acceptance

- [x] PR comment artifact is generated.
  - Evidence: `cwf github-pr <run-id> --format comment`

- [x] PR review JSON artifact is generated.
  - Evidence: `cwf github-pr <run-id> --format review`

- [x] Posting is explicit.
  - Evidence: no network/write happens without `--post`

- [x] Missing `gh` or auth failure is clear.
  - Evidence: mocked `gh` failure test

- [x] Local artifacts remain available.
  - Evidence: generated files under `artifacts/`

### Goal Prompt

```text
Build Codex Flow v1.3 GitHub PR Review Output in /Users/sunny/Work/CODEX/codex-workflows.

Scope:
- Do not auto-post to GitHub.
- Do not add GitHub App integration.
- Do not attempt inline line comments yet.
- Keep local artifacts as source of truth.

Required:
- Add cwf github-pr <run-id> --format comment|review.
- Add optional --post --repo <owner/repo> --pr <number> path using gh CLI.
- Generate github-pr-comment.md and github-pr-review.json artifacts.
- Add clear errors for missing gh/auth.
- Update docs and tests.

Verification:
- npm run check
- npm pack --dry-run
- completed run smoke
- artifact generation smoke
- mocked gh post success/failure tests

Final response:
- Explain what is generated locally and what, if anything, was posted.
- Include commands run, pass/fail, commit hash, and push status.
```

## v1.6: Generated Workflow Spec Suggestions

Status: implemented. `cwf suggest-workflow` writes constrained YAML suggestions, validates them immediately, leaves the registry unchanged, and requires explicit path usage before running.

### PRD

Users will eventually want Codex Flow to help draft new workflows. This must be safe: generated suggestions should be specs, not executable scripts, and must pass validation before running.

### Goals

- Let Codex draft constrained workflow YAML.
- Save generated specs as suggestions, not active workflows.
- Validate before activation.
- Keep humans in control of adding the workflow to registry paths.

### SPEC

New command:

```bash
cwf suggest-workflow --goal "<task>" [--target <repo>] [--output <path>]
cwf suggest-workflow --from-run <run-id> [--output <path>]
```

Default output:

```text
~/.codex-workflows/suggestions/<timestamp>-<slug>.yaml
```

Behavior:

- Suggestion is generated as constrained YAML/JSON workflow spec.
- It is not automatically installed.
- CLI immediately runs validation and prints pass/fail.
- Failed validation leaves the file with diagnostics.
- Running a suggested workflow requires explicit path or moving it into a registry path.

Out of scope:

- generated JavaScript
- auto-installing generated workflow into registry
- auto-running generated workflow
- non-Codex generation providers

### Acceptance

- [x] A workflow suggestion can be generated.
  - Evidence: `cwf suggest-workflow --goal "..."`

- [x] Suggestions are not installed automatically.
  - Evidence: `cwf workflows list` unchanged after suggestion

- [x] Validation diagnostics are shown.
  - Evidence: invalid suggestion diagnostics test

- [x] A valid suggestion can be run by explicit path.
  - Evidence: explicit-path run test with mocked Codex worker

- [x] No generated JS execution exists.
  - Evidence: source and docs audit

### Goal Prompt

```text
Build Codex Flow v1.6 Generated Workflow Spec Suggestions in /Users/sunny/Work/CODEX/codex-workflows.

Scope:
- Generate constrained YAML/JSON workflow specs only.
- Do not generate or execute JavaScript workflows.
- Do not auto-install or auto-run suggestions.
- Keep public core Codex-native.

Required:
- Add cwf suggest-workflow --goal "<task>" [--target <repo>] [--output <path>].
- Add cwf suggest-workflow --from-run <run-id> [--output <path>].
- Save suggestions under ~/.codex-workflows/suggestions by default.
- Validate generated suggestions and print diagnostics.
- Require explicit path or manual move into registry before running.
- Update docs and tests.

Verification:
- npm run check
- npm pack --dry-run
- suggestion generation smoke
- invalid suggestion diagnostics test
- explicit-path run smoke for a valid suggested workflow
- source audit for no generated JS execution

Final response:
- Explain that this suggests specs only and does not run them automatically.
- Include commands run, pass/fail, commit hash, and push status.
```

## v1.7: Worker App Threads

Planning source: [WORKER_APP_THREADS_PLAN.md](WORKER_APP_THREADS_PLAN.md).

### PRD

v1.7 makes worker execution visible in Codex Desktop without changing the final-result UX. If a user starts CWF from an active Codex conversation, the final answer returns to that same conversation through the skill wrapper. If the workflow requests `codex-app-thread`, each worker can also run in a separate Desktop-visible thread for inspection and debugging.

The point is not to build a managed agent platform. The point is to reuse Codex's native thread surface for worker execution while preserving CWF's run store, worker envelopes, gates, reducer output, and fallback behavior.

### Goals

- Add a live `codex-app-thread` worker adapter.
- Create one Codex Desktop thread per worker when app-server is available and the workflow requests it.
- Preserve the same worker JSON envelope as SDK workers.
- Record worker thread id, turn id, parent/coordinator ids when known, adapter metadata, transcript-read status, sandbox, approval policy, and fallback status.
- Keep same-conversation result return as the primary Codex skill UX.
- Keep `--new-thread` as explicit CLI/background/coordinator behavior.
- Keep `codex-sdk-headless` fallback explicit, not automatic.

### SPEC

Workflow runtime opt-in:

```yaml
runtime:
  preferred_worker_adapter: codex-app-thread
  fallback_worker_adapter: codex-sdk-headless
```

Behavior:

- `codex-app-thread` probes the same app-server capability surface as `cwf desktop check`.
- Each worker gets its own `thread/start`, readable `thread/name/set`, and `turn/start`.
- Worker prompts include the same role/configuration used by SDK workers.
- Worker final output is read from the app-server turn/thread path when available, then normalized into `workers/<worker-id>.json`.
- If transcript reading is unavailable, preserve the best available response and set `transcript_read: false`.
- Reducers must not branch on adapter type.
- If native worker creation fails, fallback only happens when `runtime.fallback_worker_adapter` is configured.
- CWF never infers `parent_thread_id` from `thread/list`; it records a parent only when the host provides one.

Out of scope:

- Claude Managed Agents parity
- custom scheduler, queue, remote lifecycle service, or marketplace
- recursive worker fan-out
- write-capable app-thread workers
- making CLI-only users depend on Codex Desktop
- default result return to a new Desktop thread

### Acceptance

- [ ] Same-conversation result return remains primary in docs and skill behavior.
  - Evidence: source/docs audit shows `--new-thread` is explicit/background/fallback, not default

- [ ] One app-thread worker can run through a fake app-server.
  - Evidence: unit/integration test covers `thread/start`, `thread/name/set`, `turn/start`, `thread/read`, and worker envelope normalization

- [ ] `diff-review` can create Desktop-visible worker threads in live smoke.
  - Evidence: live run records three worker `thread_id` values and three worker `turn_id` values

- [ ] Reducer output remains adapter-independent.
  - Evidence: mixed SDK/app-thread worker fixture produces the same reduced-result contract

- [ ] Fallback behavior is explicit.
  - Evidence: unavailable app-thread with fallback configured records `fallback_used: true`; without fallback it fails with `WorkerAdapterUnavailableError`

- [ ] Existing CLI lifecycle remains unaffected.
  - Evidence: `npm run check`, `bash scripts/smoke-cli.sh`, and normal `diff-review` smoke pass without app-server

- [ ] No current-thread guessing exists.
  - Evidence: tests and source audit prove `thread/list` is never used to select a parent/current thread

### Goal Prompt

```text
Build Codex Flow v1.7 Worker App Threads in /Users/sunny/Work/CODEX/codex-workflows.

Scope:
- Implement a live codex-app-thread worker adapter.
- Keep the Codex skill wrapper / active conversation as the primary final-result return path.
- Keep --new-thread explicit for CLI/background/coordinator use only.
- Do not build Claude Managed Agents-style platform scheduling.
- Do not build a custom subagent scheduler, queue, daemon, remote lifecycle service, or marketplace.
- Do not enable write-capable app-thread workers.
- Do not guess the current/parent Codex thread from thread/list.

Required:
- Reuse the existing app-server websocket transport.
- Add codex-app-thread execution behind runtime.preferred_worker_adapter.
- For each worker, create a named app-server thread and start a worker turn.
- Normalize app-thread output into the existing worker envelope.
- Record thread_id, turn_id, parent_thread_id when provided, coordinator_thread_id when present, transcript_read, sandbox, approval_policy, adapter, fallback, and app-server metadata.
- Keep reducer adapter-independent.
- Fall back to codex-sdk-headless only when runtime.fallback_worker_adapter is configured.
- Update README, README.zh-CN, PRD, SPEC, POST_V1_PLAN, PHASE_CONTRACTS, ACCEPTANCE, and WORKER_APP_THREADS_PLAN if implementation changes the contract.

Verification:
- npm run check
- bash scripts/smoke-cli.sh
- fake app-server app-thread worker test
- mixed-adapter reducer fixture
- normal CLI diff-review smoke without app-server
- live app-server diff-review smoke with three worker thread ids when app-server is available
- source audit for no current-thread guessing

Final response:
- Say whether same-conversation return remains primary.
- List worker thread ids / turn ids from live smoke, or state why live smoke was unavailable.
- Explain fallback behavior and whether fallback was used.
- Include commands run, pass/fail, commit hash, push status, and any remaining gap.
```

## Deferred: Managed-Agents-Style Platform Scheduling

Do not implement platform-level scheduling in v1.7. That work is deferred until worker app threads are proven.

Future planning can start after v1.7 proves:

- worker threads are visible in Codex Desktop;
- worker outputs return to the reducer;
- final results return to the initiating conversation through the skill wrapper;
- fallback is safe for CLI-only users;
- a custom scheduler is still clearly needed after reusing Codex's native thread/subagent surface.

## Superseded: Gated Write-Capable Workflow Pack

This section was the older post-v1 numbering for the write-capable workflow pack. It is superseded by v1.4 `doc-refresh` above. The active v1.5 scope is GitHub PR review artifacts.

### Historical PRD

Codex Flow had gate primitives, but v1.0 shipped only read-only workflows. The write-capable pack introduced in v1.4 starts with a narrow, reversible documentation workflow.

### Goals

- Add optional write-capable workflows behind gates.
- Require preview/dry-run evidence before writing.
- Keep writes scoped and reversible.
- Preserve old read-only defaults.

### SPEC

Candidate workflows:

```text
fix-with-review
doc-refresh
test-suggestion-apply
```

Requirements for every write-capable workflow:

- `capabilities.writes: true`
- at least one gate before first write-capable phase
- pre-write plan artifact
- dry-run or diff preview artifact
- post-write result and verification command
- rollback note

Commands remain existing lifecycle:

```bash
cwf run fix-with-review --target <repo> --background
cwf show <run-id>
cwf approve <run-id> <gate-id>
cwf resume <run-id>
```

Out of scope:

- irreversible writes
- credentials or secret edits
- database migrations
- deployment
- automatic approval

### Acceptance

- [ ] Write-capable workflow fails without gate.
  - Evidence: validation test

- [ ] Write-capable workflow pauses before writing.
  - Evidence: run reaches `waiting`

- [ ] Dry-run/preview artifact exists before approval.
  - Evidence: artifact manifest includes preview

- [ ] Approved run writes only scoped files.
  - Evidence: fixture diff after resume

- [ ] Rejecting gate writes nothing.
  - Evidence: reject smoke

- [ ] Rollback guidance is generated.
  - Evidence: result includes rollback note

### Goal Prompt

```text
Build Codex Flow v1.5 Gated Write-Capable Workflow Pack in /Users/sunny/Work/CODEX/codex-workflows.

Scope:
- Add only narrow, reversible write-capable workflows.
- Do not touch credentials, databases, deployment, or irreversible external state.
- Require gates, preview artifacts, and explicit approval before writes.
- Keep read-only workflows unchanged.

Required:
- Add one or more gated write-capable workflows.
- Require capabilities.writes:true and a gate before writes.
- Generate pre-write plan and diff/preview artifacts.
- Ensure reject writes nothing.
- Ensure approve/resume writes only scoped files.
- Generate rollback notes.
- Update docs and tests.

Verification:
- npm run check
- npm pack --dry-run
- write workflow validation tests
- pause/approve/resume/reject fixture smokes
- scoped write diff verification
- read-only workflow regression smoke

Final response:
- Explain exactly what can write, what cannot, and where approval happens.
- Include commands run, pass/fail, commit hash, and push status.
```

## Later: Remote Workflow Sharing

Remote workflow sharing should only happen after local registry, validation, release checks, and write-gates are mature.

Possible shape:

- `cwf registry add <url>`
- signed or checksummed workflow specs
- trust policy
- local cache
- explicit install

Non-goals:

- auto-running remote workflows
- remote code execution
- generated JavaScript marketplace
- unreviewed write-capable remote workflows

This is intentionally not scoped as v1.x until the local engine has enough real usage.
