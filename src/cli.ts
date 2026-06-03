#!/usr/bin/env node
import { access, readdir, readFile } from "node:fs/promises";
import { closeSync, openSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { loadWorkflowSpec } from "./workflow-loader.js";
import { executeWorkflow, runWorkflow } from "./phase-engine.js";
import { describeFailurePolicy, latestRun, listRuns, normalizeRunState, showRun } from "./run-index.js";
import { RunStore } from "./run-store.js";
import {
  formatWorkflowList,
  formatWorkflowShow,
  listWorkflowEntries,
  resolveWorkflowReference,
  showWorkflow,
  validateWorkflowRegistry,
  workflowSearchPaths,
} from "./workflow-registry.js";
import type { PhaseState, PhaseStatus, RunIndexEntry, RunState, WorkerResult } from "./types.js";

type ParsedArgs = {
  command?: string;
  workflowPath?: string;
  workflowSubcommand?: string;
  workflowRef?: string;
  target?: string;
  runId?: string;
  background?: boolean;
  once?: boolean;
  intervalMs?: number;
  limit?: number;
  status?: PhaseStatus;
  gateId?: string;
  reason?: string;
};

async function main(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  if (!args.command || args.command === "--help" || args.command === "-h" || args.command === "help") {
    printHelp();
    return;
  }

  if (args.command === "run") {
    if (!args.workflowPath) {
      throw new Error("Please tell me which workflow to run. Example: cwf run diff-review --target .");
    }
    if (!args.target) {
      throw new Error("Please pass --target <repo>. Example: cwf run diff-review --target .");
    }
    const target = resolve(args.target);
    await assertPathExists(target, "target repo");
    const { spec, path: specPath } = await resolveWorkflowReference(args.workflowPath);
    if (args.background) {
      const store = await RunStore.create(spec, target);
      await startBackgroundRun(store, specPath, target);
      console.log(`Run ID: ${store.runId}`);
      console.log(`Run dir: ${store.runDir}`);
      console.log(`Status: cwf status ${store.runId}`);
      console.log(`Result: cwf result ${store.runId}`);
      return;
    }
    const store = await runWorkflow({ spec, specPath, target });
    console.log(`Run ID: ${store.runId}`);
    console.log(`Run dir: ${store.runDir}`);
    return;
  }

  if (args.command === "validate" || args.command === "dry-run") {
    if (!args.workflowPath) {
      throw new Error("Please tell me which workflow to validate. Example: cwf validate workflows/diff-review.yaml");
    }
    const { spec, path: specPath } = await resolveWorkflowReference(args.workflowPath);
    printWorkflowValidation(spec, specPath);
    return;
  }

  if (args.command === "workflows") {
    if (args.workflowSubcommand === "list") {
      console.log(formatWorkflowList(await listWorkflowEntries()));
      return;
    }
    if (args.workflowSubcommand === "show") {
      if (!args.workflowRef) {
        throw new Error("Usage: cwf workflows show <workflow-id-or-path>");
      }
      console.log(formatWorkflowShow(await showWorkflow(args.workflowRef)));
      return;
    }
    if (args.workflowSubcommand === "validate") {
      if (args.workflowRef) {
        const { spec, path: specPath } = await resolveWorkflowReference(args.workflowRef);
        printWorkflowValidation(spec, specPath);
        return;
      }
      const entries = await validateWorkflowRegistry();
      console.log(`Workflow registry OK: ${entries.length} workflow${entries.length === 1 ? "" : "s"}`);
      for (const path of workflowSearchPaths()) {
        console.log(`Search path: ${path}`);
      }
      return;
    }
    throw new Error("Usage: cwf workflows <list|show|validate> [workflow-id-or-path]");
  }

  if (args.command === "__run") {
    if (!args.runId || !args.workflowPath || !args.target) {
      throw new Error("Usage: cwf __run <run-id> <workflow.yaml> --target <repo>");
    }
    const specPath = resolve(args.workflowPath);
    const target = resolve(args.target);
    const spec = await loadWorkflowSpec(specPath);
    const store = RunStore.fromRunId(args.runId);
    await executeWorkflow({ spec, specPath, target, store });
    return;
  }

  if (args.command === "status") {
    if (!args.runId) {
      throw new Error("Usage: cwf status <run-id>");
    }
    const store = RunStore.fromRunId(args.runId);
    const state = await store.readState();
    await printStatus(store, state);
    return;
  }

  if (args.command === "list") {
    const runs = await listRuns({ limit: args.limit ?? 20, status: args.status, target: args.target });
    console.log(formatRunList(runs));
    return;
  }

  if (args.command === "show") {
    if (!args.runId) {
      throw new Error("Usage: cwf show <run-id>");
    }
    const state = await showRun(args.runId);
    const workerResults = await readWorkerResults(state.run_dir);
    console.log(formatRunShow(state, workerResults));
    return;
  }

  if (args.command === "latest") {
    const run = await latestRun({ target: args.target });
    if (!run) {
      console.log(args.target ? `No runs found for target: ${resolve(args.target)}` : "No runs found.");
      return;
    }
    const state = await showRun(run.id);
    const workerResults = await readWorkerResults(state.run_dir);
    console.log(formatRunShow(state, workerResults));
    return;
  }

  if (args.command === "watch") {
    if (!args.runId) {
      throw new Error("Usage: cwf watch <run-id> [--interval <ms>] [--once]");
    }
    const store = RunStore.fromRunId(args.runId);
    await watchRun(store, { intervalMs: args.intervalMs ?? 2000, once: Boolean(args.once) });
    return;
  }

  if (args.command === "approve") {
    if (!args.runId || !args.gateId) {
      throw new Error("Usage: cwf approve <run-id> <gate-id>");
    }
    const store = RunStore.fromRunId(args.runId);
    await store.approveGate(args.gateId);
    console.log(`Approved gate: ${args.gateId}`);
    console.log(`Resume: cwf resume ${args.runId}`);
    return;
  }

  if (args.command === "reject") {
    if (!args.runId || !args.gateId) {
      throw new Error("Usage: cwf reject <run-id> <gate-id> [--reason <text>]");
    }
    const store = RunStore.fromRunId(args.runId);
    await store.rejectGate(args.gateId, args.reason);
    console.log(`Rejected gate: ${args.gateId}`);
    console.log(`Status: cwf status ${args.runId}`);
    return;
  }

  if (args.command === "resume") {
    if (!args.runId) {
      throw new Error("Usage: cwf resume <run-id>");
    }
    const store = RunStore.fromRunId(args.runId);
    const spec = await store.readWorkflow();
    const state = await store.readState();
    await executeWorkflow({ spec, specPath: `${store.runDir}/workflow.json`, target: state.target, store, resume: true });
    const nextState = await store.readState();
    const workerResults = await readWorkerResults(store.runDir);
    console.log(formatStatus(nextState, workerResults));
    return;
  }

  if (args.command === "result") {
    if (!args.runId) {
      throw new Error("Usage: cwf result <run-id>");
    }
    const store = RunStore.fromRunId(args.runId);
    try {
      process.stdout.write(await store.readResult());
    } catch {
      const state = await store.readState();
      throw new Error(`No result yet for ${args.runId}. Current status is ${state.status}. Try: cwf status ${args.runId}`);
    }
    return;
  }

  if (args.command === "cancel") {
    if (!args.runId) {
      throw new Error("Usage: cwf cancel <run-id>");
    }
    const store = RunStore.fromRunId(args.runId);
    const before = await store.readState();
    if (before.background_pid && before.status === "running") {
      try {
        process.kill(before.background_pid, "SIGTERM");
      } catch {
        // The run may have completed between status read and cancellation.
      }
    }
    const state = await store.cancel();
    if (state.status === "cancelled") {
      console.log(`Cancelled: ${args.runId}`);
    } else {
      console.log(`Cancel ignored: ${args.runId} is ${state.status}`);
    }
    return;
  }

  throw new Error(`Unknown command: ${args.command}`);
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command, first, second, ...restAfterSecond] = argv;
  const rest = command === "__run" ? restAfterSecond : [second, ...restAfterSecond].filter((value): value is string => Boolean(value));
  const parsed: ParsedArgs = { command };

  if (command === "run") {
    parsed.workflowPath = first;
    for (let index = 0; index < rest.length; index += 1) {
      const token = rest[index];
      if (token === "--target") {
        parsed.target = rest[index + 1];
        index += 1;
      } else if (token === "--background") {
        parsed.background = true;
      }
    }
  } else if (command === "validate" || command === "dry-run") {
    parsed.workflowPath = first;
  } else if (command === "workflows") {
    parsed.workflowSubcommand = first;
    parsed.workflowRef = second;
  } else if (command === "__run") {
    parsed.runId = first;
    parsed.workflowPath = second;
    for (let index = 0; index < rest.length; index += 1) {
      const token = rest[index];
      if (token === "--target") {
        parsed.target = rest[index + 1];
        index += 1;
      }
    }
  } else if (command === "status" || command === "result" || command === "cancel" || command === "watch" || command === "resume") {
    parsed.runId = first;
    for (let index = 0; index < rest.length; index += 1) {
      const token = rest[index];
      if (token === "--once") {
        parsed.once = true;
      } else if (token === "--interval") {
        parsed.intervalMs = parseInterval(rest[index + 1]);
        index += 1;
      }
    }
  } else if (command === "approve" || command === "reject") {
    parsed.runId = first;
    parsed.gateId = second;
    for (let index = 0; index < rest.length; index += 1) {
      const token = rest[index];
      if (token === "--reason") {
        parsed.reason = rest[index + 1];
        index += 1;
      }
    }
  } else if (command === "show") {
    parsed.runId = first;
  } else if (command === "list" || command === "latest") {
    const tokens = [first, ...rest].filter((value): value is string => Boolean(value));
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (token === "--limit") {
        parsed.limit = parseLimit(tokens[index + 1]);
        index += 1;
      } else if (token === "--status") {
        parsed.status = parseStatus(tokens[index + 1]);
        index += 1;
      } else if (token === "--target") {
        parsed.target = tokens[index + 1];
        index += 1;
      }
    }
  }

  return parsed;
}

