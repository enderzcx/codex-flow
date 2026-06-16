# CWF Core

Codex Workflows is a native bounded dynamic workflow skill for Codex.

## Product Definition

```text
Codex main session dynamically writes or selects workflow.js,
then creates a bounded run plan,
then executes it with native Codex subagents,
then returns the result to the same conversation by foreground, background, or heartbeat synthesis.
```

## Core Principles

1. Native first: Codex subagents are the execution layer.
2. Dynamic first: workflows are custom harnesses for the current task.
3. Bounded first: every serious workflow has scope, budget, verifier, quarantine, and stop rules.
4. JS as harness: JavaScript describes orchestration; Node does not execute the workflow.
5. Same conversation: the main Codex session synthesizes the final answer.
6. Write by gated patch: write workers use explicit approval, bounded paths, apply checks, verification, and rollback evidence before real writes.
7. Selective visibility: only important workers become Desktop sidebar threads.
8. Budgeted execution: reusable workflows state a token budget and stop rule.
9. Quarantine untrusted input: readers of raw external content stay read-only.
10. Preview and status: non-trivial workflows expose run shape before and during execution.
11. Small templates: reusable workflows should be templates, not rigid scripts.
12. Async without drift: long workflows may use SDK/background/heartbeat adapters, but the coordinator contract and safety gates stay the same.
13. Controller-first state: `cwf-start.mjs` creates preview, run-plan, state, return-envelope, final, worker-packets, and worker-results slots before any worker dispatch.
14. Adapter honesty: native subagent, SDK, Desktop-thread, and heartbeat helpers must write `fixture`, `real-smoke`, `requires_approval`, `unavailable`, or `deferred` evidence labels instead of upgrading claims silently.
15. Checker-owned verification: maker workers may write attempted/proposed/changed state, but `verified`, `passed`, `done`, and `regression_locked` belong to a verifier, deterministic test, replay, or human reviewer.
16. Failure to regression: recurring workflow, helper, route, connector, skill, or harness failures should preserve the failing input or trace and leave behind a regression artifact or explicit skip reason.
17. Receipt-only oracles: EWC-approved external oracle reviews may be preserved as `external_oracle_receipts[]`, but they are advisory evidence and never CWF workers, executors, or verified-state owners.

## Failure Modes

Use CWF when a normal single-context run is likely to fail because of:

- `agentic laziness`: the agent stops after partial progress and calls the task done.
- `self-preferential bias`: the same agent creates and judges its own output.
- `goal drift`: original constraints fade across long runs, summaries, or compactions.

CWF addresses these structurally with isolated workers, separate verifiers, explicit stop conditions, and same-conversation synthesis.

## Bounded Dynamic Contract

CWF follows a `loop > prompt` model for complex work: the main session turns the user's goal into a small run plan, runs bounded workers, verifies the result, and only loops while the stop rules allow it.

Dynamic does not mean unbounded. CWF should avoid default hundreds-agent swarms. It should scale from a few well-chosen workers, then add more only when the run plan says why.

A non-trivial run plan should name:

- exact scope and exclusions;
- phases and workers;
- verifier or challenger role;
- verified-state owner;
- failure-to-regression receipt when applicable;
- write scopes;
- untrusted input route;
- token budget and stop rule;
- verification evidence;
- resume checkpoint.

## Worker Visibility

Worker visibility is a product decision, not an implementation accident.

- `inline`: default. Use for short explorers, one-shot verifiers, and small helper tasks.
- `desktop-thread`: use when the worker is long-running, writable, or likely to need separate follow-up.
- `auto`: let the main Codex session decide from task length, write scope, risk, and expected follow-up.

Do not create a left-sidebar thread for every worker. That makes dynamic workflows noisy. The main session remains the coordinator and final synthesis point.

SDK/background workers are quiet execution contexts and are not a product guarantee of left-sidebar visibility. `desktop-thread` is the explicit visibility path for selected workers that should appear in Codex Desktop's sidebar. Visible Desktop-thread smoke requires explicit approval for the exact run.

## Core Patterns

