import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { parse } from "acorn";
import { collectDiffContext, currentDiffHash } from "./adapters/command-step.js";
import { runWorkerWithAdapter, type WorkerAdapterOptions } from "./adapters/worker-adapter.js";
import { buildFailureSummary, DEFAULT_FAILURE_POLICY } from "./run-index.js";
import { RunStore } from "./run-store.js";
import type { ArtifactRef, DiffContext, WorkerResult, WorkflowSpec, WorkflowWorker } from "./types.js";

export type DynamicWorkflowOrigin =
  | "generated-current-session"
  | "local-trust-record"
  | "copied-local"
  | "remote"
  | "registry"
  | "packaged"
  | "unknown";

export type DynamicPermissionProfile = "read-only" | "safePatch" | "inherit-session";

export type ParentPermissionCap = {
  sandbox: "read-only" | "workspace-write" | "danger-full-access" | "unknown";
  approval_policy: "never" | "on-request" | "on-failure" | "untrusted" | "unknown";
};

export type DynamicWorkflowBudget = {
  max_agents: number;
  max_concurrency: number;
  timeout_ms: number;
  output_bytes: number;
};

export type DynamicWorkflowMetadata = {
  source_path: string;
  artifact_script_path: string;
  source_sha256: string;
  origin: DynamicWorkflowOrigin;
  origin_session_id?: string;
  parent_permission_cap: ParentPermissionCap;
  budget: DynamicWorkflowBudget;
  capabilities: DynamicWorkflowCapabilities;
  ast_policy: {
    status: "passed";
    parser: "acorn";
    rejected_patterns: string[];
  };
};

export type DynamicWorkflowCapabilities = {
  uses: string[];
  requested_permissions: DynamicPermissionProfile[];
  inherit_session_allowed: boolean;
  inherit_session_reason: string;
  app_thread_inherit_session_status: "read-only-only" | "inherit-session-degraded-to-read-only";
};

export type DynamicWorkerRunner = (
  worker: WorkflowWorker,
  context: DiffContext,
  options: WorkerAdapterOptions,
) => Promise<WorkerResult>;

export type DynamicWorkflowOptions = {
  scriptPath: string;
  target: string;
  runsRoot?: string;
  origin?: DynamicWorkflowOrigin;
  originSessionId?: string;
  parentPermissionCap?: ParentPermissionCap;
  budget?: Partial<DynamicWorkflowBudget>;
  workerRunner?: DynamicWorkerRunner;
  approve?: boolean;
};

const DEFAULT_DYNAMIC_BUDGET: DynamicWorkflowBudget = {
  max_agents: 8,
  max_concurrency: 4,
  timeout_ms: 120000,
  output_bytes: 128000,
};

const FORBIDDEN_IDENTIFIERS = new Set([
  "require",
  "eval",
  "Function",
  "globalThis",
  "process",
  "fetch",
  "Reflect",
  "Proxy",
  "setTimeout",
  "setInterval",
  "setImmediate",
  "queueMicrotask",
]);

const FORBIDDEN_MEMBER_NAMES = new Set(["constructor", "prototype", "__proto__", "env"]);
const ALLOWED_CALL_ROOTS = new Set(["cwf", "JSON", "Math", "Array", "Object", "Number", "String", "Boolean", "Promise"]);
const SHELL_STRING_PATTERNS = [/rm\s+-rf/, /\bcurl\s+/, /\bbash\s+/, /\bsh\s+/, /\bnode\s+/, /\bpython(?:3)?\s+/];

export async function startDynamicWorkflow(options: DynamicWorkflowOptions): Promise<RunStore> {
  const target = resolve(options.target);
  const sourcePath = resolve(options.scriptPath);
  const source = await readFile(sourcePath, "utf8");
  validateDynamicWorkflowSource(source);
  const store = await createDynamicStore(sourcePath, target, options.runsRoot);
  await writeDynamicPreview(store, sourcePath, source, target, options);
  if (options.approve) {
    await store.approveGate("approve-dynamic");
    await resumeDynamicWorkflow({ store, target, workerRunner: options.workerRunner });
  }
  return store;
}

