#!/usr/bin/env node
import { access } from "node:fs/promises";
import { closeSync, openSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { loadWorkflowSpec } from "./workflow-loader.js";
import { executeWorkflow, runWorkflow } from "./phase-engine.js";
import { RunStore } from "./run-store.js";

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
      throw new Error("Usage: cwf run <workflow.yaml> --target <repo>");
    }
    if (!args.target) {
      throw new Error("Missing --target <repo>");
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
    console.log(`Run ID: ${state.id}`);
    console.log(`Workflow: ${state.workflow}`);
    console.log(`Status: ${state.status}`);
    console.log(`Target: ${state.target}`);
    console.log("Phases:");
    for (const phase of state.phases) {
      console.log(`- ${phase.id}: ${phase.status}${phase.error ? ` (${phase.error})` : ""}`);
    }
    if (state.workers.length > 0) {
      console.log("Workers:");
      for (const worker of state.workers) {
        console.log(`- ${worker.id}: ${worker.status}${worker.error ? ` (${worker.error})` : ""}`);
      }
    }
    if (state.result_path) {
      console.log(`Result: ${state.result_path}`);
    }
    if (state.log_path) {
      console.log(`Log: ${state.log_path}`);
    }
    if (state.background_pid && (state.status === "running" || state.status === "pending")) {
      console.log(`PID: ${state.background_pid}`);
    }
    return;
  }

  if (args.command === "result") {
    if (!args.runId) {
      throw new Error("Usage: cwf result <run-id>");
    }
    const store = RunStore.fromRunId(args.runId);
    process.stdout.write(await store.readResult());
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

function printHelp(): void {
  console.log(`cwf - Codex-native workflow runner

Usage:
  cwf --help
  cwf run <workflow.yaml> --target <repo> [--background]
  cwf status <run-id>
  cwf result <run-id>
  cwf cancel <run-id>

MVP workflow:
  workflows/diff-review.yaml
`);
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

main(process.argv.slice(2)).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
