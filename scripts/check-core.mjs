import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { buildPreview, loadWorkflow, parseWorkflowSpec, resolveVisibility } from "./cwf-run-preview.mjs";
import { buildRunPlanFromWorkflow, renderRunPlanMarkdown } from "./cwf-run-plan.mjs";
import { deriveRunStatus, refreshResume } from "./cwf-run-state.mjs";

const root = new URL("..", import.meta.url);

const requiredFiles = [
  "README.md",
  "README.zh-CN.md",
  "docs/CORE.md",
  "docs/CWF_MVP_EVIDENCE.md",
  "docs/RUN_EXPERIENCE.md",
  "docs/WORKFLOW_JS.md",
  "skills/codex-workflows/SKILL.md",
  "scripts/cwf-run-preview.mjs",
  "scripts/cwf-run-plan.mjs",
  "scripts/cwf-run-state.mjs",
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
const zh = await readText("README.zh-CN.md");
const skill = await readText("skills/codex-workflows/SKILL.md");
const evidence = await readText("docs/CWF_MVP_EVIDENCE.md");
const gitignore = await readText(".gitignore");
const packageJson = JSON.parse(await readText("package.json"));

mustContain(readme, "not a standalone agent platform");
mustContain(readme, "bounded dynamic workflow");
mustContain(readme, "run plan");
mustContain(readme, "cwf-run-plan.mjs");
mustContain(readme, "desktop-thread");
mustContain(zh, "Codex 原生、有边界的动态工作流");
mustContain(zh, "有边界的动态工作流");
mustContain(zh, "左侧线程");
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
mustContain(evidence, "real-smoke pass");
mustContain(evidence, "fixture pass");
mustContain(evidence, "dry-run pass");
mustContain(evidence, "Desktop-thread smoke passed");
mustContain(evidence, "automatic callback");
mustContain(evidence, "safe-fix-loop");
mustContain(gitignore, ".cwf/");
if (packageJson.bin) {
  throw new Error("package.json must not expose a standalone CLI bin");
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
    buildPreview({ ...smallWorkflow, budget: { max_tokens: 100001 } }, { runImmediately: true }),
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
    skippedBoundary.resume.next_phase_id !== "scope"
  ) {
    throw new Error("resume checkpoint must use the last contiguous completed phase boundary");
  }
}
