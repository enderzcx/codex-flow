# Codex Flow v1.1-v1.6 Goal Checklist

This file tracks the active goal phase by phase. It is the local evidence ledger for the durable goal contract.

## Global Constraints

- [x] Public core remains Codex-native for v1.1.
  - Evidence: v1.1 adds CI/smoke/docs only; no runtime adapter or model routing changes.

- [x] CLI-only users are not made dependent on Codex Desktop for v1.1.
  - Evidence: `scripts/smoke-cli.sh` uses `node dist/cli.js` only.

- [x] No generated JavaScript execution, auto-posting, ungated writes, private adapters, or non-Codex routing added in v1.1.
  - Evidence: v1.1 files are release automation/docs only.

## v1.1 Release Automation And CI Smoke

- [x] Add CI checks for build, tests, package dry-run, and CLI smoke.
  - Evidence: `.github/workflows/ci.yml`

- [x] Add local non-live smoke script.
  - Evidence: `scripts/smoke-cli.sh`

- [x] Add release checklist matching README claims.
  - Evidence: `docs/RELEASE_CHECKLIST.md`

- [x] Keep live Codex worker smoke manual.
  - Evidence: `scripts/smoke-cli.sh` does not call `cwf run`; `docs/RELEASE_CHECKLIST.md` lists live smoke as optional/manual.

- [x] Verification: `npm run check`
  - Evidence: passed locally; build succeeded and Vitest reported 8 test files / 41 tests passed.

- [x] Verification: `npm pack --dry-run`
  - Evidence: passed locally; package contains 39 files and excludes `GOAL_CHECKLIST.md` / `.github` after package `files` whitelist.

- [x] Verification: `bash scripts/smoke-cli.sh`
  - Evidence: passed locally; it ran build/test, pack dry-run, help, workflow registry list/show/validate, `diff-review` validation, gated fixture validation, and write-without-gate failure smoke without live Codex worker calls.

- [x] Verification: local inspection of `.github/workflows/ci.yml`
  - Evidence: workflow runs on push to `main` and pull requests, uses current v6 GitHub checkout/setup-node actions, then executes `npm ci`, `npm run check`, `npm pack --dry-run`, and `bash scripts/smoke-cli.sh`.

- [x] Commit v1.1.
  - Evidence: v1.1 phase commit in git history; final response reports the exact hash after commit.

## v1.2 Native Runtime Bridge

- [x] Add `cwf desktop check`.
  - Evidence: `src/cli.ts` routes `desktop check` to `checkDesktopCapability`; verification pending current-run output.

- [x] Add `cwf desktop result <run-id> [--thread <thread-id>] [--new-thread] [--print]`.
  - Evidence: `src/cli.ts` routes `desktop result`; `tests/desktop-bridge.test.ts` covers print, explicit-thread, new-thread, and fallback.

- [x] Generate `artifacts/handoff-prompt.md` from a completed run.
  - Evidence: `handleDesktopResult` writes `artifacts/handoff-prompt.md`; verification pending smoke output.

- [x] Write `artifacts/desktop-handoff.json` when app-server integration is attempted.
  - Evidence: `handleDesktopResult` writes app-server attempt metadata for `--thread` and `--new-thread`; tests cover fallback and success metadata.

- [x] Implement app-server schema/capability probe and guarded result-return attempt.
  - Evidence: `src/desktop-bridge.ts` probes Codex CLI, generated app-server schema, daemon version, and required thread methods.

- [x] Do not guess current Codex thread.
  - Evidence: `desktop result --thread` requires an explicit thread id; `buildThreadListRequest` filters by run id/cwd for verification only.

- [x] Keep Desktop unavailable path non-fatal.
  - Evidence: tests cover unavailable app-server fallback; normal CLI run/result paths are unchanged.

- [x] Add optional `--desktop-result` to `cwf run`.
  - Evidence: foreground run writes handoff after completion; background child receives `--desktop-result` and writes handoff after `__run` completion.

- [x] Add native runtime metadata fields.
  - Evidence: `RunState.native_runtime.desktop_handoff` records adapter, mode, status, paths, app-server capability, thread id, turn id, and fallback reason.

