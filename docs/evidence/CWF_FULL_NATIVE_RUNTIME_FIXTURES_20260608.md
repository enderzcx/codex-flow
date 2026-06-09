---
half_life: 7d
archive_at: 2026-06-15
scope_type: evidence
scope_name: cwf-full-native-runtime-fixtures-20260608
verification_level: fixture
real_smoke_status: superseded_for_sdk_by_20260609_real_smoke; desktop_and_heartbeat_still_not_claimed_here
review_status: pending_final_review
---

# CWF Full Native Runtime Fixtures 2026-06-08

## Summary

This evidence records the checked-in local fixture layer for CWF full native runtime v1. It proves controller artifacts and adapter result schemas, not hosted scheduling, npm publish, platform automatic callback, unrestricted workflow execution, or unapproved visible Desktop-thread creation. SDK real-smoke is now covered separately by [CWF_FULL_NATIVE_RUNTIME_REAL_SMOKE_20260609.md](CWF_FULL_NATIVE_RUNTIME_REAL_SMOKE_20260609.md).

## Verified By

```bash
npm run check
```

`npm run check` now covers:

- `scripts/cwf-start.mjs`: creates `preview.md`, `run-plan.md`, `state.json`, `return-envelope.json`, `final.md`, `worker-packets/`, and `worker-results/` for `workflows/repo-audit.workflow.js`.
- `scripts/cwf-worker-sdk.mjs`: fixture result with marker `CWF_SDK_FIXTURE_OK`, normalized worker result JSON, and fixture SDK thread id without credentials.
- `scripts/cwf-native-subagent.mjs`: honest `native-subagent-unavailable` fixture when native host subagent tools are not exposed to the helper.
- `scripts/cwf-worker-desktop-thread.mjs`: failed preflight fixture records `desktop-thread-execution-unavailable`, empty `desktop_thread_id`, and `created_visible_thread: false`.
- `scripts/cwf-return-heartbeat.mjs`: `heartbeat-unavailable` fixture writes a copy-ready resume prompt that reads `.cwf/runs/RUN_ID/final.md`.
- `scripts/cwf-safe-write.mjs`: SDK and Desktop-thread patch proposals fail closed unless the coordinator safe-write gate records `coordinator_approval: "accepted"`.

## Not Claimed

- SDK real-smoke is not claimed by this fixture; it is claimed by the 2026-06-09 real-smoke evidence file.
- Visible Desktop-thread real-smoke is not run by this fixture. It remains approval-gated to avoid sidebar noise.
- Heartbeat platform delivery is not claimed by this fixture. The helper records `heartbeat-unavailable` plus a resume prompt unless heartbeat synthesis is actually proven.
- Platform automatic callback remains deferred.
