---
half_life: 7d
archive_at: 2026-06-15
scope_type: evidence
scope_name: cwf-mvp-completion
verification_level: local
real_smoke_status: inline_native_desktop_thread_sdk_native_subagents_safe_write_heartbeat_real_smoke_20260609_auto_callback_deferred
review_status: reasonix_followup_go_after_heartbeat_fix
---

# CWF MVP Evidence

## Status Table

| Surface | Status | Evidence |
|---|---|---|
| Phase 1 run-plan generation | local pass | `node scripts/cwf-run-plan.mjs workflows/repo-audit.workflow.js --objective "audit this repo" --run-id smoke`; `node scripts/cwf-run-plan.mjs workflows/adversarial-verify.workflow.js --objective "verify roadmap" --run-id smoke-adv --format json`; `rg -n "## Scope\|## Exclusions\|## Workers\|## Verifier\|## Quarantine\|## Budget\|## Stop Rules\|## Evidence\|## Resume Checkpoint" .cwf/runs/smoke/run-plan.md .cwf/runs/adversarial-smoke/run-plan.md` |
| Phase 1 persisted state | local pass | `node scripts/cwf-run-state.mjs init --run-id state-smoke --workflow workflows/repo-audit.workflow.js --objective "audit this repo"` created `final.md`, `preview.md`, `run-plan.md`, and `state.json`. |
| Enhancement E1 return envelope | local pass | `scripts/cwf-run-state.mjs init` writes `return-envelope.json`; `npm run check` asserts run id, workflow, final destination, return mode, final summary path, evidence path, verifier status, deferred items, and completion status. |
| Full native runtime controller | fixture pass | `npm run check` runs `scripts/cwf-start.mjs` against `workflows/repo-audit.workflow.js` in a temporary run root and asserts `preview.md`, `run-plan.md`, `state.json`, `return-envelope.json`, `final.md`, `worker-packets/`, and `worker-results/` exist. |
| SDK background worker adapter | fixture + real-smoke pass | `npm run check` runs `scripts/cwf-worker-sdk.mjs` fixture mode and records `CWF_SDK_FIXTURE_OK`. Real SDK smoke on 2026-06-09 ran `@openai/codex-sdk`, returned marker `CWF_SDK_REAL_SMOKE_20260609`, SDK thread id `019ea9cd-8659-7ab2-80a7-71b906175511`, final response, and usage in `.cwf/runs/cwf-full-native-real-20260609/worker-results/correctness.json`. |
| Native subagent adapter | unavailable fixture pass | `npm run check` runs `scripts/cwf-native-subagent.mjs` unavailable mode and records `native-subagent-unavailable` honestly when host-native subagent tools are not exposed to the helper. |
| Desktop-thread adapter failure fixture | fixture pass | `npm run check` runs `scripts/cwf-worker-desktop-thread.mjs` failure fixture and asserts no visible thread id is recorded and status is `desktop-thread-execution-unavailable`. Visible-thread real-smoke still requires explicit Ender GO. |
| Heartbeat return adapter | unavailable fixture pass | `npm run check` runs `scripts/cwf-return-heartbeat.mjs` unavailable mode and records `heartbeat-unavailable` plus a copy-ready resume prompt that reads `.cwf/runs/RUN_ID/final.md`. |
| Full native runtime 2026-06-09 | real-smoke pass | [docs/evidence/CWF_FULL_NATIVE_RUNTIME_REAL_SMOKE_20260609.md](evidence/CWF_FULL_NATIVE_RUNTIME_REAL_SMOKE_20260609.md) records real SDK worker, two host-native subagents, approved visible Desktop-thread `019ea9d6-fbe7-70c0-ac5a-eb3002d30f7e`, approved `/tmp/cwf-safe-write-smoke-20260609` safe-write apply smoke, and no-count heartbeat return marker `CWF_HEARTBEAT_NO_COUNT_PROBE_20260609`. Earlier `COUNT=1` heartbeat attempts did not dispatch and are documented as the root cause. |
| Phase 2 native inline repo-audit | real-smoke pass | Native `explorer` subagents returned in the originating conversation for correctness, tests, and maintainability. Findings were applied where required. No Desktop thread was created. |
| Phase 3 adversarial verifier participation | fixture pass | `node scripts/cwf-run-plan.mjs workflows/adversarial-verify.workflow.js --objective "verify roadmap" --run-id smoke-adv --format json` shows `correctness-challenger`, `safety-challenger`, and `evidence-checker`. |
| Phase 3 verifier blocker prevents PASS | fixture pass | `node scripts/cwf-run-state.mjs init --run-id adversarial-blocked --workflow workflows/adversarial-verify.workflow.js --objective "verify unsupported Desktop automatic callback claim"` then `node scripts/cwf-run-state.mjs phase --run-id adversarial-blocked --phase verify --status blocked --evidence "Verifier blocks PASS: platform-level automatic callback is not observed; roadmap marks automatic return as not currently proven."` |
| Phase 4 Desktop-thread visibility | real-smoke pass | After Ender GO, exactly one same-directory Codex Desktop thread was created: `019ea65c-5b14-7a52-9923-62797c5366ff`. It returned `CWF_DESKTOP_THREAD_SMOKE_OK thread_id=019ea65c-5b14-7a52-9923-62797c5366ff`. |
| Phase 4 automatic return | deferred | The originating coordinator read the Desktop-thread marker through `read_thread` and synthesized it back here. Platform-level automatic callback remains unproven and must not be claimed. |
| Enhancement E2 Desktop execution preflight | observed local smoke | Root cause of the failed optimization probe was the wrong transport path: `codex app-server proxy` against the remote-control socket did not answer the attempted framing. The working path is a fresh `codex app-server --listen stdio://` JSONL session. Historical evidence: `thread/start` created `019ea726-a070-73f2-b182-602b905cd9ec`, `thread/name/set` named it `CWF stdio left-thread smoke 1780920786999`, a separate process required `thread/resume` before `turn/start`, marker `CWF_LEFT_THREAD_TURN_OK_20260608` returned, `thread/read` showed `turns: 1`, and `thread/list` found the thread in `/Users/sunny/Work/CODEX/codex-workflows`. Platform automatic callback remains unproven. Latest checked-in local evidence: [docs/evidence/CWF_REAL_DYNAMIC_SMOKE_20260608.md](evidence/CWF_REAL_DYNAMIC_SMOKE_20260608.md). |
| Real dynamic workflow smoke | blocked then fixed locally | `repo-audit` ran with two native Codex explorer subagents plus one Codex Desktop app-server stdio thread. The dynamic chain proved coordinator synthesis, native subagents, Desktop-thread creation/execution/readback, and run-state blocking. It surfaced helper help/evidence-honesty blockers, which were fixed by adding `cwf-run-plan.mjs --help`, helper help smoke in `check-core`, and this durable evidence document. Details: [docs/evidence/CWF_REAL_DYNAMIC_SMOKE_20260608.md](evidence/CWF_REAL_DYNAMIC_SMOKE_20260608.md). |
| Phase 5 repo-audit path | real-smoke pass | Three native inline repo-audit explorers returned to the coordinator; the coordinator applied required findings and kept final synthesis in this conversation. |
| Phase 5 adversarial path | fixture pass | Adversarial preview and blocked-state fixture prove verifier roles and blocked completion semantics locally. |
| Phase 5 safe-fix-loop path | dry-run pass | `node scripts/cwf-run-plan.mjs workflows/safe-fix-loop.workflow.js --objective "dry-run a bounded fix without writing real target files" --run-id safe-fix-dry-run`; `node scripts/cwf-run-preview.mjs workflows/safe-fix-loop.workflow.js --format json`; no real target files were modified by this dry-run. |
| Enhancement E4 safe-write gate | fixture pass | `npm run check` covers `scripts/cwf-safe-write.mjs` positive approval-gated patch fixture plus negative fixtures for no prior gate, forbidden path, out-of-scope path, conflict patch, verification failure, SDK patch bypass, and Desktop-thread patch bypass. No real target files are modified by the fixture. |
| Enhancement E4 disposable safe-write | real-smoke pass | After approval, a temporary git repo under `/tmp/cwf-safe-write-smoke.oTtSfI` changed only `docs/example.md`. Evidence: `git apply --check change.patch`; `scripts/cwf-safe-write.mjs` returned `status: pass`, `changed_files: ["docs/example.md"]`, and rollback command `git checkout -- 'docs/example.md'`; `git apply change.patch`; verification `test "$(cat docs/example.md)" = new`; rollback command for the disposable target: `git -C /tmp/cwf-safe-write-smoke.oTtSfI checkout -- docs/example.md`. |
| Enhancement E5 dynamic generation | local pass | `npm run check` covers generated repo-audit and safe-fix-loop workflow fixtures from `scripts/cwf-generate-workflow.mjs`, plus unsafe-token negative fixtures for imports, `require`, `process`, `child_process`, `fs`, `fetch`, `eval`, `Function`, and hidden execution patterns. |
| Enhancement E6 catalog/user workflows | fixture pass | `npm run check` validates `scripts/cwf-catalog.mjs` built-in catalog coverage for all eight templates and project-local `.cwf/workflows/*.workflow.js` discovery with fail-closed invalid fixture behavior. |
| Enhancement E7 verifier gates | fixture pass | `npm run check` covers verifier statuses `pass`, `blocked`, `needs-waiver`, and `advisory`; blocked and unwaived findings prevent final pass, advisory remains visible and non-blocking. |
| Enhancement E8 budget controls | fixture pass | `npm run check` covers expensive-run warning (`max_tokens > 50000`), local token accounting labeled `estimated`, and fail-closed fixtures for missing budget or missing stop rule. |
| Enhancement E9 status UX | local pass | `scripts/cwf-run-state.mjs status` outputs conclusion, current phase, worker counts, blocker, evidence, next action, final destination, return mode, final summary path, evidence path, and verifier status. Final summaries begin with a Chinese conclusion. |
| Enhancement E10 release readiness | local pass | [docs/CWF_RELEASE_READINESS.md](CWF_RELEASE_READINESS.md) maps local/package gates and explicitly excludes npm publish, git tag, deploy, hosted scheduler, marketplace, and platform-callback proof. Reasonix final review returned GO in `/tmp/cwf-full-implementation-review-2.jsonl`. |
| Package/core boundary | local pass | `npm run check`; `git diff --check`; `npm pack --dry-run --json`; `src` and `tsconfig.json` absent. `package-lock.json` is now legitimate because `@openai/codex-sdk` is a real dependency for SDK background worker support. |
| Final review | GO | `crb delegate --mode final-review --background ...` failed with `unknown option '--mode'`; first packet-based `reasonix run -m deepseek-v4-pro:cloud --effort high ...` returned BLOCKED for missing embedded native subagent evidence and safe-fix-loop guards; fixes were applied; second packet-based Reasonix review returned GO. Transcripts: `/tmp/cwf-reasonix-packet-review.jsonl`, `/tmp/cwf-reasonix-packet-review-2.jsonl`. |

