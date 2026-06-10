# CWF Run Plan

## Objective

<What the workflow must accomplish in plain language.>

## Why CWF

<Why this needs workflow orchestration instead of one normal Codex turn.>

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

## Human Summary Shape

```text
这次 CWF 做了什么：
证据在哪：
还没做什么：
下一步：
```
