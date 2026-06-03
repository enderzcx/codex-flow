import { join, resolve } from "node:path";
import { collectDiffContext, currentDiffHash } from "./adapters/command-step.js";
import { runCodexWorker, type RunCodexWorkerOptions } from "./adapters/codex-worker.js";
import { reduceDiffReview } from "./reducers/diff-review-reducer.js";
import { renderMarkdownResult } from "./renderers/markdown-result.js";
import { buildFailureSummary } from "./run-index.js";
import { RunStore } from "./run-store.js";
import type { ArtifactManifest, ArtifactRef, DiffContext, PhaseState, WorkerResult, WorkflowPhase, WorkflowSpec, WorkflowWorker } from "./types.js";

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
  const state = await store.readState();
  const artifacts = buildArtifactRefs(store, workerResults, state.log_path);
  const reduced = reduceDiffReview(workerResults, artifacts);
  await store.writeReducedResult(reduced);
  const markdown = renderMarkdownResult(reduced, context, workerResults, store.runDir);
  await store.updatePhase(phase.id, "completed");
  await store.writeResult(markdown);
  const workflow = await store.readWorkflow();
  await store.writeArtifactManifest(buildArtifactManifest(store, workflow.id, artifacts));
}

function buildArtifactRefs(store: RunStore, workerResults: WorkerResult[], logPath?: string): ArtifactRef[] {
  const artifacts: ArtifactRef[] = [
    {
      id: "workflow",
      type: "workflow",
      path: join(store.runDir, "workflow.json"),
      description: "Validated workflow spec snapshot for this run.",
    },
    {
      id: "state",
      type: "state",
      path: join(store.runDir, "state.json"),
      description: "Mutable run state, phase status, worker status, and discovery metadata.",
    },
    {
      id: "events",
      type: "events",
      path: join(store.runDir, "events.jsonl"),
      description: "Append-only chronological event log.",
    },
    {
      id: "context",
      type: "context",
      path: join(store.runDir, "context.json"),
      description: "Collected git diff context reviewed by workers.",
    },
    ...workerResults.map<ArtifactRef>((worker) => ({
      id: `worker:${worker.worker_id}`,
      type: "worker",
      path: join(store.runDir, "workers", `${worker.worker_id}.json`),
      description: `Standard worker result envelope for ${worker.worker_id}.`,
    })),
    {
      id: "reduced-result",
      type: "generated",
      path: join(store.runDir, "artifacts", "reduced-result.json"),
      description: "Stable reduced result envelope used to render the final report.",
    },
    {
      id: "result",
      type: "result",
      path: join(store.runDir, "result.md"),
      description: "Human-readable reduced Markdown report.",
    },
    {
      id: "manifest",
      type: "manifest",
      path: join(store.runDir, "artifacts", "manifest.json"),
      description: "Rebuildable artifact manifest for this run.",
    },
  ];
  if (logPath) {
    artifacts.push({
      id: "log",
      type: "log",
      path: logPath,
      description: "Background process log for this run.",
    });
  }
  return artifacts;
}

function buildArtifactManifest(store: RunStore, workflow: string, artifacts: ArtifactRef[]): ArtifactManifest {
  return {
    version: 1,
    run_id: store.runId,
    workflow,
    generated_at: new Date().toISOString(),
    artifacts,
  };
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
