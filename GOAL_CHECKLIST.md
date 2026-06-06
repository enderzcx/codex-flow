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

## v1.10 Safe Write Workers

- [x] Codex SDK writer can target a disposable repo.
  - Evidence: local feasibility spike wrote `docs/sdk-write-probe.md` inside `/tmp/cwf-sdk-target-*` through `@openai/codex-sdk` `workspace-write` and removed the temp repo after confirming the file body.

- [x] Non-doc write-capable workflows require `write_policy`.
  - Evidence: `tests/workflow-schema.test.ts` covers missing policy rejection, explicit `mode: patch`, unsafe path pattern rejection, and `doc-refresh` direct-docs compatibility.

- [x] Patch-mode writer runs in an isolated target and applies through policy-checked patch.
  - Evidence: `tests/phase-engine.test.ts` covers isolated target patch generation, `artifacts/proposed.patch`, approve/resume apply, manifest entries, and workflow verification commands.

- [x] Forbidden paths and patch conflicts stop safely.
  - Evidence: `tests/phase-engine.test.ts` rejects `.env` before target change.
  - Evidence: `tests/safe-write.test.ts` proves a conflicting patch stops at `git apply --check --3way` and leaves the target file unchanged.

- [x] Verification failure cannot produce a passing run.
  - Evidence: `tests/phase-engine.test.ts` marks worker JSON and run state failed when configured verification commands fail after apply, records that the applied patch was reverted, and asserts the generated target file is absent afterward.

- [x] Preview-before-apply artifacts are generated before approval.
  - Evidence: controlled real-smoke `run_20260606022257_psa1ma` paused at `approve-write` with target `/tmp/cwf-v110-real-target-h1P8A9` clean before approval.
  - Evidence: `artifacts/write-plan.md` recorded `write_policy` mode `patch`, allowed paths `src/generated/**`, forbidden paths `.env`, `.git`, `.git/**`, and no pre-write changed files.
  - Evidence: `artifacts/dry-run-preview.md` recorded that preview modified no target files and that the approved worker would emit `artifacts/proposed.patch` from an isolated copy.

- [x] Controlled real-smoke after Ender GO passes on a disposable git repo.
  - Evidence: `run_20260606022257_psa1ma` completed after `approve-write` at `2026-06-06T02:23:11.254Z`; status `completed`, 1/1 workers completed, 0 raw fallback, 0 adapter fallback, 0 findings, final verdict `PASS`.
  - Evidence: target repo `/tmp/cwf-v110-real-target-h1P8A9` had only `A  src/generated/safe-write-result.js`; cached diff stat showed `1 file changed, 4 insertions(+)`.
  - Evidence: `artifacts/diff-summary.md` recorded changed files and policy-applied files as only `src/generated/safe-write-result.js`.
  - Evidence: `artifacts/verification.md` recorded workflow verification passed: `test -f src/generated/safe-write-result.js`.

- [x] Write-result artifacts stay accurate for staged safe-apply output.
  - Evidence: `src/phase-engine.ts` now includes both working-tree and cached diff stats in `diff-summary.md`.
  - Evidence: `src/safe-write.ts` now reports policy-applied files from the patch paths rather than unrelated pre-existing target diffs.
  - Evidence: `tests/phase-engine.test.ts` asserts `diff-summary.md` includes the generated-file diff stat and only the generated file under `Policy-Applied Files`.

- [x] Broad local verification passes after v1.10 implementation.
  - Evidence: `git diff --check` passed.
  - Evidence: `npx vitest run tests/phase-engine.test.ts tests/safe-write.test.ts` passed 20 tests.
  - Evidence: `npm run check` passed with 13 test files / 117 tests.
  - Evidence: `bash scripts/smoke-cli.sh` passed without live Codex worker calls and validated the safe-write fixture.
  - Evidence: `npm pack --dry-run` passed with 58 files in the package dry-run.

- [x] Final implementation review is approved.
  - Evidence: Reasonix final file-input review returned `verdict: approve` with no blocker/high findings before the controlled real-smoke.
  - Evidence: Reasonix follow-up review of commit `1551fcc` returned `verdict: approve` with no findings after the diff-summary/policy-applied-files fix and final real-smoke evidence.
  - Evidence: review artifact `~/.Codex/review-artifacts/adc6f86501ee326e0ab3e4d1916f5986c0f8910b5fee1c7620c5accc16756358.json` recorded `GO` for the implementation diff committed as `e1a3431`.

## v1.5 GitHub PR Review Artifacts

- [x] PR comment artifact is generated.
  - Evidence: `bash scripts/smoke-cli.sh` runs `cwf github-pr <run-id> --format comment` and verifies `artifacts/github-pr-comment.md`.

- [x] PR review JSON artifact is generated.
  - Evidence: `bash scripts/smoke-cli.sh` runs `cwf github-pr <run-id> --format review` and verifies `artifacts/github-pr-review.json`.

- [x] Posting is explicit only.
  - Evidence: `tests/github-pr.test.ts` verifies artifact generation without `--post` does not invoke `gh`; source audit confirms the only `gh` path is gated by explicit `--post --repo --pr`.

