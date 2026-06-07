import { open, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, sep } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { checkDesktopCapability, createDefaultAppServerTransport, createStdioAppServerTransport, type AppServerTransport } from "../desktop-bridge.js";
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

const appThreadExecutionProbes = new Map<string, Promise<void>>();
const appServerFactoryIds = new WeakMap<NonNullable<WorkerAdapterOptions["appServerFactory"]>, number>();
let nextAppServerFactoryId = 1;
const defaultAppThreadModel = "gpt-5.3-codex-spark";
const defaultAppThreadReasoningEffort = "low";
const appThreadProbeText = 'Return exactly {"probe":"cwf-app-thread-ok"} and nothing else.';
const appThreadDiagnosticsMaxBytes = 1_048_576;

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

  const codexPath = options.codexPath ?? process.env.CWF_CODEX_PATH ?? "codex";
  const capability = options.capability ?? await checkDesktopCapability(options.codexPath);
  if (!capability.thread_apis_available) {
    throw new WorkerAdapterUnavailableError("codex-app-thread", "Codex app-server schema does not expose required thread APIs");
  }
  await ensureAppThreadExecutionAvailable(context, options, codexPath);

  const appServer = options.appServer ?? (options.appServerFactory ?? createAppThreadAppServerTransport)(codexPath);
  const modelOverride = appThreadModelOverride();

  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const prompt = buildWorkerPrompt(worker, context);
  const requestTimeoutMs = appThreadWorkerRequestTimeoutMs(options);
  const deadline = Date.now() + Math.max(1, options.timeoutMs);
  let threadId: string | undefined;
  let turnId: string | undefined;
  let transcriptRead = false;
  let raw = "";

  try {
    await appServerRequestWithTimeout(appServer, "initialize", buildInitializeParams(), remainingWorkerTimeoutMs(deadline, options.timeoutMs, requestTimeoutMs));
    await appServerNotifyWithTimeout(appServer, "initialized", remainingWorkerTimeoutMs(deadline, options.timeoutMs, requestTimeoutMs));

    const thread = await appServerRequestWithTimeout(appServer, "thread/start", buildWorkerThreadStartParams(context, modelOverride), remainingWorkerTimeoutMs(deadline, options.timeoutMs, requestTimeoutMs));
    threadId = extractId(thread, "thread");
    if (!threadId) {
      throw new Error("thread/start did not return thread.id");
    }
    await appServerRequestWithTimeout(appServer, "thread/name/set", buildWorkerThreadNameParams(threadId, worker, options), remainingWorkerTimeoutMs(deadline, options.timeoutMs, requestTimeoutMs));

    const turn = await appServerRequestWithTimeout(appServer, "turn/start", buildWorkerTurnStartParams(threadId, prompt, context, modelOverride), remainingWorkerTimeoutMs(deadline, options.timeoutMs, requestTimeoutMs));
    turnId = extractId(turn, "turn");
    const directRaw = extractWorkerRaw(turn, turnId) ?? "";
    const readResult = await readAppThreadWorkerRaw(
      appServer,
      threadId,
      turnId,
      directRaw,
      directRaw ? 1 : remainingWorkerTimeoutMs(deadline, options.timeoutMs),
    );
    raw = readResult.raw;
    transcriptRead = readResult.transcriptRead;

    if (!raw) {
      throw new Error(formatAppThreadExecutionUnavailable("worker did not return an assistant response", threadId, turnId));
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
        model: modelOverride.model,
        model_provider: modelOverride.modelProvider,
        reasoning_effort: modelOverride.reasoningEffort,
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
        model: modelOverride.model,
        model_provider: modelOverride.modelProvider,
        reasoning_effort: modelOverride.reasoningEffort,
        result_return_path: "worker-envelope",
      },
    };
  } finally {
    await appServerCloseWithTimeout(appServer, appThreadCloseTimeoutMs(requestTimeoutMs)).catch(() => {});
  }
}

