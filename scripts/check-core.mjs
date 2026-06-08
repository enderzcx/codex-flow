import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("..", import.meta.url);

const requiredFiles = [
  "README.md",
  "README.zh-CN.md",
  "docs/CORE.md",
  "docs/RUN_EXPERIENCE.md",
  "docs/WORKFLOW_JS.md",
  "skills/codex-workflows/SKILL.md",
  "workflows/classify-and-act.workflow.js",
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

mustContain(readme, "not a standalone agent platform");
mustContain(readme, "desktop-thread");
mustContain(zh, "Codex 原生动态工作流");
mustContain(zh, "左侧线程");
mustContain(skill, "Do not execute these files with Node");
mustContain(skill, "native Codex subagents");
mustContain(skill, "Worker Visibility");
mustContain(skill, "Budget");
mustContain(skill, "Quarantine");
mustContain(skill, "Save As Skill");
mustContain(skill, "Run Experience");

const workflowDir = join(root.pathname, "workflows");
const workflows = (await readdir(workflowDir)).filter((file) => file.endsWith(".workflow.js"));
if (workflows.length < 6) {
  throw new Error("Expected at least six workflow templates");
}

for (const file of workflows) {
  const text = await readFile(join(workflowDir, file), "utf8");
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
}

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