export async function resumeDynamicWorkflow(options: {
  store: RunStore;
  target?: string;
  workerRunner?: DynamicWorkerRunner;
}): Promise<RunStore> {
  const store = options.store;
  const state = await store.readState();
  if (state.status === "rejected") {
    throw new Error("Dynamic workflow was rejected and cannot be resumed.");
  }
  const gate = state.phases.find((phase) => phase.id === "approve-dynamic");
  if (gate?.status !== "approved") {
    throw new Error("Dynamic workflow must be approved before execution.");
  }
  if (state.phases.find((phase) => phase.id === "dynamic-execute")?.status === "completed") {
    return store;
  }

  const target = resolve(options.target ?? state.target);
  const metadata = await readDynamicMetadata(store);
  await store.updatePhase("dynamic-execute", "running");
  const context = await store.readContext();
  const startedHash = await currentDiffHash(target);
  const events: unknown[] = [];
  const workerResults: WorkerResult[] = [];
  try {
    const finalResult = await executeDynamicChild({
      store,
      target,
      context,
      metadata,
      workerRunner: options.workerRunner,
      events,
      workerResults,
    });
    const completedHash = await currentDiffHash(target);
    await writeDynamicExecutionArtifacts(store, metadata, events, workerResults, finalResult, startedHash, completedHash);
    await store.updatePhase("dynamic-execute", "completed");
    await store.writeResult(renderDynamicResult(metadata, workerResults, finalResult, completedHash !== startedHash));
    await store.writeArtifactManifest(buildDynamicArtifactManifest(store, workerResults));
    await store.appendEvent("run.completed", { run_id: store.runId });
    return store;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeDynamicExecutionArtifacts(store, metadata, events, workerResults, { error: message }, startedHash, await currentDiffHash(target).catch(() => startedHash));
    await store.updatePhase("dynamic-execute", "failed", message);
    const failed = await store.readState();
    failed.status = "failed";
    failed.error = message;
    failed.failure_summary = buildFailureSummary(failed, message);
    await store.writeState(failed);
    await store.appendEvent("run.failed", { error: message });
    throw error;
  }
}

export function validateDynamicWorkflowSource(source: string): void {
  const ast = parse(source, {
    ecmaVersion: "latest",
    sourceType: "module",
    allowAwaitOutsideFunction: false,
  }) as unknown as AcornNode;
  const topLevel = Array.isArray(ast.body) ? ast.body : [];
  let defaultExportCount = 0;
  for (const statement of topLevel) {
    if (statement.type === "ImportDeclaration") {
      throw new Error("dynamic workflow cannot use imports or dynamic import");
    }
    if (statement.type === "ExportDefaultDeclaration") {
      defaultExportCount += 1;
      const declaration = statement.declaration;
      if (!declaration || (declaration.type !== "FunctionDeclaration" && declaration.type !== "ArrowFunctionExpression")) {
        throw new Error("dynamic workflow default export must be an async function");
      }
      if (!declaration.async) {
        throw new Error("dynamic workflow default export must be async");
      }
      continue;
    }
    if (statement.type === "ExportNamedDeclaration" && isAllowedMetadataExport(statement)) {
      continue;
    }
    if (statement.type === "EmptyStatement") {
      continue;
    }
    throw new Error("dynamic workflow only allows metadata exports and one async default workflow export at top level");
  }
  if (defaultExportCount !== 1) {
    throw new Error("dynamic workflow must export exactly one async default function");
  }
  walkAst(ast, undefined);
}

async function createDynamicStore(scriptPath: string, target: string, runsRoot?: string): Promise<RunStore> {
  const spec = createDynamicWorkflowSpec(scriptPath);
  return RunStore.create(spec, target, runsRoot);
}

function createDynamicWorkflowSpec(scriptPath: string): WorkflowSpec {
  return {
    id: "dynamic-js",
    version: "1.11.0",
    title: `Dynamic JS Workflow: ${basename(scriptPath)}`,
    tags: ["dynamic", "javascript", "v1.11"],
    inputs: {
      target: { type: "path", required: true },
    },
    capabilities: { writes: false },
    requires: { target: "git-repo" },
    defaults: { sandbox: "read-only", timeout_ms: DEFAULT_DYNAMIC_BUDGET.timeout_ms },
    phases: [
      { id: "collect", kind: "command" },
      { id: "dynamic-preview", kind: "command" },
      { id: "approve-dynamic", kind: "gate", prompt: "Approve dynamic JavaScript workflow execution.", requires_approval: true },
      { id: "dynamic-execute", kind: "command" },
    ],
    artifacts: ["result.md", "artifacts/dynamic-preview.md", "artifacts/dynamic-events.jsonl"],
  };
}

