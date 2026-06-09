import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { buildPreview, loadWorkflow, parseWorkflowSpec, resolveVisibility } from "./cwf-run-preview.mjs";
import { buildRunPlanFromWorkflow, renderRunPlanMarkdown } from "./cwf-run-plan.mjs";
import { deriveRunStatus, refreshResume } from "./cwf-run-state.mjs";
import { buildReturnEnvelope } from "./cwf-return-envelope.mjs";
import { evaluateSafeWriteRequest, evaluateVerifierGate } from "./cwf-safe-write.mjs";
import { generateWorkflowFromObjective, renderGeneratedWorkflow, scanUnsafeWorkflowText } from "./cwf-generate-workflow.mjs";
import { BUILT_IN_CATALOG, discoverProjectWorkflows, validateCatalogCoverage } from "./cwf-catalog.mjs";
import { startRun } from "./cwf-start.mjs";
import { recordSdkWorker } from "./cwf-worker-sdk.mjs";
import { recordDesktopThreadWorker } from "./cwf-worker-desktop-thread.mjs";
import { recordHeartbeatReturn } from "./cwf-return-heartbeat.mjs";
import { recordNativeSubagent } from "./cwf-native-subagent.mjs";

const root = new URL("..", import.meta.url);

const requiredFiles = [
  "README.md",
  "README.en.md",
  "README.zh-CN.md",
  "docs/CORE.md",
  "docs/CWF_MVP_EVIDENCE.md",
  "docs/CWF_ASYNC_RUNTIME.md",
  "docs/CWF_CLAUDE_COMPARISON.md",
  "docs/CWF_FULL_NATIVE_RUNTIME_PLAN.md",
  "docs/goals/CWF_FULL_NATIVE_RUNTIME_GOAL.md",
  "docs/evidence/CWF_REAL_DYNAMIC_SMOKE_20260608.md",
  "docs/evidence/CWF_FULL_NATIVE_RUNTIME_FIXTURES_20260608.md",
  "docs/evidence/CWF_FULL_NATIVE_RUNTIME_REAL_SMOKE_20260609.md",
  "docs/RUN_EXPERIENCE.md",
  "docs/WORKFLOW_JS.md",
  "skills/codex-workflows/SKILL.md",
  "skills/codex-workflows/evals/trigger_cases.json",
  "skills/codex-workflows/references/routing.md",
  "skills/codex-workflows/scripts/check_skill_install.py",
  "skills/codex-workflows/templates/run-plan.md",
  "scripts/cwf-run-preview.mjs",
  "scripts/cwf-run-plan.mjs",
  "scripts/cwf-run-state.mjs",
  "scripts/cwf-start.mjs",
  "scripts/cwf-worker-sdk.mjs",
  "scripts/cwf-worker-desktop-thread.mjs",
  "scripts/cwf-return-heartbeat.mjs",
  "scripts/cwf-native-subagent.mjs",
  "scripts/cwf-return-envelope.mjs",
  "scripts/cwf-safe-write.mjs",
  "scripts/cwf-generate-workflow.mjs",
  "scripts/cwf-catalog.mjs",
  "scripts/lib/cli.mjs",
  "workflows/classify-and-act.workflow.js",
  "workflows/adversarial-verify.workflow.js",
  "workflows/pipeline.workflow.js",
  "workflows/repo-audit.workflow.js",
  "workflows/safe-fix-loop.workflow.js",
  "workflows/tournament.workflow.js",
  "workflows/ui-copy-review.workflow.js",
];

for (const file of requiredFiles) {
  const path = join(root.pathname, file);
  const info = await stat(path);
  if (!info.isFile()) {
    throw new Error(`${file} is not a file`);
  }
}

const readme = await readText("README.md");
const readmeEn = await readText("README.en.md");
const zh = await readText("README.zh-CN.md");
const skill = await readText("skills/codex-workflows/SKILL.md");
const evidence = await readText("docs/CWF_MVP_EVIDENCE.md");
const asyncRuntime = await readText("docs/CWF_ASYNC_RUNTIME.md");
const comparison = await readText("docs/CWF_CLAUDE_COMPARISON.md");
const fullNativeRuntimePlan = await readText("docs/CWF_FULL_NATIVE_RUNTIME_PLAN.md");
const fullNativeRuntimeGoal = await readText("docs/goals/CWF_FULL_NATIVE_RUNTIME_GOAL.md");
const realDynamicEvidence = await readText("docs/evidence/CWF_REAL_DYNAMIC_SMOKE_20260608.md");
const fullNativeFixtureEvidence = await readText("docs/evidence/CWF_FULL_NATIVE_RUNTIME_FIXTURES_20260608.md");
const fullNativeRealEvidence = await readText("docs/evidence/CWF_FULL_NATIVE_RUNTIME_REAL_SMOKE_20260609.md");
const skillRouting = await readText("skills/codex-workflows/references/routing.md");
const skillRunPlanTemplate = await readText("skills/codex-workflows/templates/run-plan.md");
const skillTriggerCases = JSON.parse(await readText("skills/codex-workflows/evals/trigger_cases.json"));
const gitignore = await readText(".gitignore");
const packageJson = JSON.parse(await readText("package.json"));

