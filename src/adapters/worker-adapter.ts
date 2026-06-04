import { setTimeout as sleep } from "node:timers/promises";
import { checkDesktopCapability, createDefaultAppServerTransport, type AppServerTransport } from "../desktop-bridge.js";
import type { DesktopCapabilitySummary, DiffContext, WorkerAdapterName, WorkerResult, WorkflowRuntime, WorkflowWorker } from "../types.js";
import { buildWorkerPrompt, parseWorkerOutput, runCodexWorker, type RunCodexWorkerOptions } from "./codex-worker.js";

export type WorkerAdapterOptions = RunCodexWorkerOptions & {
  runtime?: WorkflowRuntime;
  workflowId?: string;
  runId?: string;
  parentThreadId?: string;
  coordinatorThreadId?: string;
  capability?: DesktopCapabilitySummary;
  appServer?: AppServerTransport;
  appServerFactory?: (codexPath: string) => AppServerTransport;
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

export const codexAppThreadAdapter: WorkerAdapter = {
  name: "codex-app-thread",
  run: runCodexAppThreadWorker,
};

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
    const result = await adapter.run(worker, context, { ...options, requestedAdapter: preferred });
    if (result.status === "failed" && fallback && fallback !== preferred) {
      return await runFallbackWorker(fallback, preferred, fallbackReasonFromResult(result), worker, context, options, registry);
    }
    return result;
  } catch (error) {
    if (!fallback || fallback === preferred) {
      throw error;
    }
    const fallbackReason = error instanceof Error ? error.message : String(error);
    return await runFallbackWorker(fallback, preferred, fallbackReason, worker, context, options, registry);
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

async function runFallbackWorker(
  fallback: WorkerAdapterName,
  preferred: WorkerAdapterName,
  fallbackReason: string,
  worker: WorkflowWorker,
  context: DiffContext,
  options: WorkerAdapterOptions,
  registry: WorkerAdapterRegistry,
): Promise<WorkerResult> {
  const fallbackAdapter = resolveAdapter(fallback, registry);
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

function fallbackReasonFromResult(result: WorkerResult): string {
  const reason = result.error || result.summary || "preferred worker adapter returned failed status";
  const ids = [
    result.runtime?.thread_id ? `thread_id=${result.runtime.thread_id}` : undefined,
    result.runtime?.turn_id ? `turn_id=${result.runtime.turn_id}` : undefined,
  ].filter(Boolean);
  return ids.length > 0 ? `${reason} (${ids.join(", ")})` : reason;
}

function unsupportedNativeAdapter(name: WorkerAdapterName, reason: string): WorkerAdapter {
  return {
    name,
    async run(_worker: WorkflowWorker, _context: DiffContext, _options: WorkerAdapterOptions): Promise<WorkerResult> {
      throw new WorkerAdapterUnavailableError(name, reason);
    },
  };
}

async function runCodexAppThreadWorker(
  worker: WorkflowWorker,
  context: DiffContext,
  options: WorkerAdapterOptions,
): Promise<WorkerResult> {
  if (worker.writes) {
    throw new WorkerAdapterUnavailableError("codex-app-thread", "write-capable app-thread workers are not supported in v1.7");
  }

  const capability = options.capability ?? await checkDesktopCapability(options.codexPath);
  if (!capability.thread_apis_available) {
    throw new WorkerAdapterUnavailableError("codex-app-thread", "Codex app-server schema does not expose required thread APIs");
  }

  const codexPath = options.codexPath ?? process.env.CWF_CODEX_PATH ?? "codex";
  const appServer = options.appServer ?? (options.appServerFactory ?? (() => createDefaultAppServerTransport()))(codexPath);

  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const prompt = buildWorkerPrompt(worker, context);
  let threadId: string | undefined;
  let turnId: string | undefined;
  let transcriptRead = false;
  let raw = "";

  try {
    await appServer.request("initialize", buildInitializeParams());
    await appServer.notify?.("initialized");

    const thread = await appServer.request("thread/start", buildWorkerThreadStartParams(context));
    threadId = extractId(thread, "thread");
    if (!threadId) {
      throw new Error("thread/start did not return thread.id");
    }
    await appServer.request("thread/name/set", buildWorkerThreadNameParams(threadId, worker, options));

    const turn = await appServer.request("turn/start", buildWorkerTurnStartParams(threadId, prompt, context));
    turnId = extractId(turn, "turn");
    const directRaw = extractWorkerRaw(turn, turnId) ?? "";
    const readResult = await readAppThreadWorkerRaw(appServer, threadId, turnId, directRaw, options.timeoutMs);
    raw = readResult.raw;
    transcriptRead = readResult.transcriptRead;

    if (!raw) {
      throw new Error("app-thread worker did not return a readable final response");
    }

    const parsed = parseWorkerOutput(worker.id, raw);
    const completed = Date.now();
    return {
      worker_id: worker.id,
      status: "completed",
      confidence: parsed.output.confidence,
      summary: parsed.output.summary,
      findings: parsed.output.findings,
      verification: parsed.output.verification,
      artifacts: parsed.output.artifacts,
      started_at: startedAt,
      completed_at: new Date(completed).toISOString(),
      duration_ms: completed - started,
      prompt,
      raw,
      raw_fallback: parsed.rawFallback,
      fallback_reason: parsed.rawFallback ? "App-thread worker returned malformed JSON; raw text was preserved as summary." : undefined,
      retry_count: 0,
      runtime: {
        adapter: "codex-app-thread",
        requested_adapter: options.requestedAdapter,
        fallback_adapter: options.fallbackUsed ? "codex-app-thread" : undefined,
        fallback_used: Boolean(options.fallbackUsed),
        fallback_reason: options.fallbackReason,
        parent_thread_id: options.parentThreadId,
        coordinator_thread_id: options.coordinatorThreadId,
        thread_id: threadId,
        turn_id: turnId,
        agent_role: worker.perspective || worker.id,
        agent_nickname: worker.id,
        transcript_read: transcriptRead,
        sandbox: "read-only",
        approval_policy: "never",
        result_return_path: "worker-envelope",
      },
    };
  } catch (error) {
    const completed = Date.now();
    return {
      worker_id: worker.id,
      status: "failed",
      confidence: "low",
      summary: "App-thread worker failed before returning a usable result.",
      findings: [],
      verification: [],
      artifacts: [],
      started_at: startedAt,
      completed_at: new Date(completed).toISOString(),
      duration_ms: completed - started,
      prompt,
      raw,
      raw_fallback: false,
      retry_count: 0,
      error: error instanceof Error ? error.message : String(error),
      runtime: {
        adapter: "codex-app-thread",
        requested_adapter: options.requestedAdapter,
        fallback_adapter: options.fallbackUsed ? "codex-app-thread" : undefined,
        fallback_used: Boolean(options.fallbackUsed),
        fallback_reason: options.fallbackReason,
        parent_thread_id: options.parentThreadId,
        coordinator_thread_id: options.coordinatorThreadId,
        thread_id: threadId,
        turn_id: turnId,
        agent_role: worker.perspective || worker.id,
        agent_nickname: worker.id,
        transcript_read: transcriptRead,
        sandbox: "read-only",
        approval_policy: "never",
        result_return_path: "worker-envelope",
      },
    };
  } finally {
    await appServer.close?.();
  }
}

function buildInitializeParams(): Record<string, unknown> {
  return {
    clientInfo: { name: "codex-flow", title: "Codex Flow", version: "1.7.0" },
    capabilities: {
      experimentalApi: true,
      requestAttestation: false,
      optOutNotificationMethods: ["item/agentMessage/delta", "command/exec/outputDelta"],
    },
  };
}

function buildWorkerThreadStartParams(context: DiffContext): Record<string, unknown> {
  return {
    cwd: context.target,
    approvalPolicy: "never",
    sandbox: "read-only",
    ephemeral: false,
    threadSource: "user",
    baseInstructions: "You are a read-only Codex Flow worker thread. Return the requested worker JSON and do not modify files.",
  };
}

function buildWorkerThreadNameParams(threadId: string, worker: WorkflowWorker, options: WorkerAdapterOptions): Record<string, unknown> {
  const workflow = options.workflowId ?? "workflow";
  const run = shortRunId(options.runId);
  return {
    threadId,
    name: `CWF ${workflow} ${worker.id}${run ? ` ${run}` : ""}`,
  };
}

function buildWorkerTurnStartParams(threadId: string, prompt: string, context: DiffContext): Record<string, unknown> {
  return {
    threadId,
    input: [{ type: "text", text: prompt, text_elements: [] }],
    cwd: context.target,
    approvalPolicy: "never",
    sandboxPolicy: { type: "readOnly", networkAccess: false },
  };
}

async function readAppThreadWorkerRaw(
  appServer: AppServerTransport,
  threadId: string,
  turnId: string | undefined,
  directRaw: string,
  timeoutMs: number,
): Promise<{ raw: string; transcriptRead: boolean }> {
  const deadline = Date.now() + Math.max(1000, Math.min(timeoutMs, Number(process.env.CWF_APP_THREAD_RESULT_TIMEOUT_MS || 120000)));
  let lastError: string | undefined;
  while (Date.now() <= deadline) {
    try {
      const read = await appServer.request("thread/read", { threadId, includeTurns: true });
      const readRaw = extractWorkerRaw(read, turnId);
      if (readRaw) {
        return { raw: readRaw, transcriptRead: true };
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    if (directRaw) {
      return { raw: directRaw, transcriptRead: false };
    }
    await sleep(1000);
  }
  if (lastError) {
    throw new Error(`app-thread worker did not return a readable final response; last thread/read error: ${lastError}`);
  }
  throw new Error("app-thread worker did not return a readable final response");
}

function shortRunId(runId?: string): string | undefined {
  if (!runId) {
    return undefined;
  }
  const parts = runId.split("_").filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : runId.slice(0, 8);
}

function extractId(value: unknown, key: "thread" | "turn"): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const nested = (value as Record<string, unknown>)[key];
  if (nested && typeof nested === "object") {
    const id = (nested as { id?: unknown }).id;
    return typeof id === "string" ? id : undefined;
  }
  const id = (value as { id?: unknown }).id;
  return typeof id === "string" ? id : undefined;
}

function extractWorkerRaw(value: unknown, turnId?: string): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  for (const key of ["finalResponse", "final_response", "response", "text", "output"]) {
    if (typeof record[key] === "string") {
      return record[key] as string;
    }
  }
  const turn = record.turn;
  if (turn && typeof turn === "object") {
    const raw = extractWorkerRaw(turn, turnId);
    if (raw) {
      return raw;
    }
  }
  const thread = record.thread;
  if (thread && typeof thread === "object") {
    const raw = extractWorkerRaw(thread, turnId);
    if (raw) {
      return raw;
    }
  }
  const turns = record.turns;
  if (Array.isArray(turns)) {
    const matching = turnId
      ? turns.find((item) => Boolean(item) && typeof item === "object" && (item as { id?: unknown }).id === turnId)
      : turns.at(-1);
    const raw = extractWorkerRaw(matching, turnId);
    if (raw) {
      return raw;
    }
  }
  const items = record.items;
  if (Array.isArray(items)) {
    const agentItems = items.filter((item) => Boolean(item) && typeof item === "object" && (item as { type?: unknown }).type === "agentMessage");
    for (const item of agentItems.reverse()) {
      const raw = extractWorkerRaw(item, turnId);
      if (raw) {
        return raw;
      }
    }
  }
  return undefined;
}
