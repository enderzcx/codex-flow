# Codex Workflows

> 中文优先: [README.zh-CN.md](README.zh-CN.md)

Codex Workflows is a native bounded dynamic workflow skill for Codex.

The point is not "open more agents." The point is to move hard orchestration out of a drifting chat context and into a small, inspectable run plan: scope first, fan out only where useful, challenge important results, verify, then summarize back to the same conversation.

It is not a standalone agent platform and not a Node CLI runner. The core loop is:

```text
User goal
  -> Codex main session writes or selects a workflow.js harness
  -> Codex main session produces a bounded run plan
  -> Codex main session interprets that harness
  -> Codex spawns native subagents
  -> subagents inherit the current Codex sandbox and approval policy
  -> important workers may be promoted to visible Desktop threads
  -> Codex waits or runs in background, adapts, verifies, and summarizes back in the same conversation
```

## What Stays

- A Codex skill: `skills/codex-workflows/SKILL.md`
- JavaScript workflow harness templates under `workflows/`
- Native Codex subagents as the execution surface
- Scope-first run plans for non-trivial workflows
- Same-conversation result synthesis
- Optional Desktop-thread visibility for long, writable, or follow-up-worthy workers
- Optional background + heartbeat return for long workflows that should not block the main turn
- Human-readable stop conditions, gates, and verification rules

## What Was Removed

The old external runtime has been removed from the product core:

- no TypeScript CLI runner
- no YAML workflow registry
- no app-server thread simulation as the main path
- no safePatch engine as the default experience
- no CI-shaped smoke matrix as the primary product surface

Those ideas may return only as optional adapters after the native workflow skill is solid.

## Workflow Templates

Current templates:

- `workflows/classify-and-act.workflow.js`
- `workflows/adversarial-verify.workflow.js`
- `workflows/pipeline.workflow.js`
- `workflows/repo-audit.workflow.js`
- `workflows/safe-fix-loop.workflow.js`
- `workflows/tournament.workflow.js`
- `workflows/ui-copy-review.workflow.js`

These files are not executed by Node. They are readable harness specs for Codex to interpret with the native subagent tools available in the current session.

## Worker Visibility

Most workers should stay `inline`: their result returns to the main conversation without creating sidebar noise.

Use `desktop-thread` only when the worker is worth opening later:

- long-running research or review;
- implementation / write workers;
- work that the user may want to inspect, steer, or continue separately.

Use `auto` when the workflow wants Codex to decide from task length, risk, write scope, and whether the worker needs follow-up.

The invariant: final synthesis always returns to the conversation that launched the workflow.

Long-running workflows do not have to make the main conversation wait. CWF can run as `background+heartbeat`: the runtime writes state and final output under `.cwf/runs/RUN_ID/`, then schedules a heartbeat follow-up for the originating conversation. That follow-up counts as `heartbeat_synthesis` only after the coordinator observes a real marker reply in the originating thread; otherwise it stays `heartbeat-scheduled` or `heartbeat-scheduled-not-returned`. SDK workers are useful for quiet background execution, but they are not a left-sidebar visibility guarantee. `desktop-thread` remains the path for selected workers the user should see in Codex Desktop's sidebar.

## Failure Modes

Use a workflow when a single long Codex context is likely to fail structurally:

- `agentic laziness`: a long task stops after partial progress and calls itself done;
- `self-preferential bias`: the same agent produces and judges its own answer;
- `goal drift`: the task loses original constraints after many turns or compactions.

CWF solves these with isolated worker contexts, separate verifiers, explicit stop conditions, and a final synthesis step in the originating conversation.

## Bounded Dynamic Workflows

CWF is inspired by Claude Dynamic Workflows, but it intentionally keeps a smaller native Codex shape: no unbounded agent swarm and no hidden unrestricted scheduler. For CWF, "dynamic" means Codex can draft or adapt a run plan for the current task. "Bounded" means the plan has scope, budget, quarantine, verifier, and stop rules before serious work starts. Optional SDK/heartbeat adapters may run long work in the background, but `workflow.js` remains a harness spec, not arbitrary Node code.

Use this shape for large migrations, repo audits, bug hunts, source-backed research, adversarial review, and safe fix loops. Do not use it for daily small edits where one Codex turn is cheaper and clearer.

## Run Experience

CWF should preview the harness before non-trivial runs, keep compact status while workers run, support cancel/resume semantics, and return the final synthesis to the originating conversation.

For non-trivial work, the preview should include the generated run plan: scope, phases, workers, verifier/challenger, write scopes, quarantine path, budget, and stop conditions.

Inline workers stay quiet. Desktop-thread workers are only used when their process is worth inspecting or continuing separately.

Generate a local preview:

```bash
node scripts/cwf-run-preview.mjs workflows/repo-audit.workflow.js
```

Generate and persist a bounded run plan:

```bash
node scripts/cwf-run-plan.mjs workflows/repo-audit.workflow.js --objective "audit this repo" --run-id demo
```

Record local run state for cancel/resume fixtures:

```bash
node scripts/cwf-run-state.mjs init --run-id demo --workflow workflows/repo-audit.workflow.js
node scripts/cwf-run-state.mjs status --run-id demo
```

Initialize a full controller artifact set with worker packets and result slots:

```bash
node scripts/cwf-start.mjs workflows/repo-audit.workflow.js --objective "audit this repo" --run-id demo
```

