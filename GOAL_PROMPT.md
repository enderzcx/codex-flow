---
half_life: 7d
archive_at: 2026-06-11
---

# Current Goal Prompt

This file is the current goal-mode entrypoint. Historical phase prompts live in
`docs/goal-prompts/`.

Current phase:

- none; v1.9 is completed as a planning contract

Latest decisions:

- v1.8 Managed-Agents-Style Scheduling Decision: do not build a scheduler now.
- v1.9 Public Workflow Registry Planning: use source trust levels plus required
  SHA-256 pinning for remote install; do not implement registry runtime commands
  in the planning goal.

Archived phase prompts:

- `docs/goal-prompts/v0.3-run-discovery.md`
- `docs/goal-prompts/v1.7-worker-app-threads.md`
- `docs/goal-prompts/v1.8-managed-agents-decision.md`
- `docs/goal-prompts/v1.9-public-workflow-registry.md`

When a new phase starts, replace this file with the active goal prompt and add
or update the matching historical prompt under `docs/goal-prompts/`.

## v1.9 Planning Summary

Codex Flow should plan a public workflow registry, but not implement registry
runtime commands in the planning goal.

Chosen trust model:

- `bundled`: package-shipped workflows, CI/package-smoke validated, runnable by
  id.
- `local`: user/project workflows in existing search paths, validated before
  list/show/run.
- `remote-candidate`: inspected only, untrusted, not installed, not enabled, not
  runnable.
- `remote-installed`: validated and SHA-256 pinned into a local cache, but not
  runnable yet.
- `remote-enabled`: explicitly enabled read-only workflow exposed through local
  discovery.

Smallest future implementation slice:

- inspect a remote/file workflow and print metadata, diagnostics, capabilities,
  and SHA-256;
- install only when the user supplies the expected SHA-256 digest;
- keep remote installs disabled until explicit enablement;
- refuse write-capable remote workflows in the first slice;
- keep `cwf run <url>` invalid.

What v1.9 planning does not add:

- no registry runtime commands yet;
- no remote install behavior yet;
- no generated JavaScript execution;
- no auto-run or direct URL run;
- no write-capable remote workflow enablement;
- no marketplace, daemon, scheduler, queue, remote lifecycle service, or nested
  worker runtime;
- no private adapters, non-Codex model routing, or user-specific defaults.

## v1.8 Decision Summary

Codex Flow should not implement a managed-agents-style scheduler in v1.8.

Evidence reviewed:

- v1.7 app-thread worker support is implemented and documented as completed.
- Live run `run_20260604084923_hqu0l8` recorded real app-thread metadata for
  3/3 workers, with no SDK fallback and no raw fallback:
  - correctness: thread `019e91d2-ac76-7191-90b2-a7b2234f1c96`, turn
    `019e91d2-b4a6-7760-8f72-1e34aa73c96a`
  - tests: thread `019e91d2-ac75-71a0-8186-764d87e9cdf1`, turn
    `019e91d2-b8be-7793-86c7-674a08bd9205`
  - safety: thread `019e91d2-ac76-7191-90b2-a7a457bef8f2`, turn
    `019e91d2-b0d3-73f3-be0a-1060c7067178`
- Existing CLI/background/watch/list/show/result/cancel surfaces already provide
  inspectable local lifecycle behavior without a daemon.
- Codex-native app-server threads, SDK workers, skills, sandbox/approval rules,
  worktrees, and host subagents remain the preferred execution boundary.

What v1.8 adds:

- an explicit roadmap decision;
- a tighter non-goal around schedulers, queues, daemons, marketplaces, remote
  lifecycle services, and nested worker execution;
- revisit criteria for a future scheduler decision.

What v1.8 does not add:

- no scheduler implementation;
- no queue, daemon, registry, marketplace, remote lifecycle service, or nested
  worker runtime;
- no private adapters, non-Codex model routing, or user-specific defaults;
- no change to same-conversation result-return semantics.
