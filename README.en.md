# Codex Workflows (CWF)

> Chinese: [README.md](README.md)
>
> A Codex-native bounded workflow skill and template library: reusable workflow templates and local helpers that split complex tasks into scoped, verifiable `run plan`s and return the result to the originating Codex conversation.

Codex Workflows is built for OpenAI Codex and Codex Desktop. It is not a standalone agent platform, not a hosted workflow service, and not an arbitrary Node runtime. The originating Codex conversation remains the coordinator. `workflow.js` files are readable and adaptable harness/spec files for Codex. Execution favors native Codex capabilities: native subagents, Codex SDK, Codex Desktop `desktop-thread`, and `background+heartbeat`.

## Quick Start

Install the skill into the local Codex skill root:

```bash
mkdir -p ~/.codex/skills
ln -sfn "$(pwd)/skills/codex-workflows" ~/.codex/skills/codex-workflows
python3 skills/codex-workflows/scripts/check_skill_install.py --check-install
```

After install, new Codex sessions should see `$codex-workflows`. Already-running sessions do not hot-refresh the skill list.

Verify the repo:

```bash
npm run check
```

## When To Use It

Use CWF for:

- large repo audits and release-risk checks
- complex PR / diff review, adversarial verification, and evidence review
- root-cause investigation, bug hunt, migration, and refactor planning
- work that benefits from multiple isolated worker contexts
- safe fix loops with explicit write approval
- long tasks where the main conversation should receive the final synthesis later

Avoid CWF for:

- tiny typo, import, or button-style fixes
- ordinary tasks that one Codex turn can finish cleanly
- exploratory chat without a goal or acceptance criteria
- unbounded platform-managed agent swarms

## What You Get

| Category | Contents |
|---|---|
| Workflow templates | 8 built-in templates: repo audit, code review, adversarial verify, safe fix loop, and more |
| Run helpers | `cwf-run-preview.mjs`, `cwf-run-plan.mjs`, `cwf-start.mjs`, `cwf-run-state.mjs` |
| Worker evidence helpers | `cwf-worker-sdk.mjs`, `cwf-worker-desktop-thread.mjs`, `cwf-native-subagent.mjs` |
| Safety helpers | `cwf-safe-write.mjs`, `cwf-return-envelope.mjs`, `cwf-return-heartbeat.mjs` |
| Skill package | library-style Codex skill package: `SKILL.md`, `references/`, `templates/run-plan.md`, `evals/trigger_cases.json`, `scripts/check_skill_install.py` |
| Skill registry helper | `cwf-skills.mjs` for list/read/validate over the current skill SOP |

Inspect the current version's skill registry:

```bash
node scripts/cwf-skills.mjs list --format markdown
node scripts/cwf-skills.mjs list codex-workflows --format markdown
node scripts/cwf-skills.mjs read codex-workflows/references/routing.md
node scripts/cwf-skills.mjs validate codex-workflows --format markdown
```

`cwf-skills.mjs` only exposes SOP content such as `SKILL.md`, `references/`, `templates/`, and `evals/`; it refuses `scripts/`, assets, absolute paths, and `..` escapes.

## Core Concepts

**Run plan**: scope, phases, workers, budget, and stop rules generated before each run. Preview a workflow and generate a run plan:

```bash
node scripts/cwf-run-preview.mjs workflows/repo-audit.workflow.js
node scripts/cwf-run-plan.mjs workflows/repo-audit.workflow.js \
  --objective "audit this repo" \
  --run-id demo
```

**Run artifacts**: `.cwf/runs/RUN_ID/` stores local run state, run plan, worker packets, worker results, return envelope, and final summary. Initialize full run evidence:

```bash
node scripts/cwf-start.mjs workflows/repo-audit.workflow.js \
  --objective "audit this repo" \
  --run-id demo
node scripts/cwf-run-state.mjs status --run-id demo
```

**Worker visibility**:

| Mode | Meaning | Best For |
|---|---|---|
| `inline` | worker runs quietly and returns to the coordinator | normal audits, checks, analysis |
| `desktop-thread` | worker gets a visible Codex Desktop thread | long tasks, write workers, follow-up questions |
| SDK background workers | quiet execution through `@openai/codex-sdk` | background workers that do not need sidebar visibility |
| `background+heartbeat` | background work wakes the originating conversation later | long tasks where the main turn should not keep waiting |

Record worker evidence:

```bash
node scripts/cwf-worker-sdk.mjs --mode real --run-id demo --worker correctness
node scripts/cwf-worker-desktop-thread.mjs --run-id demo --worker visible-fixture
```

**Result synthesis**: the final synthesis must return to the originating CWF conversation. `heartbeat_synthesis` only counts after a real marker reply appears in that conversation; creating an automation is not enough.

**Workflow files**: `workflow.js` is a workflow harness/spec, not a script to execute directly. CWF does not run unknown JavaScript as arbitrary code.

## Safety Contract

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

SDK workers and `desktop-thread` workers may propose patches, but real apply goes back through the coordinator's safe write gate.

External advisors or review tools can enter a run plan or return envelope only as `external_review_receipts[]`. They may propose risks, blockers, and `goal_delta` changes, but they are not CWF workers, cannot write files, and cannot replace tests or checker-owned verified state. See [docs/EXTERNAL_REVIEW_RECEIPTS.md](docs/EXTERNAL_REVIEW_RECEIPTS.md).

## Built-In Workflow Templates

| Template | Purpose |
|---|---|
| `workflows/repo-audit.workflow.js` | repo audit and release-risk review |
| `workflows/code-review.workflow.js` | code, PR, and diff review |
| `workflows/adversarial-verify.workflow.js` | adversarial verification and counterevidence |
| `workflows/safe-fix-loop.workflow.js` | approval-gated fix loop |
| `workflows/classify-and-act.workflow.js` | classify first, then choose an action |
| `workflows/pipeline.workflow.js` | staged execution |
| `workflows/tournament.workflow.js` | compare multiple candidates and judge |
| `workflows/ui-copy-review.workflow.js` | UI, copy, and information hierarchy review |

These files are specs for Codex to interpret and coordinate, not scripts to execute directly with Node.

## Relationship To Claude Dynamic Workflows

CWF is inspired by Claude Dynamic Workflows, but it does not claim to fully replicate them. Claude is closer to a platform-native orchestration runtime that can run orchestration scripts outside the chat and coordinate many subagents. CWF is lighter: the originating Codex conversation remains the coordinator, `workflow.js` is a harness/spec, workers split out only when useful, important claims are challenged by a verifier, and the final answer returns to the originating conversation.

See [docs/CWF_CLAUDE_COMPARISON.md](docs/CWF_CLAUDE_COMPARISON.md) for the fuller comparison.

## Current Boundaries

- Not a hosted workflow service.
- Not a standalone agent platform.
- SDK automatic callback and platform automatic callback are not claimed as available.
- Desktop-thread is reserved for workers worth following separately, not every worker.
- File writes still use an approval-gated patch flow.
- External review receipts are advisory evidence and cannot replace tests or checker-owned verified state.

## Docs

- [README.md](README.md): Chinese default README
- [README.zh-CN.md](README.zh-CN.md): Chinese mirror
- [docs/CORE.md](docs/CORE.md): core principles
- [docs/RUN_EXPERIENCE.md](docs/RUN_EXPERIENCE.md): run experience
- [docs/WORKFLOW_JS.md](docs/WORKFLOW_JS.md): `workflow.js` contract
- [docs/CWF_ASYNC_RUNTIME.md](docs/CWF_ASYNC_RUNTIME.md): foreground / background / heartbeat contract
- [docs/EXTERNAL_REVIEW_RECEIPTS.md](docs/EXTERNAL_REVIEW_RECEIPTS.md): external review receipt contract

## Check

```bash
npm run check
python3 skills/codex-workflows/scripts/check_skill_install.py --check-install
```
