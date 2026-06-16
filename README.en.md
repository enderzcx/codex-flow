# Codex Workflows (CWF)

> Chinese: [README.md](README.md)
>
> CWF is a Codex-native bounded dynamic workflow skill. Small tasks should stay simple; complex tasks use CWF to split, run, verify, and return a coordinated answer.

Codex Workflows is built for OpenAI Codex and Codex Desktop. It turns complex work that would drift inside a long chat into a scoped, inspectable, resumable `run plan`.

CWF is not a standalone agent platform, not a hosted workflow service, and not a standalone Node runtime. The originating Codex conversation remains the coordinator. `workflow.js` is a readable harness/spec for Codex. Execution tries to reuse native Codex capabilities: native subagents, Codex SDK, Codex Desktop `desktop-thread`, and `background+heartbeat`.

## When To Use It

Use CWF for:

- large repo audits and release-risk checks
- complex PR review, adversarial verification, and evidence review
- root-cause investigation, bug hunt, migration, and refactor planning
- work that benefits from multiple isolated worker contexts
- safe fix loops with an explicit write boundary
- long tasks where the main conversation should receive the final synthesis later

Avoid CWF for:

- tiny typo, import, or button-style fixes
- ordinary tasks that one Codex turn can finish cleanly
- exploratory chat without a goal or acceptance criteria
- unbounded platform-managed agent swarms

## Core Flow

```text
user objective
  -> originating Codex conversation chooses or generates a workflow.js harness
  -> Codex creates a bounded run plan: scope, phases, workers, budget, stop rules
  -> Codex dispatches native subagents / SDK background workers / desktop-thread workers
  -> verifier or challenger reviews the critical claims
  -> file writes must go through the safe write gate
  -> coordinator_synthesis or heartbeat_synthesis returns the result to the originating conversation
```

`workflow.js` is a harness/spec, not an unrestricted Node script. CWF does not execute unknown JavaScript as arbitrary code.

## Worker Visibility

| Mode | Meaning | Best For |
|---|---|---|
| `inline` | worker runs quietly and returns to the coordinator | normal audits, checks, analysis |
| `desktop-thread` | worker gets a visible Codex Desktop thread | long tasks, write workers, follow-up questions |
| SDK background workers | quiet execution through `@openai/codex-sdk` | background workers that do not need sidebar visibility |
| `background+heartbeat` | background work wakes the originating conversation later | long tasks where the main turn should not keep waiting |

The final synthesis must return to the originating CWF conversation. `heartbeat_synthesis` only counts after a real marker reply appears in that conversation; creating an automation is not enough.

## Safety Boundary

Every CWF run should declare:

- Scope: paths, questions, and artifacts in scope
- Exclusions: what is explicitly out of scope
- Budget: token, worker, and time limits
- Stop rule: when to stop or report blocked
- Quarantine: how untrusted external input is isolated
- Verifier: who challenges the critical conclusion
- Write scope: which writes need approval

Workers cannot freely apply file changes. `scripts/cwf-safe-write.mjs` evaluates an approval-gated patch flow and apply-check evidence:

```text
preview -> approve-write -> path policy -> git apply --check -> verification -> rollback evidence
```

SDK workers and `desktop-thread` workers may propose patches, but real apply goes back through the coordinator's safe write gate.

External advisors or review tools can enter a run plan or return envelope only as `external_review_receipts[]`. They may propose risks, blockers, and `goal_delta` changes, but they are not CWF workers, cannot write files, and cannot replace tests or checker-owned verified state. See [docs/EXTERNAL_REVIEW_RECEIPTS.md](docs/EXTERNAL_REVIEW_RECEIPTS.md).

## Quick Start

Install the skill into the local Codex skill root:

```bash
mkdir -p ~/.codex/skills
ln -sfn "$(pwd)/skills/codex-workflows" ~/.codex/skills/codex-workflows
python3 skills/codex-workflows/scripts/check_skill_install.py --check-install
```

After install, new Codex sessions should see `$codex-workflows`. Already-running sessions do not hot-refresh the skill list.

Inspect the current version's agent-readable skill registry:

```bash
node scripts/cwf-skills.mjs list --format markdown
node scripts/cwf-skills.mjs list codex-workflows --format markdown
node scripts/cwf-skills.mjs read codex-workflows/references/routing.md
node scripts/cwf-skills.mjs validate codex-workflows --format markdown
```

`cwf-skills.mjs` only exposes SOP content such as `SKILL.md`, `references/`, `templates/`, and `evals/`; it refuses `scripts/`, assets, absolute paths, and `..` escapes.

Preview a workflow:

```bash
node scripts/cwf-run-preview.mjs workflows/repo-audit.workflow.js
```

Generate and save a run plan:

```bash
node scripts/cwf-run-plan.mjs workflows/repo-audit.workflow.js \
  --objective "audit this repo" \
  --run-id demo
```

Initialize full controller artifacts:

```bash
node scripts/cwf-start.mjs workflows/repo-audit.workflow.js \
  --objective "audit this repo" \
  --run-id demo
```

Check run state:

```bash
node scripts/cwf-run-state.mjs status --run-id demo
```

Record SDK worker evidence:

```bash
node scripts/cwf-worker-sdk.mjs --mode real --run-id demo --worker correctness
```

Record Desktop-thread worker evidence:

```bash
node scripts/cwf-worker-desktop-thread.mjs --run-id demo --worker visible-fixture
```

Evaluate an approved patch:

```bash
node scripts/cwf-safe-write.mjs \
  --patch change.patch \
  --allowed docs \
  --forbidden .env \
  --approval approve-write \
  --prior-gate previewed \
  --apply-check passed \
  --apply-check-command "git apply --check change.patch" \
  --apply-check-evidence "git apply --check passed" \
  --verification-status pass
```

Verify the repo:

```bash
npm run check
```

## Built-In Workflow Templates

- `workflows/repo-audit.workflow.js`: repo audit and release-risk review
- `workflows/code-review.workflow.js`: code, PR, and diff review
- `workflows/adversarial-verify.workflow.js`: adversarial verification and counterevidence
- `workflows/safe-fix-loop.workflow.js`: approval-gated fix loop
- `workflows/classify-and-act.workflow.js`: classify first, then choose an action
- `workflows/pipeline.workflow.js`: staged execution
- `workflows/tournament.workflow.js`: compare multiple candidates and judge
- `workflows/ui-copy-review.workflow.js`: UI, copy, and information hierarchy review

These files are not scripts to execute directly with Node. They are specs for Codex to interpret and coordinate.

## Run Artifacts

`.cwf/runs/RUN_ID/` stores local run state, run plan, worker packets, worker results, return envelope, and final summary. It is the local evidence boundary and is excluded from the npm package.

The default return path is `coordinator_synthesis`. Long tasks can use `background+heartbeat`, but `heartbeat_synthesis` is only recorded after the real marker returns to the originating conversation. Platform automatic callback remains deferred and is not claimed as complete here.

## Relationship To Claude Dynamic Workflows

CWF is inspired by Claude Dynamic Workflows, but it does not claim to fully replicate them.

Claude is closer to a platform-native orchestration runtime that can run orchestration scripts outside the chat and coordinate many subagents. CWF is lighter: the originating Codex conversation remains the brain, `workflow.js` is a harness/spec, workers split out only when useful, important claims are challenged by a verifier, and the final answer returns to the originating conversation.

See [docs/CWF_CLAUDE_COMPARISON.md](docs/CWF_CLAUDE_COMPARISON.md) for the fuller comparison.

## Current Status

Included today:

- Codex skill: `skills/codex-workflows/SKILL.md`
- Sunny-style library skill package: `references/routing.md`, `templates/run-plan.md`, `evals/trigger_cases.json`, `scripts/check_skill_install.py`
- agent-readable skill registry helper: `scripts/cwf-skills.mjs`
- bounded run plan helper: `scripts/cwf-run-plan.mjs`
- controller artifact initializer: `scripts/cwf-start.mjs`
- SDK worker evidence helper: `scripts/cwf-worker-sdk.mjs`
- Desktop-thread evidence helper: `scripts/cwf-worker-desktop-thread.mjs`
- heartbeat return evidence helper: `scripts/cwf-return-heartbeat.mjs`
- safe write gate helper: `scripts/cwf-safe-write.mjs`
- eight built-in workflow templates

Honest boundaries:

- CWF is not a hosted workflow service.
- CWF does not claim SDK automatic callback.
- CWF does not claim platform automatic callback.
- Desktop-thread is reserved for workers worth continuing in the sidebar, not every worker.
- File writes still use an approval-gated patch flow.

## Skill Package Structure

CWF is packaged as a Sunny-style library skill package:

| File | Purpose |
|---|---|
| `skills/codex-workflows/SKILL.md` | main Codex instruction file |
| `skills/codex-workflows/references/routing.md` | routing boundaries with `goal-writer`, `delivery-planner`, `project-status-audit`, and `codex-thread-orchestrator` |
| `skills/codex-workflows/templates/run-plan.md` | bounded run plan template |
| `skills/codex-workflows/evals/trigger_cases.json` | examples for trigger, non-trigger, and neighboring skills |
| `skills/codex-workflows/scripts/check_skill_install.py` | skill package and local install checker |
| `scripts/cwf-skills.mjs` | repo-level `skills list/read/validate` entrypoint for current-version agent SOP |

This keeps CWF routeable in both the public repo and local Codex skill root: trigger it for real workflows, and hand smaller tasks to narrower skills.

## Docs

- [README.md](README.md): Chinese default README
- [README.zh-CN.md](README.zh-CN.md): Chinese mirror
- [docs/CORE.md](docs/CORE.md): core principles
- [docs/RUN_EXPERIENCE.md](docs/RUN_EXPERIENCE.md): run experience
- [docs/WORKFLOW_JS.md](docs/WORKFLOW_JS.md): `workflow.js` contract
- [docs/CWF_ASYNC_RUNTIME.md](docs/CWF_ASYNC_RUNTIME.md): foreground / background / heartbeat contract

The repository also contains roadmap, goal, and evidence documents for maintainers. The npm package includes only the public core docs above so local paths, thread ids, and internal acceptance records do not leak into the public package.

## Check

```bash
npm run check
python3 skills/codex-workflows/scripts/check_skill_install.py --check-install
```