mustContain(readme, "英文版：[README.en.md]");
mustContain(readme, "Codex 原生、有边界的动态工作流");
mustContain(readme, "不是独立 agent 平台");
mustContain(readme, "run plan");
mustContain(readme, "cwf-run-plan.mjs");
mustContain(readme, "desktop-thread");
mustContain(readme, "background+heartbeat");
mustContain(readme, "SDK 后台 worker");
mustContain(readme, "cwf-start.mjs");
mustContain(readme, "cwf-worker-sdk.mjs");
mustContain(readme, "cwf-worker-desktop-thread.mjs");
mustContain(readme, "Sunny-style `library` skill");
mustContain(readme, "check_skill_install.py --check-install");
mustContain(readme, "evals/trigger_cases.json");
mustContain(readmeEn, "Chinese: [README.md]");
mustContain(readmeEn, "not a standalone agent platform");
mustContain(readmeEn, "bounded dynamic workflow");
mustContain(readmeEn, "run plan");
mustContain(readmeEn, "cwf-run-plan.mjs");
mustContain(readmeEn, "desktop-thread");
mustContain(readmeEn, "background+heartbeat");
mustContain(readmeEn, "SDK background workers");
mustContain(readmeEn, "cwf-start.mjs");
mustContain(readmeEn, "cwf-worker-sdk.mjs");
mustContain(readmeEn, "cwf-worker-desktop-thread.mjs");
mustContain(readmeEn, "Sunny-style library skill package");
mustContain(readmeEn, "check_skill_install.py --check-install");
mustContain(readmeEn, "evals/trigger_cases.json");
mustContain(zh, "Codex 原生、有边界的动态工作流");
mustContain(zh, "有边界的动态工作流");
mustContain(zh, "左侧线程");
mustContain(zh, "background+heartbeat");
mustContain(zh, "SDK 后台 worker");
mustContain(zh, "cwf-start.mjs");
mustContain(zh, "cwf-worker-sdk.mjs");
mustContain(zh, "Sunny-style `library` skill");
mustContain(zh, "check_skill_install.py --check-install");
mustContain(skill, "bounded dynamic workflow");
mustContain(skill, "bounded run plan");
mustContain(skill, "cwf-run-plan.mjs");
mustContain(skill, "Do not execute these files with Node");
mustContain(skill, "native Codex subagents");
mustContain(skill, "Worker Visibility");
mustContain(skill, "Budget");
mustContain(skill, "Quarantine");
mustContain(skill, "Save As Skill");
mustContain(skill, "Run Experience");
mustContain(skill, "background+heartbeat");
mustContain(skill, "heartbeat_synthesis");
mustContain(skill, "cwf-start.mjs");
mustContain(skill, "cwf-worker-sdk.mjs");
mustContain(skill, "cwf-worker-desktop-thread.mjs");
mustContain(skill, "sunny_skill_type: library");
mustContain(skill, "Output Contract");
mustContain(skill, "references/routing.md");
mustContain(skillRouting, "goal-writer");
mustContain(skillRouting, "delivery-planner");
mustContain(skillRouting, "project-status-audit");
mustContain(skillRouting, "codex-thread-orchestrator");
mustContain(skillRunPlanTemplate, "## Objective");
mustContain(skillRunPlanTemplate, "## Resume Checkpoint");
for (const key of ["should_trigger", "should_not_trigger", "near_neighbors"]) {
  if (!Array.isArray(skillTriggerCases[key]) || skillTriggerCases[key].length === 0) {
    throw new Error(`skills/codex-workflows/evals/trigger_cases.json missing ${key}`);
  }
}
mustContain(asyncRuntime, "CWF Async Runtime Contract");
mustContain(asyncRuntime, "background+heartbeat");
mustContain(asyncRuntime, "Desktop-thread workers are the visibility path");
mustContain(asyncRuntime, "Do not claim platform automatic callback");
mustContain(asyncRuntime, "must not execute arbitrary workflow JavaScript as unrestricted Node code");
mustContain(comparison, "CWF vs Claude Dynamic Workflows");
mustContain(comparison, "background+heartbeat");
mustContain(comparison, "SDK background worker");
mustContain(comparison, "不声称 SDK 自动 callback");
mustContain(fullNativeRuntimePlan, "CWF Full Native Runtime Plan");
mustContain(fullNativeRuntimePlan, "host-native subagent");
mustContain(fullNativeRuntimePlan, "SDK background worker");
mustContain(fullNativeRuntimePlan, "Desktop-thread adapter");
mustContain(fullNativeRuntimePlan, "heartbeat return");
mustContain(fullNativeRuntimeGoal, "CWF Full Native Runtime Goal");
mustContain(fullNativeRuntimeGoal, "Host-native subagent execution");
mustContain(fullNativeRuntimeGoal, "SDK background worker adapter");
mustContain(fullNativeRuntimeGoal, "Heartbeat return");
mustContain(fullNativeRuntimeGoal, "Do not claim SDK automatic callback");
mustContain(evidence, "real-smoke pass");
mustContain(evidence, "fixture pass");
mustContain(evidence, "dry-run pass");
mustContain(evidence, "Desktop-thread smoke passed");
mustContain(evidence, "automatic callback");
mustContain(evidence, "safe-fix-loop");
mustContain(evidence, "CWF_REAL_DYNAMIC_SMOKE_20260608.md");
mustContain(realDynamicEvidence, "CWF_DESKTOP_CORRECTNESS_WORKER_OK_20260608");
mustContain(realDynamicEvidence, "blocked_then_fixed_locally");
mustContain(realDynamicEvidence, "Platform-level automatic callback");
mustContain(fullNativeFixtureEvidence, "CWF Full Native Runtime Fixtures 2026-06-08");
mustContain(fullNativeFixtureEvidence, "CWF_SDK_FIXTURE_OK");
mustContain(fullNativeFixtureEvidence, "desktop-thread-execution-unavailable");
mustContain(fullNativeFixtureEvidence, "heartbeat-unavailable");
mustContain(fullNativeRealEvidence, "CWF_SDK_REAL_SMOKE_20260609");
mustContain(fullNativeRealEvidence, "CWF_NATIVE_SUBAGENT_A_20260609");
mustContain(fullNativeRealEvidence, "cwf-heartbeat-real-smoke");
mustContain(fullNativeRealEvidence, "CWF_HEARTBEAT_NO_COUNT_PROBE_20260609");
mustContain(fullNativeRealEvidence, "FREQ=MINUTELY;INTERVAL=1;COUNT=1");
mustContain(fullNativeRealEvidence, "FREQ=MINUTELY;INTERVAL=1");
mustContain(gitignore, ".cwf/");
if (packageJson.bin) {
  throw new Error("package.json must not expose a standalone CLI bin");
}
if (packageJson.dependencies?.["@openai/codex-sdk"] == null) {
  throw new Error("package.json must include @openai/codex-sdk for real SDK background worker support");
}
if (!Array.isArray(packageJson.files) || packageJson.files.includes(".cwf/")) {
  throw new Error("package files must exclude .cwf/");
}

