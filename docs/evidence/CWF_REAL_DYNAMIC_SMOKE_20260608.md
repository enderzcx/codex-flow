---
half_life: 30d
archive_at: 2026-07-08
scope_type: evidence
scope_name: cwf-real-dynamic-smoke-20260608
verification_level: local
status: blocked_then_fixed_locally
review_status: reasonix_go
review_command: reasonix run -m deepseek-v4-pro:cloud --effort high --transcript /tmp/cwf-fix-reasonix-review.jsonl
---

# CWF Real Dynamic Smoke 2026-06-08

This file records the checked-in evidence for the local Codex Workflows dynamic smoke run. It is local proof only. It is not npm publish, release, hosted scheduler, marketplace, or platform automatic callback proof.

## Scope

- Repository: `/Users/sunny/Work/CODEX/codex-workflows`
- Workflow template: `workflows/repo-audit.workflow.js`
- Run id: `real_dynamic_smoke_20260608202243`
- Pattern: `fan-out-and-synthesize`
- Objective: audit current CWF helper changes for compatibility and evidence honesty.

## Worker Execution

| Worker | Runtime | Result |
|---|---|---|
| tests | native Codex explorer subagent | Returned marker `CWF_NATIVE_TESTS_EXPLORER_OK`; verdict `BLOCKED` on helper help coverage and evidence provenance. |
| maintainability | native Codex explorer subagent | Returned marker `CWF_NATIVE_MAINT_EXPLORER_OK`; verdict `BLOCKED` on stale review metadata, narrative-only E2 evidence, and untracked helper risk. |
| correctness | Codex Desktop app-server stdio thread | Returned marker `CWF_DESKTOP_CORRECTNESS_WORKER_OK_20260608`; verdict `BLOCKED` on stale/overstrong E2 evidence wording. |

Desktop thread evidence:

- Thread id: `019ea731-ccc4-7d40-8038-c9703c395f7b`
- Turn id: `019ea731-d253-7eb2-af42-cd3d297e26f0`
- Thread name: `CWF real dynamic worker 1780921519228`
- `thread/read` contained the marker.
- `thread/list` found the thread in cwd `/Users/sunny/Work/CODEX/codex-workflows`.

## Findings From The Smoke

1. `node scripts/cwf-run-plan.mjs --help` failed because `--help` was parsed as the workflow path.
2. The E2 Desktop-thread wording was stronger than the checked-in evidence. It had thread ids and markers, but no durable evidence document or transcript reference in the repository.
3. `scripts/lib/cli.mjs` was untracked while changed scripts imported it.

## Follow-Up Fix

- `scripts/cwf-run-plan.mjs` now handles `--help` explicitly.
- `scripts/check-core.mjs` now executes helper `--help` commands, including `cwf-run-plan.mjs`, so CLI entrypoint regressions are guarded.
- This checked-in evidence file is the durable local artifact for the dynamic smoke. `.cwf/runs/real_dynamic_smoke_20260608202243/` remains a local ignored runtime artifact.
- `scripts/lib/cli.mjs` must be staged with the scripts that import it.

## Follow-Up Validation

Validated commands:

```bash
node scripts/cwf-run-plan.mjs --help
npm run check
git diff --check
npm pack --dry-run --json
```

Expected result:

- `cwf-run-plan.mjs --help` exits 0 and prints usage.
- `npm run check` includes helper help command smoke and passes.
- `git diff --check` passes.
- `npm pack --dry-run --json` includes `scripts/lib/cli.mjs` and excludes `.cwf/`.
- Reasonix final review returns GO with no blocker/high findings.

## Boundary

This evidence proves local coordinator synthesis plus Codex Desktop thread creation/execution/readback. Platform-level automatic callback into the originating conversation remains deferred and unproven.
