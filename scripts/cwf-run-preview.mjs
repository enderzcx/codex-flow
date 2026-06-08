import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const AUTO_DESKTOP_RE = /\b(deploy|release|migrate|publish)\b/i;

export async function loadWorkflow(path) {
  const resolved = resolve(path);
  const text = await readFile(resolved, "utf8");
  return {
    path: resolved,
    workflow: parseWorkflowSpec(text, path),
  };
}

export function parseWorkflowSpec(text, label = "workflow") {
  const trimmed = text.trim();
  const match = trimmed.match(/^export\s+default\s+([\s\S]*?);?\s*$/);
  if (!match) {
    throw new Error(`${label}: expected "export default { ... }"`);
  }

  const body = match[1].trim();
  rejectExecutableTokens(body, label);

  const jsonText = body
    .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
    .replace(/,\s*([}\]])/g, "$1");

  try {
    return JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`${label}: workflow spec must be a plain data object (${error.message})`);
  }
}

export function buildPreview(workflow, options = {}) {
  const budgetPolicy = evaluateBudgetPolicy(workflow, options.label ?? workflow.name ?? "workflow");
  const phases = Array.isArray(workflow.phases) ? workflow.phases : [];
  const agents = collectAgents(phases);
  const resolvedAgents = agents.map((agent) => {
    const resolved = resolveVisibility(workflow, phases, agent, { ...options, allAgents: agents });
    return {
      ...agent,
      resolved_visibility: resolved.visibility,
      visibility_reason: resolved.reason,
    };
  });

  const skip = evaluatePreviewSkip(workflow, phases, resolvedAgents, options);

  return {
    name: workflow.name,
    pattern: workflow.pattern,
    budget: workflow.budget ?? {},
    budget_policy: budgetPolicy,
    phases: phases.map((phase) => ({
      id: phase.id,
      label: phase.label,
      agent_count: countPhaseAgents(phase),
      coordinator: phase.coordinator,
    })),
    agents: resolvedAgents,
    quarantine_rules: workflow.quarantine_rules ?? [],
    stop_conditions: workflow.stop_conditions ?? [],
    verification: workflow.verification ?? [],
    visibility_policy: workflow.visibility_policy ?? [],
    preview_skip: skip,
  };
}

export function renderPreviewMarkdown(preview, sourcePath) {
  const lines = [
    `# CWF Preview: ${preview.name}`,
    "",
    `- Source: ${sourcePath}`,
    `- Pattern: ${preview.pattern}`,
    `- Budget: ${preview.budget.max_tokens ?? "unknown"} tokens`,
    `- Stop rule: ${preview.budget.stop_when ?? "not specified"}`,
    `- Token accounting: ${preview.budget_policy.token_accounting}`,
    `- Preview skip eligible: ${preview.preview_skip.eligible ? "yes" : "no"}`,
  ];

  if (preview.budget_policy.warning) {
    lines.push(`- Budget warning: ${preview.budget_policy.warning}`);
  }

  if (!preview.preview_skip.eligible) {
    lines.push(`- Preview required because: ${preview.preview_skip.reasons.join("; ")}`);
  }

  lines.push("", "## Phases");
  for (const phase of preview.phases) {
    lines.push(`- ${phase.id}: ${phase.agent_count} agent(s)`);
  }

  lines.push("", "## Agents");
  for (const agent of preview.agents) {
    const scope = agent.write_scope ? `; write_scope=${agent.write_scope}` : "";
    lines.push(
      `- ${agent.id} (${agent.type}, phase=${agent.phase_id}): ${agent.visibility} -> ${agent.resolved_visibility} (${agent.visibility_reason}${scope})`,
    );
  }

  lines.push("", "## Quarantine");
  appendList(lines, preview.quarantine_rules);

  lines.push("", "## Stop Conditions");
  appendList(lines, preview.stop_conditions);

  if (preview.verification.length > 0) {
    lines.push("", "## Verification");
    appendList(lines, preview.verification);
  }

  return `${lines.join("\n")}\n`;
}

export function evaluatePreviewSkip(workflow, phases, agents, options = {}) {
  const reasons = [];
  const workerCount = agents.length;
  const phaseCount = phases.length;
  const maxTokens = Number(workflow.budget?.max_tokens ?? Number.POSITIVE_INFINITY);
  const hasAnyWriteScope = agents.some((agent) => hasWriteScope(agent));
  const hasDesktopThread = agents.some(
    (agent) => agent.visibility === "desktop-thread" || agent.resolved_visibility === "desktop-thread",
  );
  const rawPrivilegedPath = Boolean(options.rawPrivilegedPath);
  const runImmediately = Boolean(options.runImmediately);

  if (!runImmediately) reasons.push("user did not explicitly ask to run immediately");
  if (phaseCount > 3) reasons.push(`phase count ${phaseCount} > 3`);
  if (workerCount > 5) reasons.push(`worker count ${workerCount} > 5`);
  if (maxTokens > 100000) reasons.push(`budget ${maxTokens} > 100000`);
  if (hasAnyWriteScope) reasons.push("worker write scope is present");
  if (hasDesktopThread) reasons.push("desktop-thread visibility is planned");
  if (rawPrivilegedPath) reasons.push("untrusted raw content can reach a privileged worker");

  return {
    eligible: reasons.length === 0,
    reasons,
    thresholds: {
      run_immediately: true,
      phases_lte: 3,
      workers_lte: 5,
      budget_lte: 100000,
      read_only: true,
      no_desktop_thread: true,
      no_privileged_raw_content_path: true,
    },
  };
}

