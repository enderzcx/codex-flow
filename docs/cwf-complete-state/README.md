---
half_life: 30d
archive_at: 2026-07-06
scope_type: roadmap
scope_name: CWF complete-state delivery pack
coverage: Index for the PRD, SPEC, acceptance matrix, and staged goal prompts that turn the CWF complete-state plan into implementable phases.
not_complete_for: Runtime implementation, exact Claude parity, hosted scheduling, unrestricted JavaScript, non-Codex model routing, production deploy automation, or broad autonomous writes.
verification_level: docs-only
real_smoke_status: not_required
review_status: reviewed
reviewer: reasonix-v4pro
review_command: crb delegate --mode final-review --json review-payload-for-cwf-planning-docs-after-trq212-minli
review_notes: Based on the reviewed CWF complete-state plan and usage guide; no blocker/high/real medium issues in the source plan.
review_owner: Codex
review_due: resolved 2026-06-06
---

# CWF Complete-State Delivery Pack

This folder is the handoff pack for making Codex Flow feel like Claude-style dynamic workflows while staying Codex-native.

Use this pack when a future Codex goal needs the concrete PRD, SPEC, acceptance criteria, or phase prompt without reading the long roadmap first.

## Files

| File | Use it for |
|---|---|
| `PRD.md` | Product intent: who this is for, what "complete" means, what not to build. |
| `SPEC.md` | Runtime contract: flow, APIs, safety boundaries, result return, save/reuse. |
| `CURRENT_VS_COMPLETE.md` | What already exists, what complete state still needs, and what future goals must not rebuild. |
| `ACCEPTANCE.md` | Evidence-bound checklist for each phase. |
| `GOAL_PROMPTS.md` | Copy-ready staged `/goal` prompts from Phase A through Phase G. |

## Source Of Truth

This pack is extracted from:

- `docs/CWF_COMPLETE_STATE_PLAN.md`
- `docs/WHEN_TO_USE_CWF.md`
- trq212's "A harness for every task" breakdown
- MinLi's Chinese annotated dynamic workflow breakdown

## Human Summary

CWF complete-state means:

1. Codex decides CWF is worth using.
2. Codex generates a task-specific `workflow.js`.
3. CWF previews the plan, workers, budgets, permissions, and stop rules.
4. The user approves before execution.
5. Workers run through Codex-native execution paths.
6. Read-only workers may become visible Desktop threads when available.
7. Writes only happen through `safePatch` or tightly capped trusted `inherit-session`.
8. The initiating Codex conversation receives the final reduced result.
9. Good workflows can be saved as local templates or skills.

This is not an exact Claude clone. It is the Codex-native version: Codex remains the brain and permission boundary; CWF is the plan/evidence/gate/reducer layer.

## Before Opening A Goal

Read `CURRENT_VS_COMPLETE.md` first. The most important boundary is:

> v1.11 already has preview-first local dynamic `workflow.js` execution on the current preview branch. Phase A adds Codex-generated workflow authoring; it should not rebuild the dynamic runtime.
