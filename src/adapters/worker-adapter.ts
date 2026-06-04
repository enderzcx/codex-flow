import type { DiffContext, WorkerAdapterName, WorkerResult, WorkflowRuntime, WorkflowWorker } from "../types.js";
import { runCodexWorker, type RunCodexWorkerOptions } from "./codex-worker.js";

export type WorkerAdapterOptions = RunCodexWorkerOptions & {
  runtime?: WorkflowRuntime;
};

export type WorkerAdapter = {
  name: WorkerAdapterName;
  run(worker: WorkflowWorker, context: DiffContext, options: WorkerAdapterOptions): Promise<WorkerResult>;
};

export type WorkerAdapterRegistry = Partial<Record<WorkerAdapterName, WorkerAdapter>>;

export class WorkerAdapterUnavailableError extends Error {
  constructor(adapter: WorkerAdapterName, reason: string) {
    super(`${adapter} unavailable: ${reason}`);
    this.name = "WorkerAdapterUnavailableError";
  }
}

export const sdkHeadlessAdapter: WorkerAdapter = {
  name: "codex-sdk-headless",
  run: runCodexWorker,
};

export const codexAppThreadAdapter: WorkerAdapter = unsupportedNativeAdapter(
  "codex-app-thread",
  "Codex app-server worker thread execution is not available in this public runtime yet.",
);

export const codexSubagentAdapter: WorkerAdapter = unsupportedNativeAdapter(
  "codex-subagent",
  "Native Codex subagent execution is host-owned and not exposed to this CLI process.",
);

export const codexReviewDetachedAdapter: WorkerAdapter = unsupportedNativeAdapter(
  "codex-review-detached",
  "Detached app-server review worker execution is not available in this public runtime yet.",
);

export const defaultWorkerAdapters: WorkerAdapterRegistry = {
  "codex-sdk-headless": sdkHeadlessAdapter,
  "codex-app-thread": codexAppThreadAdapter,
  "codex-subagent": codexSubagentAdapter,
  "codex-review-detached": codexReviewDetachedAdapter,
};

export async function runWorkerWithAdapter(
  worker: WorkflowWorker,
  context: DiffContext,
  options: WorkerAdapterOptions,
  registry: WorkerAdapterRegistry = defaultWorkerAdapters,
): Promise<WorkerResult> {
  const preferred = options.runtime?.preferred_worker_adapter ?? "codex-sdk-headless";
  const fallback = options.runtime?.fallback_worker_adapter;
  const adapter = resolveAdapter(preferred, registry);
  try {
    return await adapter.run(worker, context, { ...options, requestedAdapter: preferred });
  } catch (error) {
    if (!fallback || fallback === preferred) {
      throw error;
    }
    const fallbackAdapter = resolveAdapter(fallback, registry);
    const fallbackReason = error instanceof Error ? error.message : String(error);
    const result = await fallbackAdapter.run(worker, context, {
      ...options,
      requestedAdapter: preferred,
      fallbackUsed: true,
      fallbackReason,
    });
    return {
      ...result,
      runtime: {
        ...result.runtime,
        adapter: fallback,
        requested_adapter: preferred,
        fallback_adapter: fallback,
        fallback_used: true,
        fallback_reason: fallbackReason,
        agent_role: result.runtime?.agent_role ?? worker.id,
        transcript_read: result.runtime?.transcript_read ?? false,
      },
    };
  }
}

export function normalizeWorkerRuntimeMetadata(
  result: WorkerResult,
  adapter: WorkerAdapterName,
  worker: WorkflowWorker,
  metadata: Partial<NonNullable<WorkerResult["runtime"]>> = {},
): WorkerResult {
  return {
    ...result,
    runtime: {
      adapter,
      fallback_used: false,
      agent_role: worker.id,
      transcript_read: false,
      ...result.runtime,
      ...metadata,
    },
  };
}

function resolveAdapter(name: WorkerAdapterName, registry: WorkerAdapterRegistry): WorkerAdapter {
  const adapter = registry[name];
  if (!adapter) {
    throw new WorkerAdapterUnavailableError(name, "adapter is not registered");
  }
  return adapter;
}

function unsupportedNativeAdapter(name: WorkerAdapterName, reason: string): WorkerAdapter {
  return {
    name,
    async run(_worker: WorkflowWorker, _context: DiffContext, _options: WorkerAdapterOptions): Promise<WorkerResult> {
      throw new WorkerAdapterUnavailableError(name, reason);
    },
  };
}
