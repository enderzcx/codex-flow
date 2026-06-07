import { createHash } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildDesktopResultPrompt,
  buildInitializeRequest,
  buildThreadListRequest,
  buildThreadNameRequest,
  buildThreadReadRequest,
  buildThreadStartRequest,
  buildTurnStartRequest,
  checkDesktopCapability,
  handleDesktopResult,
  createStdioAppServerTransport,
  type AppServerTransport,
} from "../src/desktop-bridge.js";
import { DEFAULT_FAILURE_POLICY } from "../src/run-index.js";
import { RunStore } from "../src/run-store.js";
import type { DesktopCapabilitySummary, RunState, WorkflowSpec } from "../src/types.js";

const cleanup: string[] = [];

afterEach(async () => {
  while (cleanup.length > 0) {
    const path = cleanup.pop();
    if (path) {
      await rm(path, { recursive: true, force: true });
    }
  }
});

describe("desktop bridge", () => {
  it("builds a concise result prompt from a completed run report", () => {
    const prompt = buildDesktopResultPrompt(createState(), sampleResult());

    expect(prompt).toContain("Codex Flow result handoff for run_test");
    expect(prompt).toContain("Workflow: diff-review");
    expect(prompt).toContain("Verdict: FAIL");
    expect(prompt).toContain("- [HIGH] Regression");
    expect(prompt).toContain("- Run npm test");
    expect(prompt).toContain("- Restore behavior");
    expect(prompt).toContain("Do not claim any file changes were made by this handoff.");
  });

  it("constructs app-server requests without guessing the current thread", () => {
    const state = createState();

    expect(buildInitializeRequest()).toMatchObject({ method: "initialize" });
    expect(buildThreadStartRequest(state)).toMatchObject({
      method: "thread/start",
      params: { cwd: state.target, approvalPolicy: "never", sandbox: "read-only" },
    });
    expect(buildThreadNameRequest("thread_1", state)).toMatchObject({
      method: "thread/name/set",
      params: { threadId: "thread_1" },
    });
    expect(buildTurnStartRequest("thread_1", "hello", state)).toMatchObject({
      method: "turn/start",
      params: { threadId: "thread_1", input: [{ type: "text", text: "hello", text_elements: [] }] },
    });
    expect(buildThreadListRequest("thread_1", state)).toMatchObject({
      method: "thread/list",
      params: { cwd: state.target, searchTerm: state.id },
    });
    expect(buildThreadReadRequest("thread_1")).toMatchObject({
      method: "thread/read",
      params: { threadId: "thread_1", includeTurns: false },
    });
  });

  it("marks thread APIs unavailable when the schema lacks thread/read", async () => {
    const root = await mkdtemp(join(tmpdir(), "cwf-capability-"));
    cleanup.push(root);
    const fakeCodex = join(root, "fake-codex");
    const fakeCli = join(root, "fake-codex.mjs");
    await writeFile(fakeCli, fakeCapabilityCodexScript(false));
    await writeFile(fakeCodex, `#!/bin/sh\nexec "${process.execPath}" "${fakeCli}" "$@"\n`);
    await chmod(fakeCodex, 0o755);

    const capability = await checkDesktopCapability(fakeCodex);

    expect(capability.codex_cli_available).toBe(true);
    expect(capability.schema_available).toBe(true);
    expect(capability.required_methods["thread/read"]).toBe(false);
    expect(capability.thread_apis_available).toBe(false);
  });

  it("writes a local handoff prompt and records print metadata", async () => {
    const store = await createCompletedRun();

    const result = await handleDesktopResult(store.runId, { mode: "print", runDir: store.runDir, indexPath: store.indexPath });
    const state = await store.readState();
    const prompt = await readFile(result.handoffPromptPath, "utf8");

    expect(prompt).toContain("Codex Flow result handoff");
    expect(state.native_runtime?.desktop_handoff?.status).toBe("printed");
    expect(state.native_runtime?.desktop_handoff?.result_return_path).toBe("stdout");
  });

  it("falls back cleanly when app-server is unavailable", async () => {
    const store = await createCompletedRun();

    const result = await handleDesktopResult(store.runId, {
      mode: "new-thread",
      runDir: store.runDir,
      indexPath: store.indexPath,
      capability: unavailableCapability(),
      appServerFactory: () => new FailingAppServer("socket missing"),
    });
    const handoff = JSON.parse(await readFile(result.desktopHandoffPath ?? "", "utf8")) as { status: string; fallback_reason: string; error: string };

    expect(result.record.status).toBe("fallback");
    expect(handoff.fallback_reason).toContain("proxy is unavailable");
    expect(handoff.error).toContain("socket missing");
  });

  it("tries app-server proxy even when daemon status is not running", async () => {
    const store = await createCompletedRun();
    const appServer = new MockAppServer({ threadId: "thread_new", turnId: "turn_new", listedThreadId: "thread_new" });

    const result = await handleDesktopResult(store.runId, {
      mode: "new-thread",
      runDir: store.runDir,
      indexPath: store.indexPath,
      capability: unavailableCapability(),
      appServerFactory: () => appServer,
    });

    expect(result.record.status).toBe("posted");
    expect(result.record.thread_id).toBe("thread_new");
    expect(appServer.methods).toEqual(["initialize", "thread/start", "thread/name/set", "turn/start", "thread/read"]);
  });

  it("posts to an explicit thread without calling thread/start", async () => {
    const store = await createCompletedRun();
    const appServer = new MockAppServer({ turnId: "turn_explicit", listedThreadId: "thread_known" });

    const result = await handleDesktopResult(store.runId, {
      mode: "thread",
      threadId: "thread_known",
      runDir: store.runDir,
      indexPath: store.indexPath,
      appServer,
      capability: availableCapability(),
    });

    expect(result.record.status).toBe("posted");
    expect(result.record.thread_id).toBe("thread_known");
    expect(result.record.turn_id).toBe("turn_explicit");
    expect(appServer.methods).toEqual(["initialize", "turn/start"]);
  });

  it("creates and verifies a new coordinator thread when app-server succeeds", async () => {
    const store = await createCompletedRun();
    const appServer = new MockAppServer({ threadId: "thread_new", turnId: "turn_new", listedThreadId: "thread_new" });

    const result = await handleDesktopResult(store.runId, {
      mode: "new-thread",
      runDir: store.runDir,
      indexPath: store.indexPath,
      appServer,
      capability: availableCapability(),
    });

    expect(result.record.status).toBe("posted");
    expect(result.record.thread_id).toBe("thread_new");
    expect(result.record.turn_id).toBe("turn_new");
    expect(appServer.methods).toEqual(["initialize", "thread/start", "thread/name/set", "turn/start", "thread/read"]);
  });

  it("posts through the Unix-socket WebSocket app-server transport", async () => {
    const store = await createCompletedRun();
    const root = await mkdtemp(join(tmpdir(), "cwf-ws-"));
    cleanup.push(root);
    const socketPath = join(root, "app-server.sock");
    const fakeAppServer = await startFakeWebSocketAppServer(socketPath);
    const previousSocketPath = process.env.CWF_APP_SERVER_SOCKET;
    process.env.CWF_APP_SERVER_SOCKET = socketPath;

    try {
      const result = await handleDesktopResult(store.runId, {
        mode: "new-thread",
        runDir: store.runDir,
        indexPath: store.indexPath,
        capability: availableCapability(),
      });

      expect(result.record.status).toBe("posted");
      expect(result.record.thread_id).toBe("thread_ws");
      expect(result.record.turn_id).toBe("turn_ws");
      expect(result.record.warning).toBeUndefined();
      expect(fakeAppServer.methods).toEqual(["initialize", "thread/start", "thread/name/set", "turn/start", "thread/read"]);
    } finally {
      if (previousSocketPath === undefined) {
        delete process.env.CWF_APP_SERVER_SOCKET;
      } else {
        process.env.CWF_APP_SERVER_SOCKET = previousSocketPath;
      }
      await fakeAppServer.close();
    }
  });

  it("posts through a spawned stdio app-server transport", async () => {
    const root = await mkdtemp(join(tmpdir(), "cwf-stdio-"));
    cleanup.push(root);
    const fakeCodex = join(root, "fake-codex");
    const fakeServer = join(root, "fake-server.mjs");
    await writeFile(fakeServer, fakeStdioAppServerScript());
    await writeFile(fakeCodex, `#!/bin/sh\nexec "${process.execPath}" "${fakeServer}" "$@"\n`);
    await chmod(fakeCodex, 0o755);

    const appServer = createStdioAppServerTransport(fakeCodex);
    try {
      await appServer.request("initialize", buildInitializeRequest().params);
      await appServer.notify?.("initialized");
      const started = await appServer.request("thread/start", buildThreadStartRequest(createState()).params) as { thread?: { id?: string } };
      const turn = await appServer.request("turn/start", buildTurnStartRequest("thread_stdio", "hello", createState()).params) as { turn?: { id?: string } };

      expect(started.thread?.id).toBe("thread_stdio");
      expect(turn.turn?.id).toBe("turn_stdio");
    } finally {
      await appServer.close?.();
    }
  });

  it("escalates stdio app-server close when the child ignores SIGTERM", async () => {
    const root = await mkdtemp(join(tmpdir(), "cwf-stdio-close-"));
    cleanup.push(root);
    const fakeCodex = join(root, "fake-codex");
    const fakeServer = join(root, "ignore-term-server.mjs");
    const pidFile = join(root, "pid.txt");
    await writeFile(fakeServer, fakeIgnoringStdioAppServerScript());
    await writeFile(fakeCodex, `#!/bin/sh\nexec "${process.execPath}" "${fakeServer}" "$@"\n`);
    await chmod(fakeCodex, 0o755);

    const previousPidFile = process.env.CWF_FAKE_STDIO_PID_FILE;
    process.env.CWF_FAKE_STDIO_PID_FILE = pidFile;
    try {
      const appServer = createStdioAppServerTransport(fakeCodex);
      const pid = await waitForPidFile(pidFile);
      expect(isProcessAlive(pid)).toBe(true);

      await appServer.close?.();
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(isProcessAlive(pid)).toBe(false);
    } finally {
      if (previousPidFile === undefined) {
        delete process.env.CWF_FAKE_STDIO_PID_FILE;
      } else {
        process.env.CWF_FAKE_STDIO_PID_FILE = previousPidFile;
      }
    }
  });

  it("fails stdio app-server requests when stdout exceeds the frame cap without a newline", async () => {
    const root = await mkdtemp(join(tmpdir(), "cwf-stdio-buffer-"));
    cleanup.push(root);
    const fakeCodex = join(root, "fake-codex");
    const fakeServer = join(root, "no-newline-server.mjs");
    await writeFile(fakeServer, fakeOversizedStdoutAppServerScript());
    await writeFile(fakeCodex, `#!/bin/sh\nexec "${process.execPath}" "${fakeServer}" "$@"\n`);
    await chmod(fakeCodex, 0o755);

    const appServer = createStdioAppServerTransport(fakeCodex);
    try {
      await expect(appServer.request("initialize", {})).rejects.toThrow("app-server stdio output exceeds");
    } finally {
      await appServer.close?.();
    }
  });

  it("keeps a posted result when thread/list misses the freshly created thread", async () => {
    const store = await createCompletedRun();
    const appServer = new MockAppServer({ threadId: "thread_new", turnId: "turn_new", listedThreadId: "thread_other", readThreadId: "thread_other" });

    const result = await handleDesktopResult(store.runId, {
      mode: "new-thread",
      runDir: store.runDir,
      indexPath: store.indexPath,
      appServer,
      capability: availableCapability(),
    });

    expect(result.record.status).toBe("posted");
    expect(result.record.thread_id).toBe("thread_new");
    expect(result.record.turn_id).toBe("turn_new");
    expect(result.record.warning).toContain("thread/read did not confirm");
  });
});