async function writeDynamicPreview(
  store: RunStore,
  sourcePath: string,
  source: string,
  target: string,
  options: DynamicWorkflowOptions,
): Promise<void> {
  await store.updatePhase("collect", "running");
  const context = {
    ...(await collectDiffContext(target)),
    tracked_diff_hash: await currentDiffHash(target),
  };
  await store.writeContext(context);
  await store.updatePhase("collect", "completed");

  await store.updatePhase("dynamic-preview", "running");
  const artifactScriptPath = join(store.runDir, "artifacts", "workflow.js");
  await mkdir(join(store.runDir, "artifacts"), { recursive: true });
  await writeFile(artifactScriptPath, source);
  const sourceSha256 = sha256(source);
  const parentPermissionCap = options.parentPermissionCap ?? inferParentPermissionCap();
  const budget = { ...DEFAULT_DYNAMIC_BUDGET, ...options.budget };
  const origin = options.origin ?? "copied-local";
  const capabilities = buildDynamicCapabilities(source, origin, parentPermissionCap);
  const metadata: DynamicWorkflowMetadata = {
    source_path: sourcePath,
    artifact_script_path: artifactScriptPath,
    source_sha256: sourceSha256,
    origin,
    origin_session_id: options.originSessionId,
    parent_permission_cap: parentPermissionCap,
    budget,
    capabilities,
    ast_policy: {
      status: "passed",
      parser: "acorn",
      rejected_patterns: [
        "imports",
        "dynamic import",
        "require",
        "eval",
        "Function",
        "globalThis",
        "process",
        "fetch",
        "constructor/prototype escapes",
        "direct shell strings",
        "non-cwf call roots",
      ],
    },
  };
  await writeJsonFile(join(store.runDir, "artifacts", "dynamic-workflow.json"), metadata);
  await writeJsonFile(join(store.runDir, "artifacts", "dynamic-capabilities.json"), capabilities);
  await writeJsonFile(join(store.runDir, "artifacts", "dynamic-budget.json"), budget);
  await writeFile(join(store.runDir, "artifacts", "workflow.sha256"), `${sourceSha256}\n`);
  await writeFile(join(store.runDir, "artifacts", "dynamic-preview.md"), renderDynamicPreview(metadata, context));
  await store.appendEvent("dynamic.preview", {
    source_sha256: sourceSha256,
    origin,
    requested_permissions: capabilities.requested_permissions,
    inherit_session_allowed: capabilities.inherit_session_allowed,
  });
  await store.updatePhase("dynamic-preview", "completed");
  await store.waitAtGate("approve-dynamic", "Approve dynamic JavaScript workflow execution after reviewing artifacts/dynamic-preview.md.");
}

async function executeDynamicChild(options: {
  store: RunStore;
  target: string;
  context: DiffContext;
  metadata: DynamicWorkflowMetadata;
  workerRunner?: DynamicWorkerRunner;
  events: unknown[];
  workerResults: WorkerResult[];
}): Promise<unknown> {
  const childPath = join(options.store.runDir, "artifacts", "dynamic-child.mjs");
  await writeFile(childPath, DYNAMIC_CHILD_SOURCE);
  const child = spawn(process.execPath, [
    "--permission",
    `--allow-fs-read=${options.store.runDir}`,
    childPath,
    options.metadata.artifact_script_path,
  ], {
    cwd: options.store.runDir,
    env: {
      CWF_TARGET: options.target,
      CWF_RUN_DIR: options.store.runDir,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stderr = "";
  let stdoutBuffer = "";
  let finalResult: unknown;
  let childError: Error | undefined;
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }
      void handleChildMessage(JSON.parse(line) as ChildRequest).catch((error) => {
        childError = error instanceof Error ? error : new Error(String(error));
        child.kill("SIGTERM");
      });
    }
  });

  const exit = new Promise<void>((resolveExit, rejectExit) => {
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      rejectExit(new Error("dynamic workflow timed out"));
    }, options.metadata.budget.timeout_ms);
    child.on("error", (error) => {
      clearTimeout(timeout);
      rejectExit(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timeout);
      if (childError) {
        rejectExit(childError);
      } else if (code === 0) {
        resolveExit();
      } else {
        rejectExit(new Error(`dynamic child exited with code ${code}${stderr.trim() ? `: ${stderr.trim()}` : ""}`));
      }
    });
  });

  async function handleChildMessage(message: ChildRequest): Promise<void> {
    if (message.type === "event") {
      options.events.push(message.payload);
      await appendDynamicEvent(options.store, message.payload);
      return;
    }
    if (message.type !== "request") {
      return;
    }
    try {
      const result = await handleRuntimeRequest(message.method, message.params, options);
      if (message.method === "report.final") {
        finalResult = result;
      }
      child.stdin.write(`${JSON.stringify({ type: "response", id: message.id, result })}\n`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      child.stdin.write(`${JSON.stringify({ type: "response", id: message.id, error: errorMessage })}\n`);
    }
  }

  await exit;
  return finalResult;
}

