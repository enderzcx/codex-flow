# Codex Workflows Routing

Use this reference when a prompt could belong to CWF or a nearby skill.

## Parent Runtime Router

For Ender's local workflow, Ender Work Contract (EWC) is the parent runtime router:

- `/Users/sunny/Work/CC/OPC/ENDER_WORK_CONTRACT.md`
- `/Users/sunny/Work/CC/OPC/work-contract/ROUTING_MATRIX.md`
- `/Users/sunny/Work/CC/OPC/work-contract/templates/work-contract.md`

CWF is an execution backend, not a default task entry point. Before selecting CWF, the coordinator must fill a CWF Self-Check:

- which EWC CWF Trigger Boundary is met;
- why direct, skill-only, or triad/thread is insufficient.

If the self-check cannot name a trigger, CWF must not be used. If CWF is selected without a valid self-check, reviewers should flag a contract violation.

Durable CWF run plans must include the `CWF Self-Check` section from `templates/run-plan.md` before any workers are spawned.

When Goal Mode and CWF are both requested, Goal Mode is the outer contract and CWF is the bounded execution episode. Use `goal-writer` to create or attach the Goal Anchor, then use CWF for each episode. Each episode must return `goal_delta` with `run_id`, `completed`, `evidence_added`, `blockers`, `next_slice`, `next_cwf_run`, `continue_or_stop`, and `progress_artifact_update`.

## CWF Owns

CWF owns prompts that ask Codex to run or prepare a bounded dynamic workflow:

- "run a workflow";
- "use CWF";
- "create a workflow.js harness";
- "split this across native subagents";
- "run an adversarial verification workflow";
- "run a tournament / pipeline / safe fix loop";
- "use Goal Mode and CWF together until acceptance is met";
- "audit or fix this repo with multiple agents";
- "review this diff with CWF / multiple reviewers";
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
| "run this goal with CWF" | `goal-writer` then CWF | Goal Anchor owns continuation; CWF owns each bounded execution episode. |
| "write PRD/SPEC/acceptance/phase plan" | `delivery-planner` | Delivery docs need planning structure before workflow execution. |
| "what is the project status?" | `project-status-audit` | Status audit is read-only and should not spawn workflow workers by default. |
| "coordinate many Desktop threads" | `codex-thread-orchestrator` | General thread management is separate from CWF run planning. |
| "debug why this failed" | `hunt` | Root-cause debugging starts direct unless the user asks for workflow fan-out. |
| "review this diff" | review skill | Single diff review usually does not need dynamic workflow overhead. |
| "run CWF review on this diff" | `code-review.workflow.js` | Use CWF when the review needs multiple independent reviewer contexts and findings-first synthesis. |
| "write copy / UI wording" | Kimi / writing skill | CWF does not route external creative models. |
| "ask ChatGPT Pro / Reasonix / Kimi for a second opinion" | EWC collaborator / oracle routing | External model routing is outside CWF; CWF may only preserve an approved oracle receipt. |

## Skip Cases

Do not trigger CWF for:

- typo fixes;
- one import or one failing test;
- ordinary implementation that one Codex turn can finish;
- a request for a reminder, automation, or recurring monitor;
- a public article or X post draft with no workflow execution;
- docs-only planning where the user did not ask for a workflow;
- external model routing, including ChatGPT Pro / Reasonix / Kimi calls as workers;
- any task where workflow overhead is bigger than the work.

## Ambiguous Prompts

When the user says "plan this workflow", inspect wording:

- If they mean a delivery plan, use `delivery-planner`.
- If they mean a reusable `workflow.js` harness or a CWF run, use CWF.
- If they want a `/goal`, use `goal-writer` unless they also ask to run CWF.
- If they want `/goal` plus CWF, create or attach the Goal Anchor first, then run a bounded CWF episode and emit `goal_delta`.

When unsure, ask one concise question:

```text
你是想要一份普通计划/goal，还是要真的按 CWF 跑一个动态工作流？
```
