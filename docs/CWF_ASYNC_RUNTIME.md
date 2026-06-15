---
half_life: 30d
archive_at: 2026-07-08
---

# CWF Async Runtime Contract

CWF can support long-running work without making the originating Codex conversation wait the whole time.

This is not a return to the removed standalone runtime. The async layer is a bounded native adapter around Codex surfaces:

- Codex SDK workers for background execution when sidebar visibility is not required;
- Codex Desktop app-thread workers for selected work that should appear in the left sidebar;
- `.cwf/runs/RUN_ID/` state files as the local handoff surface;
- a heartbeat follow-up request for the originating thread to read the result and synthesize it back to the user.

## Runtime Modes

| Mode | Use When | Result Return |
|---|---|---|
| `foreground` | The workflow is short enough for the main conversation to wait. | Coordinator synthesis in the same conversation. |
| `background` | The workflow may run longer than an interactive turn. | Runtime writes state/result under `.cwf/runs/RUN_ID/`; user can poll or resume. |
| `background+heartbeat` | The user wants the original Codex conversation to report back later. | CWF schedules a thread heartbeat for the originating conversation. It is only delivered after a real marker reply is observed; otherwise the run remains `heartbeat-scheduled` or `heartbeat-scheduled-not-returned` with a resume prompt. |
| `desktop-thread` worker | A selected worker should be visible or continuable in Codex Desktop's left sidebar. | Worker result is read by the coordinator; final answer still returns to the originating conversation. |

## Left Sidebar Policy

Selected workers can still appear in the Codex Desktop left sidebar.

Do not make every worker a Desktop thread. Most background workers should be quiet SDK workers because the user cares about the final synthesis, not every intermediate context.

Use `desktop-thread` when any of these are true:

- the user explicitly asks to see the worker in the sidebar;
- the worker is long-running and likely to need follow-up;
- the worker is a write worker whose plan, evidence, or proposed patch should be inspectable;
- the worker is a high-risk verifier or reviewer worth preserving as its own conversation.

SDK workers are not a left-sidebar visibility guarantee. Desktop-thread workers are the visibility path.

## Callback Truth

Current proven behavior:

| Capability | Status |
|---|---|
| SDK worker can run and return a result to the Node caller. | Supported. |
| SDK worker automatically injects its final result into the originating Codex Desktop conversation. | Not supported as a product contract. |
| Codex Desktop app-thread can create a visible worker thread when the host exposes the app-server path. | Supported when preflight and execution probe pass. |
| Low-level `thread/inject_items` can be treated as a stable visible UI callback. | Not supported as a product contract. |
| CWF final result can return to the user without blocking the main turn. | Supported only after a real `heartbeat_synthesis` marker is observed. Scheduling a heartbeat is not proof of delivery; the reliable fallback is local state plus a resume/coordinator synthesis prompt. |

Do not claim platform automatic callback unless a future Codex API exposes it and a real smoke proves it.

## Return Envelope

Async runs should record these fields in `.cwf/runs/RUN_ID/return-envelope.json`:

- `runtime_mode`: `foreground`, `background`, or `background+heartbeat`;
- `final_destination`: originating conversation, thread id when known;
- `return_mode`: `coordinator_synthesis`, `heartbeat_synthesis`, or proven future platform callback;
- `heartbeat_status`: `not_requested`, `fixture`, `scheduled`, `scheduled-not-returned`, `delivered`, `failed`, or `unavailable`;
- `sdk_thread_ids`: SDK worker ids when known;
- `desktop_thread_ids`: visible Desktop worker thread ids when created;
- `closeout_gate`: whether completed status can stand or must be downgraded pending checker-owned verification or regression lock;
- `verified_state`: maker-owned versus checker-owned state and the verification receipt;
- `failure_to_regression`: recurring-failure receipt, including regression artifact or skip reason when required;
- `final_summary_path`;
- `evidence_path`;
- `deferred_items`.

## Safety Boundary

The async adapter must not execute arbitrary workflow JavaScript as unrestricted Node code. `workflow.js` remains a harness/spec that the coordinator interprets.

Writable work still goes through approval-gated bounded patch flow. Desktop-thread workers may diagnose, plan, or propose patches, but real writes must follow the safe write gate unless a future Codex-native permission surface provides an equivalent approval and evidence trail.

## Heartbeat Delivery Rule

`heartbeat_synthesis` is a delivered state, not a scheduled state.

CWF must keep these states separate:

| Helper State | Meaning | Can Complete Gate E? |
|---|---|---|
| `heartbeat-fixture` | Local artifact shape proof only. | No. |
| `heartbeat-scheduled` | Automation was created or updated, but no originating-thread reply has been observed. | No. |
| `heartbeat-scheduled-not-returned` | The expected window passed and the marker was not observed in the originating thread. | No; block or resume later. |
| `heartbeat-unavailable` | The host heartbeat capability is absent or unusable. | No; use resume prompt. |
| `heartbeat_synthesis` | A real heartbeat reply with the expected marker was observed in the originating thread. | Yes. |

Do not use one-shot heartbeat RRULEs such as `FREQ=MINUTELY;INTERVAL=1;COUNT=1` for Gate E proof. On 2026-06-09 the one-shot form was saved as active but did not dispatch; the no-count form `FREQ=MINUTELY;INTERVAL=1` did dispatch and posted marker `CWF_HEARTBEAT_NO_COUNT_PROBE_20260609` to the originating thread. The coordinator should schedule an interval heartbeat, observe the marker, then pause or delete the automation after delivery.