const workflowDir = join(root.pathname, "workflows");
const workflows = (await readdir(workflowDir)).filter((file) => file.endsWith(".workflow.js"));
if (workflows.length !== 7) {
  throw new Error(`Expected exactly seven workflow templates, found ${workflows.length}`);
}

for (const file of workflows) {
  const text = await readFile(join(workflowDir, file), "utf8");
  const loaded = await loadWorkflow(join(workflowDir, file));
  const preview = buildPreview(loaded.workflow, { runImmediately: false });
  mustContain(text, "export default");
  mustContain(text, "name:");
  mustContain(text, "pattern:");
  mustContain(text, "budget:");
  mustContain(text, "max_tokens:");
  mustContain(text, "stop_when:");
  mustContain(text, "run_experience:");
  mustContain(text, "preview:");
  mustContain(text, "status:");
  mustContain(text, "cancel:");
  mustContain(text, "resume:");
  mustContain(text, "final_output:");
  mustContain(text, "phases:");
  mustContain(text, "stop_conditions:");
  mustContain(text, "visibility:");
  mustContain(text, "visibility_policy:");
  mustContain(text, "quarantine_rules:");
  reject(text, "import ");
  reject(text, "require(");
  reject(text, "process.");
  reject(text, "fetch(");
  checkWorkflowShape(file, text);
  if (!preview.name || !preview.pattern || preview.phases.length === 0) {
    throw new Error(`${file} did not produce a usable preview`);
  }
}

checkPreviewAndVisibilityRules();
await checkRunPlanRules();
checkRunStateRules();
checkReturnEnvelopeRules();
checkDynamicGenerationRules();
await checkCatalogRules(workflows);
checkSafeWriteAndVerifierRules();
await checkNativeRuntimeRules();
checkHelperHelpCommands();

console.log(`core check passed: ${workflows.length} workflow templates`);

async function readText(path) {
  return readFile(join(root.pathname, path), "utf8");
}

function mustContain(text, needle) {
  if (!text.includes(needle)) {
    throw new Error(`Missing required text: ${needle}`);
  }
}

function reject(text, needle) {
  if (text.includes(needle)) {
    throw new Error(`Forbidden workflow text: ${needle}`);
  }
}

function checkWorkflowShape(file, text) {
  if (file === "classify-and-act.workflow.js") {
    mustContain(text, 'pattern: "classify-and-act"');
    mustContain(text, 'type: "worker"');
    mustContain(text, "write_scope:");
    mustContain(text, "route");
    return;
  }

  if (file === "adversarial-verify.workflow.js") {
    mustContain(text, 'pattern: "adversarial-verification"');
    mustContain(text, "correctness-challenger");
    mustContain(text, "safety-challenger");
    mustContain(text, "evidence-checker");
    mustContain(text, "waived with reason");
    return;
  }

  if (file === "pipeline.workflow.js") {
    mustContain(text, 'pattern: "pipeline"');
    mustContain(text, "stage");
    mustContain(text, "Each stage output");
    return;
  }

  if (file === "safe-fix-loop.workflow.js") {
    mustContain(text, 'pattern: "loop-until-done"');
    mustContain(text, 'type: "worker"');
    mustContain(text, 'visibility: "auto"');
    mustContain(text, "write_scope:");
    mustContain(text, "verification evidence");
    return;
  }

  if (file === "tournament.workflow.js") {
    mustContain(text, 'pattern: "tournament"');
    mustContain(text, "pairwise");
    mustContain(text, "candidate");
    return;
  }

  mustContain(text, "agents: [");
  mustContain(text, 'visibility: "inline"');
  const explorerCount = (text.match(/type:\s*"explorer"/g) || []).length;
  if (explorerCount < 3) {
    throw new Error(`${file} must define at least three explorer agents`);
  }

  if (!/Return (file references|concrete|changed files|suggest|wording|hierarchy|actionable)|Suggest concrete/i.test(text)) {
    throw new Error(`${file} must define concrete expected output in agent prompts`);
  }
}

