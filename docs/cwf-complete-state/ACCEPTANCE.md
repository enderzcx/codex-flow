---
half_life: 30d
archive_at: 2026-07-06
scope_type: roadmap
scope_name: CWF complete-state acceptance matrix
coverage: Evidence-bound acceptance criteria for each complete-state phase.
not_complete_for: Runtime implementation, exact Claude parity, hosted scheduling, unrestricted JS, non-Codex routing, production deploys, database/credential/payment/permission writes.
verification_level: docs-only
real_smoke_status: requires_approval
review_status: reviewed
reviewer: reasonix-v4pro
review_command: crb delegate --mode final-review --json review-payload-for-cwf-planning-docs-after-trq212-minli
review_notes: Derived from reviewed complete-state and usage plans.
review_owner: Codex
review_due: resolved 2026-06-06
---

# Acceptance Matrix: CWF Complete-State

## Phase A: Intent To Previewed `workflow.js`

- [ ] A user request can produce a saved `workflow.js` artifact.
  - Test: fixture or local run creates script plus preview artifact.
- [ ] Generated script cannot run before `approve-dynamic`.
  - Test: dynamic run pauses at gate.
- [ ] Invalid generated script fails before execution.
  - Test: forbidden imports/process/fetch/shell cases fail validation.
- [ ] Existing dynamic workflow smoke still passes.
  - Test: `npm run check`, `bash scripts/smoke-cli.sh`, controlled dynamic real-smoke.

## Phase B: Same-Conversation Result Return

- [ ] A CWF run launched from Codex returns a concise summary in the initiating conversation.
  - Manual evidence: local skill-wrapper smoke or documented app-host fallback.
- [ ] `--new-thread` remains explicit.
  - Test: docs and tests show no default new-thread behavior.
- [ ] CLI-only users still work.
  - Test: `cwf result RUN_ID`.

## Phase C: Worker Visibility

- [ ] `cwf desktop check` distinguishes schema availability from real execution.
  - Test: probe thread returns fixed JSON.
- [ ] Read-only worker app threads appear in Desktop when available.
  - Manual evidence: controlled live smoke with thread ids and turn ids.
- [ ] SDK fallback is explicit when app-thread execution is unavailable.
  - Test: status/result show fallback reason.

## Phase D: Write-Capable Dynamic Workers

- [ ] Dynamic `safePatch` creates `artifacts/dynamic-proposed.patch` and `artifacts/dynamic-safe-patch.json`.
  - Test: fixture run and `tests/dynamic-workflow.test.ts`.
- [ ] Forbidden path patch is rejected before target changes.
  - Test: forbidden-path fixture leaves target unchanged.
- [ ] Verification failure marks the run failed.
  - Test: failing verification fixture cannot return PASS.
- [ ] Controlled real-smoke modifies only allowed paths.
  - Manual evidence: target diff summary and verification output after Ender GO.

## Phase E: Built-In Dynamic Modes

- [ ] Each mode has a template and plain-English preview.
  - Test: template files and preview snapshots.
- [ ] Each mode has fixture coverage.
  - Test: focused template tests.
- [ ] At least two modes have controlled real-smoke evidence.
  - Manual evidence: run ids and result summaries.
- [ ] Untrusted-input modes enforce quarantine.
  - Test: reader workers cannot perform gated writes or external actions.

## Phase F: Save, Reuse, Package

- [ ] Saved workflow cannot silently change without SHA mismatch warning.
  - Test: trust metadata test.
- [ ] Saved workflow appears in local discovery only after explicit enable.
  - Test: registry test.
- [ ] Remote workflows require inspect/install/enable before run.
  - Test: direct URL run remains invalid.

## Phase G: Public Polish And Release

- [ ] Public docs explain current, preview, and planned surfaces.
  - Test: source audit over README, Chinese README, workflow catalog, and complete-state docs.
- [ ] Public docs do not claim exact Claude parity.
  - Test: source audit for exact parity / automatic trigger / unrestricted JS / ungated writes.
- [ ] CLI smoke covers the stable command surface.
  - Test: `bash scripts/smoke-cli.sh`.
- [ ] CI passes after push.
  - Manual evidence: GitHub Actions success.
