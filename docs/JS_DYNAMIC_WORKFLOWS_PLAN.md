---
half_life: 30d
archive_at: 2026-07-06
scope_type: roadmap
scope_name: v1.11-v1.16 JS Dynamic Workflows
coverage: Complete roadmap and delivery contract for making Codex Flow feel like Claude Dynamic Workflows by using a JavaScript workflow harness.
not_complete_for: Full Claude product parity, unrestricted Node.js execution, remote workflow marketplace execution, production deploy automation, database writes, credentials, payments, permissions, or unreviewed autonomous writes.
verification_level: docs-only
real_smoke_status: requires_approval
review_status: approved
reviewer: reasonix-v4pro
review_command: crb review --scope working-tree --mode final-review --compact --json --timeout-ms 240000
review_notes: Approved after adding session-permission inheritance capped by parent Codex permissions, generated-current-session SHA binding, strict origin enum, non-skippable inherited-permission preview, explicit app-thread downgrade status, and artifact-boundary verification.
review_owner: Codex resolves blocker/high findings before implementation goal starts
review_due: resolved 2026-06-06
---

# JS Dynamic Workflows Plan

Status: reviewed-plan.

## Alignment Snapshot

- Building: a Claude-like JavaScript workflow harness for Codex Flow, where Codex can generate a task-specific `workflow.js`, show a preview, ask for approval, and then execute the script through safe CWF runtime APIs.
- Not building: unrestricted `node workflow.js`, exact Claude product parity, hidden writes, remote untrusted workflow execution, marketplace lifecycle, daemon scheduling, non-Codex model routing, or production/database/credential/payment/permission writes.
- Source of truth: v1.7 app-thread worker evidence, v1.10 safe write worker evidence, current CWF run-store/artifact/reducer contracts, Codex app-server and SDK capabilities, and Claude Dynamic Workflows public descriptions.
- Deliverables: PRD, SPEC, acceptance matrix, phase plan, and a copy-ready v1.11 `/goal` prompt.
- Phase scope: roadmap-level contract for v1.11-v1.16, with v1.11 as the first implementable version slice.
- Completeness: complete enough to start v1.11 without re-litigating whether JavaScript is the right dynamic-workflow surface.
- Verification level: this planning artifact is docs-only; implementation must prove fixture, local, and controlled real-smoke behavior.
- Review requirement: Reasonix/v4Pro rereview passed on 2026-06-06 after session-permission inheritance changes.
- Verification: `git diff --check`, delivery-doc mechanical validation if available, `npm run check`, `bash scripts/smoke-cli.sh`, Reasonix review, and future implementation evidence listed below.
- Open decisions: none blocking. The selected architecture is JavaScript-first, with a capability-scoped `cwf` runtime object and Codex-native workers that may inherit the parent session permission cap in trusted local runs.

Capability sentence:

This planning pass helps public Codex Flow users build Claude-like dynamic workflows by producing a JavaScript-harness roadmap and v1.11 delivery contract, using current CWF safe-write, app-thread, and Codex permission evidence as source of truth, while avoiding unrestricted script execution, hidden writes, and platform-scheduler scope.

## Source Summary

Anthropic describes Claude Dynamic Workflows as a research-preview feature where Claude writes orchestration scripts that run many subagents in parallel, checks results before folding them in, and keeps progress outside the main conversation so long runs can resume. A follow-up Anthropic article describes the implementation shape more directly: dynamic workflows execute a JavaScript file with special functions for spawning and coordinating subagents; workflows can choose models and worktree isolation; saved workflows can be distributed through skills.

Community writeups converge on the same mental model: the important shift is moving orchestration state out of the model context window and into a background runtime. They also highlight operational risks: runaway subagent loops, high token usage, and the need for per-agent time, round, and budget fuses.

References:

- Anthropic: [Introducing dynamic workflows in Claude Code](https://claude.com/blog/introducing-dynamic-workflows-in-claude-code)
- Anthropic: [A harness for every task: dynamic workflows in Claude Code](https://claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code)
- Anthropic docs: [Multiagent sessions](https://platform.claude.com/docs/en/managed-agents/multi-agent)
- Community guide: [Claude Code Dynamic Workflows: How to Orchestrate 1,000 Subagents on a Real Codebase](https://www.buildthisnow.com/blog/guide/development/claude-code-dynamic-workflows)
- Node.js docs: [VM is not a security mechanism](https://nodejs.org/api/vm.html)
- Node.js docs: [Permission Model](https://nodejs.org/api/permissions.html)

Design implication for CWF:

- CWF should use JavaScript for dynamic workflows if the goal is Claude-like ergonomics.
- JavaScript must be the orchestration language, not a bypass around CWF safety.
- All high-impact actions must go through CWF-provided capabilities: `cwf.agent`, `cwf.git`, `cwf.write.safePatch`, `cwf.verify`, `cwf.artifacts`, and `cwf.report`.

## Plain-Language Result

Today CWF can run static workflows and safe gated writes. That is useful, but it does not feel like Claude Dynamic Workflows because the user still has to choose or author a workflow shape up front.

The target experience:

1. The user says: "Use a dynamic workflow to audit this repo for auth risks and fix small confirmed issues."
2. Codex generates a `workflow.js` harness for that specific task.
3. CWF shows the script summary, planned agents, write boundaries, budgets, and stop conditions.
4. The user approves.
5. The JavaScript harness runs through CWF's controlled runtime APIs.
6. Read-only workers may appear as Codex Desktop app-thread workers.
7. Write-capable Codex workers can either use `safePatch` for public/auditable patch mode, or inherit the parent Codex session permission cap in a trusted local run.
8. The initiating Codex conversation gets a short human summary, while artifacts keep the full evidence.

The important shift: CWF becomes a dynamic harness runtime, not just a YAML workflow runner.

## PRD

### Problem

Static YAML workflows are predictable, but they do not match how users ask for large agentic work. Users do not want to pick a workflow ID, count workers, and decide phases. They want to say what they need, inspect what the agent plans to run, approve it, and come back to a checked answer.

Claude Dynamic Workflows demonstrate a stronger UX:

- the model writes a task-specific harness;
- the harness can fan out agents;
- intermediate state stays outside the main chat;
- agents can be verified or refuted before final synthesis;
- users can save good workflows for reuse.

CWF already has pieces that should not be thrown away:

- app-thread read-only workers can create Desktop-visible worker threads;
- SDK workers can run local Codex tasks;
- v1.10 safe writes can apply bounded patches after approval;
- run-store artifacts make progress auditable;
- reducers produce stable final result envelopes.

The gap is a dynamic JavaScript orchestration layer that composes those pieces.

### Target Users

- Codex users who want Claude-like dynamic workflow ergonomics without leaving Codex.
- Maintainers who want CWF to remain safe, auditable, and packageable.
- Skill authors who want to package reusable dynamic workflows.
- Advanced users who want background multi-agent runs with visible worker threads and a clean final answer.

### Goals

- Add a JavaScript workflow harness as the primary dynamic workflow surface.
- Let Codex generate `workflow.js` from a user request, but require preview and approval before execution.
- Execute scripts inside a constrained runtime that exposes a safe `cwf` API.
- Support fan-out, map, branch, tournament, adversarial verification, and loop-until patterns through runtime APIs.
- Support two write paths: `safePatch` for public/auditable patch mode, and `inherit-session` for trusted local Codex-native workers that should behave like the parent Codex session.
- Preserve current YAML workflows as stable bundled workflows.
- Store script, plan, runtime events, agent outputs, budgets, and final report as run artifacts.
- Keep same-conversation result return as the default UX.
- Make app-thread workers an optional visibility surface, not a requirement.
- Add explicit token/time/round/concurrency fuses to avoid runaway workflows.

### Non-Goals

- No unrestricted Node.js filesystem, process, network, or package access.
- No execution of remote JavaScript workflows by URL.
- No auto-running generated scripts without preview and approval.
- No direct JavaScript writes to the real target repo.
- No permission escalation beyond the parent Codex session's sandbox and approval profile.
- No bypass around v1.10 `allowed_paths`, `forbidden_paths`, drift check, `git apply --check --3way`, verification, and rollback.
- No daemon scheduler, queue service, hosted agent platform, or exact Claude product clone in v1.11-v1.16.
- No non-Codex model routing.
- No production deploy, database, credential, payment, permission, or external-message writes.

### User Stories

- As a user, I can say "run a dynamic workflow" and get a generated workflow preview before anything executes.
- As a user, I can see planned agents, concurrency, budget, write permissions, and stop conditions before approving.
- As a user, I can run a generated workflow and receive one coordinated result in the initiating Codex conversation.
- As a user, I can inspect run artifacts when I need details.
- As a Desktop user, I can opt into worker threads for read-only agents.
- As a cautious user, I can let the workflow propose code changes without letting it write directly to my repo.
- As a maintainer, I can test dynamic workflow behavior with deterministic fixtures.
- As a skill author, I can package a saved `workflow.js` template and let Codex adapt it for the current task.

### Success Criteria

- A generated or local `workflow.js` can run through CWF without unrestricted Node.js access.
- The first v1.11 smoke proves a simple JS workflow can spawn at least two read-only agents, collect outputs, and synthesize a result.
- Script preview shows planned capabilities and budget before execution.
- Generated scripts cannot call `fs`, `child_process`, `fetch`, dynamic import, or arbitrary shell directly.
- Dynamic execution fails closed if CWF cannot enforce both the static AST policy gate and the permissioned child-process boundary.
- All agent execution goes through `cwf.agent.*`.
- v1.11 dynamic agents are read-only by default, but trusted local runs can request `inherit-session` and receive only the parent Codex session's permission cap.
- Writes are never performed by JavaScript directly. They go through either `safePatch` or Codex-native workers under an explicit CWF permission profile.
- Run artifacts include the script, preview, events, agent outputs, final report, and budget usage.
- Runaway scripts stop on wall-clock, token, round, and concurrency limits.
- Existing YAML workflows and v1.10 safe-write workflows remain compatible.

## SPEC

### Runtime Model

There are two workflow surfaces:

1. Static workflows: existing YAML workflow specs for stable packaged flows.
2. Dynamic workflows: JavaScript workflow harnesses executed by CWF with a capability-scoped runtime object.

Dynamic workflow execution shape:

```text
user request
  -> Codex generates or selects workflow.js
  -> CWF validates script metadata and capability declaration
  -> CWF renders preview
  -> user approves
  -> CWF executes workflow.js in constrained runtime
  -> workflow calls cwf APIs
  -> agents/write/verify/report produce artifacts
  -> final result returns to initiating conversation
```

### JavaScript Harness Contract

Dynamic workflows should use one default export:

```js
export default async function workflow(cwf) {
  const files = await cwf.git.changedFiles();
  const reviews = await cwf.map(files, async (file) => {
    return cwf.agent.run({
      id: `review-${file}`,
      role: "reviewer",
      prompt: `Review ${file} for auth risk.`,
      sandbox: "read-only",
    });
  }, { concurrency: 8 });
  return cwf.report.summarize(reviews);
}
```

Allowed language features in v1.11:

- standard JavaScript control flow;
- `Array`, `Object`, `Map`, `Set`, `JSON`, `Math`;
- async/await;
- deterministic timers exposed by CWF only if needed for budget checks.

Forbidden in v1.11:

- `fs`, `child_process`, `net`, `http`, `https`, `fetch`, `process`, environment access, dynamic import, CommonJS `require`, native addons, arbitrary package imports, and direct shell.

### Execution Containment Contract

Reasonix review called out the key implementation risk: passing only a safe `cwf` object is not a sandbox. A script run as ordinary Node.js can still reach globals, modules, or process APIs. v1.11 must define the containment mechanism before code starts.

v1.11 selected approach:

1. **Static AST policy gate**
   - Parse the workflow source before execution.
   - Allow only the expected workflow module shape: metadata export plus one default async workflow function.
   - Reject import declarations, dynamic import, CommonJS `require`, `eval`, `Function`, `globalThis`, `process`, `constructor`, `prototype`, `__proto__`, `Reflect`, `Proxy`, direct shell strings, and any call expression that is not rooted in `cwf` or an explicitly allowed JavaScript builtin.
   - Reject top-level executable statements outside metadata and the default workflow export.
   - If the parser dependency is needed at runtime, add a small maintained parser dependency such as `acorn`; do not hand-roll parsing with string matching.

2. **Permissioned child process**
   - Execute accepted scripts in a separate Node child process, not in the main CWF process.
   - Start the child with Node Permission Model enabled.
   - Do not grant filesystem read/write access to the target repo.
   - Do not grant network, child process, worker thread, native addon, WASI, FFI, or inspector permissions.
   - Grant only the minimum read access needed for the generated workflow artifact and runtime shim.
   - On Node versions without stable Permission Model support, dynamic execution must fail closed with `dynamic-runtime-unavailable` unless a future explicit unsafe dev-only flag is designed and reviewed. v1.11 does not add that unsafe flag by default.

3. **IPC-only capabilities**
   - The child process receives a frozen `cwf` proxy.
   - All `cwf.git`, `cwf.agent`, `cwf.map`, `cwf.artifacts`, and `cwf.report` calls are JSON-RPC messages to the parent CWF process.
   - The parent validates every request against run capabilities, budgets, target path policy, and adapter availability before doing work.
   - The child cannot read files, spawn agents, write artifacts, or inspect git state except through parent-approved CWF APIs.

4. **Codex-native worker permission contract**
   - `workflow.js` never receives raw filesystem, network, process, shell, or environment access.
   - `cwf.agent.run` supports an explicit permission profile:
   - `read-only`: default profile. Worker runs with Codex read-only sandbox settings. Any target diff change fails the run with `read-only-worker-violation`.
   - `safePatch`: public/auditable write profile. Worker writes in an isolated target and CWF applies only a reviewed patch through v1.10 safe-write controls.
   - `inherit-session`: trusted local profile. Worker inherits the parent Codex session's sandbox and approval cap, such as workspace-write or full access, but CWF must never grant permissions that the parent session does not already have.
   - `inherit-session` is allowed only for workflows with a trusted local origin:
     - `generated-current-session`: CWF generated the script during the initiating Codex session, wrote it into the run directory, recorded its SHA-256, and the approved script hash still matches at execution time.
     - `local-trust-record`: the user explicitly trusted a local workflow by SHA-256 for this repo through a future reviewed trust command or config record.
   - `inherit-session` is disabled for `remote`, `registry`, `packaged`, `copied-local`, and `unknown` origins. Copying a remote workflow into a local path must not make it trusted.
   - v1.11 should implement `generated-current-session` first. `local-trust-record` can be planned but may remain disabled until its own trust UX and tests exist.
   - Preview must show the requested permission profile, inherited parent permission cap, expected write surface, approval policy, and whether the worker may change the target repo.
   - Preview must also show workflow origin, script SHA-256, and whether `inherit-session` is allowed or rejected for that origin.
   - `inherit-session` preview is non-skippable. When the parent session has broad permissions such as workspace-write or full access, the preview must compare declared task scope with inherited capability and highlight surprising or broader-than-needed authority before approval.
   - SDK workers use Codex SDK sandbox/approval parameters derived from the selected permission profile. App-thread workers can inherit only when the app-server exposes a stable write-capable sandbox/approval contract; otherwise they remain read-only or fall back by explicit policy.
   - App-thread `inherit-session` fallback must never be silent. If write-capable app-thread inheritance is unavailable, CWF records `inherit-session-degraded-to-read-only`, shows it in status/final summary, and runs read-only only after explicit fallback approval.
   - The parent CWF process captures target diff before and after every dynamic worker. In `read-only`, any target change fails. In `inherit-session`, target changes are allowed only as declared run output and must be recorded in artifacts, status, and final summary.
   - Worker-produced artifacts are persisted by the parent CWF process into the run folder. Workers should not use arbitrary out-of-run artifact paths.
   - CWF permission inheritance is an upper-bound rule, not escalation: child workers can receive equal or lower authority than the parent session, never more.

5. **No `node:vm` as the security boundary**
   - Node's `vm` module may be used only as an execution convenience inside the already permissioned child process.
   - The plan must not rely on `vm` alone for security because official Node docs state it is not a security mechanism for untrusted code.

6. **Deny-by-test fixtures**
   - v1.11 must include malicious fixture scripts for `fs`, `child_process`, `process.env`, `fetch`, `require`, dynamic import, `globalThis`, constructor escape attempts, prototype escape attempts, and direct artifact writes.
   - v1.11 must include malicious or simulated worker fixtures proving read-only workers cannot mutate the target repo, trusted `inherit-session` workers cannot exceed the parent session permission cap, and unknown/copied/remote origins cannot request `inherit-session`.
   - These fixtures must fail before agent execution and must leave the target unchanged.

### Runtime API

Initial v1.11 API:

```ts
type WorkflowOrigin =
  | "generated-current-session"
  | "local-trust-record"
  | "copied-local"
  | "remote"
  | "registry"
  | "packaged"
  | "unknown";

type CwfRuntime = {
  origin: {
    kind: WorkflowOrigin;
    scriptSha256: string;
    inheritSessionAllowed: boolean;
  };
  git: {
    changedFiles(): Promise of string list;
    diff(paths?: string list): Promise of string;
    status(): Promise of string;
  };
  agent: {
    run(input: AgentRunInput & { permissions?: "read-only" | "safePatch" | "inherit-session" }): Promise of AgentRunResult;
  };
  map(
    items: list,
    fn: async function,
    options?: { concurrency?: number; label?: string }
  ): Promise of result list;
  artifacts: {
    writeText(path: string, content: string): Promise of artifact path;
    writeJson(path: string, value: unknown): Promise of artifact path;
  };
  report: {
    summarize(inputs: list): Promise of WorkflowReport;
  };
};
```

Unknown or unhandled origin values must fail closed before worker execution. In v1.11, `local-trust-record` should parse as a known origin but remain disabled for `inherit-session` unless the trust command/config is fully implemented and tested.

Future API:

```ts
cwf.agent.thread(...)
cwf.verify.adversarial(...)
cwf.tournament(...)
cwf.loop.until(...)
cwf.classify(...)
cwf.write.safePatch(...)
cwf.workflow.save(...)
```

### Capability Declaration

Every dynamic workflow must declare capabilities before execution:

```js
export const workflow = {
  id: "auth-risk-audit",
  title: "Auth Risk Audit",
  capabilities: {
    agents: true,
    appThreadWorkers: false,
    writes: false,
    network: false,
  },
  budgets: {
    maxAgents: 12,
    maxConcurrency: 4,
    maxRounds: 3,
    timeoutMs: 600000,
  },
};
```

If the script does not declare capabilities, CWF may infer a conservative preview, but execution should require explicit user approval.

### Preview And Approval

Before execution CWF writes:

```text
artifacts/workflow-preview.md
artifacts/workflow-script.js
artifacts/workflow-capabilities.json
artifacts/workflow-budget.json
```

Preview must include:

- script source path or generated script artifact;
- planned capabilities;
- whether writes are possible;
- allowed and forbidden write paths when writes are possible;
- expected agent count or upper bound;
- concurrency and timeout budgets;
- stop conditions;
- whether app-thread worker visibility is requested.

The first implementation can require explicit CLI approval:

```bash
cwf dynamic approve RUN_ID
```

### Safe Write From JavaScript

Dynamic scripts must not write directly to the real target. When write support arrives, scripts call:

```js
await cwf.write.safePatch({
  id: "fix-auth-guards",
  prompt: "Fix only confirmed missing auth guards.",
  allowedPaths: ["src/auth/**", "tests/auth/**"],
  forbiddenPaths: [".env*", ".git/**"],
  verificationCommands: ["npm test -- auth"],
});
```

`safePatch` reuses v1.10:

- preview artifacts;
- approval gate;
- isolated target writer;
- proposed patch artifact;
- allowed/forbidden path scan;
- target diff drift check;
- `git apply --check --3way`;
- apply;
- verification;
- rollback artifacts;
- failed verification cannot produce PASS.

### App-Thread Workers

App-thread workers remain a visibility and evidence surface:

- v1.12 can let `cwf.agent.run({ adapter: "codex-app-thread" })` create Desktop-visible read-only worker threads.
- v1.13 can let app-thread write workers participate only by writing inside an isolated target and returning patch artifacts through `safePatch`.
- No app-thread worker may directly modify the original target repo in the dynamic runtime.

### Budget And Fuse Model

Every dynamic run must have:

- max wall-clock time;
- max agent count;
- max concurrent agents;
- max rounds per loop;
- max output bytes per agent stored in primary summary;
- full raw output stored as artifacts;
- cancellation behavior;
- partial-result reporting when a cap is hit.

Default v1.11 suggested budgets:

```json
{
  "maxAgents": 8,
  "maxConcurrency": 3,
  "maxRounds": 2,
  "timeoutMs": 300000,
  "maxAgentOutputBytes": 65536
}
```

### Error And Fallback Behavior

- Script parse error: fail before execution with source location and no agents started.
- Capability mismatch: fail before execution and show missing or forbidden capability.
- Agent failure: record agent artifact; continue only if failure policy allows.
- All agents fail: fail run.
- Budget hit: stop spawning new work, synthesize partial report, mark result as capped.
- App-thread unavailable: use SDK fallback only if the script or user approved fallback.
- Safe-write failure: follow v1.10 failure and rollback behavior.
- User cancels: stop current orchestration, record partial artifacts, no success claim.

## Acceptance Matrix

- [ ] JavaScript workflow preview is generated before execution.
  - Verification level: fixture/local.
  - Evidence: fixture dynamic workflow creates `workflow-preview.md`, `workflow-script.js`, capabilities, and budget artifacts without starting agents.

- [ ] Generated scripts require explicit approval before execution.
  - Verification level: fixture/local.
  - Evidence: run pauses at a gate; rejecting the gate starts no agents and leaves target unchanged.

- [ ] Runtime exposes only `cwf` capabilities in v1.11.
  - Verification level: fixture.
  - Evidence: tests reject or sandbox scripts that access `fs`, `child_process`, `process.env`, `fetch`, `require`, or dynamic import.

- [ ] Runtime containment is concrete, not just a safe object convention.
  - Verification level: fixture/local.
  - Evidence: implementation starts workflow scripts in a permissioned child process, blocks target repo filesystem access, and malicious fixtures fail before any agent starts.

- [ ] A simple JS workflow can spawn multiple read-only agents and synthesize one result.
  - Verification level: local.
  - Evidence: fixture workflow runs two or more mock/SDK workers, writes worker artifacts, and produces a reduced result.

- [ ] Spawned dynamic agents honor the requested CWF permission profile.
  - Verification level: fixture/local.
  - Evidence: `read-only` mutation fails; `inherit-session` receives no more than the parent session permission cap; untrusted remote/package workflows cannot request inherited writes.

- [ ] Trusted local dynamic agents can inherit the parent Codex session permission cap.
  - Verification level: local/manual.
  - Evidence: with a generated-current-session workflow, matching script SHA-256, explicit approval, and a write-capable parent session, `cwf.agent.run({ permissions: "inherit-session" })` records origin and inherited sandbox metadata and allows declared Codex worker file changes.

- [ ] Inherited broad permissions require a non-skippable preview.
  - Verification level: fixture/local.
  - Evidence: workspace-write or full-access parent permissions produce a preview that compares declared task scope with inherited capability and requires explicit approval before any worker starts.

- [ ] Unknown or untrusted workflow origins cannot inherit the parent session.
  - Verification level: fixture.
  - Evidence: copied-local, remote, registry, packaged, unknown-origin, and hash-mismatched scripts requesting `inherit-session` are rejected before worker execution.

- [ ] App-thread inherit-session degradation is explicit.
  - Verification level: fixture/local.
  - Evidence: missing or degraded app-thread write capability records `inherit-session-degraded-to-read-only`, requires explicit fallback approval, and appears in status and final summary.

- [ ] Map concurrency is bounded.
  - Verification level: fixture.
  - Evidence: test proves no more than configured concurrency tasks run at once.

- [ ] Agent count and round budgets stop runaway workflows.
  - Verification level: fixture.
  - Evidence: loop fixture hits `maxRounds` or `maxAgents`, stops cleanly, and reports capped status.

- [ ] App-thread dynamic workers remain optional and fallback-safe.
  - Verification level: local.
  - Evidence: app-thread request uses probe rules from v1.7; unavailable app-thread falls back only when configured.

- [ ] Dynamic write attempts cannot bypass v1.10 safe-write.
  - Verification level: fixture.
  - Evidence: direct JavaScript file write API is absent; public/untrusted workflows cannot write except through `safePatch`; trusted `inherit-session` writes are clearly labeled and bounded by the parent session permission cap.

- [ ] `safePatch` from JS reuses v1.10 evidence.
  - Verification level: local/real-smoke.
  - Evidence: approved dynamic safe-write smoke produces `proposed.patch`, diff summary, verification artifact, rollback artifact, and only allowed files change.

- [ ] Existing YAML workflows remain compatible.
  - Verification level: local.
  - Evidence: `npm run check` and `bash scripts/smoke-cli.sh` pass.

- [ ] Final result returns to the initiating conversation when launched from the skill.
  - Verification level: local/manual.
  - Evidence: skill wrapper reports dynamic run summary in the current Codex conversation; otherwise CLI `cwf result` provides the same summary.

- [ ] Saved JS workflows can be packaged later without executing remote code.
  - Verification level: docs/fixture.
  - Evidence: save command writes local workflow files only; remote execution remains disabled.

## Phase Plan

### v1.11: JS Runtime MVP

Deliver:

- `cwf dynamic preview TASK_OR_SCRIPT` for generated or local `workflow.js` preview.
- constrained JS execution environment;
- AST policy gate plus permissioned child-process execution boundary;
- `cwf.agent.run` permission profiles: default `read-only`, public `safePatch`, and trusted local `inherit-session`;
- `cwf.git`, `cwf.agent.run`, `cwf.map`, `cwf.artifacts`, `cwf.report`;
- script/capability/budget artifacts;
- approval gate before execution;
- fixture dynamic workflows;
- docs and goal prompt.

Verify:

- `npx vitest run tests/dynamic-workflow*.test.ts`
- `npm run check`
- `bash scripts/smoke-cli.sh`
- fixture CLI smoke with a local script that spawns two read-only workers.
- trusted local smoke with generated-current-session origin, matching script SHA-256, and `inherit-session` metadata when the parent session is write-capable.
- malicious fixture scripts for forbidden globals, modules, process, network, and filesystem access.
- worker sandbox fixtures proving read-only mutation fails, untrusted or hash-mismatched inherited writes are rejected, and trusted inherited writes cannot exceed the parent session permission cap.
- preview fixtures proving broad inherited permissions cannot skip explicit approval.
- origin enum fixtures proving unknown/unhandled origins fail closed and `local-trust-record` stays disabled until implemented.
- app-thread fallback fixtures proving degraded inheritance is explicit and not silently downgraded.

Stop if:

- implementation requires unrestricted Node.js access;
- script execution cannot enforce the AST gate plus permissioned child-process boundary;
- the local Node runtime cannot support Permission Model for dynamic execution and no reviewed fail-closed fallback exists;
- `cwf.agent.run` cannot enforce read-only default behavior, trusted-local inheritance rules, and parent permission cap limits;
- CWF cannot distinguish generated-current-session workflows from unknown/copied/remote origins before allowing `inherit-session`;
- broad inherited permissions can execute without a non-skippable preview;
- app-thread inherit-session fallback would silently downgrade or silently change write expectations;
- existing YAML workflows regress.

### v1.12: Desktop-Visible Dynamic Agents

Deliver:

- `cwf.agent.run({ adapter: "codex-app-thread" })`;
- app-thread metadata in dynamic worker artifacts;
- fallback behavior aligned with v1.7 probe requirements;
- one real app-thread dynamic smoke after Ender GO.

Verify:

- fake app-server tests;
- `cwf desktop check`;
- live read-only app-thread dynamic smoke;
- CI green.

Stop if:

- app-thread execution probe does not return fixed JSON;
- result retrieval is unreliable and no SDK fallback was approved.

### v1.13: Safe Writes From JS

Deliver:

- `cwf.write.safePatch()`;
- dynamic safe-write preview and approval;
- reuse v1.10 path policy, isolated target, patch apply, verification, and rollback;
- app-thread write workers only inside isolated targets if supported.

Verify:

- direct write bypass tests fail;
- safePatch fixture and controlled real-smoke pass;
- forbidden/outside-allowed/conflict/verification-fail tests pass.

Stop if:

- any path touches real target before approval;
- write behavior bypasses `git apply --check --3way`;
- app-thread writes cannot be isolated.

### v1.14: Dynamic Patterns

Deliver:

- `cwf.verify.adversarial`;
- `cwf.tournament`;
- `cwf.loop.until`;
- `cwf.classify`;
- built-in templates for audit, migration, research, and naming/design review.

Verify:

- deterministic fixture workflows for each pattern;
- budget cap tests;
- result quality tests for reducer shape and evidence coverage.

Stop if:

- loops can run without max rounds;
- tournament/adversarial flows cannot preserve provenance.

### v1.15: Save And Share

Deliver:

- save approved/generated scripts as local workflows;
- load saved JS workflows from safe local search paths;
- package workflow scripts in skills;
- inspect remote scripts without enabling or executing them.

Verify:

- save/load fixture;
- remote execution disabled tests;
- package dry-run includes saved workflow docs when intended.

Stop if:

- remote JavaScript can execute without explicit local install and review;
- saved workflow lacks capability metadata.

### v1.16: Claude-Like UX Polish

Deliver:

- status UI for phases, agents, budgets, and caps;
- pause/resume/cancel/restart agent where supported;
- human summary returned to initiating Codex conversation;
- concise `cwf dynamic watch`;
- docs comparing CWF Dynamic Workflows to Claude Dynamic Workflows honestly.

Verify:

- CLI watch smoke;
- same-conversation skill smoke;
- app-thread visibility manual proof when available;
- Reasonix final review.

Stop if:

- UX claims cannot be proven with local or Desktop evidence;
- docs imply exact Claude parity where CWF only supports a subset.

## Goal Prompt

Copy-ready v1.11 goal prompt lives in `docs/goal-prompts/v1.11-js-dynamic-runtime.md`.