function checkPreviewAndVisibilityRules() {
  const smallWorkflow = {
    name: "small",
    pattern: "fan-out-and-synthesize",
    budget: { max_tokens: 100000, stop_when: "Done or blocked." },
    phases: [
      {
        id: "fanout",
        agents: [
          { id: "reader", type: "explorer", visibility: "inline", prompt: "Read only." },
        ],
      },
    ],
    quarantine_rules: [],
    stop_conditions: ["Done."],
  };
  const smallPreview = buildPreview(smallWorkflow, { runImmediately: true });
  if (!smallPreview.preview_skip.eligible) {
    throw new Error("small read-only workflow should be preview-skip eligible when run immediately");
  }

  const writeWorkflow = {
    ...smallWorkflow,
    phases: [
      {
        id: "fix",
        agents: [
          {
            id: "implementer",
            type: "worker",
            visibility: "auto",
            write_scope: "approved file",
            prompt: "Fix the issue.",
          },
        ],
      },
    ],
  };
  const writePreview = buildPreview(writeWorkflow, { runImmediately: true });
  assertPreviewRequired("write scope", writePreview, "worker write scope is present");
  assertPreviewRequired(
    "phase count",
    buildPreview({ ...smallWorkflow, phases: [1, 2, 3, 4].map((id) => ({ id: `p${id}`, agents: [] })) }, { runImmediately: true }),
    "phase count",
  );
  assertPreviewRequired(
    "worker count",
    buildPreview(
      {
        ...smallWorkflow,
        phases: [
          {
            id: "fanout",
            agents: [1, 2, 3, 4, 5, 6].map((id) => ({
              id: `reader-${id}`,
              type: "explorer",
              visibility: "inline",
              prompt: "Read only.",
            })),
          },
        ],
      },
      { runImmediately: true },
    ),
    "worker count",
  );
  assertPreviewRequired(
    "budget",
    buildPreview({ ...smallWorkflow, budget: { max_tokens: 100001, stop_when: "Done or blocked." } }, { runImmediately: true }),
    "budget",
  );
  assertPreviewRequired(
    "desktop-thread",
    buildPreview(
      {
        ...smallWorkflow,
        phases: [
          {
            id: "fanout",
            agents: [{ id: "visible", type: "explorer", visibility: "desktop-thread", prompt: "Read only." }],
          },
        ],
      },
      { runImmediately: true },
    ),
    "desktop-thread visibility is planned",
  );
  assertPreviewRequired(
    "raw privileged path",
    buildPreview(smallWorkflow, { runImmediately: true, rawPrivilegedPath: true }),
    "untrusted raw content",
  );

  const autoAgent = { id: "worker", type: "worker", visibility: "auto", prompt: "Work." };
  const phase = [{ id: "work", agents: [autoAgent] }];
  assertVisibility("budget", { ...smallWorkflow, budget: { max_tokens: 50001 } }, phase, autoAgent, {}, "desktop-thread");
  assertVisibility("write scope", smallWorkflow, phase, { ...autoAgent, write_scope: "x" }, {}, "desktop-thread");
  assertVisibility(
    "sibling write scope",
    smallWorkflow,
    phase,
    autoAgent,
    { allAgents: [autoAgent, { id: "writer", visibility: "auto", write_scope: "approved file" }] },
    "desktop-thread",
  );
  assertVisibility("release marker", smallWorkflow, [{ id: "release", agents: [autoAgent] }], autoAgent, {}, "desktop-thread");
  assertVisibility(
    "release marker elsewhere",
    smallWorkflow,
    [{ id: "work", agents: [autoAgent] }, { id: "release", agents: [] }],
    autoAgent,
    {},
    "desktop-thread",
  );
  assertVisibility("inspection request", smallWorkflow, phase, autoAgent, { userRequest: "continue this worker separately" }, "desktop-thread");
  assertVisibility(
    "default inline",
    { ...smallWorkflow, budget: { max_tokens: 50000, stop_when: "Done or blocked." } },
    phase,
    autoAgent,
    {},
    "inline",
  );

  assertRejectsExecutableWorkflow();
  assertBudgetPolicy();
}

function assertPreviewRequired(label, preview, reasonNeedle) {
  if (preview.preview_skip.eligible) {
    throw new Error(`${label}: preview should be required`);
  }
  if (!preview.preview_skip.reasons.some((reason) => reason.includes(reasonNeedle))) {
    throw new Error(`${label}: missing preview reason ${reasonNeedle}`);
  }
}

function assertVisibility(label, workflow, phases, agent, options, expected) {
  const actual = resolveVisibility(workflow, phases, agent, options).visibility;
  if (actual !== expected) {
    throw new Error(`auto visibility ${label}: expected ${expected}, got ${actual}`);
  }
}

function assertRejectsExecutableWorkflow() {
  try {
    parseWorkflowSpec('export default { name: "bad", run: () => "nope" };', "negative");
  } catch {
    return;
  }
  throw new Error("workflow parser must reject executable tokens");
}

function assertBudgetPolicy() {
  const expensive = buildPreview(
    {
      name: "expensive",
      pattern: "fan-out-and-synthesize",
      budget: { max_tokens: 50001, stop_when: "Done or blocked." },
      phases: [{ id: "fanout", agents: [{ id: "reader", type: "explorer", visibility: "inline", prompt: "Read." }] }],
      quarantine_rules: [],
      stop_conditions: ["Done."],
    },
    { runImmediately: true },
  );
  if (!expensive.budget_policy.warning.includes("expensive run")) {
    throw new Error("expensive run preview must warn before workers run");
  }
  if (expensive.budget_policy.token_accounting !== "estimated") {
    throw new Error("local token accounting must be labeled estimated");
  }

  assertThrows(
    () => buildPreview({ name: "unbounded", pattern: "fan-out-and-synthesize", phases: [] }, { runImmediately: true }),
    "missing budget should fail closed",
  );
  assertThrows(
    () => buildPreview({ name: "no-stop", pattern: "fan-out-and-synthesize", budget: { max_tokens: 1000 }, phases: [] }, { runImmediately: true }),
    "missing stop rule should fail closed",
  );
}