export function formatHelp(): string {
  return `cwf - Codex-native workflow runner

Usage:
  cwf --help
  cwf validate <workflow.yaml>
  cwf workflows list
  cwf workflows show <workflow-id-or-path>
  cwf workflows validate [workflow-id-or-path]
  cwf run <workflow-id-or-path> --target <repo> [--background]
  cwf status <run-id>
  cwf watch <run-id> [--interval <ms>] [--once]
  cwf list [--limit <n>] [--status <status>] [--target <repo>]
  cwf latest [--target <repo>]
  cwf show <run-id>
  cwf approve <run-id> <gate-id>
  cwf reject <run-id> <gate-id> [--reason <text>]
  cwf resume <run-id>
  cwf result <run-id>
  cwf cancel <run-id>

Common flow:
  cwf validate workflows/diff-review.yaml
  cwf workflows list
  cwf run diff-review --target . --background
  cwf watch <run-id>
  cwf latest
  cwf result <run-id>

Current workflow:
  diff-review (or workflows/diff-review.yaml)
`;
}

function printWorkflowValidation(spec: Awaited<ReturnType<typeof loadWorkflowSpec>>, specPath: string): void {
  console.log(`Workflow OK: ${spec.id}@${spec.version}`);
  console.log(`Title: ${spec.title}`);
  console.log(`Path: ${specPath}`);
  console.log(`Phases: ${spec.phases.map((phase) => phase.id).join(" -> ")}`);
  const reviewPhase = spec.phases.find((phase) => phase.kind === "codex-parallel");
  if (reviewPhase?.kind === "codex-parallel") {
    console.log(`Workers: ${reviewPhase.workers.map((worker) => worker.id).join(", ")}`);
  }
  console.log("No Codex workers were started.");
}