class MockAppServer implements AppServerTransport {
  readonly methods: string[] = [];

  constructor(private readonly ids: { threadId?: string; turnId: string; listedThreadId: string; readThreadId?: string }) {}

  async request(method: string): Promise<unknown> {
    this.methods.push(method);
    if (method === "thread/start") {
      return { thread: { id: this.ids.threadId } };
    }
    if (method === "turn/start") {
      return { turn: { id: this.ids.turnId } };
    }
    if (method === "thread/list") {
      return { data: [{ id: this.ids.listedThreadId }] };
    }
    if (method === "thread/read") {
      return { thread: { id: this.ids.readThreadId ?? this.ids.threadId } };
    }
    return {};
  }
}

class FailingAppServer implements AppServerTransport {
  constructor(private readonly message: string) {}

  async request(): Promise<unknown> {
    throw new Error(this.message);
  }
}

async function startFakeWebSocketAppServer(socketPath: string): Promise<{ methods: string[]; close(): Promise<void> }> {
  const methods: string[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    handleFakeWebSocket(socket, methods);
  });
  await listen(server, socketPath);
  return {
    methods,
    async close() {
      for (const socket of sockets) {
        socket.destroy();
      }
      await closeServer(server);
    },
  };
}

function handleFakeWebSocket(socket: Socket, methods: string[]): void {
  let buffer = Buffer.alloc(0);
  let handshaken = false;

  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    if (!handshaken) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) {
        return;
      }
      const header = buffer.subarray(0, headerEnd).toString("utf8");
      buffer = buffer.subarray(headerEnd + 4);
      const key = /^Sec-WebSocket-Key:\s*(.+)\s*$/im.exec(header)?.[1]?.trim();
      const accept = createHash("sha1")
        .update(`${key ?? ""}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
        .digest("base64");
      socket.write([
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Accept: ${accept}`,
        "",
        "",
      ].join("\r\n"));
      handshaken = true;
    }
    buffer = readFakeFrames(socket, buffer, methods);
  });
}