async function checkRunPlanRules() {
  const plan = await buildRunPlanFromWorkflow("workflows/repo-audit.workflow.js", {
    runId: "check",
    objective: "audit this repo",
  });
  const markdown = renderRunPlanMarkdown(plan);
  for (const needle of [
    "## Scope",
    "## Exclusions",
    "## Workers",
    "## Verifier",
    "## Quarantine",
    "## Budget",
    "## Stop Rules",
    "## Evidence",
    "## Resume Checkpoint",
    ".cwf/runs/check/",
  ]) {
    mustContain(markdown, needle);
  }

  const followUpPlan = await buildRunPlanFromWorkflow("workflows/pipeline.workflow.js", {
    runId: "check-follow-up",
    objective: "continue this worker separately",
  });
  if (!followUpPlan.preview.agents.some((agent) => agent.resolved_visibility === "desktop-thread")) {
    throw new Error("run plan must preserve objective-driven auto visibility");
  }

  const adversarialPlan = renderRunPlanMarkdown(
    await buildRunPlanFromWorkflow("workflows/adversarial-verify.workflow.js", {
      runId: "check-adversarial",
      objective: "verify roadmap",
    }),
  );
  mustContain(adversarialPlan, "correctness-challenger");
  mustContain(adversarialPlan, "safety-challenger");
  mustContain(adversarialPlan, "evidence-checker");
  mustContain(adversarialPlan, "Required verifier findings must be applied or explicitly waived with reason.");

  const safeFixPlan = await buildRunPlanFromWorkflow("workflows/safe-fix-loop.workflow.js", {
    runId: "check-safe-fix",
    objective: "dry-run a bounded fix without writing real target files",
  });
  const safeFixMarkdown = renderRunPlanMarkdown(safeFixPlan);
  if (!safeFixPlan.preview.agents.some((agent) => agent.write_scope)) {
    throw new Error("safe-fix-loop must expose write scopes for dry-run proof");
  }
  if (!safeFixPlan.preview.agents.some((agent) => agent.resolved_visibility === "desktop-thread")) {
    throw new Error("safe-fix-loop write worker must remain approval-gated through desktop-thread visibility");
  }
  mustContain(safeFixMarkdown, "write_scope=Only the files needed for the approved bounded fix.");
  mustContain(safeFixMarkdown, "Preview required because");
  mustContain(safeFixMarkdown, "worker write scope is present");
}

function checkRunStateRules() {
  const status = deriveRunStatus({
    status: "planned",
    phases: [{ id: "verify", status: "blocked" }],
    workers: [],
  });
  if (status !== "blocked") {
    throw new Error(`phase blocker must make run status blocked, got ${status}`);
  }

  const skippedBoundary = {
    phases: [
      { id: "scope", index: 0, status: "planned" },
      { id: "fanout", index: 1, status: "planned" },
      { id: "synthesize", index: 2, status: "completed" },
    ],
  };
  refreshResume(skippedBoundary);
  if (
    skippedBoundary.resume.last_completed_phase_id !== "" ||
    skippedBoundary.resume.next_phase_id !== "scope" ||
    skippedBoundary.resume.action !== "safely_restarted"
  ) {
    throw new Error("resume checkpoint must use the last contiguous completed phase boundary");
  }

  const blockedBoundary = {
    status: "running",
    phases: [
      { id: "scope", index: 0, status: "completed" },
      { id: "fanout", index: 1, status: "failed" },
      { id: "synthesize", index: 2, status: "completed" },
    ],
    workers: [],
    verifier_evaluations: [],
  };
  refreshResume(blockedBoundary);
  if (
    blockedBoundary.resume.last_completed_phase_id !== "scope" ||
    blockedBoundary.resume.next_phase_id !== "fanout" ||
    blockedBoundary.resume.action !== "blocked" ||
    deriveRunStatus(blockedBoundary) !== "blocked"
  ) {
    throw new Error("failed phase must block resume past the last safe boundary");
  }

  for (const statusName of ["completed", "blocked", "failed", "skipped", "missing", "partial"]) {
    const fixture = {
      status: "running",
      phases: [{ id: "scope", index: 0, status: statusName }],
      workers: [],
      verifier_evaluations: [],
    };
    refreshResume(fixture);
    if (!fixture.resume?.action) {
      throw new Error(`resume fixture missing action for ${statusName}`);
    }
  }
}

