---
half_life: 30d
archive_at: 2026-07-08
scope_type: evidence
scope_name: cwf-release-readiness
verification_level: local
real_smoke_status: sdk_native_desktop_safe_write_heartbeat_real_smoke_passed
review_status: reasonix_followup_go_after_heartbeat_fix
reviewer: reasonix-v4pro
review_command: reasonix run -m deepseek-v4-pro:cloud --effort high --transcript /tmp/cwf-fix-reasonix-review.jsonl
review_notes: First full implementation pass blocked on missing E8 expensive-run warning and unbounded refusal fixtures. E8 was implemented in `cwf-run-preview.mjs` and `check-core.mjs`, E2 was relabeled `deferred_with_fixture_only`, and second pass returned GO. A later real dynamic smoke found helper-help and evidence-honesty blockers; the fixes added helper help guards and checked-in evidence. Heartbeat follow-up fixed the one-shot RRULE issue and Reasonix review returned GO with no blocker/high findings.
---

# CWF Release Readiness

This checklist tracks public-release readiness evidence. It is not an npm publish, git tag, deploy, hosted scheduler, marketplace launch, or platform-callback proof.

## Local Readiness Checklist

| Gate | Required evidence | Status |
|---|---|---|
| Core check | `npm run check` | required before release decision |
| Whitespace diff check | `git diff --check` | required before release decision |
| Package dry-run | `npm pack --dry-run --json` | required before release decision |
| Old runtime absence | `src/` and `tsconfig.json` absent; `package-lock.json` allowed only because `@openai/codex-sdk` is a legitimate runtime dependency | required before release decision |
| Package contents | README, docs, skill, workflows, scripts included; `.cwf/` excluded | required before release decision |
| False callback claim audit | No source claims proven platform callback return without real smoke | required before release decision |
| Final review | Reasonix/v4Pro GO or blocker/high findings handled or explicitly waived | pass: `/tmp/cwf-full-implementation-review-2.jsonl`; heartbeat follow-up pass: `/tmp/cwf-heartbeat-fix-reasonix-2.jsonl` |

## Enhancement Evidence Map

| Phase | Current implementation evidence |
|---|---|
| E1 Return envelope | `scripts/cwf-return-envelope.mjs`; `cwf-run-state init/update` writes `.cwf/runs/RUN_ID/return-envelope.json`; `npm run check` validates required fields and deferred platform callback status. |
| Full native runtime v1 real smoke | `scripts/cwf-start.mjs` initializes controller artifacts; `scripts/cwf-worker-sdk.mjs` now calls `@openai/codex-sdk` for real marker runs; host-native `spawn_agent` explorers returned to the coordinator. Checked-in evidence: [docs/evidence/CWF_FULL_NATIVE_RUNTIME_REAL_SMOKE_20260609.md](evidence/CWF_FULL_NATIVE_RUNTIME_REAL_SMOKE_20260609.md). Fixture evidence remains in [docs/evidence/CWF_FULL_NATIVE_RUNTIME_FIXTURES_20260608.md](evidence/CWF_FULL_NATIVE_RUNTIME_FIXTURES_20260608.md). |
| E2 Desktop-thread preflight | `desktop-thread-stdio-observed`: the failed probe used the wrong path (`codex app-server proxy` against the remote-control socket). The correct path is a fresh `codex app-server --listen stdio://` JSONL session. Historical evidence recorded thread `019ea726-a070-73f2-b182-602b905cd9ec` and marker `CWF_LEFT_THREAD_TURN_OK_20260608`. Latest checked-in local dynamic smoke evidence is [docs/evidence/CWF_REAL_DYNAMIC_SMOKE_20260608.md](evidence/CWF_REAL_DYNAMIC_SMOKE_20260608.md). This proves Desktop-thread creation/execution/readback locally, not platform automatic callback. |
| E3 Resume/checkpoint | `scripts/cwf-run-state.mjs` resumes only from the last contiguous completed phase boundary; `npm run check` covers completed, blocked, failed, skipped, missing, and partial fixtures. |
| E4 Safe write | `scripts/cwf-safe-write.mjs` evaluates approval gate, changed paths, forbidden/out-of-scope paths, apply-check result, verification status, changed files, and rollback command. A disposable `/tmp` git-repo real-smoke passed after approval with `git apply --check`, apply, verification, changed files, and rollback evidence. |
| E5 Dynamic generation | `scripts/cwf-generate-workflow.mjs` generates bounded data-only repo-audit and safe-fix-loop workflows and rejects unsafe generated content tokens. |
| E6 Catalog/user workflows | `scripts/cwf-catalog.mjs` contains built-in catalog metadata and project-local `.cwf/workflows/*.workflow.js` discovery with fail-closed validation. |
| E7 Verifier gates | `scripts/cwf-safe-write.mjs` implements `pass`, `blocked`, `needs-waiver`, and `advisory`; `blocked` and unwaived findings prevent final pass. |
| E8 Budget/cost | Preview helpers fail closed without `budget.max_tokens` or `budget.stop_when`, warn before workers run when `max_tokens > 50000`, and label local token accounting as `estimated`. `npm run check` covers expensive-run warning and unbounded-refusal fixtures. |
| E9 Human status UX | `scripts/cwf-run-state.mjs status` includes conclusion, phase, worker counts, blocker, evidence, next action, final destination, return mode, and verifier status. Final summaries start with a Chinese conclusion. |
| E10 Public readiness | This file plus README/docs/skill synchronization, package dry-run, old-runtime absence, and final review. |

## Deferred Or Approval-Gated Items

- Platform-level automatic callback remains deferred until Codex exposes a stable API and a real smoke proves it.
- SDK real-smoke, host-native subagent smoke, visible Desktop-thread real-smoke, disposable `/tmp` safe-write apply smoke, and no-count heartbeat return smoke passed on 2026-06-09. Do not use `FREQ=MINUTELY;INTERVAL=1;COUNT=1` for heartbeat proof; the passing probe used `FREQ=MINUTELY;INTERVAL=1` and cleaned up the automation after delivery.
- Enhanced Desktop-thread execution preflight must use `codex app-server --listen stdio://` JSONL. Do not use `codex app-server proxy` as the worker creation path unless its remote-control protocol is separately proven.
- Further safe-write real-smoke requires explicit approval for the disposable `/tmp` target and exact write scope. The 2026-06-09 approved smoke used `/tmp/cwf-safe-write-smoke-20260609` and changed only `src/allowed.txt`.
- npm publish, git tag, deploy, hosted scheduler, and marketplace behavior are out of scope unless Ender explicitly requests them.
