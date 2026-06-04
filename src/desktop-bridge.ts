import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ArtifactManifest, DesktopCapabilitySummary, DesktopHandoffRecord, RunState } from "./types.js";
import { RunStore } from "./run-store.js";

export const DESKTOP_REQUIRED_METHODS = [
  "initialize",
  "thread/start",
  "thread/name/set",
  "thread/list",
  "turn/start",
] as const;

export type DesktopResultMode = "handoff" | "print" | "new-thread" | "thread";

export type DesktopResultOptions = {
  mode: DesktopResultMode;
  threadId?: string;
  codexPath?: string;
  appServer?: AppServerTransport;
  capability?: DesktopCapabilitySummary;
  runDir?: string;
  indexPath?: string;
};

export type DesktopResult = {
  prompt: string;
  handoffPromptPath: string;
  desktopHandoffPath?: string;
  record: DesktopHandoffRecord;
};

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
};

export type AppServerTransport = {
  request(method: string, params?: unknown): Promise<unknown>;
  notify?(method: string, params?: unknown): Promise<void> | void;
  close?(): Promise<void> | void;
};

export async function checkDesktopCapability(codexPath = process.env.CWF_CODEX_PATH || "codex"): Promise<DesktopCapabilitySummary> {
  const methods = Object.fromEntries(DESKTOP_REQUIRED_METHODS.map((method) => [method, false])) as Record<string, boolean>;
  let codexCliVersion: string | undefined;
  let schemaAvailable = false;
  let schemaError: string | undefined;

  try {
    codexCliVersion = (await runCommand(codexPath, ["--version"])).trim();
  } catch (error) {
    return {
      codex_cli_available: false,
      schema_available: false,
      app_server_running: false,
      required_methods: methods,
      thread_apis_available: false,
      error: errorMessage(error),
    };
  }

  try {
    const schemaDir = await mkdtemp(join(tmpdir(), "cwf-app-schema-"));
    await runCommand(codexPath, ["app-server", "generate-json-schema", "--out", schemaDir]);
    const clientRequest = JSON.parse(await readFile(join(schemaDir, "ClientRequest.json"), "utf8")) as unknown;
    const serialized = JSON.stringify(clientRequest);
    for (const method of DESKTOP_REQUIRED_METHODS) {
      methods[method] = serialized.includes(`"method":"${method}"`) || serialized.includes(`"${method}"`);
    }
    schemaAvailable = true;
  } catch (error) {
    schemaError = errorMessage(error);
  }

  let appServerRunning = false;
  let appServerVersion: unknown;
  try {
    const raw = await runCommand(codexPath, ["app-server", "daemon", "version"]);
    appServerVersion = JSON.parse(raw);
    appServerRunning = true;
  } catch {
    appServerRunning = false;
  }

  return {
    codex_cli_available: true,
    codex_cli_version: codexCliVersion,
    schema_available: schemaAvailable,
    app_server_running: appServerRunning,
    app_server_version: appServerVersion,
    required_methods: methods,
    thread_apis_available: DESKTOP_REQUIRED_METHODS.every((method) => methods[method]),
    error: schemaError,
  };
}

export function formatDesktopCheck(summary: DesktopCapabilitySummary): string {
  const lines = [
    "Codex Desktop bridge check",
    `Codex CLI: ${summary.codex_cli_available ? summary.codex_cli_version ?? "available" : "not found"}`,
    `App-server schema: ${summary.schema_available ? "available" : "unavailable"}`,
    `App-server daemon: ${summary.app_server_running ? "running" : "not running"}`,
    `Thread APIs: ${summary.thread_apis_available ? "available" : "unavailable"}`,
    "Required methods:",
  ];
  for (const method of DESKTOP_REQUIRED_METHODS) {
    lines.push(`- ${method}: ${summary.required_methods[method] ? "yes" : "no"}`);
  }
  if (summary.error) {
    lines.push(`Warning: ${summary.error}`);
  }
  return lines.join("\n");
}