function readFakeFrames(socket: Socket, input: Buffer, methods: string[]): Buffer {
  let buffer = input;
  while (buffer.length >= 2) {
    const opcode = buffer[0] & 0x0f;
    const masked = (buffer[1] & 0x80) !== 0;
    let length = buffer[1] & 0x7f;
    let offset = 2;
    if (length === 126) {
      if (buffer.length < offset + 2) {
        return buffer;
      }
      length = buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (buffer.length < offset + 8) {
        return buffer;
      }
      length = Number(buffer.readBigUInt64BE(offset));
      offset += 8;
    }
    const mask = masked ? buffer.subarray(offset, offset + 4) : undefined;
    offset += masked ? 4 : 0;
    if (buffer.length < offset + length) {
      return buffer;
    }
    const payload = Buffer.from(buffer.subarray(offset, offset + length));
    buffer = buffer.subarray(offset + length);
    if (mask) {
      for (let index = 0; index < payload.length; index += 1) {
        payload[index] ^= mask[index % 4];
      }
    }
    if (opcode === 0x1) {
      handleFakeMessage(socket, payload.toString("utf8"), methods);
    } else if (opcode === 0x8) {
      writeFakeFrame(socket, 0x8, Buffer.alloc(0));
      socket.end();
      return buffer;
    }
  }
  return buffer;
}

