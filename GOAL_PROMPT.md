---
half_life: 7d
archive_at: 2026-06-09
---

# Goal Prompt For The Next Run

Use this when setting a goal for implementation:

```text
Build the public Codex-native `codex-workflows` MVP in /Users/sunny/Work/CODEX/codex-workflows.

Scope:
- Implement only the public Codex-native runner.
- Do not add third-party model routing or private adapters.
- Implement one workflow only: `diff-review`.
- Use Codex SDK if reachable; if not reachable, report the blocker and stop instead of inventing another architecture.
- Keep `diff-review` read-only by default.

Required deliverables:
- CLI commands: cwf --help, cwf run, cwf status, cwf result, cwf cancel.
- Workflow spec for diff-review.
- Skill file at skills/codex-workflows/SKILL.md.
- Run store under ~/.codex-workflows/runs/<run-id>/.
- Persisted events.jsonl, state.json, worker outputs, and result.md.
- Fixture or smoke target proving the workflow runs end to end.
- README/docs explaining how the result differs from Claude Dynamic Workflows.

Acceptance:
- Follow /Users/sunny/Work/CODEX/codex-workflows/IMPLEMENTATION_PLAN.md.
- Follow /Users/sunny/Work/CODEX/codex-workflows/ACCEPTANCE.md.
- Stop after diff-review MVP passes smoke; do not expand into ui-check/repo-audit/research-crosscheck yet.
- Final response must include exact commands run and what passed/failed.
```