export async function handleDesktopResult(runId: string, options: DesktopResultOptions): Promise<DesktopResult> {
  const store = options.runDir ? new RunStore(runId, options.runDir, options.indexPath) : RunStore.fromRunId(runId);
  const state = await store.readState();
  if (state.status !== "completed") {
    throw new Error(`Desktop result requires a completed run. ${runId} is ${state.status}.`);
  }
  const resultMarkdown = await store.readResult();
  const prompt = buildDesktopResultPrompt(state, resultMarkdown);
  const handoffPromptPath = join(store.runDir, "artifacts", "handoff-prompt.md");
  await mkdir(join(store.runDir, "artifacts"), { recursive: true });
  await writeFile(handoffPromptPath, prompt);
  await appendManifestArtifact(store.runDir, "handoff-prompt", handoffPromptPath, "Concise Codex Desktop handoff prompt for this run.");

  let record: DesktopHandoffRecord = {
    adapter: "codex-app-server",
    mode: options.mode,
    status: options.mode === "print" ? "printed" : "handoff-written",
    attempted_at: new Date().toISOString(),
    handoff_prompt_path: handoffPromptPath,
    result_return_path: options.mode === "print" ? "stdout" : "handoff-prompt",
  };

  if (options.mode === "new-thread" || options.mode === "thread") {
    record = await attemptAppServerResult(state, prompt, handoffPromptPath, options);
    const desktopHandoffPath = join(store.runDir, "artifacts", "desktop-handoff.json");
    record.desktop_handoff_path = desktopHandoffPath;
    await writeFile(desktopHandoffPath, `${JSON.stringify(record, null, 2)}\n`);
    await appendManifestArtifact(store.runDir, "desktop-handoff", desktopHandoffPath, "Codex app-server result-return attempt metadata.");
    await store.appendEvent("desktop.handoff", {
      mode: record.mode,
      status: record.status,
      thread_id: record.thread_id,
      turn_id: record.turn_id,
      fallback_reason: record.fallback_reason,
      error: record.error,
    });
  } else {
    await store.appendEvent("desktop.handoff_prompt", { path: handoffPromptPath, mode: options.mode });
  }

  const nextState = await store.readState();
  nextState.native_runtime = {
    ...(nextState.native_runtime ?? {}),
    desktop_handoff: record,
  };
  await store.writeState(nextState);

  return { prompt, handoffPromptPath, desktopHandoffPath: record.desktop_handoff_path, record };
}

