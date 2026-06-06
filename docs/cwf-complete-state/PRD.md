---
half_life: 30d
archive_at: 2026-07-06
scope_type: roadmap
scope_name: CWF complete-state PRD
coverage: Product requirements for the complete CWF dynamic workflow experience across multiple implementation phases.
not_complete_for: One-shot implementation, exact Claude parity, hosted managed agents, unrestricted JavaScript, non-Codex routing, production deploy automation, or broad autonomous writes.
verification_level: docs-only
real_smoke_status: not_required
review_status: reviewed
reviewer: reasonix-v4pro
review_command: crb delegate --mode final-review --json review-payload-for-cwf-planning-docs-after-trq212-minli
review_notes: Derived from reviewed complete-state and usage plans.
review_owner: Codex
review_due: resolved 2026-06-06
---

# PRD: CWF Complete-State

## Problem

Long Codex conversations can solve hard work, but they are a poor place to hold every phase, worker output, hypothesis, budget, gate, and artifact.

The failure modes are familiar:

- the agent finishes too early;
- one theory dominates because the same agent is judging itself;
- constraints disappear after many turns;
- raw logs and worker findings pollute the main conversation;
- untrusted input and high-permission actions mix;
- large runs spend too much time or token budget without a hard stop.

Claude Dynamic Workflows are compelling because they create a task-specific harness. CWF should deliver the same kind of outcome for Codex users, without copying Claude's product internals or bypassing Codex-native permissions.

## Target Users

- Codex users doing complex repo audits, reviews, migrations, investigations, or controlled fixes.
- Maintainers who need repeatable workflows with artifacts and evidence.
- Skill authors who want a safe local workflow layer around Codex.
- Public users comparing CWF with Claude Dynamic Workflows.

## Product Goal

CWF is complete when a user can ask:

> Run a dynamic workflow to audit this repo for auth risks and fix only the small safe issues after review.

And the system can:

1. decide that CWF is the right tool;
2. generate a task-specific `workflow.js`;
3. show a readable preview before execution;
4. pause for approval;
5. run through constrained CWF APIs and Codex workers;
6. surface read-only workers as Desktop threads when app-thread execution is available;
7. keep writes behind `safePatch` or tightly capped trusted `inherit-session`;
8. store full run evidence;
9. return the final reduced result to the initiating Codex conversation;
10. let the user save the workflow as a local template or skill.

## Goals

- Intent-to-workflow: Codex can turn a user request into a previewable workflow harness.
- Preview-first safety: the user sees purpose, phases, workers, budgets, permissions, write policy, and stop rules before execution.
- Same-conversation result: the default user experience returns the result to the initiating Codex thread.
- Worker visibility: read-only workers can be visible Codex Desktop threads when real app-thread execution is available.
- Safe writes: dynamic workflows cannot write directly; bounded writes use policy, gates, patch checks, verification, and rollback evidence.
- Built-in modes: common patterns are available without users designing every workflow.
- Save/reuse: approved workflows can become local templates or skills with trust metadata.

## Non-Goals

- No exact Claude product parity claim.
- No unrestricted JavaScript runtime.
- No hidden writes.
- No direct JavaScript filesystem, network, shell, package import, or target repo access.
- No non-Codex model routing in the public core.
- No hosted queue, scheduler, daemon, or managed-agent platform in this roadmap.
- No production deploys, database writes, credentials, payments, permissions, or external messages without a separate high-risk plan and explicit approval.

## User Stories

1. As a Codex user, I can ask for a complex workflow in plain language and receive a preview before anything runs.
2. As a cautious user, I can approve or reject the generated workflow before execution.
3. As a reviewer, I can inspect worker outputs, run artifacts, and the reducer result after completion.
4. As a Codex Desktop user, I can see read-only worker threads when the host supports real execution.
5. As a maintainer, I can keep write-capable work bounded to allowed paths and verified commands.
6. As a repeat user, I can save a good workflow as a reusable local template.
7. As a public user, I can tell which features are stable, preview, or planned.

## Success Criteria

- Generated workflow preview exists before execution.
- Invalid generated scripts fail before execution.
- Same-conversation result return is the default Codex UX.
- Read-only app-thread workers have real execution preflight and explicit fallback.
- Safe writes cannot bypass gate, path policy, patch check, verification, or rollback evidence.
- Dynamic modes cover research, audit, migration, adversarial review, safe fix loop, root-cause investigation, rule mining, tournament selection, quarantine triage, and rubric eval.
- Docs never imply exact Claude parity, unrestricted writes, or shipped behavior that is only planned.
