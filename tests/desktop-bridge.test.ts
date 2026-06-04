import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildDesktopResultPrompt,
  buildInitializeRequest,
  buildThreadListRequest,
  buildThreadNameRequest,
  buildThreadStartRequest,
  buildTurnStartRequest,
  handleDesktopResult,
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

  it("constructs app-server JSON-RPC messages without guessing the current thread", () => {
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
    });
    const handoff = JSON.parse(await readFile(result.desktopHandoffPath ?? "", "utf8")) as { status: string; fallback_reason: string };

    expect(result.record.status).toBe("fallback");
    expect(handoff.fallback_reason).toContain("daemon is not running");
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
    expect(appServer.methods).toEqual(["initialize", "turn/start", "thread/list"]);
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
    expect(appServer.methods).toEqual(["initialize", "thread/start", "thread/name/set", "turn/start", "thread/list"]);
  });
});

class MockAppServer implements AppServerTransport {
  readonly methods: string[] = [];

  constructor(private readonly ids: { threadId?: string; turnId: string; listedThreadId: string }) {}

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
    return {};
  }
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