export function buildDesktopResultPrompt(state: RunState, resultMarkdown: string): string {
  const verdict = firstMatch(resultMarkdown, /^- Verdict:\s*(.+)$/m) ?? state.status.toUpperCase();
  const summary = firstMatch(resultMarkdown, /^- Summary:\s*(.+)$/m) ?? `Workflow ${state.workflow} completed.`;
  const findings = [...resultMarkdown.matchAll(/^### \[([^\]]+)]\s+(.+)$/gm)]
    .slice(0, 5)
    .map((match) => `- [${match[1]}] ${match[2]}`);
  const gaps = sectionBullets(resultMarkdown, "Verification Gaps").slice(0, 5);
  const actions = sectionBullets(resultMarkdown, "Suggested Next Actions").slice(0, 5);
  const lines = [
    `Codex Flow result handoff for ${state.id}`,
    "",
    `Workflow: ${state.workflow}`,
    `Status: ${state.status}`,
    `Verdict: ${verdict}`,
    `Summary: ${summary}`,
    `Target: ${state.target}`,
    "",
    "Top findings:",
    ...(findings.length > 0 ? findings : ["- No supported findings."]),
    "",
    "Verification gaps:",
    ...(gaps.length > 0 ? gaps : ["- No verification gaps reported."]),
    "",
    "Suggested next actions:",
    ...(actions.length > 0 ? actions : ["- No next actions reported."]),
    "",
    "Artifacts:",
    `- Run dir: ${state.run_dir}`,
    state.result_path ? `- Result: ${state.result_path}` : "- Result: not recorded",
    state.artifact_manifest_path ? `- Manifest: ${state.artifact_manifest_path}` : "- Manifest: not recorded",
    "",
    "Please summarize this workflow result for the current Codex conversation. Do not claim any file changes were made by this handoff.",
  ];
  return `${lines.join("\n")}\n`;
}

export function buildInitializeRequest(id = 1): JsonRpcRequest {
  return {
    jsonrpc: "2.0",
    id,
    method: "initialize",
    params: {
      clientInfo: { name: "codex-flow", title: "Codex Flow", version: "1.2.0" },
      capabilities: {
        experimentalApi: true,
        requestAttestation: false,
        optOutNotificationMethods: ["item/agentMessage/delta", "command/exec/outputDelta"],
      },
    },
  };
}

export function buildThreadStartRequest(state: RunState, id = 2): JsonRpcRequest {
  return {
    jsonrpc: "2.0",
    id,
    method: "thread/start",
    params: {
      cwd: state.target,
      approvalPolicy: "never",
      sandbox: "read-only",
      ephemeral: false,
      threadSource: "user",
      baseInstructions: "You are a Codex Flow coordinator thread. Summarize workflow result artifacts without modifying files.",
    },
  };
}

export function buildThreadNameRequest(threadId: string, state: RunState, id = 3): JsonRpcRequest {
  return {
    jsonrpc: "2.0",
    id,
    method: "thread/name/set",
    params: {
      threadId,
      name: `Codex Flow ${state.workflow} ${state.id}`,
    },
  };
}

export function buildTurnStartRequest(threadId: string, prompt: string, state: RunState, id = 4): JsonRpcRequest {
  return {
    jsonrpc: "2.0",
    id,
    method: "turn/start",
    params: {
      threadId,
      input: [{ type: "text", text: prompt, text_elements: [] }],
      cwd: state.target,
      approvalPolicy: "never",
      sandboxPolicy: { type: "readOnly", networkAccess: false },
    },
  };
}

export function buildThreadListRequest(threadId: string, state: RunState, id = 5): JsonRpcRequest {
  return {
    jsonrpc: "2.0",
    id,
    method: "thread/list",
    params: {
      limit: 20,
      cwd: state.target,
      searchTerm: state.id,
      archived: false,
      useStateDbOnly: false,
    },
  };
}

async function attemptAppServerResult(
  state: RunState,
  prompt: string,
  handoffPromptPath: string,
  options: DesktopResultOptions,
): Promise<DesktopHandoffRecord> {
  const appServer = options.appServer ?? new ProxyAppServerTransport(options.codexPath ?? process.env.CWF_CODEX_PATH ?? "codex");
  const capability = options.capability ?? await checkDesktopCapability(options.codexPath);
  const base: DesktopHandoffRecord = {
    adapter: "codex-app-server",
    mode: options.mode,
    status: "fallback",
    attempted_at: new Date().toISOString(),
    handoff_prompt_path: handoffPromptPath,
    app_server: capability,
    result_return_path: "handoff-prompt",
  };

  if (!capability.thread_apis_available) {
    return { ...base, fallback_reason: "Codex app-server schema does not expose all required thread APIs." };
  }
  if (!capability.app_server_running && !options.appServer) {
    return { ...base, fallback_reason: "Codex app-server daemon is not running." };
  }

  try {
    await appServer.request("initialize", buildInitializeRequest().params);
    await appServer.notify?.("initialized");

    let threadId = options.threadId;
    if (options.mode === "new-thread") {
      const started = await appServer.request("thread/start", buildThreadStartRequest(state).params) as { thread?: { id?: string } };
      threadId = started.thread?.id;
      if (!threadId) {
        throw new Error("thread/start did not return thread.id");
      }
      await appServer.request("thread/name/set", buildThreadNameRequest(threadId, state).params);
    }

    if (!threadId) {
      throw new Error("Explicit --thread <thread-id> is required unless --new-thread is used.");
    }

    const turn = await appServer.request("turn/start", buildTurnStartRequest(threadId, prompt, state).params) as { turn?: { id?: string } };
    const turnId = turn.turn?.id;
    const listed = await appServer.request("thread/list", buildThreadListRequest(threadId, state).params) as { data?: Array<{ id?: string }> };
    const confirmed = Array.isArray(listed.data) && listed.data.some((thread) => thread.id === threadId);
    if (options.mode === "new-thread" && !confirmed) {
      throw new Error(`thread/list did not confirm created thread ${threadId}`);
    }
    return {
      ...base,
      status: "posted",
      thread_id: threadId,
      turn_id: turnId,
      result_return_path: "app-server-thread",
      fallback_reason: undefined,
    };
  } catch (error) {
    return {
      ...base,
      fallback_reason: "App-server result return failed; use handoff-prompt.md manually.",
      error: errorMessage(error),
    };
  } finally {
    await appServer.close?.();
  }
}

class ProxyAppServerTransport implements AppServerTransport {
  private nextId = 1;
  private readonly child;
  private buffer = "";
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

  constructor(codexPath: string) {
    this.child = spawn(codexPath, ["app-server", "proxy"], { stdio: ["pipe", "pipe", "pipe"] });
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => this.onData(chunk));
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk: string) => {
      for (const waiter of this.pending.values()) {
        waiter.reject(new Error(chunk.trim()));
      }
      this.pending.clear();
    });
    this.child.on("error", (error) => {
      for (const waiter of this.pending.values()) {
        waiter.reject(error);
      }
      this.pending.clear();
    });
  }

  async request(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++;
    const message = { jsonrpc: "2.0", id, method, params };
    const response = new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for app-server response to ${method}`));
      }, 15000);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
    });
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
    return response;
  }

  async notify(method: string, params?: unknown): Promise<void> {
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }

  async close(): Promise<void> {
    this.child.stdin.end();
    this.child.kill();
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let newline = this.buffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line) {
        this.handleLine(line);
      }
      newline = this.buffer.indexOf("\n");
    }
  }

  private handleLine(line: string): void {
    let message: { id?: number; result?: unknown; error?: { message?: string } };
    try {
      message = JSON.parse(line) as { id?: number; result?: unknown; error?: { message?: string } };
    } catch {
      return;
    }
    if (typeof message.id !== "number") {
      return;
    }
    const waiter = this.pending.get(message.id);
    if (!waiter) {
      return;
    }
    this.pending.delete(message.id);
    if (message.error) {
      waiter.reject(new Error(message.error.message ?? JSON.stringify(message.error)));
    } else {
      waiter.resolve(message.result);
    }
  }
}

async function appendManifestArtifact(runDir: string, id: string, path: string, description: string): Promise<void> {
  const manifestPath = join(runDir, "artifacts", "manifest.json");
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ArtifactManifest;
    manifest.artifacts = [
      ...manifest.artifacts.filter((artifact) => artifact.id !== id),
      { id, type: "generated", path, description },
    ];
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  } catch {
    // A completed run should have a manifest, but handoff prompt remains useful without one.
  }
}

function firstMatch(value: string, pattern: RegExp): string | undefined {
  return pattern.exec(value)?.[1]?.trim();
}

function sectionBullets(markdown: string, heading: string): string[] {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`## ${escaped}\\n\\n([\\s\\S]*?)(?:\\n## |$)`).exec(markdown);
  if (!match) {
    return [];
  }
  return match[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "));
}

function runCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr.trim() || `${command} ${args.join(" ")} exited with ${code}`));
      }
    });
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
