---
half_life: 30d
archive_at: 2026-07-06
scope_type: roadmap
scope_name: CWF current-vs-complete gap
coverage: Self-contained current state and remaining gap summary for CWF complete-state goal execution.
not_complete_for: Runtime implementation, exact Claude parity, hosted scheduling, unrestricted JS, non-Codex routing, production deploys, database/credential/payment/permission writes.
verification_level: docs-only
real_smoke_status: not_required
review_status: reviewed
reviewer: reasonix-v4pro
review_command: crb delegate --mode final-review --json review-payload-for-cwf-complete-state-delivery-pack
review_notes: Added to resolve Reasonix high finding that the delivery pack lacked current-vs-target context; rereview approved with no unresolved blocker/high/real medium findings.
review_owner: Codex
review_due: 2026-06-06
---

# Current vs Complete

Use this before starting any CWF complete-state goal. It prevents future goal-mode runs from rebuilding already-completed pieces.

## Snapshot

| Layer | Current state | Complete state | Next action |
|---|---|---|---|
| Static workflows | Stable CLI workflows exist. | Keep as reliable repeatable base. | No rebuild needed. |
| Safe writes | v1.10 safe write workers exist for gated bounded patch flow; dynamic `cwf.safePatch.apply` now reuses the same parent-applied policy/verification path. | Dynamic workflows can call the same guarded safePatch path. | Keep expanding only through explicit write policies and focused fixtures. |
| Dynamic JS runtime | v1.11 preview branch supports local `workflow.js` preview, approval gate, AST policy, child runtime, CWF APIs, and `cwf dynamic generate`. | Codex can generate the script from user intent and run it through the same guarded path. | Productize after local/CI smoke and review. |
| Same-conversation return | Skill wrapper/manual result handoff is the intended default. | Runs launched from Codex reliably return concise result summaries to the initiating conversation. | Phase B productizes this path. |
| Worker visibility | App-thread worker path exists with capability/probe constraints. | Read-only workers can be Desktop-visible threads when execution preflight succeeds. | Phase C hardens and documents this as a user-facing surface. |
| Write worker visibility | Safe writes run through isolated patch application, not Desktop app-thread writes. | Write workers remain safePatch/inherit-session controlled; no hidden Desktop direct writes. | Keep Desktop app-thread writes refused until Codex exposes stable approval/write support. |
| Built-in modes | Static catalog plus two local dynamic templates: `change-summary` and `docs-change-check`. | Dynamic catalog can grow toward deep research, repo audit, migration, adversarial review, safe fix loop, root cause, rule mining, tournament, triage quarantine, and rubric eval. | Add future templates one at a time with fixture and smoke coverage. |
| Save/reuse | Local YAML registry exists; dynamic JS can also be saved under local SHA-bound trust metadata and run by id. | Approved dynamic scripts can become local templates or skills with trust metadata. | Keep remote/public registry behavior inspect-first. |
| Native UI parity | CLI status/watch/artifacts; no Claude `/workflows` panel. | Codex-native best effort: same-conversation summaries, visible worker threads, artifact links, optional explicit new thread. | Do not claim exact Claude UI parity. |

## Already Built: Do Not Rebuild

- static YAML workflow engine;
- workflow registry/list/show/validate;
- run store, status, watch, result, list/show/latest;
- reducer envelopes and artifact manifests;
- gated safe write path for bounded patches;
- preview-first local dynamic JS execution on the v1.11 preview branch;
- app-thread preflight concept and fallback recording.

## Still To Build

1. Productize and release the Phase A `cwf dynamic generate` preview after local/CI smoke and review.
2. Default same-conversation result return polish.
3. Worker-thread visibility as a documented read-only execution path.
4. Additional dynamic templates beyond the first two implemented-preview templates.
5. Broader save/reuse packaging as skills.
7. Public docs and skill routing that explain stable vs preview vs planned surfaces.

## Human Rule

If a future goal starts by rebuilding the static engine, the safe-write engine, or the v1.11 local dynamic JS runtime, it is probably doing the wrong job.