Run state, run plans, final summaries, and return envelopes live under ignored `.cwf/runs/RUN_ID/` and are not part of the npm package. The return envelope records the final destination, return mode, evidence path, verifier status, deferred items, and completion status. The default return mode is coordinator synthesis; platform automatic callback remains deferred unless a future real smoke proves it.

Async return behavior is specified in [docs/CWF_ASYNC_RUNTIME.md](docs/CWF_ASYNC_RUNTIME.md). The short version: `foreground` waits in the current turn; `background` writes local state for polling/resume; `background+heartbeat` schedules a wake-up for the originating conversation and must keep polling/resume evidence until a real marker reply is observed. Selected `desktop-thread` workers can still appear in the Codex Desktop left sidebar, but SDK background workers should be treated as quiet workers unless promoted through the Desktop-thread path.

Native runtime adapter helpers are local evidence surfaces. `cwf-worker-sdk.mjs --mode real` uses `@openai/codex-sdk` to run a read-only fixed-marker SDK worker and record the real SDK thread id, final response, usage, timeout, and errors.

- `scripts/cwf-native-subagent.mjs` records host-native subagent results or `native-subagent-unavailable`.
- `scripts/cwf-worker-sdk.mjs` records SDK worker fixture results or real SDK marker-smoke results.
- `scripts/cwf-worker-desktop-thread.mjs` records Desktop-thread failure fixtures, approval-gated pending smoke, or an approved real-smoke result.
- `scripts/cwf-return-heartbeat.mjs` records heartbeat fixture, scheduled, scheduled-not-returned, real-smoke, or unavailable states. It only records `heartbeat_synthesis` after a real originating-thread marker was observed.

These helpers do not create visible Desktop threads unless the exact smoke has been approved, and they do not claim SDK automatic callback or platform automatic callback.

The current Claude Dynamic Workflows comparison is tracked in [docs/CWF_CLAUDE_COMPARISON.md](docs/CWF_CLAUDE_COMPARISON.md).

The full plan for eating the available Codex-native subagent/thread/SDK/heartbeat surfaces is tracked in [docs/CWF_FULL_NATIVE_RUNTIME_PLAN.md](docs/CWF_FULL_NATIVE_RUNTIME_PLAN.md), with a copy-ready goal prompt in [docs/goals/CWF_FULL_NATIVE_RUNTIME_GOAL.md](docs/goals/CWF_FULL_NATIVE_RUNTIME_GOAL.md).

Generate bounded workflow drafts for the first supported families:

```bash
node scripts/cwf-generate-workflow.mjs "audit this repo for release risk"
node scripts/cwf-generate-workflow.mjs "fix a bounded bug"
```

Inspect built-in workflow catalog data:

```bash
node scripts/cwf-catalog.mjs
```

Safe write workers are modeled as approval-gated bounded patch flow, not direct Desktop-thread or SDK filesystem writes. `scripts/cwf-safe-write.mjs` validates preview gate, `approve-write`, path policy, coordinator approval for non-coordinator patch proposals, apply-check result, declared verification, changed files, and rollback evidence for fixtures and approved disposable smoke targets.

Evaluate a real patch file after the preview and approval gates:

```bash
node scripts/cwf-safe-write.mjs \
  --patch change.patch \
  --allowed docs \
  --forbidden .env \
  --approval approve-write \
  --prior-gate previewed \
  --apply-check passed \
  --verification-status pass
```

All helper scripts support `--help`. They are local evidence helpers for the Codex-native skill, not a standalone product runtime.

Current MVP evidence is summarized in [docs/CWF_MVP_EVIDENCE.md](docs/CWF_MVP_EVIDENCE.md), with labels for real-smoke, fixture, dry-run, approval-gated, and deferred proof.

Post-MVP enhancements are planned in [docs/CWF_ENHANCEMENT_ROADMAP.md](docs/CWF_ENHANCEMENT_ROADMAP.md), with staged goal prompts in [docs/goals/CWF_ENHANCEMENT_GOALS.md](docs/goals/CWF_ENHANCEMENT_GOALS.md) and one all-in implementation goal in [docs/goals/CWF_FULL_IMPLEMENTATION_GOAL.md](docs/goals/CWF_FULL_IMPLEMENTATION_GOAL.md).

Release-readiness evidence is tracked in [docs/CWF_RELEASE_READINESS.md](docs/CWF_RELEASE_READINESS.md). It is local package readiness evidence, not npm publish, git tag, deploy, marketplace, or hosted scheduler proof.

## Budget And Quarantine

Every saved workflow should name a budget and stop rule. Dynamic workflows can spend far more tokens than a normal turn, so templates should make the limit visible.

Any workflow that reads untrusted public or user-submitted content should quarantine it:

- raw readers stay read-only;
- privileged workers receive sanitized summaries;
- write/deploy/payment/database actions require explicit approval.

## Save As Skill

When a workflow proves useful, save it as a template and ship it inside a Codex skill. Treat saved workflows as adaptable harness specs, not scripts to execute verbatim.

## When To Use

Use Codex Workflows when the task benefits from separate clean contexts:

- repo audit or release review
- root-cause investigation
- adversarial verification
- safe fix loops
- UI/copy/design review
- migration or refactor planning
- claim checking
- sorting or tournament-style evaluation

Do not use it for trivial edits, one-off commands, or normal coding tasks that one Codex turn can finish cleanly.

## Check

```bash
npm run check
```

This validates the native skill and workflow templates. It intentionally does not build an external runtime.
