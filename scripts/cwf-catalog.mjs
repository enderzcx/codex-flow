import { readdir, readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { parseWorkflowSpec } from "./cwf-run-preview.mjs";
import { parseArgs, printHelp, wantsHelp } from "./lib/cli.mjs";

export const BUILT_IN_CATALOG = [
  entry("adversarial-verify.workflow.js", "Challenge important plans, claims, diffs, or artifacts.", "High-confidence review before acceptance.", "inline", "read-only", "blocked/waiver/advisory verifier", "local"),
  entry("code-review.workflow.js", "Review a focused diff, pull request, or code change.", "Findings-first code or PR review before merge.", "inline", "read-only", "evidence-backed findings and test gaps", "local"),
  entry("classify-and-act.workflow.js", "Classify mixed work and route actions.", "Mixed item queues with different action needs.", "auto", "approved routed writes only", "route and evidence checks", "local"),
  entry("pipeline.workflow.js", "Move items through ordered stages.", "Sequential processing with resumable item status.", "auto", "read-only by default", "stage evidence verifier", "local"),
  entry("repo-audit.workflow.js", "Audit a repo from independent perspectives.", "Read-only repo audit or release review.", "inline", "read-only", "evidence-backed findings", "local"),
  entry("safe-fix-loop.workflow.js", "Fix a bounded issue through an approval-gated patch loop.", "Small approved fix with declared verification.", "auto", "approve-write bounded patch", "apply check plus verification", "local/real-smoke after approval"),
  entry("tournament.workflow.js", "Generate or compare candidates with isolated judging.", "Taste-heavy or tradeoff-heavy decisions.", "inline", "read-only", "pairwise evidence", "local"),
  entry("ui-copy-review.workflow.js", "Review UI, copy, hierarchy, and taste.", "Reader-facing UI or copy review.", "inline", "read-only", "source-fidelity and rendering evidence", "local"),
];

export async function discoverProjectWorkflows(projectRoot) {
  const root = resolve(projectRoot);
  const workflowDir = resolve(root, ".cwf/workflows");
  if (workflowDir !== root && !workflowDir.startsWith(`${root}${sep}`)) {
    throw new Error("custom workflow path resolves outside project root");
  }

  let files = [];
  try {
    files = (await readdir(workflowDir)).filter((file) => file.endsWith(".workflow.js"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  const discovered = [];
  for (const file of files) {
    const path = join(workflowDir, file);
    const text = await readFile(path, "utf8");
    const workflow = parseWorkflowSpec(text, path);
    validateCustomWorkflow(workflow, path);
    discovered.push({ path, name: workflow.name, pattern: workflow.pattern });
  }
  return discovered;
}

export function validateCatalogCoverage(workflowFiles) {
  const catalogFiles = new Set(BUILT_IN_CATALOG.map((item) => item.file));
  const missing = workflowFiles.filter((file) => !catalogFiles.has(file));
  const extra = [...catalogFiles].filter((file) => !workflowFiles.includes(file));
  return { ok: missing.length === 0 && extra.length === 0, missing, extra };
}

function validateCustomWorkflow(workflow, path) {
  const required = ["name", "pattern", "budget", "phases", "stop_conditions", "quarantine_rules", "visibility_policy"];
  for (const key of required) {
    if (workflow[key] == null) throw new Error(`${path}: custom workflow missing ${key}`);
  }
  if (!workflow.budget?.max_tokens || !workflow.budget?.stop_when) {
    throw new Error(`${path}: custom workflow missing budget limits or stop rule`);
  }
}

function entry(file, purpose, when, visibilityDefault, writePolicy, verifierPolicy, evidenceLevel) {
  return {
    file,
    purpose,
    when_to_use: when,
    inputs: ["user objective", "current repo state", "source-of-truth files"],
    visibility_default: visibilityDefault,
    write_policy: writePolicy,
    verifier_policy: verifierPolicy,
    evidence_level: evidenceLevel,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (wantsHelp(options)) {
    printHelp(`
Usage:
  node scripts/cwf-catalog.mjs
  node scripts/cwf-catalog.mjs --project-root .
  node scripts/cwf-catalog.mjs --format markdown

Options:
  --project-root <path>  Also discover .cwf/workflows/*.workflow.js in a project.
  --format <json|markdown>  Default: json. Without --project-root, json remains the legacy built-in array.
  --help                 Show this help.
`);
    return;
  }
  const projectRoot = optionValue(options["project-root"], "project-root");
  const result = {
    built_ins: BUILT_IN_CATALOG,
    project_workflows: projectRoot ? await discoverProjectWorkflows(projectRoot) : [],
  };
  if (options.format === "markdown") {
    process.stdout.write(renderCatalogMarkdown(result));
    return;
  }
  const jsonOutput = projectRoot ? result : BUILT_IN_CATALOG;
  process.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
}

function optionValue(value, name) {
  if (value === true) throw new Error(`--${name} requires a value`);
  return value;
}

function renderCatalogMarkdown(result) {
  const lines = ["# CWF Workflow Catalog", "", "## Built-ins"];
  for (const item of result.built_ins) {
    lines.push(`- ${item.file}: ${item.purpose} Use when: ${item.when_to_use}`);
  }
  lines.push("", "## Project Workflows");
  if (result.project_workflows.length === 0) {
    lines.push("- none");
  } else {
    for (const item of result.project_workflows) lines.push(`- ${item.name}: ${item.path} (${item.pattern})`);
  }
  return `${lines.join("\n")}\n`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