function printHelp(): void {
  console.log(formatHelp());
}

type WatchOptions = {
  intervalMs: number;
  once: boolean;
};

async function watchRun(store: RunStore, options: WatchOptions): Promise<void> {
  const intervalMs = Math.max(250, options.intervalMs);
  while (true) {
    const state = await store.readState();
    const workerResults = await readWorkerResults(store.runDir);
    const frame = formatWatchFrame(state, workerResults, intervalMs);
    if (process.stdout.isTTY && !options.once) {
      process.stdout.write("\x1b[2J\x1b[H");
    }
    process.stdout.write(`${frame}\n`);

    if (options.once || isTerminalStatus(state.status)) {
      return;
    }
    await sleep(intervalMs);
  }
}

export function formatWatchFrame(state: RunState, workerResults: WorkerResult[] = [], intervalMs = 2000, now = Date.now()): string {
  const lines = [
    `cwf watch ${state.id}`,
    `Auto-refresh: ${intervalMs}ms; press Ctrl-C to stop. Finished runs exit automatically.`,
    "",
    formatStatus(state, workerResults, now),
  ];
  return lines.join("\n");
}

async function printStatus(store: RunStore, state: RunState): Promise<void> {
  const workerResults = await readWorkerResults(store.runDir);
  console.log(formatStatus(state, workerResults));
}

