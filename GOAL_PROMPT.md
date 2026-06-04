---
half_life: 7d
archive_at: 2026-06-11
---

# Goal Prompt For v0.3

Use this copy-ready prompt when starting Codex goal mode for the v0.3 run discovery and failure-model slice.

```text
Build Codex Flow v0.3 Run Discovery And Failure Model in /Users/sunny/Work/CODEX/codex-workflows.

Outcome:
- Users can discover prior runs without manually browsing ~/.codex-workflows/runs.
- Codex Flow maintains ~/.codex-workflows/index.json, or an equivalent rebuildable discovery cache, with run id, workflow, status, target, timestamps, artifact paths, and failure metadata.
- `cwf list [--limit <n>] [--status <status>] [--target <path>]` lists recent runs newest first.
- `cwf show <run-id>` prints a human-readable run detail view with status, current work, phases, workers, artifacts, failure policy, and failure summary when failed.
- `cwf latest [--target <path>]` opens the newest run overall or for a resolved target path.
- If discovery data is missing, stale, or corrupt, it is rebuilt from run folders under ~/.codex-workflows/runs/*/state.json.
- Failed runs record default failure policy metadata and human-readable failure summaries with failed phase, failed workers when known, and a concrete next step.
- Existing diff-review foreground, background, watch, result, and cancel behavior still works.

Allowed writes:
- src/
- tests/
- scripts/ only if smoke coverage needs a small repo-local helper
- README.md
- README.zh-CN.md
- docs/PRD.md
- docs/SPEC.md
- docs/SKILL_PLAN.md
- ACCEPTANCE.md
- docs/FULL_PLAN.md
- docs/PHASE_CONTRACTS.md
- GOAL_PROMPT.md

Forbidden:
- Do not add private adapters or non-Codex model routing.
- Do not add new workflow types.
- Do not add a workflow registry in this slice.
- Do not add daemon, web UI, remote service, marketplace, or scheduler behavior.
- Do not make run folders stop being the source of truth.
- Do not break existing `diff-review` behavior or public Codex-native core commands.
- Do not depend on private local files, credentials, or non-public adapters.

Constraints:
- Keep public core Codex-native.
- Keep discovery local and rebuildable.
- Treat `~/.codex-workflows/index.json` as a cache, not authoritative state.
- Resolve `--target <path>` before filtering so equivalent relative paths match consistently.
- Keep failed-run output readable from both `cwf status` and `cwf show`.
- Update README, README.zh-CN, PRD, SPEC, SKILL_PLAN, ACCEPTANCE, FULL_PLAN, and PHASE_CONTRACTS if behavior changes.

Verification:
- `npm run check`
- `npm pack --dry-run`
- `node dist/cli.js validate workflows/diff-review.yaml`
- fixture foreground smoke
- fixture background smoke
- `cwf watch` smoke
- `cwf list/show/latest` smoke
- mocked failure smoke
- cancel smoke
- source audit proving no private adapters, non-Codex model routing, new workflow types, workflow registry implementation, daemon, web UI, marketplace, or scheduler was added for this slice

Iteration policy:
- Start by auditing current implementation and docs against this contract.
- Patch the smallest missing vertical slice first: index/discovery, CLI formatting, failure summaries, docs, then smoke coverage.
- After each code change, run the nearest targeted test before expanding scope.
- If a verification smoke fails, state the root-cause hypothesis before retrying.
- Keep existing run folders and generated smoke evidence out of git unless the repo already tracks that fixture.

Stop/Pause conditions:
- Stop if implementing the requested behavior would require a workflow registry, new workflow type, private adapter, non-Codex model router, daemon, web UI, remote service, marketplace, or scheduler.
- Stop after three repeated no-progress attempts on the same failing verification command and report the blocker.
- Stop before destructive changes to user run history under ~/.codex-workflows.
- Stop when all required verification passes, the worktree is clean except intentional edits, and the commit/push state is reported.

Final response:
- Explain in human terms what users can now do.
- Include commands run, pass/fail, commit hash, and push status.
```