function handleFakeMessage(socket: Socket, raw: string, methods: string[]): void {
  const message = JSON.parse(raw) as { id?: number; method?: string };
  if (typeof message.id !== "number" || !message.method) {
    return;
  }
  methods.push(message.method);
  const result = fakeResult(message.method);
  writeFakeFrame(socket, 0x1, Buffer.from(JSON.stringify({ id: message.id, result }), "utf8"));
}

function fakeResult(method: string): unknown {
  if (method === "thread/start") {
    return { thread: { id: "thread_ws" } };
  }
  if (method === "turn/start") {
    return { turn: { id: "turn_ws" } };
  }
  if (method === "thread/read") {
    return { thread: { id: "thread_ws" } };
  }
  return {};
}

function fakeStdioAppServerScript(): string {
  return `#!/usr/bin/env node
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  for (;;) {
    const index = buffer.indexOf("\\n");
    if (index < 0) break;
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    if (!message.id) continue;
    let result = {};
    if (message.method === "thread/start") result = { thread: { id: "thread_stdio" } };
    if (message.method === "turn/start") result = { turn: { id: "turn_stdio" } };
    process.stdout.write(JSON.stringify({ id: message.id, result }) + "\\n");
  }
});
`;
}

function fakeCapabilityCodexScript(includeThreadRead: boolean): string {
  const methods = [
    "initialize",
    "thread/start",
    "thread/name/set",
    "thread/list",
    ...(includeThreadRead ? ["thread/read"] : []),
    "turn/start",
  ];
  return `#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
if (args[0] === "--version") {
  console.log("codex-cli test");
  process.exit(0);
}
if (args[0] === "app-server" && args[1] === "generate-json-schema") {
  const out = args[args.indexOf("--out") + 1];
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "ClientRequest.json"), JSON.stringify({ oneOf: ${JSON.stringify(methods.map((method) => ({ properties: { method: { const: method } } })))} }));
  process.exit(0);
}
if (args[0] === "app-server" && args[1] === "daemon" && args[2] === "version") {
  process.exit(1);
}
process.exit(1);
`;
}