function checkReturnEnvelopeRules() {
  const state = {
    run_id: "check-envelope",
    workflow_name: "repo-audit",
    template_path: "workflows/repo-audit.workflow.js",
    runtime_mode: "background+heartbeat",
    adapter_status: { heartbeat_return: "heartbeat_synthesis" },
    status: "completed",
    updated_at: "2026-06-08T00:00:00.000Z",
    verifier_evaluations: [{ status: "advisory", summary: "follow-up optional" }],
    deferred_items: [{ id: "desktop-thread-execution-preflight", status: "requires_approval" }],
  };
  const envelope = buildReturnEnvelope(state);
  for (const key of [
    "run_id",
    "workflow",
    "final_destination",
    "runtime_mode",
    "return_mode",
    "heartbeat_status",
    "coordinator_synthesis",
    "platform_callback",
    "final_summary_path",
    "evidence_path",
    "sdk_thread_ids",
    "desktop_thread_ids",
    "verifier_status",
    "deferred_items",
    "completion_status",
  ]) {
    if (envelope[key] == null) throw new Error(`return envelope missing ${key}`);
  }
  if (envelope.return_mode !== "coordinator_synthesis") {
    throw new Error("return envelope must default to coordinator synthesis");
  }
  if (envelope.runtime_mode !== "background+heartbeat" || envelope.heartbeat_status !== "heartbeat_synthesis") {
    throw new Error("return envelope must expose runtime mode and heartbeat status");
  }
  if (envelope.platform_callback.status !== "deferred") {
    throw new Error("return envelope must defer platform callback unless proven");
  }
  if (!envelope.deferred_items.some((item) => item.status === "requires_approval")) {
    throw new Error("return envelope must preserve deferred approval items");
  }

  const idsEnvelope = buildReturnEnvelope({
    ...state,
    workers: [
      { id: "sdk", sdk_thread_id: "sdk-1" },
      { id: "desktop", desktop_thread_id: "thread-1" },
    ],
  });
  if (idsEnvelope.sdk_thread_ids[0] !== "sdk-1" || idsEnvelope.desktop_thread_ids[0] !== "thread-1") {
    throw new Error("return envelope must expose SDK and Desktop thread ids when known");
  }

  const heartbeatEnvelope = buildReturnEnvelope({ ...state, return_mode: "heartbeat_synthesis" });
  if (heartbeatEnvelope.return_mode !== "heartbeat_synthesis") {
    throw new Error("return envelope must preserve state return_mode when no override is provided");
  }
}

function checkDynamicGenerationRules() {
  const audit = generateWorkflowFromObjective("audit this repo for release risk", { family: "repo-audit" });
  const auditText = renderGeneratedWorkflow(audit);
  const auditParsed = parseWorkflowSpec(auditText, "generated audit");
  for (const key of ["scope", "exclusions", "phases", "visibility_policy", "quarantine_rules", "budget", "stop_conditions"]) {
    if (auditParsed[key] == null) throw new Error(`generated repo-audit missing ${key}`);
  }

  const safeFix = generateWorkflowFromObjective("fix a bounded bug", {
    family: "safe-fix-loop",
    allowed_paths: ["scripts"],
  });
  const safeFixText = renderGeneratedWorkflow(safeFix);
  const safeFixParsed = parseWorkflowSpec(safeFixText, "generated safe-fix");
  if (!JSON.stringify(safeFixParsed).includes("write_scope")) {
    throw new Error("generated safe-fix must include write scope");
  }
  if (!JSON.stringify(safeFixParsed).includes("approve-write")) {
    throw new Error("generated safe-fix must include approval gate");
  }

  for (const unsafe of ["import x", "require('fs')", "process.env", "child_process", "fs.readFile", "fetch('x')", "eval('x')", "Function('x')", "globalThis"]) {
    assertThrows(() => scanUnsafeWorkflowText(unsafe, "unsafe fixture"), `unsafe scanner accepted ${unsafe}`);
  }
}

