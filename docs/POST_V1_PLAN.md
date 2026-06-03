---
half_life: 30d
archive_at: 2026-07-03
---

# Codex Flow Post-v1 Plan

Codex Flow v1.0 is the stable CLI workflow engine. Post-v1 work should not keep expanding runtime scope by default. The next phases should improve distribution, integration, and carefully gated advanced capabilities.

Plain English:

- v1.0 proves the engine works.
- v1.1 makes releases hard to break.
- v1.2 adds Codex App thread integration: left-sidebar threads, result return, and native safety boundaries.
- v1.3 turns results into GitHub PR review artifacts.
- v1.4 lets Codex suggest workflow specs safely.
- v1.5 introduces write-capable workflows behind gates.
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

## v1.2: Codex App Thread Integration

### PRD

Today `cwf` runs are visible through CLI and files, not the Codex Desktop left sidebar. That is not enough for a Codex-native workflow experience.

v1.2 makes Codex App integration real: a workflow can create a visible Codex thread, return its result to a Codex conversation, and prepare the path for write-capable work using Codex's own thread, worktree, sandbox, approval, and subagent model.

The normal CLI engine must still work without Codex Desktop. Desktop mode is required only when the user asks for left-sidebar thread behavior.

Reference: [CODEX_NATIVE_CAPABILITY_AUDIT.md](CODEX_NATIVE_CAPABILITY_AUDIT.md).

### Goals

- Add a Codex App Server capability probe.
- Create a named, visible Codex thread for a completed workflow result.
- Return workflow results to a Codex conversation through either a skill wrapper or an explicit thread id.
- Keep CLI result artifacts as the durable source of truth.
- Document how future write-capable workflows reuse Codex sandbox, approvals, permissions profiles, subagents, and worktrees.
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
- `cwf desktop result <run-id> --new-thread` creates a visible Codex App thread with `thread/start`, sets a readable name, starts a turn with the workflow result, and records thread/turn ids.
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
- Write-capable workflows must declare `capabilities.writes: true`, include a prior gate, and run write phases through Codex thread/worktree execution.
- Approval policy, permissions profile, sandbox mode, and network access come from Codex, not from a custom bypass.
- Future worker-sidebar behavior should use Codex subagents/threads, not custom process logs pretending to be agents.

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

- [ ] A visible Codex thread can be created in Desktop mode.
  - Evidence: `cwf desktop result <run-id> --new-thread` creates a named thread, records `thread_id`, and `thread/list` can read it back

- [ ] Result can return to a known Codex conversation.
  - Evidence: `cwf desktop result <run-id> --thread <thread-id>` records a posted/steered turn id, or the Codex skill wrapper returns the same result in the active conversation

- [ ] Existing CLI lifecycle remains unaffected.
  - Evidence: run, watch, result smoke still passes without Desktop

- [ ] Safety boundaries reuse Codex primitives.
  - Evidence: docs and tests show read-only default, gated writes, sandbox/approval/permissions pass-through, and no custom write bypass

### Goal Prompt

```text
Build Codex Flow v1.2 Codex App Thread Integration in /Users/sunny/Work/CODEX/codex-workflows.

Scope:
- Keep CLI run store as the source of truth.
- Do not require Codex Desktop for normal workflows.
- Desktop mode must create a real Codex thread visible through app-server thread/list and intended for Codex App left-sidebar visibility.
- Do not duplicate Codex subagent scheduling, approvals, sandbox, skills, or plugin systems.
- Do not guess the current Codex thread; use an explicit thread id or a host-provided thread id.
- Desktop integration must be explicit, guarded, and fallback-safe for CLI-only users.

Required:
- Add docs/CODEX_NATIVE_CAPABILITY_AUDIT.md updates if implementation changes the contract.
- Add cwf desktop check.
- Add cwf desktop result <run-id> [--thread <thread-id>] [--new-thread] [--print].
- Generate artifacts/handoff-prompt.md from a completed run.
- Write artifacts/desktop-handoff.json when app-server integration is attempted.
- Implement app-server initialize, thread/start, thread/name/set, turn/start, thread/list verification, and fallback handling.
- Add optional --desktop-result to cwf run for completed runs.
- Keep result output structured enough for a Codex skill wrapper to return it in the current conversation.
- Document the write-capable workflow path through Codex sandbox/approval/worktree/subagent primitives, but do not enable production write workflows yet.
- Update README, README.zh-CN, SPEC, PRD, SKILL_PLAN, POST_V1_PLAN.
- Add tests for result prompt generation, Desktop fallback, app-server message construction, explicit-thread posting, and no-current-thread guessing.

Verification:
- npm run check
- npm pack --dry-run
- completed run smoke
- cwf desktop check
- cwf desktop result <run-id> --print
- cwf desktop result <run-id> --new-thread
- app-server thread/list confirms the created thread id
- cwf desktop result <run-id> --thread <thread-id> when a test thread id is available
- Desktop fallback smoke when app-server path is unavailable
- existing run/watch/result smoke without Desktop

Final response:
- Explain what appears in Codex Desktop left sidebar and what returns to the current Codex conversation.
- Include fallback behavior, commands run, pass/fail, commit hash, and push status.
```

## v1.3: GitHub PR Review Output

### PRD

Codex Flow produces useful reports, but maintainers often need to paste them into pull requests manually. v1.3 adds a PR-ready output format so results can become comments or review notes.

### Goals

- Generate GitHub-friendly Markdown.
- Optionally post a PR comment when `gh` is available and the user explicitly asks.
- Keep posting disabled by default.
- Preserve local artifacts as source of truth.

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

- [ ] PR comment artifact is generated.
  - Evidence: `cwf github-pr <run-id> --format comment`

- [ ] PR review JSON artifact is generated.
  - Evidence: `cwf github-pr <run-id> --format review`

- [ ] Posting is explicit.
  - Evidence: no network/write happens without `--post`

- [ ] Missing `gh` or auth failure is clear.
  - Evidence: mocked `gh` failure test

- [ ] Local artifacts remain available.
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

## v1.4: Generated Workflow Spec Suggestions

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

- [ ] A workflow suggestion can be generated.
  - Evidence: `cwf suggest-workflow --goal "..."`

- [ ] Suggestions are not installed automatically.
  - Evidence: `cwf workflows list` unchanged after suggestion

- [ ] Validation diagnostics are shown.
  - Evidence: invalid generated fixture test

- [ ] A valid suggestion can be run by explicit path.
  - Evidence: `cwf run <suggestion-path> --target <repo>`

- [ ] No generated JS execution exists.
  - Evidence: source and docs audit

### Goal Prompt

```text
Build Codex Flow v1.4 Generated Workflow Spec Suggestions in /Users/sunny/Work/CODEX/codex-workflows.

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

## v1.5: Gated Write-Capable Workflow Pack

### PRD

Codex Flow has gate primitives, but v1.0 ships only read-only workflows. v1.5 can introduce write-capable workflows safely, starting with narrow, reversible tasks.

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
