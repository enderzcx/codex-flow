# CWF Core

Codex Workflows is a native bounded dynamic workflow skill for Codex.

## Product Definition

```text
Codex main session dynamically writes or selects workflow.js,
then creates a bounded run plan,
then executes it with native Codex subagents,
then returns the result to the same conversation.
```

## Core Principles

1. Native first: Codex subagents are the execution layer.
2. Dynamic first: workflows are custom harnesses for the current task.
3. Bounded first: every serious workflow has scope, budget, verifier, quarantine, and stop rules.
4. JS as harness: JavaScript describes orchestration; Node does not execute the workflow.
5. Same conversation: the main Codex session synthesizes the final answer.
6. Write by inheritance: write workers inherit current Codex sandbox and approval policy.
7. Selective visibility: only important workers become Desktop sidebar threads.
8. Budgeted execution: reusable workflows state a token budget and stop rule.
9. Quarantine untrusted input: readers of raw external content stay read-only.
10. Preview and status: non-trivial workflows expose run shape before and during execution.
11. Small templates: reusable workflows should be templates, not rigid scripts.

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
- cancel without claiming completion;
- resume from the last safe checkpoint when state is available;
- always return final synthesis to the originating conversation.

## Budget

Every saved workflow should include a visible `budget` with a token cap and stop rule. Dynamic workflows can cost far more than a normal Codex turn; budget is part of the contract, not an afterthought.

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

They may return later as optional adapters, but not as the main experience.
