import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { buildPreview, loadWorkflow } from "./cwf-run-preview.mjs";
import { parseArgs as parseCliArgs, printHelp, wantsHelp } from "./lib/cli.mjs";

const DEFAULT_RUN_ROOT = ".cwf/runs";
const HELP = `
Usage:
  node scripts/cwf-run-plan.mjs <workflow.js>
  node scripts/cwf-run-plan.mjs <workflow.js> --objective "audit this repo" --run-id smoke
  node scripts/cwf-run-plan.mjs <workflow.js> --format json

Options:
  --objective <text>  Objective for this run. Default: empty.
  --run-id <id>      Safe run id used under .cwf/runs/. Default: smoke.
  --format <format>  markdown or json. Default: markdown.
  --help             Show this help.
`;

export async function buildRunPlanFromWorkflow(workflowPath, options = {}) {
  const loaded = await loadWorkflow(workflowPath);
  const preview = buildPreview(loaded.workflow, {
    runImmediately: false,
    inspectWorker: Boolean(options.inspectWorker),
    rawPrivilegedPath: Boolean(options.rawPrivilegedPath),
    userRequest: options.objective ?? "",
  });

  return {
    workflowPath,
    workflow: loaded.workflow,
    preview,
    runId: options.runId ?? "",
    objective: options.objective ?? "",
  };
}

export function renderRunPlanMarkdown(plan) {
  const { workflow, preview, runId, objective, workflowPath } = plan;
  const verifierAgents = preview.agents.filter((agent) => /challenger|verifier|evidence/i.test(agent.id));
  const writeAgents = preview.agents.filter((agent) => agent.write_scope);
  const quarantinePath = runId ? `.cwf/runs/${runId}/` : ".cwf/runs/RUN_ID/";
  const resumeCheckpoint = preview.phases[0]?.id
    ? `Start at phase ${preview.phases[0].id}; after each completed phase, resume from the next phase boundary.`
    : "No phase checkpoint available.";

  const lines = [
    `# CWF Run Plan: ${workflow.name}`,
    "",
    "## Scope",
    `- Objective: ${objective || workflow.goal || "not specified"}`,
    `- Workflow: ${workflow.name}`,
    `- Source: ${workflowPath}`,
    `- Pattern: ${workflow.pattern}`,
    "",
    "## Exclusions",
    "- No external runtime, scheduler, marketplace, model routing, deploy, credential, database, payment, permission, or irreversible external write.",
    "- Do not execute workflow files as unrestricted JavaScript.",
    "- Do not create Desktop threads unless explicitly approved for the run.",
    "",
    "## Phases",
  ];

  for (const phase of preview.phases) {
    lines.push(`- ${phase.id}: ${phase.label ?? "coordinator/worker phase"} (${phase.agent_count} agent(s))`);
  }

  lines.push("", "## Workers");
  for (const agent of preview.agents) {
    lines.push(
      `- ${agent.id}: role=${agent.type}; phase=${agent.phase_id}; visibility=${agent.resolved_visibility}; return=current conversation; expected_output=${agent.prompt ?? "see workflow"}${agent.write_scope ? `; write_scope=${agent.write_scope}` : ""}`,
    );
  }
  if (preview.agents.length === 0) lines.push("- none");

  lines.push("", "## Verifier");
  if (verifierAgents.length > 0) {
    for (const agent of verifierAgents) {
      lines.push(`- ${agent.id}: ${agent.prompt ?? "challenge final output against evidence"}`);
    }
  } else {
    lines.push("- No dedicated verifier agent in this template; coordinator must verify evidence before final synthesis.");
  }

  lines.push("", "## Write Scopes");
  if (writeAgents.length > 0) {
    for (const agent of writeAgents) {
      lines.push(`- ${agent.id}: ${agent.write_scope}`);
    }
  } else {
    lines.push("- read-only");
  }

  lines.push("", "## Quarantine");
  lines.push(`- Run artifact path: ${quarantinePath}`);
  appendList(lines, preview.quarantine_rules);

  lines.push("", "## Budget");
  lines.push(`- Max tokens: ${preview.budget.max_tokens ?? "unknown"}`);
  lines.push(`- Stop rule: ${preview.budget.stop_when ?? "not specified"}`);
  lines.push(`- Preview skip eligible: ${preview.preview_skip.eligible ? "yes" : "no"}`);
  if (!preview.preview_skip.eligible) {
    lines.push(`- Preview required because: ${preview.preview_skip.reasons.join("; ")}`);
  }

  lines.push("", "## Stop Rules");
  appendList(lines, preview.stop_conditions);

  lines.push("", "## Evidence");
  appendList(lines, preview.verification);
  lines.push("- Record final synthesis in the originating Codex conversation.");
  lines.push("- Label evidence as local, fixture, dry-run, real-smoke, requires_approval, or blocked.");

  lines.push("", "## Resume Checkpoint");
  lines.push(`- ${resumeCheckpoint}`);

  return `${lines.join("\n")}\n`;
}

export async function writeRunPlan({ workflowPath, runId, objective }) {
  const runDir = safeRunDir(resolve(DEFAULT_RUN_ROOT), runId);
  const plan = await buildRunPlanFromWorkflow(workflowPath, { runId, objective });
  const outputPath = join(runDir, "run-plan.md");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, renderRunPlanMarkdown(plan), "utf8");
  return { runId, runPlan: outputPath };
}

function appendList(lines, items) {
  if (!Array.isArray(items) || items.length === 0) {
    lines.push("- none");
    return;
  }
  for (const item of items) lines.push(`- ${item}`);
}

function safeRunDir(root, runId) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(runId)) {
    throw new Error("run-id must be a single safe filename segment");
  }
  const runDir = resolve(root, runId);
  if (runDir !== root && !runDir.startsWith(`${root}${sep}`)) {
    throw new Error("run-id resolves outside state directory");
  }
  return runDir;
}

function parseArgs(argv) {
  const parsed = parseCliArgs(argv);
  if (wantsHelp(parsed)) {
    return { help: true };
  }
  const options = {
    objective: "",
    runId: "smoke",
    format: "markdown",
  };
  let workflowPath = "";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--objective") {
      options.objective = argv[++index] ?? "";
    } else if (arg === "--run-id") {
      options.runId = argv[++index] ?? "";
    } else if (arg === "--format") {
      options.format = argv[++index] ?? "markdown";
    } else if (!workflowPath) {
      workflowPath = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  if (!workflowPath) {
    throw new Error("Usage: node scripts/cwf-run-plan.mjs <workflow.js> [--objective <text>] [--run-id <id>] [--format json]");
  }

  return { workflowPath, options };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    printHelp(HELP);
    return;
  }
  const { workflowPath, options } = parsed;
  const runPlan = await buildRunPlanFromWorkflow(workflowPath, options);
  if (options.format === "json") {
    console.log(JSON.stringify(runPlan, null, 2));
    return;
  }

  if (options.runId) {
    const written = await writeRunPlan({ workflowPath, runId: options.runId, objective: options.objective });
    console.error(JSON.stringify(written, null, 2));
  }
  process.stdout.write(renderRunPlanMarkdown(runPlan));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
