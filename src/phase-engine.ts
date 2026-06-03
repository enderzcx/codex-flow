import { resolve } from "node:path";
import { collectDiffContext, currentDiffHash } from "./adapters/command-step.js";
import { runCodexWorker, type RunCodexWorkerOptions } from "./adapters/codex-worker.js";
import { reduceDiffReview } from "./reducers/diff-review-reducer.js";
import { renderMarkdownResult } from "./renderers/markdown-result.js";
import { buildFailureSummary } from "./run-index.js";
import { RunStore } from "./run-store.js";
import type { DiffContext, PhaseState, WorkerResult, WorkflowPhase, WorkflowSpec, WorkflowWorker } from "./types.js";

export type WorkerRunner = (
  worker: WorkflowWorker,
  context: DiffContext,
  options: RunCodexWorkerOptions,
) => Promise<WorkerResult>;

export type RunWorkflowOptions = {
  spec: WorkflowSpec;
  specPath: string;
  target: string;
  workerRunner?: WorkerRunner;
  resume?: boolean;
};

export async function runWorkflow(options: RunWorkflowOptions): Promise<RunStore> {
  const target = resolve(options.target);
  const store = await RunStore.create(options.spec, target);
  await executeWorkflow({ ...options, target, store });
  return store;
}

export type ExecuteWorkflowOptions = RunWorkflowOptions & {
  store: RunStore;
};

export async function executeWorkflow(options: ExecuteWorkflowOptions): Promise<RunStore> {
  const target = resolve(options.target);
  const store = options.store;
  let context: DiffContext | undefined;

  if (options.resume) {
    await assertResumable(store);
  }

  try {
    for (const phase of options.spec.phases) {
      const phaseState = await readPhaseState(store, phase.id);
      if (isPhaseCompleteForExecution(phaseState)) {
        continue;
      }

      if (phase.kind === "command") {
        if (phase.id !== "collect") {
          throw new Error(`Unsupported command phase: ${phase.id}`);
        }
        context = await runCollectPhase(store, target);
        continue;
      }

      if (phase.kind === "gate") {
        if (phaseState.status === "waiting") {
          return store;
        }
        await store.waitAtGate(phase.id, phase.prompt);
        return store;
      }

      if (phase.kind === "codex-parallel") {
        context = context ?? (await loadContextForRun(store, target));
        await assertTargetDiffUnchanged(target, expectedTrackedDiffHash(context), "Target repo diff changed before Codex workers resumed.");
        await runCodexParallelPhase(store, phase, context, target, options);
        continue;
      }

      if (phase.kind === "reducer") {
        context = context ?? (await loadContextForRun(store, target));
        await assertTargetDiffUnchanged(target, expectedTrackedDiffHash(context), "Target repo diff changed during read-only diff-review run.");
        await runReducerPhase(store, phase, context);
      }
    }

    const finalState = await store.readState();
    if (finalState.phases.every((phase) => phase.status === "completed" || phase.status === "approved")) {
      await store.appendEvent("run.completed", { run_id: store.runId });
    }
    return store;
  } catch (error) {
    const state = await store.readState();
    state.status = "failed";
    state.error = error instanceof Error ? error.message : String(error);
    state.failure_summary = buildFailureSummary(state, state.error);
    await store.writeState(state);
    await store.appendEvent("run.failed", { error: state.error });
    throw error;
  }
}

async function runCollectPhase(store: RunStore, target: string): Promise<DiffContext> {
  await store.updatePhase("collect", "running");
  const context = {
    ...(await collectDiffContext(target)),
    tracked_diff_hash: await currentDiffHash(target),
  };
  await store.writeContext(context);
  await store.appendEvent("collect.context", {
    branch: context.branch,
    changed_files: context.changed_files,
    diff_hash: context.diff_hash,
    truncated: context.truncated,
  });
  await store.updatePhase("collect", "completed");
  return context;
}

function expectedTrackedDiffHash(context: DiffContext): string {
  return context.tracked_diff_hash ?? context.diff_hash;
}

async function runCodexParallelPhase(
  store: RunStore,
  phase: Extract<WorkflowPhase, { kind: "codex-parallel" }>,
  context: DiffContext,
  target: string,
  options: ExecuteWorkflowOptions,
): Promise<void> {
  await store.updatePhase(phase.id, "running");
  const workerRunner = options.workerRunner ?? runCodexWorker;
  const workerResults = await Promise.all(
    phase.workers.map(async (worker): Promise<WorkerResult> => {
      await store.updateWorker(worker.id, "running");
      const result = await workerRunner(worker, context, {
        target,
        timeoutMs: Number(process.env.CWF_WORKER_TIMEOUT_MS || options.spec.defaults.timeout_ms),
        codexPath: process.env.CWF_CODEX_PATH,
      });
      await store.writeWorkerResult(result);
      await store.updateWorker(worker.id, result.status, result.error);
      return result;
    }),
  );

  if (workerResults.every((result) => result.status === "failed")) {
    const error = "All Codex SDK workers failed; verify Codex SDK connectivity before changing architecture.";
    await store.updatePhase(phase.id, "failed", error);
    throw new Error(error);
  }
  await store.updatePhase(phase.id, "completed");
}

async function runReducerPhase(
  store: RunStore,
  phase: Extract<WorkflowPhase, { kind: "reducer" }>,
  context: DiffContext,
): Promise<void> {
  await store.updatePhase(phase.id, "running");
  const workerResults = await store.readWorkerResults();
  const artifacts = [
    `${store.runDir}/workflow.json`,
    `${store.runDir}/state.json`,
    `${store.runDir}/events.jsonl`,
    `${store.runDir}/workers/*.json`,
    `${store.runDir}/result.md`,
  ];
  const reduced = reduceDiffReview(workerResults, artifacts);
  const markdown = renderMarkdownResult(reduced, context, workerResults, store.runDir);
  await store.updatePhase(phase.id, "completed");
  await store.writeResult(markdown);
}

async function loadContextForRun(store: RunStore, target: string): Promise<DiffContext> {
  try {
    return await store.readContext();
  } catch {
    return collectDiffContext(target);
  }
}

async function assertTargetDiffUnchanged(target: string, expectedDiffHash: string, message: string): Promise<void> {
  const current = await currentDiffHash(target);
  if (current !== expectedDiffHash) {
    throw new Error(message);
  }
}

async function assertResumable(store: RunStore): Promise<void> {
  const state = await store.readState();
  if (state.status === "waiting") {
    const gate = state.phases.find((phase) => phase.status === "waiting");
    throw new Error(`Run is waiting at gate ${gate?.id ?? "(unknown)"}. Approve or reject it before resume.`);
  }
  if (state.status === "rejected") {
    throw new Error(`Run ${store.runId} was rejected and cannot be resumed.`);
  }
  if (state.status === "completed") {
    throw new Error(`Run ${store.runId} is already completed.`);
  }
  if (!state.phases.some((phase) => phase.status === "approved")) {
    throw new Error(`Run ${store.runId} has no approved gate to resume.`);
  }
}

async function readPhaseState(store: RunStore, id: string): Promise<PhaseState> {
  const state = await store.readState();
  const phase = state.phases.find((item) => item.id === id);
  if (!phase) {
    throw new Error(`Unknown phase: ${id}`);
  }
  return phase;
}

function isPhaseCompleteForExecution(phase: PhaseState): boolean {
  return phase.status === "completed" || phase.status === "approved";
}
