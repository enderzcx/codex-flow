# Codex Workflows Routing

Use this reference when a prompt could belong to CWF or a nearby skill.

## CWF Owns

CWF owns prompts that ask Codex to run or prepare a bounded dynamic workflow:

- "run a workflow";
- "use CWF";
- "create a workflow.js harness";
- "split this across native subagents";
- "run an adversarial verification workflow";
- "run a tournament / pipeline / safe fix loop";
- "audit or fix this repo with multiple agents";
- "make a reusable workflow template for this repeated task".

The task should benefit from at least one of these:

- separate clean contexts;
- fan-out and synthesis;
- adversarial verification;
- bounded long-running work;
- visible selected Desktop-thread worker;
- background+heartbeat return;
- safe write gate.

## Nearby Skills

Prefer these skills when the user asks for their narrower job:

| User intent | Prefer | Why |
|---|---|---|
| "write a /goal prompt" | `goal-writer` | Goal contracts are not workflow execution by themselves. |
| "write PRD/SPEC/acceptance/phase plan" | `delivery-planner` | Delivery docs need planning structure before workflow execution. |
| "what is the project status?" | `project-status-audit` | Status audit is read-only and should not spawn workflow workers by default. |
| "coordinate many Desktop threads" | `codex-thread-orchestrator` | General thread management is separate from CWF run planning. |
| "debug why this failed" | `hunt` | Root-cause debugging starts direct unless the user asks for workflow fan-out. |
| "review this diff" | review skill or code-review mode | Single diff review usually does not need dynamic workflow overhead. |
| "write copy / UI wording" | Kimi / writing skill | CWF does not route external creative models. |

## Skip Cases

Do not trigger CWF for:

- typo fixes;
- one import or one failing test;
- ordinary implementation that one Codex turn can finish;
- a request for a reminder, automation, or recurring monitor;
- a public article or X post draft with no workflow execution;
- docs-only planning where the user did not ask for a workflow;
- any task where workflow overhead is bigger than the work.

## Ambiguous Prompts

When the user says "plan this workflow", inspect wording:

- If they mean a delivery plan, use `delivery-planner`.
- If they mean a reusable `workflow.js` harness or a CWF run, use CWF.
- If they want a `/goal`, use `goal-writer` unless they also ask to run CWF.

When unsure, ask one concise question:

```text
你是想要一份普通计划/goal，还是要真的按 CWF 跑一个动态工作流？
```