async function handleRuntimeRequest(
  method: string,
  params: unknown,
  options: {
    store: RunStore;
    target: string;
    context: DiffContext;
    metadata: DynamicWorkflowMetadata;
    workerRunner?: DynamicWorkerRunner;
    events: unknown[];
    workerResults: WorkerResult[];
  },
): Promise<unknown> {
  if (method === "git.changedFiles") {
    return options.context.changed_files;
  }
  if (method === "git.diff") {
    return options.context.diff;
  }
  if (method === "artifacts.write") {
    const record = asRecord(params, "artifacts.write params");
    const name = safeArtifactName(expectString(record.name, "artifacts.write.name"));
    const content = expectString(record.content, "artifacts.write.content");
    if (content.length > options.metadata.budget.output_bytes) {
      throw new Error("artifact content exceeds dynamic workflow output budget");
    }
    const path = join(options.store.runDir, "artifacts", `dynamic-${name}`);
    await writeFile(path, content);
    await options.store.appendEvent("artifact.generated", { path });
    return { path };
  }
  if (method === "report.summarize") {
    return summarizeDynamicReport(params);
  }
  if (method === "report.final") {
    return params;
  }
  if (method === "agent.run") {
    return runDynamicAgent(asRecord(params, "agent.run params"), options);
  }
  throw new Error(`unsupported dynamic runtime method: ${method}`);
}

async function runDynamicAgent(
  params: Record<string, unknown>,
  options: {
    store: RunStore;
    target: string;
    context: DiffContext;
    metadata: DynamicWorkflowMetadata;
    workerRunner?: DynamicWorkerRunner;
    workerResults: WorkerResult[];
  },
): Promise<WorkerResult> {
  if (options.workerResults.length >= options.metadata.budget.max_agents) {
    throw new Error("dynamic workflow exceeded max_agents budget");
  }
  const id = expectString(params.id, "agent.run.id");
  const role = expectString(params.role ?? id, "agent.run.role");
  const prompt = expectString(params.prompt, "agent.run.prompt");
  const permissions = expectPermissionProfile(params.permissions ?? params.sandbox ?? "read-only");
  if (permissions === "safePatch") {
    throw new Error("dynamic safePatch workers are recognized but not executable until a v1.10 write_policy is attached to the dynamic run");
  }
  if (permissions === "inherit-session") {
    assertInheritSessionAllowed(options.metadata);
  }

  const worker: WorkflowWorker = {
    id,
    perspective: role,
    prompt,
    writes: permissions === "inherit-session",
  };
  const beforeHash = await currentDiffHash(options.target);
  const runner = options.workerRunner ?? runWorkerWithAdapter;
  const result = await runner(worker, options.context, {
    target: options.target,
    timeoutMs: options.metadata.budget.timeout_ms,
    workflowId: "dynamic-js",
    runId: options.store.runId,
    runtime: { preferred_worker_adapter: "codex-sdk-headless" },
  });
  const afterHash = await currentDiffHash(options.target);
  if (permissions === "read-only" && afterHash !== beforeHash) {
    const failed = {
      ...result,
      status: "failed" as const,
      confidence: "low" as const,
      error: "read-only-worker-violation: target diff changed during read-only dynamic agent",
      verification: [...result.verification, "read-only-worker-violation: target diff changed"],
    };
    await options.store.writeWorkerResult(failed);
    options.workerResults.push(failed);
    throw new Error(failed.error);
  }
  const normalized: WorkerResult = {
    ...result,
    runtime: {
      adapter: result.runtime?.adapter ?? "codex-sdk-headless",
      fallback_used: result.runtime?.fallback_used ?? false,
      agent_role: result.runtime?.agent_role ?? role,
      transcript_read: result.runtime?.transcript_read ?? false,
      ...result.runtime,
      sandbox: permissions === "inherit-session" ? options.metadata.parent_permission_cap.sandbox as "workspace-write" | "danger-full-access" : "read-only",
      approval_policy: options.metadata.parent_permission_cap.approval_policy === "unknown" ? "never" : options.metadata.parent_permission_cap.approval_policy,
    },
  };
  await options.store.writeWorkerResult(normalized);
  options.workerResults.push(normalized);
  return normalized;
}