## Desktop Thread Smoke Evidence

Ender explicitly approved the Desktop-thread smoke in the originating thread. The coordinator created exactly one same-directory Codex Desktop thread and sent a read-only smoke prompt.

| Field | Evidence |
|---|---|
| Thread id | `019ea65c-5b14-7a52-9923-62797c5366ff` |
| Source thread id | `019ea628-73d6-7732-936e-63fa5c0a17a5` |
| Final marker | `CWF_DESKTOP_THREAD_SMOKE_OK thread_id=019ea65c-5b14-7a52-9923-62797c5366ff` |
| Worker evidence line | `Evidence: checked workspace git status on main at HEAD 38c685b; only existing local resume-fix edits are modified.` |
| Return path | Coordinator read the thread result via Codex Desktop `read_thread` and summarized it back in the originating conversation. This proves visible Desktop thread creation plus manual coordinator synthesis, not platform-level automatic callback. |

## Native Inline Subagent Evidence

The Phase 2 / Phase 5 `real-smoke pass` label is based on three native `explorer` subagents spawned from the originating CWF coordinator conversation. They were read-only, returned in the same conversation, and no Desktop thread was created.

| Agent id | Role | Returned evidence | Applied outcome |
|---|---|---|---|
| `019ea62c-e746-7491-95c4-daff55f80454` | correctness | Reported medium drift risk: `cwf-run-state init` could persist state/preview visibility that disagreed with `run-plan.md` when objective text triggered `auto` visibility. Also reported low roadmap review-status conflict. | Fixed by deriving state and run-plan from one `buildRunPlanFromWorkflow` result and synchronizing roadmap review status. |
| `019ea62c-e7de-7461-b35a-fe5df98f310a` | tests | Reported Phase 1 lacked adversarial run-plan coverage in `check-core`, Phase 3 lacked blocked verifier fixture, and Phase 5 lacked evidence-pack coverage. | Fixed by adding adversarial run-plan assertions, phase-blocked status regression, blocked verifier fixture evidence, and this evidence pack. |
| `019ea62c-e87c-7aa3-8341-bbece41d9799` | maintainability | Reported the same state/run-plan drift and review-status conflict, and confirmed the helper stayed data/artifact-only with no bin, `src/`, scheduler, marketplace, model routing, or Desktop thread creation. | Same fixes applied; boundary confirmation preserved. |