export function formatStatus(state: RunState, workerResults: WorkerResult[] = [], now = Date.now()): string {
  state = normalizeRunState(state);
  const fallbackCount = workerResults.filter((result) => result.raw_fallback).length;
  const completedWorkers = state.workers.filter((worker) => worker.status === "completed").length;
  const activePhase = state.phases.find((phase) => phase.status === "running")?.id;
  const activeGate = findActiveGate(state);
  const lines: string[] = [];

  lines.push(`Run ID: ${state.id}`);
  lines.push(`Workflow: ${state.workflow}`);
  lines.push(`Status: ${state.status}`);
  lines.push(`Now: ${describeCurrentWork(state)}`);
  lines.push(`Target: ${state.target}`);
  lines.push(`Failure policy: ${describeFailurePolicy(state.failure_policy)}`);
  if (state.failure_summary) {
    lines.push(`Failure summary: ${formatFailureSummary(state)}`);
  }
  if (activeGate) {
    lines.push(`Gate: ${formatGateSummary(state, activeGate)}`);
    if (activeGate.status === "waiting") {
      lines.push(`Approve: cwf approve ${state.id} ${activeGate.id}`);
      lines.push(`Reject: cwf reject ${state.id} ${activeGate.id} --reason <text>`);
    } else if (activeGate.status === "approved" && state.status === "approved") {
      lines.push(`Resume: cwf resume ${state.id}`);
    }
  }
  lines.push(`Workers: ${completedWorkers}/${state.workers.length} completed, ${fallbackCount} fallback`);
  if (activePhase) {
    lines.push(`Active phase: ${activePhase}`);
  }

  lines.push("Phases:");
  for (const phase of state.phases) {
    lines.push(`- ${phase.id}: ${phase.status}${formatDuration(phase.started_at, phase.completed_at, now)}${phase.error ? ` (${phase.error})` : ""}`);
  }

  if (state.workers.length > 0) {
    lines.push("Workers:");
    for (const worker of state.workers) {
      const result = workerResults.find((item) => item.worker_id === worker.id);
      const fallback = result?.raw_fallback ? ", fallback" : "";
      const findings = result?.result ? `, findings=${result.result.findings.length}` : "";
      lines.push(
        `- ${worker.id}: ${worker.status}${formatDuration(worker.started_at, worker.completed_at, now)}${fallback}${findings}${worker.error ? ` (${worker.error})` : ""}`,
      );
    }
  }

  lines.push("Artifacts:");
  lines.push(`- State: ${state.run_dir}/state.json`);
  lines.push(`- Events: ${state.run_dir}/events.jsonl`);
  lines.push(`- Workers: ${state.run_dir}/workers/*.json`);
  if (state.result_path) {
    lines.push(`- Result: ${state.result_path}`);
  } else {
    lines.push(`- Result: not ready yet`);
  }
  if (state.log_path) {
    lines.push(`- Log: ${state.log_path}`);
  }
  if (state.background_pid && state.status === "running") {
    lines.push(`PID: ${state.background_pid}`);
  }
  return lines.join("\n");
}

export function formatRunList(runs: RunIndexEntry[]): string {
  if (runs.length === 0) {
    return "No runs found.";
  }
  const lines = ["Run ID                         Status     Workflow      Created At               Target"];
  for (const run of runs) {
    lines.push(
      `${pad(run.id, 30)} ${pad(run.status, 10)} ${pad(run.workflow, 13)} ${pad(run.created_at, 24)} ${run.target}`,
    );
  }
  return lines.join("\n");
}

export function formatRunShow(state: RunState, workerResults: WorkerResult[] = [], now = Date.now()): string {
  state = normalizeRunState(state);
  return [
    formatStatus(state, workerResults, now),
    "",
    "Discovery:",
    `- Show: cwf show ${state.id}`,
    `- Latest for target: cwf latest --target ${shellArg(state.target)}`,
    `- List similar: cwf list --target ${shellArg(state.target)} --status ${state.status}`,
  ].join("\n");
}

async function readWorkerResults(runDir: string): Promise<WorkerResult[]> {
  try {
    const workerDir = `${runDir}/workers`;
    const files = await readdir(workerDir);
    const results = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map(async (file) => JSON.parse(await readFile(`${workerDir}/${file}`, "utf8")) as WorkerResult),
    );
    return results;
  } catch {
    return [];
  }
}