function assertInheritSessionAllowed(metadata: DynamicWorkflowMetadata): void {
  if (!metadata.capabilities.inherit_session_allowed) {
    throw new Error(`inherit-session rejected: ${metadata.capabilities.inherit_session_reason}`);
  }
  if (metadata.parent_permission_cap.sandbox === "read-only" || metadata.parent_permission_cap.sandbox === "unknown") {
    throw new Error("inherit-session rejected: parent permission cap is not write-capable");
  }
  if (metadata.parent_permission_cap.approval_policy === "unknown") {
    throw new Error("inherit-session rejected: parent approval policy is unknown");
  }
  const currentHash = sha256ForFileSync(metadata.artifact_script_path);
  if (currentHash !== metadata.source_sha256) {
    throw new Error("inherit-session rejected: approved script SHA-256 no longer matches");
  }
}

function buildDynamicCapabilities(
  source: string,
  origin: DynamicWorkflowOrigin,
  parentPermissionCap: ParentPermissionCap,
): DynamicWorkflowCapabilities {
  const requested = requestedPermissions(source);
  const trustedGenerated = origin === "generated-current-session";
  const parentWriteCapable = parentPermissionCap.sandbox === "workspace-write" || parentPermissionCap.sandbox === "danger-full-access";
  const inheritSessionAllowed = trustedGenerated && parentWriteCapable && parentPermissionCap.approval_policy !== "unknown";
  return {
    uses: detectRuntimeUses(source),
    requested_permissions: requested,
    inherit_session_allowed: inheritSessionAllowed,
    inherit_session_reason: inheritSessionAllowed
      ? "generated-current-session origin with write-capable parent permission cap"
      : "inherit-session requires generated-current-session origin, matching SHA-256, known approval policy, and write-capable parent permission cap",
    app_thread_inherit_session_status: requested.includes("inherit-session") ? "inherit-session-degraded-to-read-only" : "read-only-only",
  };
}

function renderDynamicPreview(metadata: DynamicWorkflowMetadata, context: DiffContext): string {
  const broadParent = metadata.parent_permission_cap.sandbox === "workspace-write" || metadata.parent_permission_cap.sandbox === "danger-full-access";
  return [
    "# Dynamic Workflow Preview",
    "",
    `Source: \`${metadata.source_path}\``,
    `Artifact script: \`${metadata.artifact_script_path}\``,
    `SHA-256: \`${metadata.source_sha256}\``,
    `Origin: \`${metadata.origin}\``,
    `Parent sandbox cap: \`${metadata.parent_permission_cap.sandbox}\``,
    `Parent approval cap: \`${metadata.parent_permission_cap.approval_policy}\``,
    "",
    "## Capabilities",
    "",
    ...(metadata.capabilities.uses.length > 0 ? metadata.capabilities.uses.map((item) => `- \`${item}\``) : ["- none detected"]),
    "",
    "## Requested Agent Permissions",
    "",
    ...metadata.capabilities.requested_permissions.map((item) => `- \`${item}\``),
    "",
    "## Budget",
    "",
    `- max_agents: ${metadata.budget.max_agents}`,
    `- max_concurrency: ${metadata.budget.max_concurrency}`,
    `- timeout_ms: ${metadata.budget.timeout_ms}`,
    `- output_bytes: ${metadata.budget.output_bytes}`,
    "",
    "## Target Snapshot",
    "",
    `- Target: \`${context.target}\``,
    `- Branch: \`${context.branch}\``,
    `- Diff hash: \`${context.diff_hash}\``,
    `- Changed files: ${context.changed_files.length > 0 ? context.changed_files.map((file) => `\`${file}\``).join(", ") : "none"}`,
    "",
    "## Safety",
    "",
    "- AST policy passed with Acorn before this preview was written.",
    "- Execution will run in a Node Permission Model child process.",
    "- The child process receives no target repo filesystem permission, no network permission, and no child-process permission.",
    "- All git, agent, artifact, and report work must go through parent CWF JSON-RPC.",
    `- inherit-session: ${metadata.capabilities.inherit_session_allowed ? "allowed for this generated-current-session script" : `rejected (${metadata.capabilities.inherit_session_reason})`}.`,
    `- App-thread inherit-session status: \`${metadata.capabilities.app_thread_inherit_session_status}\`.`,
    broadParent
      ? "- Broad parent authority detected; this preview is non-skippable and should be compared with the declared task scope before approval."
      : "- Parent authority is not broad.",
  ].join("\n");
}