Return-path proof: each subagent final response was delivered to the originating workflow coordinator as a subagent completion notification, and the coordinator applied findings in the same conversation before final synthesis.

## Template Inventory

| Template | Evidence level | Notes |
|---|---|---|
| `workflows/adversarial-verify.workflow.js` | fixture | Run-plan JSON and blocked verifier fixture covered. |
| `workflows/code-review.workflow.js` | local | Covered by `npm run check` shape validation, catalog coverage, preview, run-plan, and package dry-run. |
| `workflows/classify-and-act.workflow.js` | local | Covered by `npm run check` shape validation and package dry-run. |
| `workflows/pipeline.workflow.js` | local | Covered by `npm run check` auto-visibility regression for objective-driven follow-up. |
| `workflows/repo-audit.workflow.js` | real-smoke | Used for native inline fan-out smoke and run-plan artifact. |
| `workflows/safe-fix-loop.workflow.js` | dry-run | Write-shaped dry-run only; no approved real writes in this goal. |
| `workflows/tournament.workflow.js` | local | Covered by `npm run check` shape validation and package dry-run. |
| `workflows/ui-copy-review.workflow.js` | local | Covered by `npm run check` shape validation and package dry-run. |

## Subagent Findings Applied

- Correctness/maintainability finding: `cwf-run-state init` could previously generate `state.json` and `run-plan.md` from different preview options; fixed by deriving state and run-plan from the same `buildRunPlanFromWorkflow` result.
- Tests finding: `check-core` now asserts both `repo-audit` and `adversarial-verify` run-plan surfaces, plus objective-driven `auto` visibility and phase-blocked run status.
- Roadmap finding: `docs/CWF_COMPLETION_ROADMAP.md` review status is synchronized between frontmatter and body.
- E2E correctness finding: `refreshResume` previously used the last completed phase even when earlier phases were incomplete; fixed by using the last contiguous completed boundary from Phase 1 and adding a regression in `check-core`.

## Known Limits

- Desktop-thread smoke passed historically after explicit Ender GO.
- A later approved E2 execution-preflight optimization initially failed because it used `codex app-server proxy` and the wrong framing. The corrected `codex app-server --listen stdio://` JSONL path created and ran a visible thread: `019ea726-a070-73f2-b182-602b905cd9ec`, marker `CWF_LEFT_THREAD_TURN_OK_20260608`. The latest checked-in dynamic smoke evidence is [docs/evidence/CWF_REAL_DYNAMIC_SMOKE_20260608.md](evidence/CWF_REAL_DYNAMIC_SMOKE_20260608.md).
- Platform-level automatic callback into the originating conversation is not proven; current proof is manual coordinator synthesis from a visible Desktop thread.
- `safe-fix-loop` evidence is dry-run/write-shaped only in this goal.
- Reasonix/v4Pro direct shell/file review was unavailable, so final review used packet-based Reasonix. The second packet review returned GO.
- This evidence does not include npm publish, git tag, production deploy, hosted scheduler, marketplace, non-Codex model routing, or full Claude Dynamic Workflows parity.