function fakeIgnoringStdioAppServerScript(): string {
  return `#!/usr/bin/env node
import { writeFileSync } from "node:fs";

if (process.env.CWF_FAKE_STDIO_PID_FILE) {
  writeFileSync(process.env.CWF_FAKE_STDIO_PID_FILE, String(process.pid));
}
process.on("SIGTERM", () => {});
process.stdin.resume();
setInterval(() => {}, 1000);
`;
}

function fakeOversizedStdoutAppServerScript(): string {
  return `#!/usr/bin/env node
process.stdin.resume();
process.stdout.write("x".repeat(5 * 1024 * 1024 + 1));
setInterval(() => {}, 1000);
`;
}

async function waitForPidFile(path: string): Promise<number> {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    try {
      const pid = Number((await readFile(path, "utf8")).trim());
      if (Number.isInteger(pid) && pid > 0) {
        return pid;
      }
    } catch {
      // Keep polling until the child writes its pid.
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for pid file: ${path}`);
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function writeFakeFrame(socket: Socket, opcode: number, payload: Buffer): void {
  let header: Buffer;
  if (payload.length < 126) {
    header = Buffer.from([0x80 | opcode, payload.length]);
  } else if (payload.length <= 0xffff) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  socket.write(Buffer.concat([header, payload]));
}

async function listen(server: Server, socketPath: string): Promise<void> {
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(socketPath, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolveClose) => {
    server.close(() => resolveClose());
  });
}

async function createCompletedRun(): Promise<RunStore> {
  const root = await mkdtemp(join(tmpdir(), "cwf-desktop-"));
  cleanup.push(root);
  const store = await RunStore.create(spec, resolve("/tmp/repo"), root);
  await store.writeResult(sampleResult());
  return store;
}

function createState(overrides: Partial<RunState> = {}): RunState {
  return {
    id: "run_test",
    workflow: "diff-review",
    status: "completed",
    target: "/tmp/repo",
    run_dir: "/tmp/cwf/run_test",
    failure_policy: DEFAULT_FAILURE_POLICY,
    phases: [],
    workers: [],
    gate_decisions: [],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:01.000Z",
    result_path: "/tmp/cwf/run_test/result.md",
    artifact_manifest_path: "/tmp/cwf/run_test/artifacts/manifest.json",
    ...overrides,
  };
}

function sampleResult(): string {
  return `# codex-workflows diff-review

## Verdict

- Verdict: FAIL
- Summary: Review completed: 1 finding.

## Findings

### [HIGH] Regression

- Evidence: src/calc.js changed behavior.
- Reason: It returns the wrong value.
- Suggested fix: Restore behavior.
- Workers: correctness
- Confidence: high

## Verification Gaps

- Run npm test

## Suggested Next Actions

- Restore behavior

## Artifacts

- result (result): /tmp/cwf/run_test/result.md - Human-readable report.
`;
}

function availableCapability(): DesktopCapabilitySummary {
  return {
    codex_cli_available: true,
    codex_cli_version: "codex-cli 1.0.0",
    schema_available: true,
    app_server_running: true,
    required_methods: {
      initialize: true,
      "thread/start": true,
      "thread/name/set": true,
      "thread/list": true,
      "thread/read": true,
      "turn/start": true,
    },
    thread_apis_available: true,
  };
}

function unavailableCapability(): DesktopCapabilitySummary {
  return {
    ...availableCapability(),
    app_server_running: false,
  };
}

const spec: WorkflowSpec = {
  id: "diff-review",
  version: "1.0.0",
  title: "Diff Review",
  tags: ["review", "read-only"],
  inputs: { target: { type: "path", required: true } },
  capabilities: { writes: false },
  requires: { target: "git-repo" },
  defaults: { sandbox: "read-only", timeout_ms: 300000 },
  phases: [
    { id: "collect", kind: "command" },
    { id: "review", kind: "codex-parallel", workers: [{ id: "correctness", perspective: "correctness", prompt: "review" }] },
    { id: "reduce", kind: "reducer", reducer: "diff-review" },
  ],
  artifacts: ["result.md"],
};