async function writeDynamicExecutionArtifacts(
  store: RunStore,
  metadata: DynamicWorkflowMetadata,
  events: unknown[],
  workerResults: WorkerResult[],
  finalResult: unknown,
  beforeHash: string,
  afterHash: string,
): Promise<void> {
  await mkdir(join(store.runDir, "artifacts"), { recursive: true });
  await writeFile(join(store.runDir, "artifacts", "dynamic-events.jsonl"), events.map((event) => JSON.stringify(event)).join("\n") + (events.length > 0 ? "\n" : ""));
  await writeJsonFile(join(store.runDir, "artifacts", "dynamic-final.json"), finalResult);
  await writeFile(
    join(store.runDir, "artifacts", "dynamic-summary.md"),
    [
      "# Dynamic Workflow Summary",
      "",
      `SHA-256: \`${metadata.source_sha256}\``,
      `Origin: \`${metadata.origin}\``,
      `Workers: ${workerResults.length}`,
      `Target diff changed: ${beforeHash !== afterHash ? "yes" : "no"}`,
      "",
      "## Workers",
      "",
      ...(workerResults.length > 0 ? workerResults.map((worker) => `- ${worker.worker_id}: ${worker.status}`) : ["- none"]),
    ].join("\n"),
  );
}

function renderDynamicResult(metadata: DynamicWorkflowMetadata, workerResults: WorkerResult[], finalResult: unknown, targetChanged: boolean): string {
  return [
    "# Dynamic JS Workflow Result",
    "",
    `Origin: \`${metadata.origin}\``,
    `SHA-256: \`${metadata.source_sha256}\``,
    `Workers: ${workerResults.length}`,
    `Target changed: ${targetChanged ? "yes" : "no"}`,
    "",
    "## Final",
    "",
    "```json",
    JSON.stringify(finalResult, null, 2),
    "```",
  ].join("\n");
}

function buildDynamicArtifactManifest(store: RunStore, workerResults: WorkerResult[]) {
  const artifacts: ArtifactRef[] = [
    { id: "workflow", type: "workflow", path: join(store.runDir, "workflow.json"), description: "Dynamic workflow wrapper spec snapshot." },
    { id: "state", type: "state", path: join(store.runDir, "state.json"), description: "Mutable run state and gate decisions." },
    { id: "events", type: "events", path: join(store.runDir, "events.jsonl"), description: "Append-only run and dynamic runtime event log." },
    { id: "context", type: "context", path: join(store.runDir, "context.json"), description: "Collected git diff context exposed through cwf.git." },
    { id: "dynamic-script", type: "generated", path: join(store.runDir, "artifacts", "workflow.js"), description: "Approved JavaScript workflow artifact copy." },
    { id: "dynamic-preview", type: "generated", path: join(store.runDir, "artifacts", "dynamic-preview.md"), description: "Non-skippable preview shown before execution approval." },
    { id: "dynamic-capabilities", type: "generated", path: join(store.runDir, "artifacts", "dynamic-capabilities.json"), description: "Detected runtime capability and permission profile metadata." },
    { id: "dynamic-budget", type: "generated", path: join(store.runDir, "artifacts", "dynamic-budget.json"), description: "Runtime budget fuses for the dynamic workflow." },
    { id: "dynamic-events", type: "generated", path: join(store.runDir, "artifacts", "dynamic-events.jsonl"), description: "Dynamic workflow runtime events emitted by the child process." },
    { id: "dynamic-final", type: "generated", path: join(store.runDir, "artifacts", "dynamic-final.json"), description: "Raw final value returned by the dynamic workflow." },
    { id: "result", type: "result", path: join(store.runDir, "result.md"), description: "Human-readable dynamic workflow result." },
    { id: "manifest", type: "manifest", path: join(store.runDir, "artifacts", "manifest.json"), description: "Artifact manifest for this dynamic run." },
    ...workerResults.map<ArtifactRef>((worker) => ({
      id: `worker:${worker.worker_id}`,
      type: "worker",
      path: join(store.runDir, "workers", `${worker.worker_id}.json`),
      description: `Dynamic worker result envelope for ${worker.worker_id}.`,
    })),
  ];
  return {
    version: 1 as const,
    run_id: store.runId,
    workflow: "dynamic-js",
    generated_at: new Date().toISOString(),
    artifacts,
  };
}

async function readDynamicMetadata(store: RunStore): Promise<DynamicWorkflowMetadata> {
  return JSON.parse(await readFile(join(store.runDir, "artifacts", "dynamic-workflow.json"), "utf8")) as DynamicWorkflowMetadata;
}

