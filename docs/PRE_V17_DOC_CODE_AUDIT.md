---
half_life: 7d
archive_at: 2026-06-11
---

# Pre-v1.7 Doc-To-Code Audit

## Scope

This audit checks whether the completed pre-v1.7 claims are backed by code, tests, and smoke evidence before v1.7 Worker App Threads starts.

Baseline audited:

- commit: `7195243 Rewrite active planning docs`
- clean worktree: `/tmp/cwf-pre-v17-audit`
- main checkout note: the primary checkout had unrelated uncommitted v1.7-looking changes before this audit started, so they were intentionally excluded from this baseline verification.

This report does not rewrite completed phase evidence. `GOAL_CHECKLIST.md` remains the phase ledger for v1.1-v1.6.

## Plain Summary

The pre-v1.7 foundation is good enough to build on.

The important claims are backed by implementation and tests:

- CLI engine, workflow registry, run store, status/watch/result, and package smoke work.
- Desktop result handoff is explicit and fallback-safe.
- Worker adapter fallback happens only when configured.
- Native worker adapters are honest unavailable stubs before v1.7.
- `doc-refresh` is gated before writes and writes through Codex SDK `workspace-write`.
- GitHub PR output is local by default; posting requires explicit flags.
- Workflow suggestions generate validated YAML, do not install themselves, and do not run automatically.

The main caution is documentation interpretation: `ACCEPTANCE.md` still contains unchecked global criteria and should not be treated as the completed-phase ledger. For v1.1-v1.6 completion, use `GOAL_CHECKLIST.md` plus the tests and smoke commands below.

## Verification Run

Commands run in the clean detached worktree:

```bash
npm ci
npm run check
bash scripts/smoke-cli.sh
git diff --check
```

Result:

- `npm ci`: passed, 55 packages installed, 0 vulnerabilities.
- `npm run check`: passed, TypeScript build plus 12 Vitest files / 75 tests.
- `bash scripts/smoke-cli.sh`: passed, including `npm pack --dry-run`, help smoke, workflow registry smoke, workflow validation, write-gate failure smoke, GitHub PR artifact smoke, and suggest-workflow smoke.
- `git diff --check`: passed.

Source audit result:

- No runtime private model router or non-Codex adapter implementation was found in `src`, `tests`, `workflows`, `scripts`, or `package.json`.
- Mentions of `--post` are documented and tested as explicit GitHub posting flags.
- The only `ollama` hit is a negative schema test that rejects non-Codex runtime adapters.

## Status Matrix

| Area | Status | Evidence | Gap / Note |
| --- | --- | --- | --- |
| v1.0 CLI engine and public package surface | Verified | `scripts/smoke-cli.sh` runs build/test, package dry-run, help, registry, and validation smokes; `npm run check` passed 12 files / 75 tests. | No live Codex worker call in smoke by design. |
| Workflow registry | Verified | Smoke lists 6 bundled workflows and validates registry; `tests/workflow-registry.test.ts` covers duplicate ids and invalid specs. | Remote registry is not built, correctly deferred. |
| Status/watch/list/show/result run surfaces | Verified | `src/cli.ts` exposes the command set; `tests/cli-format.test.ts` covers readable waiting/approved/rejected gate output. | Live long-run UX is covered by smoke history, not rerun in this audit. |
| v1.1 release automation | Verified | `GOAL_CHECKLIST.md` records CI/smoke/checklist completion; `scripts/smoke-cli.sh` runs build, tests, pack dry-run, registry, validation, GitHub artifact, and suggestion smoke. | No npm publish automation, as intended. |
| v1.2 Desktop result handoff | Verified | `src/desktop-bridge.ts` requires explicit `--thread` unless `--new-thread` creates a thread; tests cover `thread/start`, `thread/name/set`, `turn/start`, `thread/read`, fallback, and explicit-thread posting. | Live app-server daemon availability is environment-dependent; fallback path is covered. |
| No current-thread guessing | Verified | `desktop result --thread` requires an explicit thread id; `thread/list` is used only after a created thread id exists for confirmation/fallback. | v1.7 must preserve this invariant for worker threads. |
| v1.3 worker adapter abstraction | Verified | `src/adapters/worker-adapter.ts` defines `codex-sdk-headless` plus native adapter names; unsupported native adapters throw `WorkerAdapterUnavailableError`; fallback runs only when `fallback_worker_adapter` is configured. | `codex-app-thread` is intentionally not live in this baseline. |
| Adapter runtime schema | Verified | `tests/workflow-schema.test.ts` accepts public Codex adapter names and rejects `ollama`. | No private adapters in public core. |
| Reducer adapter independence | Verified | Existing reducer tests preserve runtime metadata in worker provenance. | v1.7 needs a stronger mixed SDK/app-thread fixture after live adapter implementation. |
| v1.4 gated writes | Verified | `workflows/doc-refresh.yaml` declares writes and a gate; tests cover preview-before-write, approve/resume write, reject-before-write, target-diff-change failure, rollback, verification, and manifest artifacts. | App-thread workers remain read-only for v1.7. |
| Write sandbox boundary | Verified | `src/adapters/codex-write.ts` uses Codex SDK `workspace-write`; fixture worker JSON records `sandbox: workspace-write` and `approval_policy: never` after CWF gate approval. | Approval is currently CWF gate approval, not per-action interactive Codex approval. |
| v1.5 GitHub PR artifacts | Verified | `scripts/smoke-cli.sh` creates local comment/review artifacts; `tests/github-pr.test.ts` requires completed runs, requires explicit repo/PR before posting, and leaves local artifacts when `gh` fails. | Real GitHub posting was not run; mocked path covers command construction and failure handling. |
| v1.6 workflow suggestions | Verified | `tests/workflow-suggestion.test.ts` covers valid suggestion creation, explicit output path, no overwrite, `--from-run`, diagnostics, and registry unchanged; smoke validates generated YAML and confirms `Installed: no`. | Suggestions are deterministic local templates, not model-generated workflow design. |
| Generated JavaScript / private routing boundary | Verified | Suggestion tests assert no `generated JavaScript` / `eval(` in generated YAML; schema rejects non-Codex runtime adapters. | Keep this boundary when adding any future registry/sharing feature. |
| `ACCEPTANCE.md` as completion source | Partial / documentation caveat | It has useful criteria and evidence binding, but many boxes remain unchecked even where code/tests now exist. | Do not use it alone to answer "is v1.1-v1.6 done"; use `GOAL_CHECKLIST.md` and command output. |

## v1.7 Readiness

Safe to use as v1.7 foundation:

- app-server capability probe and explicit result-return transport;
- worker adapter registry and fallback contract;
- worker JSON runtime metadata envelope;
- reducer provenance;
- gated write boundary;
- CLI smoke and package smoke.

v1.7 must add, not assume:

- live `codex-app-thread` worker implementation;
- fake app-server worker tests;
- mixed SDK/app-thread reducer fixture;
- live app-server worker-thread smoke with real worker `thread_id` and `turn_id` values when available;
- explicit proof that `thread/list` is not used to choose the initiating/current thread.

## Recommended Next Step

Proceed with v1.7 Worker App Threads, but start with the fake app-server test before touching live Desktop behavior.

Do not start v1.8 managed-agent scheduling yet. The pre-v1.7 audit supports the current plan: prove native worker threads first, then decide whether scheduling is still necessary.
