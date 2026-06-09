---
half_life: 7d
archive_at: 2026-06-16
scope_type: evidence
scope_name: cwf-full-native-runtime-real-smoke-20260609
verification_level: real-smoke
real_smoke_status: sdk_native_desktop_safe_write_heartbeat_passed
review_status: reasonix_followup_go_after_heartbeat_fix
---

# CWF Full Native Runtime Real Smoke 2026-06-09

## Summary

This evidence records the stricter full-native goal pass that requires real proof for core native gates. It supersedes fixture-only evidence for SDK and host-native subagent execution. After explicit Ender approval, it also records a visible Codex Desktop thread smoke, a disposable `/tmp` safe-write smoke, and a real heartbeat return to the originating thread. The heartbeat root cause was the one-shot RRULE shape: `FREQ=MINUTELY;INTERVAL=1;COUNT=1` saved but did not dispatch, while `FREQ=MINUTELY;INTERVAL=1` did dispatch and returned the marker.

## Real-Smoke Run

Run directory:

```text
.cwf/runs/cwf-full-native-real-20260609/
```

Controller artifacts created:

- `preview.md`
- `run-plan.md`
- `state.json`
- `return-envelope.json`
- `final.md`
- `worker-packets/*.md`
- `worker-results/*.json`

## Core Native Gate Evidence

| Gate | Status | Evidence |
|---|---|---|
| Gate A hybrid architecture | real/local pass | Skill/coordinator uses host tools for native subagents and heartbeat; `scripts/cwf-worker-sdk.mjs` calls `@openai/codex-sdk`; helper scripts persist state/evidence/policy and do not claim host-only powers. |
| Gate B SDK real worker | real-smoke pass | `node scripts/cwf-worker-sdk.mjs --run-id cwf-full-native-real-20260609 --worker correctness --mode real --marker CWF_SDK_REAL_SMOKE_20260609 --timeout-ms 180000` returned SDK thread id `019ea9cd-8659-7ab2-80a7-71b906175511`, final response `CWF_SDK_REAL_SMOKE_20260609`, usage, and `status: completed` in `worker-results/correctness.json`. |
| Gate C host-native subagents | real-smoke pass | Two host-native `spawn_agent` explorers returned to the coordinator: `019ea9cc-8e2e-7872-9ed3-7d030c4846f0` with `CWF_NATIVE_SUBAGENT_A_20260609`, and `019ea9cc-a750-7aa1-b21a-654e38aea4d8` with `CWF_NATIVE_SUBAGENT_B_20260609`. Their summaries were recorded in `worker-results/tests.json` and `worker-results/maintainability.json`. |
| Gate D Desktop-thread worker | real-smoke pass | After explicit Ender approval, visible Codex Desktop thread `019ea9d6-fbe7-70c0-ac5a-eb3002d30f7e` returned marker `CWF_DESKTOP_THREAD_REAL_SMOKE_20260609`. Recorded in `.cwf/runs/cwf-full-native-real-20260609/worker-results/desktop-visible-smoke.json` and `state.json`. |
| Gate E heartbeat return | real-smoke pass | One-shot heartbeat automation `cwf-heartbeat-real-smoke` was first scheduled with marker `CWF_HEARTBEAT_REAL_SMOKE_20260609`, but `FREQ=MINUTELY;INTERVAL=1;COUNT=1` did not dispatch. A no-count retry using `FREQ=MINUTELY;INTERVAL=1` returned marker `CWF_HEARTBEAT_NO_COUNT_PROBE_20260609` in originating thread `019ea7b2-b2e8-7850-98dc-d40c383f8116` and deleted the automation after delivery. |
| Gate F safe-write coordinator gate | real-smoke pass | After explicit Ender approval, disposable repo `/tmp/cwf-safe-write-smoke-20260609` passed `scripts/cwf-safe-write.mjs`, `git apply --check`, actual apply, verification `cat src/allowed.txt == new`, changed-file capture, and rollback recording. Evidence copied to `.cwf/runs/cwf-full-native-real-20260609/safe-write-smoke.json`. |
| Gate G truth table | real-smoke pass for native gates | Real-complete: A, B, C, D, E, F. Deferred by design: platform automatic callback. |

## Heartbeat Scheduling Evidence

Automation id:

```text
cwf-heartbeat-real-smoke
```

Automation prompt requires the heartbeat to read `.cwf/runs/cwf-full-native-real-20260609/final.md`, `.cwf/runs/cwf-full-native-real-20260609/return-envelope.json`, and `.cwf/runs/cwf-full-native-real-20260609/state.json`, then post a marker into the originating thread.

Observed state:

- Earlier retries used `FREQ=MINUTELY;INTERVAL=1;COUNT=1`. Those automations saved as active, but the expected marker appeared only in prompts/local artifacts.
- The successful retry removed `COUNT=1` and used `FREQ=MINUTELY;INTERVAL=1` with `destination=thread` and `targetThreadId=019ea7b2-b2e8-7850-98dc-d40c383f8116`.
- At `2026-06-09T07:41:02.556Z`, the originating thread received the heartbeat input containing marker `CWF_HEARTBEAT_NO_COUNT_PROBE_20260609`.
- At `2026-06-09T07:41:36Z`, the originating thread posted final answer `CWF_HEARTBEAT_NO_COUNT_PROBE_20260609 no-count heartbeat 已真实触发`.
- The heartbeat turn deleted `cwf-heartbeat-real-smoke` after delivery, preventing repeated minute wakeups.
- Root cause: Codex Desktop heartbeat dispatch works for the interval RRULE form, but the one-shot `COUNT=1` form is not reliable here and must not be used for Gate E proof.

## Not Claimed

- No platform automatic callback is claimed.
- No npm publish, git tag, deploy, hosted scheduler, marketplace, production, credential, payment, database, permission, external message, or customer-data behavior is claimed.

## Follow-up Fix: Heartbeat State Machine

After this blocker, CWF was tightened so heartbeat return cannot be upgraded by scheduling alone:

- `heartbeat-fixture` proves only local artifact shape.
- `heartbeat-scheduled` records automation creation/update, not delivery.
- `heartbeat-scheduled-not-returned` blocks the run when the expected marker is not observed in the originating thread after the scheduling window.
- `heartbeat_synthesis` is recorded only by `record-real-smoke` after the coordinator observes the marker in the originating thread.

Gate E is now allowed to pass only with the observed no-count heartbeat marker. Scheduling alone still stays `heartbeat-scheduled`, and missed windows still stay `heartbeat-scheduled-not-returned`.

Reasonix follow-up review for the heartbeat state-machine fix returned GO with 0 blocker and 0 high findings. Transcript: `/tmp/cwf-heartbeat-fix-reasonix-2.jsonl`.