async function appendDynamicEvent(store: RunStore, payload: unknown): Promise<void> {
  await store.appendEvent("dynamic.event", asRecord(payload, "dynamic event"));
}

function requestedPermissions(source: string): DynamicPermissionProfile[] {
  const profiles = new Set<DynamicPermissionProfile>(["read-only"]);
  if (source.includes("safePatch")) {
    profiles.add("safePatch");
  }
  if (source.includes("inherit-session")) {
    profiles.add("inherit-session");
  }
  return [...profiles];
}

function detectRuntimeUses(source: string): string[] {
  return ["cwf.git", "cwf.agent.run", "cwf.map", "cwf.artifacts", "cwf.report"].filter((needle) => source.includes(needle));
}

function isAllowedMetadataExport(statement: AcornNode): boolean {
  const declaration = statement.declaration;
  if (!declaration || declaration.type !== "VariableDeclaration") {
    return false;
  }
  return declaration.declarations?.every((item: AcornNode) => item.id?.name === "metadata") ?? false;
}

function walkAst(node: AcornNode, parent: AcornNode | undefined): void {
  if (node.type === "ImportDeclaration" || node.type === "ImportExpression") {
    throw new Error("dynamic workflow cannot use imports or dynamic import");
  }
  if (node.type === "Identifier" && FORBIDDEN_IDENTIFIERS.has(node.name ?? "")) {
    throw new Error(`dynamic workflow cannot access forbidden identifier: ${node.name}`);
  }
  if (node.type === "MemberExpression") {
    const propertyName = memberPropertyName(node);
    const root = callRootName(node);
    if (root && FORBIDDEN_IDENTIFIERS.has(root)) {
      throw new Error(`dynamic workflow cannot access forbidden identifier: ${root}`);
    }
    if (propertyName && FORBIDDEN_MEMBER_NAMES.has(propertyName)) {
      throw new Error(`dynamic workflow cannot access forbidden member: ${propertyName}`);
    }
  }
  if (node.type === "CallExpression") {
    const propertyName = node.callee?.type === "MemberExpression" ? memberPropertyName(node.callee) : undefined;
    if (propertyName && FORBIDDEN_MEMBER_NAMES.has(propertyName)) {
      throw new Error(`dynamic workflow cannot access forbidden member: ${propertyName}`);
    }
    assertAllowedCallExpression(node);
  }
  if (node.type === "NewExpression") {
    throw new Error("dynamic workflow cannot construct arbitrary objects with new");
  }
  if (node.type === "Literal" && typeof node.value === "string" && SHELL_STRING_PATTERNS.some((pattern) => pattern.test(node.value))) {
    throw new Error("dynamic workflow cannot contain direct shell command strings");
  }
  if (node.type === "TemplateElement") {
    const cooked = typeof node.value?.cooked === "string" ? node.value.cooked : "";
    const raw = typeof node.value?.raw === "string" ? node.value.raw : "";
    if (SHELL_STRING_PATTERNS.some((pattern) => pattern.test(cooked) || pattern.test(raw))) {
      throw new Error("dynamic workflow cannot contain direct shell command strings");
    }
  }
  for (const child of childNodes(node)) {
    walkAst(child, parent ?? node);
  }
}

function assertAllowedCallExpression(node: AcornNode): void {
  const forbiddenMember = findForbiddenMemberName(node.callee);
  if (forbiddenMember) {
    throw new Error(`dynamic workflow cannot access forbidden member: ${forbiddenMember}`);
  }
  const root = callRootName(node.callee);
  if (!root || !ALLOWED_CALL_ROOTS.has(root)) {
    throw new Error(`dynamic workflow call expressions must be rooted in cwf or allowed builtins; saw ${root ?? "unknown"}`);
  }
}