- [x] Mocked `gh` post success works.
  - Evidence: test injects a fake `gh` executor and verifies command args require `--repo` and `--pr`.

- [x] Mocked `gh` post failure is clear.
  - Evidence: test injects a failing executor and verifies local artifacts remain plus error mentions `gh`.

- [x] Verification: `npm run check`
  - Evidence: passed locally; `tsc` build plus 65 Vitest tests.

- [x] Verification: `npm pack --dry-run`
  - Evidence: passed locally; dry-run tarball includes `dist/github-pr.js`.

- [x] Verification: artifact generation smoke
  - Evidence: `bash scripts/smoke-cli.sh` passed; `github-pr artifact smoke` generated comment/review artifacts and printed `Posted: no`.

- [x] Verification: v1.5 final review
  - Evidence: Reasonix final-review returned `approve`; no findings after completed-run guard.

- [x] Commit v1.5.
  - Evidence: commit `31b0372` in git history.

## v1.6 Workflow Spec Suggestion

- [x] `cwf suggest-workflow --goal "<task>"` generates a valid YAML suggestion.
  - Evidence: `tests/workflow-suggestion.test.ts` and `bash scripts/smoke-cli.sh`.

- [x] `cwf suggest-workflow --from-run <run-id>` derives a suggestion from run context.
  - Evidence: `tests/workflow-suggestion.test.ts`.

- [x] Suggestions are not installed automatically.
  - Evidence: registry unchanged test and smoke.

- [x] Validation diagnostics are shown for invalid suggestions.
  - Evidence: invalid suggestion diagnostics test.

- [x] A valid suggestion can run by explicit path.
  - Evidence: explicit-path run test with mocked Codex worker.

- [x] No generated JavaScript execution or private model routing exists.
  - Evidence: source audit.

- [x] Verification: `npm run check`
  - Evidence: passed locally; `tsc` build plus 72 Vitest tests.

- [x] Verification: `npm pack --dry-run`
  - Evidence: passed locally; dry-run tarball includes `dist/workflow-suggestion.js`.

- [x] Verification: suggestion generation smoke
  - Evidence: `bash scripts/smoke-cli.sh` passed; `suggest-workflow smoke` generated and validated an explicit YAML path without live Codex workers.

- [x] Verification: v1.6 final review
  - Evidence: Reasonix final-review returned `approve`; only info notes, no blockers.

- [x] Commit v1.6.
  - Evidence: commit `3c38d73` in git history.

## v1.7 Worker App Threads

- [x] Same-conversation final result remains primary.
  - Evidence: docs/source audit shows worker threads are evidence surfaces; `--new-thread` remains explicit and `thread/list` is not used to infer current conversation.

- [x] One worker can run through a fake app-server app thread.
  - Evidence: `tests/worker-adapter.test.ts` covers `thread/start`, `thread/name/set`, `turn/start`, `thread/read`, and worker envelope normalization.

- [x] Runtime metadata is complete for app-thread workers.
  - Evidence: worker adapter test asserts adapter/requested/fallback fields, parent/coordinator ids, worker `thread_id`, worker `turn_id`, transcript-read status, sandbox, approval policy, and result-return path.

- [x] Reducer output is adapter-independent for mixed SDK/app-thread workers.
  - Evidence: `tests/diff-review-reducer.test.ts`.

- [x] Fallback is explicit.
  - Evidence: unavailable app-thread with fallback configured records `fallback_used: true`; unavailable app-thread without fallback throws `WorkerAdapterUnavailableError`.

- [x] CLI-only use still works.
  - Evidence: `npm run check`, `bash scripts/smoke-cli.sh`, and normal CLI `diff-review` smoke `run_20260604084030_k0c6xu` passed with 3/3 SDK workers completed.

- [x] No current-thread guessing exists.
  - Evidence: source audit and tests prove worker execution does not use `thread/list` to select a parent/current thread.

- [x] Live Desktop worker thread smoke is attempted honestly.
  - Evidence: `node dist/cli.js desktop check` reported app-server running and thread APIs available; live app-thread run `run_20260604084923_hqu0l8` completed with correctness/tests/safety worker `thread_id` and `turn_id` values recorded, 3/3 completed, 0 fallback.

- [x] Verification: `git diff --check`
  - Evidence: passed locally.

- [x] Verification: `npm run check`
  - Evidence: passed locally; `tsc` build plus 78 Vitest tests.

- [x] Verification: `bash scripts/smoke-cli.sh`
  - Evidence: passed locally; validates `app-thread-diff-review` fixture without live workers and preserves existing CLI smoke.

- [x] Verification: targeted v1.7 tests
  - Evidence: `npx vitest run tests/worker-adapter.test.ts tests/diff-review-reducer.test.ts tests/desktop-bridge.test.ts` passed 20 tests.

- [x] Verification: v1.7 final review
  - Evidence: Reasonix final-review returned `approve`; only info notes, no blockers.

- [x] Commit v1.7.
  - Evidence: v1.7 commit in git history; final response reports the exact hash after commit.
