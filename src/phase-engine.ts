import { resolve } from "node:path";
import { collectDiffContext, currentDiffHash } from "./adapters/command-step.js";
import { runCodexWorker, type RunCodexWorkerOptions } from "./adapters/codex-worker.js";
import { reduceDiffReview } from "./reducers/diff-review-reducer.js";
import { renderMarkdownResult } from "./renderers/markdown-result.js";
import { buildFailureSummary } from "./run-index.js";
import { RunStore } from "./run-store.js";
import type { DiffContext, WorkerResult, WorkflowSpec, WorkflowWorker } from "./types.js";

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
  const startedDiffHash = await currentDiffHash(target);

  try {
    await store.updatePhase("collect", "running");
    const context = await collectDiffContext(target);
    await store.appendEvent("collect.context", {
      branch: context.branch,
      changed_files: context.changed_files,
      diff_hash: context.diff_hash,
      truncated: context.truncated,
    });
    await store.updatePhase("collect", "completed");

    const reviewPhase = options.spec.phases.find((phase) => phase.kind === "codex-parallel");
    if (!reviewPhase || reviewPhase.kind !== "codex-parallel") {
      throw new Error("diff-review workflow must include a codex-parallel review phase");
    }

    await store.updatePhase("review", "running");
    const workerRunner = options.workerRunner ?? runCodexWorker;
    const workerResults = await Promise.all(
      reviewPhase.workers.map(async (worker): Promise<WorkerResult> => {
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
      await store.updatePhase("review", "failed", error);
      throw new Error(error);
    }
    await store.updatePhase("review", "completed");

    const endedDiffHash = await currentDiffHash(target);
    if (startedDiffHash !== endedDiffHash) {
      const error = "Target repo diff changed during read-only diff-review run.";
      await store.updatePhase("reduce", "failed", error);
      throw new Error(error);
    }

    await store.updatePhase("reduce", "running");
    const artifacts = [
      `${store.runDir}/workflow.json`,
      `${store.runDir}/state.json`,
      `${store.runDir}/events.jsonl`,
      `${store.runDir}/workers/*.json`,
      `${store.runDir}/result.md`,
    ];
    const reduced = reduceDiffReview(workerResults, artifacts);
    const markdown = renderMarkdownResult(reduced, context, workerResults, store.runDir);
    await store.updatePhase("reduce", "completed");
    await store.writeResult(markdown);
    await store.appendEvent("run.completed", { run_id: store.runId });
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
