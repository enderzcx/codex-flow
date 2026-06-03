#!/usr/bin/env node
import { access, readdir, readFile } from "node:fs/promises";
import { closeSync, openSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { loadWorkflowSpec } from "./workflow-loader.js";
import { executeWorkflow, runWorkflow } from "./phase-engine.js";
import { RunStore } from "./run-store.js";
import type { RunState, WorkerResult } from "./types.js";

type ParsedArgs = {
  command?: string;
  workflowPath?: string;
  target?: string;
  runId?: string;
  background?: boolean;
};

async function main(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  if (!args.command || args.command === "--help" || args.command === "-h" || args.command === "help") {
    printHelp();
    return;
  }

  if (args.command === "run") {
    if (!args.workflowPath) {
      throw new Error("Please tell me which workflow to run. Example: cwf run workflows/diff-review.yaml --target .");
    }
    if (!args.target) {
      throw new Error("Please pass --target <repo>. Example: cwf run workflows/diff-review.yaml --target .");
    }
    const specPath = resolve(args.workflowPath);
    const target = resolve(args.target);
    await assertPathExists(specPath, "workflow spec");
    await assertPathExists(target, "target repo");
    const spec = await loadWorkflowSpec(specPath);
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
    const specPath = resolve(args.workflowPath);
    await assertPathExists(specPath, "workflow spec");
    const spec = await loadWorkflowSpec(specPath);
    console.log(`Workflow OK: ${spec.id}@${spec.version}`);
    console.log(`Phases: ${spec.phases.map((phase) => phase.id).join(" -> ")}`);
    const reviewPhase = spec.phases.find((phase) => phase.kind === "codex-parallel");
    if (reviewPhase?.kind === "codex-parallel") {
      console.log(`Workers: ${reviewPhase.workers.map((worker) => worker.id).join(", ")}`);
    }
    console.log("No Codex workers were started.");
    return;
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
  } else if (command === "status" || command === "result" || command === "cancel") {
    parsed.runId = first;
  }

  return parsed;
}

export function formatHelp(): string {
  return `cwf - Codex-native workflow runner

Usage:
  cwf --help
  cwf validate <workflow.yaml>
  cwf run <workflow.yaml> --target <repo> [--background]
  cwf status <run-id>
  cwf result <run-id>
  cwf cancel <run-id>

Common flow:
  cwf validate workflows/diff-review.yaml
  cwf run workflows/diff-review.yaml --target . --background
  cwf status <run-id>
  cwf result <run-id>

Current workflow:
  workflows/diff-review.yaml
`;
}

function printHelp(): void {
  console.log(formatHelp());
}

async function printStatus(store: RunStore, state: RunState): Promise<void> {
  const workerResults = await readWorkerResults(store.runDir);
  console.log(formatStatus(state, workerResults));
}

export function formatStatus(state: RunState, workerResults: WorkerResult[] = [], now = Date.now()): string {
  const fallbackCount = workerResults.filter((result) => result.raw_fallback).length;
  const completedWorkers = state.workers.filter((worker) => worker.status === "completed").length;
  const activePhase = state.phases.find((phase) => phase.status === "running")?.id;
  const lines: string[] = [];

  lines.push(`Run ID: ${state.id}`);
  lines.push(`Workflow: ${state.workflow}`);
  lines.push(`Status: ${state.status}`);
  lines.push(`Now: ${describeCurrentWork(state)}`);
  lines.push(`Target: ${state.target}`);
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