function describeCurrentWork(state: RunState): string {
  const activeGate = findActiveGate(state);
  if (state.status === "waiting" && activeGate) {
    return `waiting at gate ${activeGate.id}; approve or reject before resume`;
  }
  if (state.status === "approved" && activeGate) {
    return `gate ${activeGate.id} approved; run cwf resume ${state.id}`;
  }
  if (state.status === "rejected" && activeGate) {
    return `rejected at gate ${activeGate.id}${activeGate.decision_reason ? `: ${activeGate.decision_reason}` : ""}`;
  }
  if (state.status === "completed") {
    return "done; open the result report";
  }
  if (state.status === "failed") {
    return `failed${state.error ? `: ${state.error}` : ""}`;
  }
  if (state.status === "cancelled") {
    return "cancelled";
  }
  const runningWorkers = state.workers.filter((worker) => worker.status === "running").map((worker) => worker.id);
  if (runningWorkers.length > 0) {
    return `reviewing diff with ${runningWorkers.join(", ")}`;
  }
  const runningPhase = state.phases.find((phase) => phase.status === "running");
  if (runningPhase) {
    return `running ${runningPhase.id}`;
  }
  return "waiting for the next phase";
}

function formatFailureSummary(state: RunState): string {
  const summary = state.failure_summary;
  if (!summary) {
    return "";
  }
  const workers = summary.failed_workers.length > 0 ? ` Failed workers: ${summary.failed_workers.join(", ")}.` : "";
  return `${summary.title}: ${withSentencePunctuation(summary.detail)}${workers} Next: ${summary.next_step}`;
}

function formatDuration(startedAt?: string, completedAt?: string, now = Date.now()): string {
  if (!startedAt) {
    return "";
  }
  const end = completedAt ? Date.parse(completedAt) : now;
  const start = Date.parse(startedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return "";
  }
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  return ` (${seconds}s)`;
}

function isTerminalStatus(status: RunState["status"]): boolean {
  return status === "completed" || status === "failed" || status === "cancelled" || status === "rejected";
}

function parseInterval(value?: string): number {
  if (!value) {
    throw new Error("Missing value after --interval");
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid --interval value: ${value}`);
  }
  return Math.round(parsed);
}

function parseLimit(value?: string): number {
  if (!value) {
    throw new Error("Missing value after --limit");
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid --limit value: ${value}`);
  }
  return parsed;
}

function parseStatus(value?: string): PhaseStatus {
  const statuses: PhaseStatus[] = ["pending", "running", "waiting", "approved", "rejected", "completed", "failed", "cancelled"];
  if (!value || !statuses.includes(value as PhaseStatus)) {
    throw new Error(`Invalid --status value: ${value ?? ""}`);
  }
  return value as PhaseStatus;
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : `${value}${" ".repeat(width - value.length)}`;
}

function withSentencePunctuation(value: string): string {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function shellArg(value: string): string {
  return /^[A-Za-z0-9_./:@-]+$/.test(value) ? value : `'${value.replace(/'/g, "'\\''")}'`;
}

function findActiveGate(state: RunState): PhaseState | undefined {
  return state.phases.find((phase) => phase.status === "waiting" || phase.status === "approved" || phase.status === "rejected");
}

function formatGateSummary(state: RunState, gate: PhaseState): string {
  const decision = state.gate_decisions.find((item) => item.gate_id === gate.id);
  if (gate.status === "waiting") {
    return `${gate.id} is waiting${gate.prompt ? ` - ${gate.prompt}` : ""}`;
  }
  if (gate.status === "approved") {
    return `${gate.id} approved${decision?.decided_at ? ` at ${decision.decided_at}` : ""}`;
  }
  if (gate.status === "rejected") {
    return `${gate.id} rejected${decision?.reason ? ` - ${decision.reason}` : ""}`;
  }
  return `${gate.id}: ${gate.status}`;
}

async function startBackgroundRun(store: RunStore, specPath: string, target: string): Promise<void> {
  const logPath = `${store.runDir}/run.log`;
  const logFd = openSync(logPath, "a");
  const scriptPath = process.argv[1];
  const child = spawn(process.execPath, [scriptPath, "__run", store.runId, specPath, "--target", target], {
    cwd: process.cwd(),
    detached: true,
    env: process.env,
    stdio: ["ignore", logFd, logFd],
  });
  child.unref();
  closeSync(logFd);
  await store.markBackground(child.pid ?? -1, logPath);
}

async function assertPathExists(path: string, label: string): Promise<void> {
  try {
    await access(path);
  } catch {
    throw new Error(`${label} does not exist: ${path}`);
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