async function ensureAppThreadExecutionAvailable(context: DiffContext, options: WorkerAdapterOptions, codexPath: string): Promise<void> {
  if (options.appServer || process.env.CWF_APP_THREAD_EXECUTION_PREFLIGHT === "0") {
    return;
  }
  const cacheKey = appThreadProbeCacheKey(codexPath, options.appServerFactory);
  let probe = appThreadExecutionProbes.get(cacheKey);
  if (!probe) {
    probe = runAppThreadExecutionProbe(context, options, codexPath);
    appThreadExecutionProbes.set(cacheKey, probe);
    probe.catch(() => {
      if (appThreadExecutionProbes.get(cacheKey) === probe) {
        appThreadExecutionProbes.delete(cacheKey);
      }
    });
  }
  await probe;
}

async function runAppThreadExecutionProbe(context: DiffContext, options: WorkerAdapterOptions, codexPath: string): Promise<void> {
  const appServer = (options.appServerFactory ?? createAppThreadAppServerTransport)(codexPath);
  const modelOverride = appThreadModelOverride();
  const probeTimeoutMs = appThreadProbeTimeoutMs(options);
  const deadline = Date.now() + probeTimeoutMs;
  let threadId: string | undefined;
  let turnId: string | undefined;
  try {
    await appServerRequestWithTimeout(appServer, "initialize", buildInitializeParams(), remainingProbeTimeoutMs(deadline, probeTimeoutMs));
    await appServerNotifyWithTimeout(appServer, "initialized", remainingProbeTimeoutMs(deadline, probeTimeoutMs));
    const thread = await appServerRequestWithTimeout(appServer, "thread/start", {
      cwd: context.target,
      approvalPolicy: "never",
      sandbox: "read-only",
      ephemeral: false,
      threadSource: "user",
      baseInstructions: "You are a Codex Flow app-thread execution probe. Return only the exact JSON object requested by the user.",
      ...buildThreadModelParams(modelOverride),
    }, remainingProbeTimeoutMs(deadline, probeTimeoutMs));
    threadId = extractId(thread, "thread");
    if (!threadId) {
      throw new Error("thread/start did not return thread.id");
    }
    await appServerRequestWithTimeout(appServer, "thread/name/set", {
      threadId,
      name: `CWF app-thread probe ${new Date().toISOString().slice(11, 19)}`,
    }, remainingProbeTimeoutMs(deadline, probeTimeoutMs));
    const turn = await appServerRequestWithTimeout(appServer, "turn/start", {
      threadId,
      input: [{ type: "text", text: appThreadProbeText, text_elements: [] }],
      cwd: context.target,
      approvalPolicy: "never",
      sandboxPolicy: { type: "readOnly", networkAccess: false },
      outputSchema: appThreadProbeOutputSchema(),
      ...buildTurnModelParams(modelOverride),
    }, remainingProbeTimeoutMs(deadline, probeTimeoutMs));
    turnId = extractId(turn, "turn");
    if (!turnId) {
      throw new Error("turn/start did not return turn.id");
    }
    const raw = await readAppThreadProbeRaw(
      appServer,
      threadId,
      turnId,
      extractWorkerRaw(turn, turnId) ?? "",
      deadline,
      probeTimeoutMs,
    );
    if (!raw) {
      throw new WorkerAdapterUnavailableError("codex-app-thread", formatAppThreadExecutionUnavailable("probe did not return an assistant response", threadId, turnId));
    }
    assertAppThreadProbeResponse(raw, threadId, turnId);
  } catch (error) {
    if (error instanceof WorkerAdapterUnavailableError) {
      throw error;
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw new WorkerAdapterUnavailableError(
      "codex-app-thread",
      turnId
        ? formatAppThreadExecutionUnavailable(reason, threadId, turnId)
        : formatAppThreadProbeSetupFailure(reason, threadId),
    );
  } finally {
    await appServerCloseWithTimeout(appServer, appThreadCloseTimeoutMs(probeTimeoutMs)).catch(() => {});
  }
}

function appThreadProbeTimeoutMs(options: WorkerAdapterOptions): number {
  return Math.max(1, Math.min(timeoutEnvMs("CWF_APP_THREAD_PROBE_TIMEOUT_MS", 15000), options.timeoutMs));
}

function appThreadWorkerRequestTimeoutMs(options: WorkerAdapterOptions): number {
  return Math.max(1, Math.min(timeoutEnvMs("CWF_APP_THREAD_WORKER_REQUEST_TIMEOUT_MS", 15000), options.timeoutMs));
}

function appThreadCloseTimeoutMs(referenceTimeoutMs: number): number {
  return Math.max(1, Math.min(timeoutEnvMs("CWF_APP_THREAD_CLOSE_TIMEOUT_MS", 1000), referenceTimeoutMs));
}

function remainingWorkerTimeoutMs(deadline: number, originalTimeoutMs: number, capMs = Number.POSITIVE_INFINITY): number {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    throw new Error(`app-thread worker timed out after ${originalTimeoutMs}ms`);
  }
  return Math.max(1, Math.min(remaining, capMs));
}

