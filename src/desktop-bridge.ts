import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { connect, type Socket } from "node:net";
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

const APP_SERVER_HANDSHAKE_TIMEOUT_MS = 5000;
const APP_SERVER_MAX_FRAME_BYTES = 5 * 1024 * 1024;

export type DesktopResultMode = "handoff" | "print" | "new-thread" | "thread";

export type DesktopResultOptions = {
  mode: DesktopResultMode;
  threadId?: string;
  codexPath?: string;
  appServer?: AppServerTransport;
  appServerFactory?: (codexPath: string) => AppServerTransport;
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

export type AppServerRequest = {
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
  const manifestPath = join(store.runDir, "artifacts", "manifest.json");
  nextState.native_runtime = {
    ...(nextState.native_runtime ?? {}),
    desktop_handoff: record,
  };
  if (!nextState.artifact_manifest_path && await fileExists(manifestPath)) {
    nextState.artifact_manifest_path = manifestPath;
  }
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

export function buildInitializeRequest(id = 1): AppServerRequest {
  return {
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

export function buildThreadStartRequest(state: RunState, id = 2): AppServerRequest {
  return {
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

export function buildThreadNameRequest(threadId: string, state: RunState, id = 3): AppServerRequest {
  return {
    id,
    method: "thread/name/set",
    params: {
      threadId,
      name: `Codex Flow ${state.workflow} ${state.id}`,
    },
  };
}

export function buildTurnStartRequest(threadId: string, prompt: string, state: RunState, id = 4): AppServerRequest {
  return {
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

export function buildThreadListRequest(threadId: string, state: RunState, id = 5): AppServerRequest {
  return {
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

export function buildThreadReadRequest(threadId: string, id = 6): AppServerRequest {
  return {
    id,
    method: "thread/read",
    params: {
      threadId,
      includeTurns: false,
    },
  };
}

async function attemptAppServerResult(
  state: RunState,
  prompt: string,
  handoffPromptPath: string,
  options: DesktopResultOptions,
): Promise<DesktopHandoffRecord> {
  const codexPath = options.codexPath ?? process.env.CWF_CODEX_PATH ?? "codex";
  const appServer = options.appServer ?? (options.appServerFactory ?? (() => new UnixSocketWebSocketAppServerTransport()))(codexPath);
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
    let warning: string | undefined;
    if (options.mode === "new-thread") {
      warning = await confirmCreatedThread(appServer, threadId, state);
    }
    return {
      ...base,
      status: "posted",
      thread_id: threadId,
      turn_id: turnId,
      result_return_path: "app-server-thread",
      fallback_reason: undefined,
      warning,
    };
  } catch (error) {
    return {
      ...base,
      fallback_reason: capability.app_server_running
        ? "App-server result return failed; use handoff-prompt.md manually."
        : "App-server proxy is unavailable; use handoff-prompt.md manually or start the Codex app-server daemon.",
      error: errorMessage(error),
    };
  } finally {
    await appServer.close?.();
  }
}

class UnixSocketWebSocketAppServerTransport implements AppServerTransport {
  private nextId = 1;
  private readonly socket: Socket;
  private readonly ready: Promise<void>;
  private readonly handshakeTimer: ReturnType<typeof setTimeout>;
  private readyResolve!: () => void;
  private readyReject!: (error: Error) => void;
  private buffer = Buffer.alloc(0);
  private handshaken = false;
  private readonly key = randomBytes(16).toString("base64");
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

  constructor(socketPath = process.env.CWF_APP_SERVER_SOCKET || defaultAppServerSocketPath()) {
    this.ready = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    this.handshakeTimer = setTimeout(() => {
      this.fail(new Error(`Timed out waiting for app-server websocket upgrade: ${socketPath}`));
    }, APP_SERVER_HANDSHAKE_TIMEOUT_MS);
    this.socket = connect(socketPath);
    this.socket.on("connect", () => this.sendHandshake());
    this.socket.on("data", (chunk) => this.onData(chunk));
    this.socket.on("error", (error) => {
      this.fail(error);
    });
    this.socket.on("close", () => {
      const error = new Error(`app-server websocket closed before completing pending requests: ${socketPath}`);
      this.fail(error);
    });
  }

  async request(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++;
    const message = { id, method, params };
    const response = new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for app-server response to ${method}`));
      }, 30000);
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
    await this.ready;
    this.writeTextFrame(JSON.stringify(message));
    return response;
  }

  async notify(method: string, params?: unknown): Promise<void> {
    await this.ready;
    this.writeTextFrame(JSON.stringify({ method, params }));
  }

  async close(): Promise<void> {
    clearTimeout(this.handshakeTimer);
    if (this.socket.destroyed) {
      return;
    }
    if (this.handshaken) {
      this.writeFrame(0x8, Buffer.alloc(0));
    }
    this.socket.end();
  }

  private sendHandshake(): void {
    const request = [
      "GET / HTTP/1.1",
      "Host: localhost",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Key: ${this.key}`,
      "Sec-WebSocket-Version: 13",
      "",
      "",
    ].join("\r\n");
    this.socket.write(request);
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    if (!this.handshaken) {
      if (!this.tryReadHandshake()) {
        return;
      }
    }
    this.readFrames();
  }

  private tryReadHandshake(): boolean {
    const headerEnd = this.buffer.indexOf("\r\n\r\n");
    if (headerEnd < 0) {
      return false;
    }
    const header = this.buffer.subarray(0, headerEnd).toString("utf8");
    this.buffer = this.buffer.subarray(headerEnd + 4);
    if (!/^HTTP\/1\.1 101\b/i.test(header)) {
      const error = new Error(`app-server websocket upgrade failed: ${header.split(/\r?\n/)[0] || "empty response"}`);
      this.fail(error);
      return false;
    }
    const expectedAccept = createHash("sha1")
      .update(`${this.key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest("base64");
    if (!new RegExp(`^Sec-WebSocket-Accept:\\s*${escapeRegExp(expectedAccept)}\\s*$`, "im").test(header)) {
      const error = new Error("app-server websocket upgrade returned an invalid Sec-WebSocket-Accept header");
      this.fail(error);
      return false;
    }
    this.handshaken = true;
    clearTimeout(this.handshakeTimer);
    this.readyResolve();
    return true;
  }

  private readFrames(): void {
    while (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const second = this.buffer[1];
      const opcode = first & 0x0f;
      const masked = (second & 0x80) !== 0;
      let length = second & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (this.buffer.length < offset + 2) {
          return;
        }
        length = this.buffer.readUInt16BE(offset);
        offset += 2;
      } else if (length === 127) {
        if (this.buffer.length < offset + 8) {
          return;
        }
        const longLength = this.buffer.readBigUInt64BE(offset);
        if (longLength > BigInt(Number.MAX_SAFE_INTEGER)) {
          this.fail(new Error("app-server websocket frame is too large"));
          return;
        }
        length = Number(longLength);
        offset += 8;
      }
      if (length > APP_SERVER_MAX_FRAME_BYTES) {
        this.fail(new Error(`app-server websocket frame exceeds ${APP_SERVER_MAX_FRAME_BYTES} bytes`));
        return;
      }
      let mask: Buffer | undefined;
      if (masked) {
        if (this.buffer.length < offset + 4) {
          return;
        }
        mask = this.buffer.subarray(offset, offset + 4);
        offset += 4;
      }
      if (this.buffer.length < offset + length) {
        return;
      }
      const payload = Buffer.from(this.buffer.subarray(offset, offset + length));
      this.buffer = this.buffer.subarray(offset + length);
      if (mask) {
        for (let index = 0; index < payload.length; index += 1) {
          payload[index] ^= mask[index % 4];
        }
      }
      if (opcode === 0x1) {
        this.handleMessage(payload.toString("utf8"));
      } else if (opcode === 0x8) {
        this.socket.end();
        return;
      } else if (opcode === 0x9) {
        this.writeFrame(0xA, payload);
      }
    }
  }

  private handleMessage(raw: string): void {
    let message: { id?: number; result?: unknown; error?: { message?: string } };
    try {
      message = JSON.parse(raw) as { id?: number; result?: unknown; error?: { message?: string } };
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

  private writeTextFrame(value: string): void {
    this.writeFrame(0x1, Buffer.from(value, "utf8"));
  }

  private writeFrame(opcode: number, payload: Buffer): void {
    const mask = randomBytes(4);
    let header: Buffer;
    if (payload.length < 126) {
      header = Buffer.from([0x80 | opcode, 0x80 | payload.length]);
    } else if (payload.length <= 0xffff) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 0x80 | 126;
      header.writeUInt16BE(payload.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(payload.length), 2);
    }
    const maskedPayload = Buffer.from(payload);
    for (let index = 0; index < maskedPayload.length; index += 1) {
      maskedPayload[index] ^= mask[index % 4];
    }
    this.socket.write(Buffer.concat([header, mask, maskedPayload]));
  }

  private rejectPending(error: Error): void {
    for (const waiter of this.pending.values()) {
      waiter.reject(error);
    }
    this.pending.clear();
  }

  private fail(error: Error): void {
    clearTimeout(this.handshakeTimer);
    this.readyReject(error);
    this.rejectPending(error);
    if (!this.socket.destroyed) {
      this.socket.destroy();
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

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

function defaultAppServerSocketPath(): string {
  return join(process.env.CODEX_HOME || join(homedir(), ".codex"), "app-server-control", "app-server-control.sock");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function threadListIncludes(value: unknown, threadId: string): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  const data = (value as { data?: unknown }).data;
  return Array.isArray(data) && data.some((thread) =>
    Boolean(thread)
    && typeof thread === "object"
    && (thread as { id?: unknown }).id === threadId,
  );
}

async function confirmCreatedThread(appServer: AppServerTransport, threadId: string, state: RunState): Promise<string | undefined> {
  try {
    const read = await appServer.request("thread/read", buildThreadReadRequest(threadId).params);
    if (threadReadMatches(read, threadId)) {
      return undefined;
    }
  } catch (error) {
    const readError = errorMessage(error);
    try {
      const listed = await appServer.request("thread/list", buildThreadListRequest(threadId, state).params);
      if (threadListIncludes(listed, threadId)) {
        return undefined;
      }
      return `thread/read failed (${readError}) and thread/list did not confirm created thread ${threadId}; thread/start and turn/start already succeeded.`;
    } catch (listError) {
      return `thread/read failed (${readError}) and thread/list confirmation also failed: ${errorMessage(listError)}`;
    }
  }
  try {
    const listed = await appServer.request("thread/list", buildThreadListRequest(threadId, state).params);
    if (threadListIncludes(listed, threadId)) {
      return undefined;
    }
    return `thread/read did not confirm created thread ${threadId}; thread/start and turn/start already succeeded.`;
  } catch (error) {
    return `thread/read did not confirm created thread ${threadId}; thread/list confirmation failed: ${errorMessage(error)}`;
  }
}

function threadReadMatches(value: unknown, threadId: string): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  const maybeThread = (value as { thread?: unknown }).thread ?? value;
  return Boolean(maybeThread)
    && typeof maybeThread === "object"
    && (maybeThread as { id?: unknown }).id === threadId;
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
