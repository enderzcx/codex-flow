---
half_life: 7d
archive_at: 2026-06-15
scope_type: evidence
scope_name: cwf-mvp-completion
verification_level: local
real_smoke_status: inline_native_passed_desktop_requires_approval
review_status: reasonix_second_pass_go
---

# CWF MVP Evidence

## Status Table

| Surface | Status | Evidence |
|---|---|---|
| Phase 1 run-plan generation | local pass | `node scripts/cwf-run-plan.mjs workflows/repo-audit.workflow.js --objective "audit this repo" --run-id smoke`; `node scripts/cwf-run-plan.mjs workflows/adversarial-verify.workflow.js --objective "verify roadmap" --run-id smoke-adv --format json`; `rg -n "## Scope\|## Exclusions\|## Workers\|## Verifier\|## Quarantine\|## Budget\|## Stop Rules\|## Evidence\|## Resume Checkpoint" .cwf/runs/smoke/run-plan.md .cwf/runs/adversarial-smoke/run-plan.md` |
| Phase 1 persisted state | local pass | `node scripts/cwf-run-state.mjs init --run-id state-smoke --workflow workflows/repo-audit.workflow.js --objective "audit this repo"` created `final.md`, `preview.md`, `run-plan.md`, and `state.json`. |
| Phase 2 native inline repo-audit | real-smoke pass | Native `explorer` subagents returned in the originating conversation for correctness, tests, and maintainability. Findings were applied where required. No Desktop thread was created. |
| Phase 3 adversarial verifier participation | fixture pass | `node scripts/cwf-run-plan.mjs workflows/adversarial-verify.workflow.js --objective "verify roadmap" --run-id smoke-adv --format json` shows `correctness-challenger`, `safety-challenger`, and `evidence-checker`. |
| Phase 3 verifier blocker prevents PASS | fixture pass | `node scripts/cwf-run-state.mjs init --run-id adversarial-blocked --workflow workflows/adversarial-verify.workflow.js --objective "verify unsupported Desktop automatic callback claim"` then `node scripts/cwf-run-state.mjs phase --run-id adversarial-blocked --phase verify --status blocked --evidence "Verifier blocks PASS: platform-level automatic callback is not observed; roadmap marks automatic return as not currently proven."` |
| Phase 4 Desktop-thread visibility | requires_approval | No Desktop worker thread was created because Ender has not given explicit `GO` for one selected Desktop-thread smoke. This is not claimed as real Desktop proof. |
| Phase 4 automatic return | deferred | Same-conversation manual synthesis is required and observed for native inline subagents. Platform-level automatic callback remains unproven and must not be claimed. |
| Phase 5 repo-audit path | real-smoke pass | Three native inline repo-audit explorers returned to the coordinator; the coordinator applied required findings and kept final synthesis in this conversation. |
| Phase 5 adversarial path | fixture pass | Adversarial preview and blocked-state fixture prove verifier roles and blocked completion semantics locally. |
| Phase 5 safe-fix-loop path | dry-run pass | `node scripts/cwf-run-plan.mjs workflows/safe-fix-loop.workflow.js --objective "dry-run a bounded fix without writing real target files" --run-id safe-fix-dry-run`; `node scripts/cwf-run-preview.mjs workflows/safe-fix-loop.workflow.js --format json`; no real target files were modified by this dry-run. |
| Package/core boundary | local pass | `npm run check`; `git diff --check`; `npm pack --dry-run --json`; `for p in src package-lock.json tsconfig.json; do [ ! -e "$p" ] && echo "ABSENT $p"; done`. |
| Final review | GO | `crb delegate --mode final-review --background ...` failed with `unknown option '--mode'`; first packet-based `reasonix run -m deepseek-v4-pro:cloud --effort high ...` returned BLOCKED for missing embedded native subagent evidence and safe-fix-loop guards; fixes were applied; second packet-based Reasonix review returned GO. Transcripts: `/tmp/cwf-reasonix-packet-review.jsonl`, `/tmp/cwf-reasonix-packet-review-2.jsonl`. |

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

## Known Limits

- Desktop-thread smoke is approval-gated and remains `requires_approval`.
- Platform-level automatic callback into the originating conversation is not proven.
- `safe-fix-loop` evidence is dry-run/write-shaped only in this goal.
- Reasonix/v4Pro direct shell/file review was unavailable, so final review used packet-based Reasonix. The second packet review returned GO.
- This evidence does not include npm publish, git tag, production deploy, hosted scheduler, marketplace, non-Codex model routing, or full Claude Dynamic Workflows parity.
