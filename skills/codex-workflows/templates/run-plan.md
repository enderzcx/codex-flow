# CWF Run Plan

## Objective

<What the workflow must accomplish in plain language.>

## Why CWF

<Why this needs workflow orchestration instead of one normal Codex turn.>

## Goal Anchor

Required when this CWF run is part of `/goal` / Goal Mode, `目标模式`, "完整跑完", or any objective likely to need more than one bounded CWF episode. Use `N/A` only for one-shot CWF runs whose acceptance can be completed in this episode.

- Goal id / file:
- Outcome:
- Acceptance:
- Current slice:
- Progress Compass:
- Continue condition:
- Stop condition:
- Pause condition:
- Budget:
- Allowed writes:
- CWF episode policy:
- Prior CWF runs:

## CWF Self-Check

- EWC CWF Trigger Boundary met:
- Why direct is insufficient:
- Why skill-only is insufficient:
- Why triad/thread is insufficient or not enough:
- Reviewer can audit this self-check: yes / no

If no trigger boundary is met, stop and use the smaller route instead of CWF.

## Scope

- Included paths / topics:
- Included actions:

## Exclusions

- Out-of-scope paths / systems:
- Actions that require separate approval:

## Phases

| Phase | Purpose | Workers | Done when |
|---|---|---|---|
| 1 | <map / inspect> | <worker ids> | <evidence> |
| 2 | <execute / compare> | <worker ids> | <evidence> |
| 3 | <verify / synthesize> | <worker ids> | <evidence> |

## Workers

| Worker | Type | Visibility | Write scope | Prompt summary |
|---|---|---|---|---|
| <id> | explorer / worker / verifier | inline / desktop-thread / auto | none / paths | <brief> |

## Budget

- Token or effort cap:
- Max worker count:
- Max loop count:
- Stop rule:

## Quarantine

- Raw untrusted input:
- Sanitized summary path:
- Privileged worker restrictions:

## Verification

- Verifier / challenger:
- Evidence required:
- Commands or artifacts:

## Verified State Ownership

- Maker-owned fields: attempted / proposed / changed / needs_review
- Checker-owned fields: verified / passed / done / regression_locked
- Checker: test / verifier agent / human reviewer / external system
- Verification receipt:
- Atomic status artifact:

Rule: implementer/maker workers must not write `verified`, `passed`, `done`, or `regression_locked` into state. The coordinator may promote those fields only from checker/test/replay/human-review evidence.

## Failure To Regression

Required when this run fixes a recurring workflow, helper, route, connector, skill, or harness failure. Use `N/A` only when no reusable failing input or safe regression artifact exists.

- Failing input or trace:
- Diagnosis:
- Fix or mitigation:
- Replay command or fixture:
- Regression artifact:
- Verified by:
- Sensitive data handling:
- Skip reason:

## Write Gate

- Write mode: none / proposed patch / approved safe write
- Allowed paths:
- Forbidden paths:
- Approval phrase:
- Rollback evidence:

## Return Path

- Runtime mode: foreground / background / background+heartbeat
- Return mode: coordinator_synthesis / heartbeat_synthesis
- Originating conversation:
- Marker, if heartbeat is used:

## Resume Checkpoint

- Last safe completed phase:
- State path:
- Restart rule if state is incomplete:

## Goal Delta

Required after this CWF episode when a Goal Anchor exists.

```yaml
goal_delta:
  run_id:
  completed:
  evidence_added:
  verified_by:
  regression_added:
  blockers:
  next_slice:
  next_cwf_run:
  continue_or_stop:
  progress_artifact_update:
```

## Human Summary Shape

```text
这次 CWF 做了什么：
证据在哪：
谁验证了：
是否新增回归夹具：
目标推进了什么：
还没做什么：
下一步：
```
