---
half_life: 30d
archive_at: 2026-07-08
scope_type: evidence
scope_name: cwf-release-readiness
verification_level: local
real_smoke_status: local_fixture_and_safe_write_disposable_real_smoke
review_status: reasonix_go
reviewer: reasonix-v4pro
review_command: reasonix run -m deepseek-v4-pro:cloud --effort high --transcript /tmp/cwf-full-implementation-review-2.jsonl
review_notes: First full implementation pass blocked on missing E8 expensive-run warning and unbounded refusal fixtures. E8 was implemented in `cwf-run-preview.mjs` and `check-core.mjs`, E2 was relabeled `deferred_with_fixture_only`, and second pass returned GO.
---

# CWF Release Readiness

This checklist tracks public-release readiness evidence. It is not an npm publish, git tag, deploy, hosted scheduler, marketplace launch, or platform-callback proof.

## Local Readiness Checklist

| Gate | Required evidence | Status |
|---|---|---|
| Core check | `npm run check` | required before release decision |
| Whitespace diff check | `git diff --check` | required before release decision |
| Package dry-run | `npm pack --dry-run --json` | required before release decision |
| Old runtime absence | `src/`, `package-lock.json`, and `tsconfig.json` absent | required before release decision |
| Package contents | README, docs, skill, workflows, scripts included; `.cwf/` excluded | required before release decision |
| False callback claim audit | No source claims proven platform callback return without real smoke | required before release decision |
| Final review | Reasonix/v4Pro GO or blocker/high findings handled or explicitly waived | pass: `/tmp/cwf-full-implementation-review-2.jsonl` |

## Enhancement Evidence Map

| Phase | Current implementation evidence |
|---|---|
| E1 Return envelope | `scripts/cwf-return-envelope.mjs`; `cwf-run-state init/update` writes `.cwf/runs/RUN_ID/return-envelope.json`; `npm run check` validates required fields and deferred platform callback status. |
| E2 Desktop-thread preflight | `deferred_with_fixture_only`: no new visible Desktop thread was created for the enhancement goal. Existing MVP Desktop-thread smoke is historical proof of visible thread creation and manual coordinator synthesis, not platform automatic callback. |
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
- Enhanced Desktop-thread execution preflight requires explicit Ender GO before creating a visible thread.
- Further safe-write real-smoke requires explicit approval for the disposable `/tmp` target and exact write scope.
- npm publish, git tag, deploy, hosted scheduler, and marketplace behavior are out of scope unless Ender explicitly requests them.
