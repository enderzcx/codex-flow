---
half_life: 30d
archive_at: 2026-07-08
scope_type: version
scope_name: cwf-full-native-runtime-v1-goal
coverage: Copy-ready goal prompt for implementing CWF full native runtime v1 across subagent, SDK, Desktop-thread, heartbeat, state, verifier, budget, and safe-write surfaces.
not_complete_for: Hosted scheduler, marketplace service, non-Codex model routing, unrestricted workflow JavaScript, npm publish, git tag, deploy, or full Claude platform parity.
verification_level: real-smoke
real_smoke_status: required_for_core_native_gates; visible_desktop_thread_and_safe_write_require_explicit_approval
review_status: revised_needs_review
reviewer: reasonix-v4pro
review_command: reasonix run -m deepseek-v4-pro:cloud --effort high
review_notes: Previous GO covered the softer fixture/unavailable contract. This revision makes CWF full native runtime a hybrid skill/coordinator + SDK + helper scripts goal and requires real proof for core native gates before complete.
review_owner: Ender
review_due: 2026-06-09
---

# CWF Full Native Runtime Goal

```text
/goal
Outcome:
Implement CWF full native runtime v1 in /Users/sunny/Work/CODEX/codex-workflows so CWF can actually use the available Codex-native capability surface instead of only documenting it. The final architecture must be hybrid-native: the CWF skill/coordinator invokes Codex host capabilities such as native subagents, Codex Desktop threads, and heartbeat automations; SDK adapters invoke @openai/codex-sdk for background Codex workers; helper scripts create run artifacts, validate policies, and record evidence. Do not try to push all native behavior into standalone Node scripts.

The completed repo must provide a bounded run controller, host-native subagent coordinator procedure, real SDK background worker adapter, selected Codex Desktop app-thread worker path, real return path to the originating Codex conversation for completed runs, unified .cwf/runs/RUN_ID state/result artifacts, verifier/budget/status gates, safe-write integration, updated docs, and evidence that distinguishes fixture/local/real-smoke/deferred behavior.

This is an implementation goal, not a docs-only goal. Do not mark complete if the diff only changes README/docs/goals. Completion requires meaningful code/check/fixture or skill-procedure changes plus synchronized docs.

Important completion rule:
- Fixture, local schema checks, unavailable markers, deferred markers, and record-only helpers are useful diagnostics, but they do not satisfy "full native runtime" completion for core native gates.
- If SDK real worker, selected Desktop-thread worker, host-native subagent execution, or return-to-origin behavior cannot be proven in this environment, mark the goal blocked or partial, explain exactly why in plain Chinese, and do not mark complete.
- The final response must not start with "complete" unless every Core Native Gate below has real proof or an explicit Ender-approved waiver.

Source of truth:
- /Users/sunny/Work/CODEX/codex-workflows/docs/CWF_FULL_NATIVE_RUNTIME_PLAN.md
- /Users/sunny/Work/CODEX/codex-workflows/docs/CWF_ASYNC_RUNTIME.md
- /Users/sunny/Work/CODEX/codex-workflows/docs/CWF_CLAUDE_COMPARISON.md
- /Users/sunny/Work/CODEX/codex-workflows/docs/CWF_MVP_EVIDENCE.md
- /Users/sunny/Work/CODEX/codex-workflows/docs/CWF_RELEASE_READINESS.md
- /Users/sunny/Work/CODEX/codex-workflows/docs/RUN_EXPERIENCE.md
- /Users/sunny/Work/CODEX/codex-workflows/docs/CORE.md
- /Users/sunny/Work/CODEX/codex-workflows/skills/codex-workflows/SKILL.md
- /Users/sunny/Work/CODEX/codex-workflows/scripts/*.mjs
- /Users/sunny/Work/CODEX/codex-workflows/workflows/*.workflow.js
- Official docs: https://developers.openai.com/codex/sdk, https://developers.openai.com/codex/subagents, https://developers.openai.com/codex/workflows, https://developers.openai.com/codex/app-server, https://developers.openai.com/codex/automations

Required work:
1. Contract sync:
   - Keep README.md, README.zh-CN.md, docs/CORE.md, docs/RUN_EXPERIENCE.md, docs/CWF_ASYNC_RUNTIME.md, docs/CWF_CLAUDE_COMPARISON.md, and skills/codex-workflows/SKILL.md aligned with actual behavior.
   - Add guard checks so future edits cannot drop the SDK/background/heartbeat/Desktop-thread callback boundaries.
   - Verify that workflows/repo-audit.workflow.js exists and is package-included before using it for controller smoke.
   - Document the hybrid-native split clearly: skill/coordinator calls Codex host tools; SDK adapter calls @openai/codex-sdk; helper scripts persist state/evidence and enforce policies.
   - Remove or rewrite any wording that implies standalone Node scripts can directly create host-native subagents, inject into the current Codex conversation, or create Desktop left-sidebar threads without a host tool/API.

2. Run controller:
   - Add helper surface such as scripts/cwf-start.mjs plus status/result integration, or an equivalent small helper design.
   - It must create run id, preview, run-plan, state.json, return-envelope.json, final.md, worker-packets, and normalized worker-results under .cwf/runs/RUN_ID/.
   - It must fail closed on missing budget or stop rule before worker dispatch.

3. Host-native subagent execution:
   - Update the skill procedure so the CWF coordinator uses Codex host-native subagent tools when they are exposed in the current session, instead of pretending Node helpers can spawn host subagents.
   - Record agent ids, prompts, summaries, evidence, and statuses into run state.
   - Run a real host-native subagent smoke with at least two read-only workers returning to the coordinator, or mark the goal blocked/partial. A `native-subagent-unavailable` fixture is allowed as diagnostic evidence only and is not enough for complete.

4. SDK background worker adapter:
   - Use @openai/codex-sdk to run quiet background workers that do not need left-sidebar visibility, for example by starting/resuming a Codex SDK thread and running a fixed-marker prompt.
   - Record SDK thread ids, status, result, timeout/cancel state, and errors into worker-results and return-envelope.
   - Do not claim SDK automatic callback or left-sidebar visibility.
   - Provide both a fixture path that does not require credentials and a real-smoke path that records actual SDK id/result.
   - `requires_implementation`, import-only checks, or SDK-unavailable markers do not satisfy completion. If the SDK package/API is missing or broken, install/fix it within the allowed boundary or mark the goal blocked with the exact error.

5. Codex Desktop app-thread worker adapter:
   - Implement the CWF coordinator procedure for selected visible workers to call the Codex Desktop thread host capability when available, and let helper scripts only record the approved thread id, marker, and result.
   - Implement or strengthen a Codex app-server/host-tool preflight for thread creation plus actual marker response.
   - Only create visible Desktop threads after Ender explicitly approves the exact smoke.
   - Record thread id, marker, worker id, and fallback reason.
   - If Desktop thread host tooling is unavailable, record the exact missing capability and mark the goal blocked/partial. `desktop-thread-execution-unavailable` is diagnostic evidence only and is not enough for complete unless Ender explicitly waives Desktop-thread real-smoke.
   - Add a failure fixture proving a failed preflight creates no sidebar noise and records desktop-thread-execution-unavailable.

6. Heartbeat return:
   - Implement the CWF coordinator procedure for background+heartbeat return to the originating Codex conversation using Codex host automation/heartbeat capability when available.
   - The heartbeat prompt must read .cwf/runs/RUN_ID/final.md or result artifacts and post a human summary in the original conversation.
   - Do not use one-shot `COUNT=1` RRULEs for heartbeat proof. Use a supported interval heartbeat such as `FREQ=MINUTELY;INTERVAL=1`, require an observed marker, and pause/delete the automation after delivery.
   - Prove at least one real return-to-origin path: coordinator_synthesis for foreground runs and heartbeat_synthesis for background runs. A copy-ready resume prompt is only fallback evidence and does not satisfy full-native completion for background return.
   - If heartbeat automation is unavailable, generate a copy-ready resume prompt and mark heartbeat-unavailable, but mark the goal partial/blocked unless Ender explicitly waives background heartbeat. If the heartbeat is scheduled but the marker does not appear in the originating thread after the expected window, mark `heartbeat-scheduled-not-returned` and keep Gate E blocked. Do not call this platform automatic callback.

7. Safe-write runtime integration:
   - Connect safe-fix-loop write workers to the run controller.
   - Preserve approval-gated patch flow: preview gate, approve-write, allowed/forbidden path policy, apply check, verification, changed files, rollback.
   - Desktop-thread and SDK workers may propose or inspect patches, but real apply must go through the coordinator safe-write gate.
   - Add a fixture proving Desktop-thread and SDK worker patch proposals cannot bypass coordinator safe-write approval.

8. Verifier, budget, resume, and status gates:
   - Preserve and extend verifier statuses pass, blocked, needs-waiver, advisory.
   - Preserve resume rule: only resume from the last contiguous completed safe boundary from Phase 1.
   - Status/result output must start with a plain Chinese conclusion and include evidence paths, worker counts, blocker, next action, runtime mode, return mode, and verifier status.

9. Dynamic generation and catalog integration:
   - Generated repo-audit and safe-fix-loop workflows must be runnable by the controller.
   - Built-in catalog and project-local workflows must feed into preview/start.
   - Unsafe generated content must fail closed.

10. Evidence, docs, and review:
   - Add or update evidence docs under docs/evidence/.
   - Update release-readiness docs.
   - Run Reasonix/v4Pro final review and apply or explicitly waive blocker/high findings.

Verification:
- npm run check
- git diff --check
- npm pack --dry-run --json
- python3 /Users/sunny/.agents/skills/delivery-planner/scripts/check_delivery_doc.py docs/CWF_FULL_NATIVE_RUNTIME_PLAN.md
- python3 /Users/sunny/.agents/skills/goal-writer/scripts/check_goal_prompt.py docs/goals/CWF_FULL_NATIVE_RUNTIME_GOAL.md
- Source audit: no false claim that SDK worker automatically injects into the originating Codex Desktop conversation; no false claim that Desktop-thread workers auto-inject results into the originating conversation; no false platform automatic callback claim; no claim that SDK workers guarantee left-sidebar visibility; no claim that Desktop-thread workers are default execution.
- Old runtime absence: no old TypeScript runtime src directory and no tsconfig.json. package-lock.json may exist if legitimate npm dependencies such as @openai/codex-sdk are added.
- Controller smoke: a repo-audit run creates preview, run-plan, state, return-envelope, worker-packets, worker-results, and final artifacts.
- Native subagent real-smoke: at least two read-only explorers run through host-native subagent tools and return to the coordinator. If host-native subagent tools are unavailable, final status is blocked/partial, not complete.
- SDK fixture: mock SDK result writes worker-results and state without credentials.
- SDK real-smoke: one tiny SDK background worker actually calls @openai/codex-sdk, returns a fixed marker into worker-results, and records SDK thread id plus finalResponse/items/usage or an equivalent SDK result. Import-only checks and `requires_implementation` fail this gate.
- Desktop-thread failure fixture: failed preflight creates no visible thread and records desktop-thread-execution-unavailable.
- Desktop-thread real-smoke: after Ender GO, the coordinator creates one selected worker as a Codex Desktop left-sidebar thread, receives a fixed marker, and records the thread id. `requires_approval` may pause the goal; `desktop-thread-execution-unavailable` is diagnostic only and does not complete this gate without Ender waiver.
- Heartbeat smoke: background+heartbeat returns a final summary to the originating conversation with an observed marker. `heartbeat-scheduled`, `heartbeat-scheduled-not-returned`, or `heartbeat-unavailable` plus resume prompt is diagnostic only and does not complete this gate without Ender waiver.
- Safe-write fixtures: no-approval, forbidden path, out-of-scope path, conflict, verification failure, and non-coordinator SDK/Desktop-thread patch bypass attempts fail closed.
- Safe-write smoke: after Ender GO, a disposable /tmp git target accepts only an allowed patch, passes verification, records changed files and rollback.
- Reasonix/v4Pro review returns GO or all blocker/high findings are handled.

Core Native Gates:
- Gate A: Hybrid architecture is implemented and documented: skill/coordinator for host tools, SDK for background workers, helper scripts for state/evidence/policy.
- Gate B: SDK real worker runs through @openai/codex-sdk and records a real SDK thread/result marker.
- Gate C: Host-native subagent execution is either proven with real coordinator-spawned read-only workers or the goal is marked blocked/partial.
- Gate D: Selected Desktop-thread worker is proven after Ender approval with a real left-sidebar thread id and marker, or the goal is paused for approval. It cannot silently complete as unavailable.
- Gate E: Return-to-origin behavior is proven for the chosen run mode. Background mode requires real heartbeat_synthesis unless Ender explicitly waives it.
- Gate F: Safe-write apply remains coordinator-gated; SDK/Desktop workers can propose patches but cannot apply them directly.
- Gate G: Final evidence and final response include a plain Chinese truth table of real-complete, fixture-only, unavailable, blocked, and waived items.

Constraints:
- CWF remains Codex-native: skill + harness specs + helper scripts + host-native subagents + Codex SDK + Codex Desktop app-thread + Codex heartbeat where available.
- CWF full native runtime is a hybrid host workflow, not a pure Node runtime. Node helpers must not claim host-only powers; they can create artifacts, validate contracts, call SDK APIs, and record host/coordinator results.
- workflow.js remains data/spec harness and must not be executed as unrestricted Node code.
- Final result returns by coordinator_synthesis or heartbeat_synthesis. Platform automatic callback remains deferred unless a future official API and real smoke prove it.
- Desktop threads are selective visibility upgrades, not default worker execution.
- Safe writes remain approval-gated and bounded.
- Evidence labels must stay honest: fixture, dry-run, local, real-smoke, deferred, unavailable, and prod are not interchangeable.
- Public docs default to Chinese README with English entry preserved.

Boundaries:
Allowed writes:
- /Users/sunny/Work/CODEX/codex-workflows/README.md
- /Users/sunny/Work/CODEX/codex-workflows/README.zh-CN.md
- /Users/sunny/Work/CODEX/codex-workflows/docs/**
- /Users/sunny/Work/CODEX/codex-workflows/docs/goals/**
- /Users/sunny/Work/CODEX/codex-workflows/docs/evidence/**
- /Users/sunny/Work/CODEX/codex-workflows/skills/codex-workflows/SKILL.md
- /Users/sunny/Work/CODEX/codex-workflows/scripts/**
- /Users/sunny/Work/CODEX/codex-workflows/workflows/*.workflow.js
- /Users/sunny/Work/CODEX/codex-workflows/package.json only if needed for scripts/files metadata, not for publishing
- /Users/sunny/Work/CODEX/codex-workflows/fixtures/** or /Users/sunny/Work/CODEX/codex-workflows/test-fixtures/** if deterministic fixtures are needed
- Disposable local smoke targets under /tmp only after explicit approval for safe-write tests

Do not edit:
- Production systems, credentials, deploy configs, databases, payment systems, permission systems, customer data, external services, global Codex config, unrelated repositories, npm registry state, git tags, or release channels.
- Real project target files through safe-write smoke unless Ender explicitly approves that exact scope.

Forbidden:
- Do not mark complete if only docs/goals changed.
- Do not mark complete if any Core Native Gate is only fixture-only, unavailable, deferred, record-only, or `requires_implementation`, unless Ender explicitly waives that exact gate in the goal thread.
- Do not add package bin, hosted scheduler, marketplace service, YAML registry as the core surface, or a general external agent platform.
- Do not resurrect old src TypeScript runtime or execute workflow JS as a real script.
- Do not create visible Desktop threads without explicit approval.
- Do not write real files without approve-write and path policy.
- Do not claim full Claude Dynamic Workflows parity.
- Do not claim SDK automatic callback, thread/inject_items visible UI callback, or platform automatic callback without real proof.

Iteration policy:
- Work in phases: contract sync, controller, host-native subagents, SDK worker, Desktop-thread worker, heartbeat return, safe-write integration, verifier/budget/status hardening, dynamic generation/catalog integration, end-to-end evidence/review.
- After each phase, update code/checks/fixtures, docs, and evidence together.
- Run npm run check after every substantial phase.
- For visible Desktop-thread or safe-write real-smoke, ask Ender for explicit approval at the point of use. If approval is not given, record requires_approval and continue other safe phases.
- Do not retry the same failing SDK/app-server/heartbeat path more than twice without writing a root-cause hypothesis and changing tactics.
- If a needed Codex host capability is absent, implement the honest unavailable/deferred diagnostic path, write a root-cause note, and continue only on independent phases. Do not mark the whole goal complete unless the missing gate is explicitly waived by Ender.

Stop when:
- All Core Native Gates pass with real evidence, or any waived gate has an explicit Ender waiver recorded in evidence and final response.
- All verification commands pass.
- Evidence docs match actual behavior.
- Reasonix/v4Pro review has no unresolved blocker/high findings.
- Final response includes a plain Chinese summary, changed code/check files, changed docs, Core Native Gate table, phase status table, verification commands, commit/push status if requested, and a separate "没有完成 / 为什么没有完成 / 下一步" table for any partial, fixture-only, unavailable, deferred, or waived item.

Pause if:
- A visible Desktop thread must be created and Ender has not approved that exact smoke.
- A real write outside disposable /tmp is needed.
- SDK, app-server, heartbeat, or subagent behavior contradicts official/current docs and no safe fallback exists.
- A Core Native Gate cannot be proven after two changed attempts. Pause with exact commands, errors, suspected root cause, and the smallest next experiment; do not mark complete.
- The implementation would require credentials, production, deploys, databases, payments, permissions, external messages, customer data, npm publish, git tags, or global config changes.
- The only implementation path would create an unrestricted runtime or execute workflow JS as code.
```