function remainingProbeTimeoutMs(deadline: number, originalTimeoutMs: number): number {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    throw new Error(`app-thread execution probe timed out after ${originalTimeoutMs}ms`);
  }
  return Math.max(1, remaining);
}

function appThreadProbeCacheKey(codexPath: string, appServerFactory: WorkerAdapterOptions["appServerFactory"]): string {
  const modelOverride = appThreadModelOverride();
  const transport = appServerFactory ? "factory" : appThreadTransportMode();
  const modelKey = [
    modelOverride.model ? `model=${modelOverride.model}` : undefined,
    modelOverride.modelProvider ? `provider=${modelOverride.modelProvider}` : undefined,
    modelOverride.reasoningEffort ? `effort=${modelOverride.reasoningEffort}` : undefined,
  ].filter(Boolean).join(",");
  if (!appServerFactory) {
    return `${codexPath}:${transport}:${modelKey || "host-default"}`;
  }
  let id = appServerFactoryIds.get(appServerFactory);
  if (!id) {
    id = nextAppServerFactoryId;
    nextAppServerFactoryId += 1;
    appServerFactoryIds.set(appServerFactory, id);
  }
  return `${codexPath}:factory:${id}:${modelKey || "host-default"}`;
}

function createAppThreadAppServerTransport(codexPath: string): AppServerTransport {
  return appThreadTransportMode() === "daemon"
    ? createDefaultAppServerTransport()
    : createStdioAppServerTransport(codexPath);
}

function appThreadTransportMode(): "stdio" | "daemon" {
  const value = process.env.CWF_APP_THREAD_TRANSPORT?.trim().toLowerCase();
  return value === "daemon" || value === "socket" || value === "control-socket" ? "daemon" : "stdio";
}

async function readAppThreadProbeRaw(
  appServer: AppServerTransport,
  threadId: string,
  turnId: string | undefined,
  directRaw: string,
  deadline: number,
  originalTimeoutMs: number,
): Promise<string> {
  if (directRaw) {
    return directRaw;
  }
  let lastError: string | undefined;
  let lastDiagnostics: string | undefined;
  const diagnosticsCache = new Map<string, string | undefined>();
  while (Date.now() <= deadline) {
    try {
      const read = await appServerRequestWithTimeout(
        appServer,
        "thread/read",
        { threadId, includeTurns: true },
        Math.max(1, Math.min(1000, remainingProbeTimeoutMs(deadline, originalTimeoutMs))),
        false,
      );
      const readRaw = extractWorkerRaw(read, turnId);
      if (readRaw) {
        return readRaw;
      }
      lastDiagnostics = await extractAppThreadReadDiagnostics(read, turnId, diagnosticsCache) ?? lastDiagnostics;
    } catch (error) {
      lastError = safeAppServerError(error);
    }
    const remaining = deadline - Date.now();
    if (remaining > 0) {
      await sleep(Math.min(250, remaining));
    }
  }
  throw new Error(
    `model execution channel did not return a readable assistant response${lastError ? `; last thread/read error: ${lastError}` : ""}${lastDiagnostics ? `; diagnostics: ${lastDiagnostics}` : ""}`,
  );
}