- [x] Tests for result prompt generation, fallback, message construction, explicit-thread posting, and no-current-thread guessing.
  - Evidence: `tests/desktop-bridge.test.ts`.

- [x] Verification: `npm run check`
  - Evidence: passed locally; build succeeded and Vitest reported 9 test files / 47 tests passed.

- [x] Verification: `npm pack --dry-run`
  - Evidence: passed locally; package contains 40 files including `dist/desktop-bridge.js`.

- [x] Verification: completed fixture diff-review run
  - Evidence: `run_20260604031556_ljuueh` completed on `/tmp/cwf-v12-fixture-fPK05r`; watch/result smokes showed 3/3 workers completed and result artifacts written.

- [x] Verification: `cwf desktop check`
  - Evidence: `node dist/cli.js desktop check` reported Codex CLI `codex-cli 0.133.0`, schema available, required thread APIs available, daemon not running.

- [x] Verification: `cwf desktop result <run-id> --print`
  - Evidence: `node dist/cli.js desktop result run_20260604031556_ljuueh --print` printed verdict, summary, top findings, verification gaps, next actions, and artifact paths.

- [x] Verification: `cwf desktop result <run-id> --new-thread` or documented fallback when app-server daemon is unavailable.
  - Evidence: `node dist/cli.js desktop result run_20260604031556_ljuueh --new-thread` wrote `artifacts/desktop-handoff.json` with `status: fallback`; `codex app-server daemon start` failed because the managed standalone Codex install is missing.

- [x] Verification: existing run/watch/result smoke without Desktop.
  - Evidence: `node dist/cli.js watch run_20260604031556_ljuueh --once` and `node dist/cli.js result run_20260604031556_ljuueh` worked without Desktop.

- [x] Verification: v1.1 smoke remains green.
  - Evidence: `bash scripts/smoke-cli.sh` passed with 9 test files / 47 tests and no live Codex worker calls.

- [x] Verification: source audit
  - Evidence: `rg` found no runtime private model routing, generated JS execution, auto-post, or GitHub posting commands in `src package.json workflows scripts .github`.

- [x] Commit v1.2.
  - Evidence: v1.2 phase commit in git history; final response reports the exact hash after commit.

## v1.3 Worker Adapter Abstraction

- [x] Worker adapter abstraction exists.
  - Evidence: `src/adapters/worker-adapter.ts` defines `codex-sdk-headless`, `codex-app-thread`, `codex-subagent`, and `codex-review-detached` adapters plus explicit fallback handling.
  - Evidence: `tests/worker-adapter.test.ts` covers SDK fallback, no-fallback failure, and native metadata normalization.

- [x] Workflow specs can declare public Codex worker adapter preferences.
  - Evidence: `runtime.preferred_worker_adapter` and `runtime.fallback_worker_adapter` validate only public Codex adapters.
  - Evidence: `npm run check` passed schema tests rejecting non-Codex/private adapter names.

- [x] Worker envelopes persist runtime metadata.
  - Evidence: SDK worker results include `runtime.adapter`, requested/fallback adapter fields, agent role, transcript-read status, sandbox, and approval policy.

- [x] Reducer output is adapter-independent.
  - Evidence: mixed SDK/native reducer fixture passed and preserved runtime metadata in worker provenance.

- [x] Native worker adapter behavior is honest when unavailable.
  - Evidence: native adapters fail with `WorkerAdapterUnavailableError`; SDK fallback is used only when configured.
  - Evidence: native app-server/subagent worker execution smoke is not claimed in this environment because the host-owned execution path is unavailable.

- [x] Verification: `npm run check`
  - Evidence: passed locally; `tsc` build plus 53 Vitest tests.

- [x] Verification: `npm pack --dry-run`
  - Evidence: passed locally; tarball dry-run included `dist/adapters/worker-adapter.js` and public docs.

- [x] Verification: SDK fallback worker smoke
  - Evidence: `npx vitest run tests/worker-adapter.test.ts` passed 3 tests covering preferred native adapter failure, configured SDK fallback, and no-fallback failure.

- [x] Verification: mixed-adapter reducer fixture
  - Evidence: `npx vitest run tests/diff-review-reducer.test.ts` passed 5 tests including mixed SDK/native runtime metadata.