async function checkCatalogRules(workflows) {
  const coverage = validateCatalogCoverage(workflows);
  if (!coverage.ok) {
    throw new Error(`catalog coverage mismatch missing=${coverage.missing.join(",")} extra=${coverage.extra.join(",")}`);
  }
  for (const entry of BUILT_IN_CATALOG) {
    for (const key of ["purpose", "when_to_use", "inputs", "visibility_default", "write_policy", "verifier_policy", "evidence_level"]) {
      if (!entry[key]) throw new Error(`catalog entry ${entry.file} missing ${key}`);
    }
  }

  const projectRoot = await mkdtemp(join(tmpdir(), "cwf-catalog-"));
  try {
    await mkdir(join(projectRoot, ".cwf/workflows"), { recursive: true });
    await writeFile(
      join(projectRoot, ".cwf/workflows/custom.workflow.js"),
      `export default ${JSON.stringify({
        name: "custom",
        pattern: "fan-out-and-synthesize",
        budget: { max_tokens: 1000, stop_when: "done" },
        phases: [{ id: "read", agents: [] }],
        stop_conditions: ["done"],
        quarantine_rules: ["read-only"],
        visibility_policy: ["inline"],
      }, null, 2)};\n`,
      "utf8",
    );
    const discovered = await discoverProjectWorkflows(projectRoot);
    if (discovered.length !== 1 || discovered[0].name !== "custom") {
      throw new Error("project-local workflow discovery failed");
    }
    await writeFile(
      join(projectRoot, ".cwf/workflows/bad.workflow.js"),
      'export default { name: "bad", pattern: "bad" };\n',
      "utf8",
    );
    await assertRejectsAsync(() => discoverProjectWorkflows(projectRoot), "invalid custom workflow must fail closed");
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

function checkSafeWriteAndVerifierRules() {
  const patch = [
    "diff --git a/docs/example.md b/docs/example.md",
    "--- a/docs/example.md",
    "+++ b/docs/example.md",
    "@@",
    "-old",
    "+new",
    "",
  ].join("\n");
  const positive = evaluateSafeWriteRequest({
    prior_gate: "previewed",
    approval: "approve-write",
    allowed_paths: ["docs"],
    forbidden_paths: [".env", "package.json"],
    apply_check: "passed",
    verification: { status: "pass", command: "npm run check" },
    patch,
  });
  if (positive.status !== "pass" || positive.changed_files[0] !== "docs/example.md" || !positive.rollback_command) {
    throw new Error("positive safe-write fixture did not pass with rollback evidence");
  }

  const negativeCases = [
    ["no prior gate", { prior_gate: "", approval: "approve-write", allowed_paths: ["docs"], apply_check: "passed", verification: { status: "pass" }, patch }],
    ["forbidden path", { prior_gate: "previewed", approval: "approve-write", allowed_paths: ["docs"], forbidden_paths: ["docs/example.md"], apply_check: "passed", verification: { status: "pass" }, patch }],
    ["out-of-scope path", { prior_gate: "previewed", approval: "approve-write", allowed_paths: ["scripts"], apply_check: "passed", verification: { status: "pass" }, patch }],
    ["conflict patch", { prior_gate: "previewed", approval: "approve-write", allowed_paths: ["docs"], apply_check: "passed", verification: { status: "pass" }, patch: `${patch}<<<<<<< HEAD\n` }],
    ["verification failure", { prior_gate: "previewed", approval: "approve-write", allowed_paths: ["docs"], apply_check: "passed", verification: { status: "fail" }, patch }],
    ["sdk bypass", { prior_gate: "previewed", approval: "approve-write", allowed_paths: ["docs"], apply_check: "passed", verification: { status: "pass" }, proposer_runtime: "sdk-background", patch }],
    ["desktop-thread bypass", { prior_gate: "previewed", approval: "approve-write", allowed_paths: ["docs"], apply_check: "passed", verification: { status: "pass" }, proposer_runtime: "desktop-thread", patch }],
  ];
  for (const [label, request] of negativeCases) {
    const result = evaluateSafeWriteRequest(request);
    if (result.status !== "refused") throw new Error(`negative safe-write fixture passed unexpectedly: ${label}`);
  }

  const coordinatorAcceptedSdkProposal = evaluateSafeWriteRequest({
    prior_gate: "previewed",
    approval: "approve-write",
    allowed_paths: ["docs"],
    apply_check: "passed",
    verification: { status: "pass" },
    proposer_runtime: "sdk-background",
    coordinator_approval: "accepted",
    patch,
  });
  if (coordinatorAcceptedSdkProposal.status !== "pass") {
    throw new Error("coordinator-approved SDK patch proposal should pass safe-write gate");
  }

  const blocked = evaluateVerifierGate([{ status: "blocked", summary: "missing evidence" }]);
  if (blocked.final_pass) throw new Error("blocked verifier must prevent final pass");
  const needsWaiver = evaluateVerifierGate([{ status: "needs-waiver", summary: "risk accepted?" }]);
  if (needsWaiver.final_pass || needsWaiver.status !== "needs-waiver") {
    throw new Error("unwaived verifier finding must require waiver");
  }
  const waived = evaluateVerifierGate([{ status: "needs-waiver", summary: "known risk", waiver: { text: "accepted for fixture", owner: "Ender" } }]);
  if (!waived.final_pass) throw new Error("waived verifier finding with text and owner should allow pass");
  const advisory = evaluateVerifierGate([{ status: "advisory", summary: "optional follow-up" }]);
  if (!advisory.final_pass || advisory.advisories.length !== 1) {
    throw new Error("advisory verifier finding should be visible and non-blocking");
  }
}

async function checkNativeRuntimeRules() {
  const runRoot = await mkdtemp(join(tmpdir(), "cwf-runs-"));
  try {
    const started = await startRun({
      workflow: "workflows/repo-audit.workflow.js",
      runId: "controller-smoke",
      runRoot,
      objective: "audit this repo with native runtime fixtures",
    });
    for (const key of ["state", "preview", "run_plan", "return_envelope", "worker_packets", "worker_results", "final"]) {
      const info = await stat(started[key]);
      if (!info.isFile() && !info.isDirectory()) throw new Error(`controller smoke missing ${key}`);
    }

    const state = JSON.parse(await readFile(started.state, "utf8"));
    if (state.runtime_mode !== "controller_only" || state.return_mode !== "coordinator_synthesis") {
      throw new Error("controller smoke must initialize runtime and return modes honestly");
    }
    if (!state.workers.every((worker) => worker.worker_packet_path && worker.worker_result_path)) {
      throw new Error("controller smoke must assign packet/result paths to every worker");
    }
    const packetFiles = await readdir(started.worker_packets);
    if (packetFiles.length !== state.workers.length) {
      throw new Error("controller smoke must write one packet per worker");
    }
    const finalText = await readFile(started.final, "utf8");
    mustContain(finalText, "结论：");

    const sdk = await recordSdkWorker({
      runId: "controller-smoke",
      workerId: "correctness",
      runRoot,
      mode: "fixture",
      marker: "CWF_SDK_FIXTURE_OK",
    });
    if (sdk.result.status !== "completed" || sdk.result.evidence_level !== "fixture" || !sdk.result.sdk_thread_id) {
      throw new Error("SDK fixture must write completed result with fixture thread id");
    }

    const nativeUnavailable = await recordNativeSubagent({
      runId: "controller-smoke",
      workerId: "tests",
      runRoot,
      mode: "unavailable",
    });
    if (nativeUnavailable.result.status !== "native-subagent-unavailable") {
      throw new Error("native subagent unavailable fixture must be honest");
    }

    const desktop = await recordDesktopThreadWorker({
      runId: "controller-smoke",
      workerId: "visible-fixture",
      runRoot,
      mode: "failure-fixture",
    });
    if (
      desktop.result.status !== "desktop-thread-execution-unavailable" ||
      desktop.result.created_visible_thread !== false ||
      desktop.result.desktop_thread_id
    ) {
      throw new Error("Desktop-thread failure fixture must create no visible thread");
    }

    const heartbeat = await recordHeartbeatReturn({
      runId: "controller-smoke",
      runRoot,
      mode: "unavailable",
    });
    if (
      heartbeat.heartbeat.status !== "heartbeat-unavailable" ||
      !heartbeat.heartbeat.resume_prompt.includes(".cwf/runs/controller-smoke/final.md")
    ) {
      throw new Error("heartbeat unavailable fixture must include a copy-ready resume prompt");
    }

    const fixtureHeartbeat = await recordHeartbeatReturn({
      runId: "controller-smoke",
      runRoot,
      mode: "fixture",
    });
    if (fixtureHeartbeat.heartbeat.status !== "heartbeat-fixture") {
      throw new Error("heartbeat fixture must not claim heartbeat_synthesis");
    }

    const scheduledHeartbeat = await recordHeartbeatReturn({
      runId: "controller-smoke",
      runRoot,
      mode: "scheduled",
      automationId: "fixture-heartbeat",
      marker: "CWF_HEARTBEAT_FIXTURE_PENDING",
    });
    if (
      scheduledHeartbeat.heartbeat.status !== "heartbeat-scheduled" ||
      scheduledHeartbeat.heartbeat.automation_id !== "fixture-heartbeat"
    ) {
      throw new Error("heartbeat scheduled fixture must record automation id and scheduled status");
    }
    const scheduledEnvelope = JSON.parse(await readFile(started.return_envelope, "utf8"));
    if (scheduledEnvelope.return_mode !== "coordinator_synthesis") {
      throw new Error("scheduled heartbeat must not upgrade return_mode to heartbeat_synthesis");
    }

    const notReturnedHeartbeat = await recordHeartbeatReturn({
      runId: "controller-smoke",
      runRoot,
      mode: "scheduled-not-returned",
      automationId: "fixture-heartbeat",
      marker: "CWF_HEARTBEAT_FIXTURE_PENDING",
    });
    if (notReturnedHeartbeat.heartbeat.status !== "heartbeat-scheduled-not-returned") {
      throw new Error("heartbeat scheduled-not-returned must record blocked status");
    }
    const notReturnedState = JSON.parse(await readFile(join(runRoot, "controller-smoke", "state.json"), "utf8"));
    if (notReturnedState.status !== "blocked") {
      throw new Error("heartbeat scheduled-not-returned must block the run");
    }
    if (notReturnedState.runtime_mode !== "background+heartbeat") {
      throw new Error("heartbeat scheduled-not-returned must mark background+heartbeat runtime mode");
    }

    const deliveredHeartbeat = await recordHeartbeatReturn({
      runId: "controller-smoke",
      runRoot,
      mode: "record-real-smoke",
      automationId: "fixture-heartbeat",
      marker: "CWF_HEARTBEAT_FIXTURE_DELIVERED",
      originatingThreadId: "fixture-originating-thread",
    });
    if (
      deliveredHeartbeat.heartbeat.status !== "heartbeat_synthesis" ||
      deliveredHeartbeat.heartbeat.evidence_level !== "real-smoke" ||
      deliveredHeartbeat.heartbeat.originating_thread_id !== "fixture-originating-thread"
    ) {
      throw new Error("heartbeat real-smoke must require observed marker evidence");
    }
    const deliveredEnvelope = JSON.parse(await readFile(started.return_envelope, "utf8"));
    if (deliveredEnvelope.return_mode !== "heartbeat_synthesis") {
      throw new Error("delivered heartbeat must upgrade return_mode to heartbeat_synthesis");
    }
    if (deliveredEnvelope.heartbeat_status !== "heartbeat_synthesis") {
      throw new Error("delivered heartbeat must expose heartbeat_synthesis status in envelope");
    }
    const postDeliveryState = JSON.parse(await readFile(join(runRoot, "controller-smoke", "state.json"), "utf8"));
    if (postDeliveryState.status !== "running" || postDeliveryState.verifier_evaluations.some((item) => item.evidence === "heartbeat-return.json" && item.status === "blocked")) {
      throw new Error("heartbeat real-smoke must clear heartbeat blocker state");
    }
    if (postDeliveryState.runtime_mode !== "background+heartbeat") {
      throw new Error("heartbeat real-smoke must preserve background+heartbeat runtime mode");
    }

    const envelope = JSON.parse(await readFile(started.return_envelope, "utf8"));
    if (envelope.platform_callback.status !== "deferred") {
      throw new Error("runtime fixture must not claim platform automatic callback");
    }
  } finally {
    await rm(runRoot, { recursive: true, force: true });
  }
}

function checkHelperHelpCommands() {
  const helpers = [
    ["scripts/cwf-run-preview.mjs", "Usage:"],
    ["scripts/cwf-run-plan.mjs", "cwf-run-plan.mjs"],
    ["scripts/cwf-run-state.mjs", "Usage:"],
    ["scripts/cwf-start.mjs", "Usage:"],
    ["scripts/cwf-worker-sdk.mjs", "Usage:"],
    ["scripts/cwf-worker-desktop-thread.mjs", "Usage:"],
    ["scripts/cwf-return-heartbeat.mjs", "Usage:"],
    ["scripts/cwf-native-subagent.mjs", "Usage:"],
    ["scripts/cwf-return-envelope.mjs", "Usage:"],
    ["scripts/cwf-safe-write.mjs", "Usage:"],
    ["scripts/cwf-generate-workflow.mjs", "Usage:"],
    ["scripts/cwf-catalog.mjs", "Usage:"],
  ];

  for (const [script, expected] of helpers) {
    const output = execFileSync(process.execPath, [join(root.pathname, script), "--help"], {
      cwd: root.pathname,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (!output.includes(expected)) {
      throw new Error(`${script} --help did not include ${expected}`);
    }
  }
}

function assertThrows(fn, label) {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error(label);
}

async function assertRejectsAsync(fn, label) {
  try {
    await fn();
  } catch {
    return;
  }
  throw new Error(label);
}