export function evaluateBudgetPolicy(workflow, label = "workflow") {
  const budget = workflow.budget;
  if (!budget || typeof budget !== "object") {
    throw new Error(`${label}: missing budget; workflow refuses to run unbounded`);
  }
  const maxTokens = Number(budget.max_tokens);
  if (!Number.isFinite(maxTokens) || maxTokens <= 0) {
    throw new Error(`${label}: missing budget.max_tokens; workflow refuses to run unbounded`);
  }
  if (typeof budget.stop_when !== "string" || budget.stop_when.trim().length === 0) {
    throw new Error(`${label}: missing budget.stop_when; workflow refuses to run without a stop rule`);
  }
  const timeoutMs = budget.timeout_ms == null ? null : Number(budget.timeout_ms);
  if (budget.timeout_ms != null && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
    throw new Error(`${label}: invalid budget.timeout_ms`);
  }
  return {
    status: "bounded",
    max_tokens: maxTokens,
    timeout_ms: timeoutMs,
    stop_when: budget.stop_when,
    token_accounting: "estimated",
    warning: maxTokens > 50000
      ? `expensive run: max_tokens ${maxTokens} exceeds 50000; preview required before workers run`
      : "",
  };
}

export function resolveVisibility(workflow, phases, agent, options = {}) {
  const requested = agent.visibility ?? "inline";
  if (requested === "inline" || requested === "desktop-thread") {
    return { visibility: requested, reason: `explicit ${requested}` };
  }

  if (requested !== "auto") {
    return { visibility: "inline", reason: `unknown visibility ${requested}; downgraded inline` };
  }

  const budget = Number(workflow.budget?.max_tokens ?? 0);
  if (budget > 50000) {
    return { visibility: "desktop-thread", reason: "auto: budget.max_tokens > 50000" };
  }

  if ((options.allAgents ?? [agent]).some((item) => hasWriteScope(item))) {
    return { visibility: "desktop-thread", reason: "auto: planned worker has non-empty write_scope" };
  }

  const searchable = [
    ...phases.flatMap((phase) => [phase.id, phase.label, phase.coordinator]),
    ...(options.allAgents ?? [agent]).flatMap((item) => [item.id, item.prompt]),
  ]
    .filter(Boolean)
    .join(" ");
  if (AUTO_DESKTOP_RE.test(searchable)) {
    return { visibility: "desktop-thread", reason: "auto: deploy/release/migrate/publish marker" };
  }

  if (options.inspectWorker || /\b(inspect|continue|handoff)\b/i.test(options.userRequest ?? "")) {
    return { visibility: "desktop-thread", reason: "auto: user asked to inspect or continue separately" };
  }

  return { visibility: "inline", reason: "auto: default inline" };
}

export function collectAgents(phases) {
  const agents = [];
  for (const phase of phases) {
    for (const agent of phaseAgents(phase)) {
      agents.push({
        ...agent,
        phase_id: phase.id,
        phase_label: phase.label,
      });
    }
  }
  return agents;
}

function phaseAgents(phase) {
  if (Array.isArray(phase.agents)) return phase.agents;
  if (phase.agent) return [phase.agent];
  return [];
}

function countPhaseAgents(phase) {
  return phaseAgents(phase).length;
}

function phaseById(phases, id) {
  return phases.find((phase) => phase.id === id);
}

function hasWriteScope(agent) {
  return typeof agent.write_scope === "string" && agent.write_scope.trim().length > 0;
}

function rejectExecutableTokens(body, label) {
  const codeOnly = body.replace(/"([^"\\]|\\.)*"/g, '""');
  const forbidden = [
    /\bimport\b/,
    /\brequire\s*\(/,
    /\bprocess\./,
    /\bchild_process\b/,
    /\bfs\b/,
    /\bfetch\s*\(/,
    /\bfunction\b/,
    /\bFunction\s*\(/,
    /=>/,
    /\bwhile\s*\(/,
    /\bfor\s*\(/,
    /\bawait\b/,
    /\beval\s*\(/,
    /\bnew\s+/,
  ];

  for (const pattern of forbidden) {
    if (pattern.test(codeOnly)) {
      throw new Error(`${label}: workflow spec contains executable token ${pattern}`);
    }
  }
}

function appendList(lines, items) {
  if (!Array.isArray(items) || items.length === 0) {
    lines.push("- none");
    return;
  }
  for (const item of items) {
    lines.push(`- ${item}`);
  }
}

function parseArgs(argv) {
  const options = {
    format: "markdown",
    runImmediately: false,
    inspectWorker: false,
    rawPrivilegedPath: false,
    userRequest: "",
  };
  let workflowPath;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--format") {
      options.format = argv[++index] ?? "markdown";
    } else if (arg === "--run-immediately") {
      options.runImmediately = true;
    } else if (arg === "--inspect-worker") {
      options.inspectWorker = true;
    } else if (arg === "--raw-privileged-path") {
      options.rawPrivilegedPath = true;
    } else if (arg === "--user-request") {
      options.userRequest = argv[++index] ?? "";
    } else if (!workflowPath) {
      workflowPath = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  if (!workflowPath) {
    throw new Error("Usage: node scripts/cwf-run-preview.mjs <workflow.js> [--format json] [--run-immediately]");
  }

  return { workflowPath, options };
}

async function main() {
  const { workflowPath, options } = parseArgs(process.argv.slice(2));
  const loaded = await loadWorkflow(workflowPath);
  const preview = buildPreview(loaded.workflow, options);
  if (options.format === "json") {
    console.log(JSON.stringify(preview, null, 2));
    return;
  }
  process.stdout.write(renderPreviewMarkdown(preview, basename(loaded.path)));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