- [x] Verification: workflow validation still works
  - Evidence: `node dist/cli.js validate workflows/diff-review.yaml` passed and started no Codex workers.
  - Evidence: `node dist/cli.js workflows validate` passed for 5 bundled workflows.

- [x] Verification: source audit
  - Evidence: `rg` found no runtime private model routing, generated JavaScript execution, auto-post, or GitHub posting commands in `src package.json workflows scripts .github`.

- [x] Verification: G3 final review
  - Evidence: Reasonix final-review returned `approve`; only advisory was documenting the internal `WorkerRunner` option shape change.

- [x] Commit v1.3.
  - Evidence: v1.3 phase commit in git history; final response reports the exact hash after commit.

## v1.4 Gated Write-Capable Workflow Pack

- [x] Write-capable specs without a gate fail validation.
  - Evidence: `node dist/cli.js validate fixtures/workflows/write-without-gate.yaml` failed with `phase collect has writes:true but no prior gate phase`.
  - Evidence: `tests/workflow-schema.test.ts` covers `codex-write` before gate and `capabilities.writes` mismatch.

- [x] A narrow write-capable workflow ships with preview and approval gate.
  - Evidence: `workflows/doc-refresh.yaml` has `capabilities.writes: true`, `write-preview`, `approve-write`, and gated `codex-write`.
  - Evidence: `node dist/cli.js workflows show doc-refresh` reports `Capabilities: writes=true`.

- [x] Write workflow pauses before write phase.
  - Evidence: CLI reject smoke on disposable repo reached `Status: waiting` and printed exact `Approve:` / `Reject:` commands before any write.
  - Evidence: phase-engine test fails before writing if the target diff changes after preview/gate.

- [x] Approved write workflow fixture smoke passes.
  - Evidence: `npx vitest run tests/phase-engine.test.ts tests/workflow-schema.test.ts tests/workflow-pack.test.ts` passed 25 tests; approved fixture writes only `docs/codex-flow-v14-fixture.md` after approval/resume and manifest includes write evidence.

- [x] Rejected write workflow fixture smoke passes.
  - Evidence: phase-engine reject fixture blocks resume and writes no target file.
  - Evidence: CLI reject smoke on disposable repo ended `Status: rejected` and did not create `docs/codex-flow-v14-fixture.md`.

- [x] Write phase uses Codex sandbox/approval/worktree boundary.
  - Evidence: `src/adapters/codex-write.ts` starts Codex SDK with `sandboxMode: "workspace-write"` and records `sandbox`, `approval_policy`, and `worktree_path` metadata.
  - Evidence: approved fixture worker JSON includes `"sandbox": "workspace-write"` and `"approval_policy": "never"`.

- [x] Result includes rollback and verification evidence.
  - Evidence: approved fixture manifest includes `write-plan`, `dry-run-preview`, `diff-summary`, `rollback`, `verification`, and `worker:doc-refresh`.

- [x] Verification: `npm run check`
  - Evidence: passed locally; `tsc` build plus 60 Vitest tests.

- [x] Verification: `npm pack --dry-run`
  - Evidence: passed locally; dry-run tarball includes `dist/adapters/codex-write.js`, `workflows/doc-refresh.yaml`, and `fixtures/workflows/gated-doc-refresh.yaml`.

- [x] Verification: `bash scripts/smoke-cli.sh`
  - Evidence: passed locally; validates registry, `diff-review`, gated diff fixture, gated doc-refresh fixture, and write-without-gate failure without live Codex worker calls.

- [x] Verification: source audit
  - Evidence: `rg` found no runtime private model routing, generated JavaScript execution, auto-post, or GitHub posting commands in `src package.json workflows scripts .github`.

- [x] Verification: v1.4 final review
  - Evidence: Reasonix final-review returned `approve`; only advisory was optional future post-write diff hash locking.

- [x] Commit v1.4.
  - Evidence: v1.4 phase commit in git history; final response reports the exact hash after commit.

## v1.5 GitHub PR Review Artifacts

- [ ] Not started.

## v1.6 Workflow Spec Suggestion

- [ ] Not started.