async function appServerRequestWithTimeout(
  appServer: AppServerTransport,
  method: string,
  params: unknown,
  timeoutMs: number,
  closeOnTimeout = true,
): Promise<unknown> {
  return promiseWithTimeout(appServer.request(method, params), method, timeoutMs, () => {
    if (closeOnTimeout) {
      void appServerCloseWithTimeout(appServer, appThreadCloseTimeoutMs(timeoutMs)).catch(() => {});
    }
  });
}

async function appServerNotifyWithTimeout(
  appServer: AppServerTransport,
  method: string,
  timeoutMs: number,
): Promise<void> {
  if (typeof appServer.notify !== "function") {
    return;
  }
  await promiseWithTimeout(Promise.resolve(appServer.notify(method)), `notify/${method}`, timeoutMs);
}

async function appServerCloseWithTimeout(appServer: AppServerTransport, timeoutMs: number): Promise<void> {
  if (typeof appServer.close !== "function") {
    return;
  }
  await promiseWithTimeout(Promise.resolve(appServer.close()), "app-server close", timeoutMs);
}

async function promiseWithTimeout<T>(promise: Promise<T>, label: string, timeoutMs: number, onTimeout?: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      onTimeout?.();
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, Math.max(1, timeoutMs));
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function formatAppThreadExecutionUnavailable(reason: string, threadId: string | undefined, turnId: string | undefined): string {
  const ids = [
    threadId ? `thread_id=${threadId}` : undefined,
    turnId ? `turn_id=${turnId}` : undefined,
  ].filter(Boolean);
  return `app-thread-execution-unavailable: thread APIs are available, but the model execution channel did not return a readable assistant response; detail: ${reason}${ids.length > 0 ? ` (${ids.join(", ")})` : ""}`;
}

function formatAppThreadProbeSetupFailure(reason: string, threadId: string | undefined): string {
  return `app-thread-probe-setup-failed: thread/model execution preflight could not complete setup; detail: ${reason}${threadId ? ` (thread_id=${threadId})` : ""}`;
}

function assertAppThreadProbeResponse(raw: string, threadId: string | undefined, turnId: string | undefined): void {
  try {
    const parsed = JSON.parse(raw.trim()) as { probe?: unknown };
    if (parsed.probe === "cwf-app-thread-ok") {
      return;
    }
  } catch {
    // Fall through to the explicit unavailable error below.
  }
  throw new WorkerAdapterUnavailableError(
    "codex-app-thread",
    formatAppThreadExecutionUnavailable("probe returned an unexpected response instead of {\"probe\":\"cwf-app-thread-ok\"}", threadId, turnId),
  );
}

function appThreadProbeOutputSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["probe"],
    properties: {
      probe: { type: "string", const: "cwf-app-thread-ok" },
    },
  };
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

type AppThreadModelOverride = {
  model?: string;
  modelProvider?: string;
  reasoningEffort?: string;
};

function appThreadModelOverride(): AppThreadModelOverride {
  const model = cleanEnvString("CWF_APP_THREAD_MODEL");
  const reasoningEffort = cleanEnvString("CWF_APP_THREAD_REASONING_EFFORT");
  const useHostDefault = model === "host-default" || model === "default";
  return {
    model: useHostDefault ? undefined : model ?? defaultAppThreadModel,
    modelProvider: cleanEnvString("CWF_APP_THREAD_MODEL_PROVIDER"),
    reasoningEffort: useHostDefault && !reasoningEffort ? undefined : reasoningEffort ?? defaultAppThreadReasoningEffort,
  };
}