function findForbiddenMemberName(node: AcornNode | undefined): string | undefined {
  if (!node) {
    return undefined;
  }
  if (node.type === "MemberExpression") {
    const propertyName = memberPropertyName(node);
    if (propertyName && FORBIDDEN_MEMBER_NAMES.has(propertyName)) {
      return propertyName;
    }
  }
  for (const child of childNodes(node)) {
    const found = findForbiddenMemberName(child);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function callRootName(node: AcornNode | undefined): string | undefined {
  if (!node) {
    return undefined;
  }
  if (node.type === "Identifier") {
    return node.name;
  }
  if (node.type === "MemberExpression" || node.type === "CallExpression") {
    return callRootName(node.object ?? node.callee);
  }
  return undefined;
}

function memberPropertyName(node: AcornNode): string | undefined {
  const property = node.property;
  if (!property) {
    return undefined;
  }
  if (property.type === "Identifier") {
    return property.name;
  }
  if (property.type === "Literal" && typeof property.value === "string") {
    return property.value;
  }
  return undefined;
}

function childNodes(node: AcornNode): AcornNode[] {
  const children: AcornNode[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === "parent") {
      continue;
    }
    if (Array.isArray(value)) {
      children.push(...value.filter(isAcornNode));
    } else if (isAcornNode(value)) {
      children.push(value);
    }
  }
  return children;
}

function isAcornNode(value: unknown): value is AcornNode {
  return Boolean(value && typeof value === "object" && typeof (value as AcornNode).type === "string");
}

function inferParentPermissionCap(): ParentPermissionCap {
  return {
    sandbox: expectParentSandbox(process.env.CWF_PARENT_SANDBOX ?? "unknown"),
    approval_policy: expectParentApprovalPolicy(process.env.CWF_PARENT_APPROVAL_POLICY ?? "unknown"),
  };
}

function expectParentSandbox(value: string): ParentPermissionCap["sandbox"] {
  if (value === "read-only" || value === "workspace-write" || value === "danger-full-access" || value === "unknown") {
    return value;
  }
  return "unknown";
}

function expectParentApprovalPolicy(value: string): ParentPermissionCap["approval_policy"] {
  if (value === "never" || value === "on-request" || value === "on-failure" || value === "untrusted" || value === "unknown") {
    return value;
  }
  return "unknown";
}

function expectPermissionProfile(value: unknown): DynamicPermissionProfile {
  if (value === "read-only" || value === "safePatch" || value === "inherit-session") {
    return value;
  }
  throw new Error(`agent.run.permissions must be read-only, safePatch, or inherit-session`);
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value;
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function safeArtifactName(value: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) {
    throw new Error("artifact name must be a simple file name");
  }
  return value;
}

async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function summarizeDynamicReport(params: unknown): string {
  const value = asRecord(params, "report.summarize params");
  const results = Array.isArray(value.results) ? value.results : [];
  return `Dynamic workflow completed ${results.length} result${results.length === 1 ? "" : "s"}.`;
}

function sha256(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

function sha256ForFileSync(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

type ChildRequest =
  | { type: "event"; payload: Record<string, unknown> }
  | { type: "request"; id: number; method: string; params: unknown };

type AcornNode = {
  type: string;
  [key: string]: any;
};

const DYNAMIC_CHILD_SOURCE = String.raw`
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

const target = process.env.CWF_TARGET;
if (!process.permission || typeof process.permission.has !== "function") {
  throw new Error("dynamic-runtime-unavailable: Node Permission Model is not active");
}
if (target && process.permission.has("fs.read", target)) {
  throw new Error("dynamic-runtime-unavailable: child process unexpectedly has target repo read access");
}

let nextId = 1;
const pending = new Map();
const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const message = JSON.parse(line);
  const entry = pending.get(message.id);
  if (!entry) {
    return;
  }
  pending.delete(message.id);
  if (message.error) {
    entry.reject(new Error(message.error));
  } else {
    entry.resolve(message.result);
  }
});

function request(method, params) {
  const id = nextId++;
  process.stdout.write(JSON.stringify({ type: "request", id, method, params }) + "\n");
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
}

function emit(payload) {
  process.stdout.write(JSON.stringify({ type: "event", payload }) + "\n");
}

async function mapWithConcurrency(items, handler, options = {}) {
  const concurrency = Math.max(1, Math.min(Number(options.concurrency || 1), Number(options.maxConcurrency || 1000)));
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await handler(items[index], index);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

const cwf = Object.freeze({
  git: Object.freeze({
    changedFiles: () => request("git.changedFiles", {}),
    diff: () => request("git.diff", {}),
  }),
  agent: Object.freeze({
    run: (params) => request("agent.run", params),
  }),
  artifacts: Object.freeze({
    write: (params) => request("artifacts.write", params),
  }),
  report: Object.freeze({
    summarize: (results) => request("report.summarize", { results }),
  }),
  map: (items, handler, options = {}) => mapWithConcurrency(items, handler, options),
  event: (payload) => emit(payload),
});

const module = await import(pathToFileURL(process.argv[2]).href);
if (typeof module.default !== "function") {
  throw new Error("dynamic workflow module must export a default function");
}
const result = await module.default(cwf);
await request("report.final", result);
rl.close();
process.exit(0);
`;