- `classify-and-act`: classify heterogeneous items, then route each class to the right behavior.
- `fan-out-and-synthesize`: split independent work across agents, then merge.
- `adversarial-verification`: use a separate context to challenge claims, fixes, or artifacts.
- `generate-and-filter`: create many candidates, dedupe, score, and keep the strongest.
- `tournament`: compare candidates pairwise when absolute scoring is unreliable.
- `pipeline`: move each item through ordered stages without waiting for a global barrier.
- `loop-until-done`: keep iterating until a hard stop condition is met or a blocker is real.

Real workflows can compose patterns. For example, a migration may use fan-out, adversarial verification, then loop-until-done.

## Run Experience

Run experience is part of the core contract:

- preview the harness before non-trivial runs;
- keep inline worker output compact;
- promote only selected workers to Desktop threads;
- show phase, worker, elapsed-time, budget, and blocker status;
- support foreground, background, and background+heartbeat modes;
- cancel without claiming completion;
- resume from the last safe checkpoint when state is available;
- always return final synthesis to the originating conversation;
- mirror return status in `.cwf/runs/RUN_ID/return-envelope.json`.

The proven return path is coordinator synthesis in the originating conversation. Heartbeat synthesis is allowed only after a real heartbeat reply with the expected marker is observed in the originating thread; `heartbeat-scheduled` and `heartbeat-scheduled-not-returned` are not delivery proof. Platform automatic callback is not claimed until a future Codex platform API and real smoke prove it.

## Verified State

CWF treats verification state as a separate ownership boundary:

- maker workers can write `attempted`, `proposed`, `changed`, and `needs_review`;
- verifier workers, deterministic tests, replay commands, external evidence, or human reviewers can write `verified`, `passed`, `done`, and `regression_locked`;
- the coordinator may synthesize verified state only by pointing at the verifier receipt.

Persistent run artifacts should avoid mixing maker narrative with checker-owned truth. If a status file or `goal_delta` will be read by a future run, write verified state after the verifier receipt exists and keep partial writes from looking authoritative.

## Failure To Regression

When a CWF run repairs a repeated failure or a harness-level issue, the repair is not complete until the failing input is replayed or preserved as a future check when feasible:

```text
failing input / trace
  -> diagnosis
  -> fix or mitigation
  -> replay
  -> regression artifact
```

Valid regression artifacts include a test, fixture, eval case, route trigger case, helper smoke, documented replay command, or sanitized error-pattern entry. If the input contains secrets, customer data, or private chat, sanitize or hash it before storing. If no safe artifact exists, record the skip reason in the run plan and closeout.

## Budget

Every saved workflow should include a visible `budget` with a token cap and stop rule. Dynamic workflows can cost far more than a normal Codex turn; budget is part of the contract, not an afterthought.

If exact token accounting is unavailable in the current host, evidence must say `estimated` or `not measurable` instead of pretending exact enforcement.

## Quarantine

When a workflow reads untrusted user, web, ticket, issue, support, social, or third-party content:

- raw reader agents must be read-only;
- privileged workers receive sanitized summaries, not raw untrusted text;
- write, deploy, payment, database, credential, permission, and irreversible external actions require explicit approval.

## Saved Workflows

Working workflows should be saved and shipped inside a skill when they become reusable. Saved workflows are adaptable harness templates, not scripts to execute verbatim.

## Non-Core

The following are not part of the core product:

- external CLI runner;
- YAML workflow registry;
- app-server worker simulation as the default path;
- safePatch as the default path;
- detached CI smoke matrix;
- non-Codex model routing;
- hosted scheduler.

Optional SDK/background/heartbeat adapters are allowed only when they preserve the bounded native contract. They must not execute `workflow.js` as unrestricted Node code or become the main product surface. Desktop-thread and SDK workers may propose patches, but real apply must return through the coordinator safe-write gate.

External oracle surfaces such as ChatGPT UI Pro are allowed only as receipt-only review evidence under EWC readiness gates. They do not reintroduce non-Codex model routing.

They may return later as optional adapters, but not as the main experience.