function cleanEnvString(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function buildThreadModelParams(modelOverride: AppThreadModelOverride): Record<string, unknown> {
  return {
    ...(modelOverride.model ? { model: modelOverride.model } : {}),
    ...(modelOverride.modelProvider ? { modelProvider: modelOverride.modelProvider } : {}),
  };
}

function buildTurnModelParams(modelOverride: AppThreadModelOverride): Record<string, unknown> {
  return {
    ...(modelOverride.model ? { model: modelOverride.model } : {}),
    ...(modelOverride.reasoningEffort ? { effort: modelOverride.reasoningEffort } : {}),
  };
}

function buildWorkerThreadStartParams(context: DiffContext, modelOverride: AppThreadModelOverride): Record<string, unknown> {
  return {
    cwd: context.target,
    approvalPolicy: "never",
    sandbox: "read-only",
    ephemeral: false,
    threadSource: "user",
    baseInstructions: "You are a read-only Codex Flow worker thread. Return the requested worker JSON and do not modify files.",
    ...buildThreadModelParams(modelOverride),
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

function buildWorkerTurnStartParams(threadId: string, prompt: string, context: DiffContext, modelOverride: AppThreadModelOverride): Record<string, unknown> {
  return {
    threadId,
    input: [{ type: "text", text: prompt, text_elements: [] }],
    cwd: context.target,
    approvalPolicy: "never",
    sandboxPolicy: { type: "readOnly", networkAccess: false },
    ...buildTurnModelParams(modelOverride),
  };
}

async function readAppThreadWorkerRaw(
  appServer: AppServerTransport,
  threadId: string,
  turnId: string | undefined,
  directRaw: string,
  timeoutMs: number,
): Promise<{ raw: string; transcriptRead: boolean }> {
  if (directRaw) {
    return { raw: directRaw, transcriptRead: false };
  }
  const deadline = Date.now() + Math.max(1, Math.min(timeoutMs, timeoutEnvMs("CWF_APP_THREAD_RESULT_TIMEOUT_MS", 120000)));
  let lastError: string | undefined;
  let lastDiagnostics: string | undefined;
  const diagnosticsCache = new Map<string, string | undefined>();
  while (Date.now() <= deadline) {
    try {
      const read = await appServerRequestWithTimeout(
        appServer,
        "thread/read",
        { threadId, includeTurns: true },
        Math.max(1, Math.min(1000, deadline - Date.now())),
        false,
      );
      const readRaw = extractWorkerRaw(read, turnId);
      if (readRaw) {
        return { raw: readRaw, transcriptRead: true };
      }
      lastDiagnostics = await extractAppThreadReadDiagnostics(read, turnId, diagnosticsCache) ?? lastDiagnostics;
    } catch (error) {
      lastError = safeAppServerError(error);
    }
    const remaining = deadline - Date.now();
    if (remaining > 0) {
      await sleep(Math.min(1000, remaining));
    }
  }
  if (lastError) {
    throw new Error(formatAppThreadExecutionUnavailable(`worker read failed; last thread/read error: ${lastError}${lastDiagnostics ? `; diagnostics: ${lastDiagnostics}` : ""}`, threadId, turnId));
  }
  throw new Error(formatAppThreadExecutionUnavailable(`worker did not return an assistant response${lastDiagnostics ? `; diagnostics: ${lastDiagnostics}` : ""}`, threadId, turnId));
}

async function extractAppThreadReadDiagnostics(value: unknown, turnId?: string, diagnosticsCache = new Map<string, string | undefined>()): Promise<string | undefined> {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const thread = record.thread && typeof record.thread === "object"
    ? record.thread as Record<string, unknown>
    : record;
  const parts: string[] = [];
  const status = thread.status;
  if (status && typeof status === "object") {
    const type = (status as { type?: unknown }).type;
    if (typeof type === "string") {
      parts.push(`thread_status=${type}`);
    }
  }
  const turns = thread.turns;
  if (Array.isArray(turns)) {
    parts.push(`turns=${turns.length}`);
  }
  const path = typeof thread.path === "string" ? thread.path : undefined;
  if (path) {
    const cacheKey = `${path}:${turnId ?? ""}`;
    let sessionDiagnostics: string | undefined;
    if (diagnosticsCache.has(cacheKey)) {
      sessionDiagnostics = diagnosticsCache.get(cacheKey);
    } else {
      sessionDiagnostics = await extractAppThreadSessionDiagnostics(path, turnId);
      if (sessionDiagnostics && isTerminalSessionDiagnostics(sessionDiagnostics)) {
        diagnosticsCache.set(cacheKey, sessionDiagnostics);
      }
    }
    if (sessionDiagnostics) {
      parts.push(sessionDiagnostics);
    }
  }
  return parts.length > 0 ? parts.join("; ") : undefined;
}

function isTerminalSessionDiagnostics(diagnostics: string): boolean {
  return diagnostics.includes("quota_unavailable=") || diagnostics.includes("last_agent_message=");
}

function safeAppServerError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/timed out after \d+ms/.test(message)) {
    return message;
  }
  return "thread-read-failed";
}

async function extractAppThreadSessionDiagnostics(path: string, turnId?: string): Promise<string | undefined> {
  const safePath = await safeCodexSessionLogPath(path);
  if (!safePath) {
    return path ? `session_log=${sessionLogName(path)}` : undefined;
  }
  try {
    const text = await readSessionLogTail(safePath);
    let model: string | undefined;
    let effort: string | undefined;
    let credits: string | undefined;
    let lastAgentMessage: string | undefined;
    for (const line of text.split("\n")) {
      if (!line.trim()) {
        continue;
      }
      let entry: unknown;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const event = entry as { type?: unknown; payload?: Record<string, unknown> };
      const payload = event.payload;
      if (!payload || typeof payload !== "object") {
        continue;
      }
      if (turnId && payload.turn_id !== turnId) {
        continue;
      }
      if (event.type === "turn_context") {
        model = typeof payload.model === "string" ? payload.model : model;
        effort = typeof payload.effort === "string" ? payload.effort : effort;
      }
      if (event.type === "event_msg" && payload.type === "token_count") {
        const rateLimits = payload.rate_limits;
        if (rateLimits && typeof rateLimits === "object") {
          const rate = rateLimits as { credits?: { has_credits?: unknown } };
          if (rate.credits?.has_credits === false) {
            credits = "quota_unavailable=true";
          }
        }
      }
      if (event.type === "event_msg" && payload.type === "task_complete") {
        lastAgentMessage = payload.last_agent_message === null
          ? "null"
          : typeof payload.last_agent_message === "string" ? "present" : lastAgentMessage;
      }
    }
    const parts = [
      model ? `model=${model}` : undefined,
      effort ? `effort=${effort}` : undefined,
      credits,
      lastAgentMessage ? `last_agent_message=${lastAgentMessage}` : undefined,
      `session_log=${sessionLogName(safePath)}`,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join("; ") : undefined;
  } catch {
    return safePath ? `session_log=${sessionLogName(safePath)}` : undefined;
  }
}

async function safeCodexSessionLogPath(path: string): Promise<string | undefined> {
  if (!path.endsWith(".jsonl")) {
    return undefined;
  }
  try {
    const root = await realpath(join(process.env.CODEX_HOME || join(homedir(), ".codex"), "sessions"));
    const resolved = await realpath(path);
    const info = await stat(resolved);
    if (!info.isFile()) {
      return undefined;
    }
    if (resolved === root || resolved.startsWith(`${root}${sep}`)) {
      return resolved;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

async function readSessionLogTail(path: string): Promise<string> {
  const info = await stat(path);
  const maxBytes = Math.min(timeoutEnvMs("CWF_APP_THREAD_DIAGNOSTICS_MAX_BYTES", appThreadDiagnosticsMaxBytes), appThreadDiagnosticsMaxBytes);
  const length = Math.min(info.size, maxBytes);
  const start = Math.max(0, info.size - length);
  const buffer = Buffer.alloc(length);
  const file = await open(path, "r");
  try {
    await file.read(buffer, 0, length, start);
  } finally {
    await file.close();
  }
  const text = buffer.toString("utf8");
  if (start === 0) {
    return text;
  }
  const firstNewline = text.indexOf("\n");
  return firstNewline >= 0 ? text.slice(firstNewline + 1) : text;
}

function sessionLogName(path: string): string {
  return basename(path) || path;
}

function timeoutEnvMs(name: string, fallbackMs: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallbackMs;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
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
