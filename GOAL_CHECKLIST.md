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
  - Evidence: workflow runs on push to `main` and pull requests, then executes `npm ci`, `npm run check`, `npm pack --dry-run`, and `bash scripts/smoke-cli.sh`.

- [x] Commit v1.1.
  - Evidence: v1.1 phase commit in git history; final response reports the exact hash after commit.

## v1.2 Native Runtime Bridge

- [ ] Not started.

## v1.3 Worker Adapter Abstraction

- [ ] Not started.

## v1.4 Gated Write-Capable Workflow Pack

- [ ] Not started.

## v1.5 GitHub PR Review Artifacts

- [ ] Not started.

## v1.6 Workflow Spec Suggestion

- [ ] Not started.
