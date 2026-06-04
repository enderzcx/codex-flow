import { describe, expect, it } from "vitest";
import {
  WorkerAdapterUnavailableError,
  codexAppThreadAdapter,
  normalizeWorkerRuntimeMetadata,
  runWorkerWithAdapter,
  type WorkerAdapterRegistry,
} from "../src/adapters/worker-adapter.js";
import type { DesktopCapabilitySummary, DiffContext, WorkerResult, WorkflowWorker } from "../src/types.js";

const worker: WorkflowWorker = {
  id: "correctness",
  perspective: "correctness",
  prompt: "review correctness",
};

const context: DiffContext = {
  target: "/repo",
  branch: "main",
  status_short: " M src/app.ts",
  changed_files: ["src/app.ts"],
  diff: "diff --git a/src/app.ts b/src/app.ts",
  diff_hash: "abc123",
  truncated: false,
};

describe("worker adapters", () => {
  it("runs a worker through a fake app-server app thread", async () => {
    const appServer = new FakeWorkerAppServer();

    const result = await runWorkerWithAdapter(worker, context, {
      target: "/repo",
      timeoutMs: 1000,
      workflowId: "diff-review",
      runId: "run_abcdef123456",
      parentThreadId: "thread_parent",
      coordinatorThreadId: "thread_coord",
      runtime: {
        preferred_worker_adapter: "codex-app-thread",
      },
      appServer,
      capability: availableCapability(),
    });

    expect(result.status).toBe("completed");
    expect(result.summary).toBe("app-thread ok");
    expect(result.runtime).toEqual(
      expect.objectContaining({
        adapter: "codex-app-thread",
        requested_adapter: "codex-app-thread",
        fallback_used: false,
        parent_thread_id: "thread_parent",
        coordinator_thread_id: "thread_coord",
        thread_id: "thread_correctness",
        turn_id: "turn_correctness",
        agent_role: "correctness",
        agent_nickname: "correctness",
        transcript_read: true,
        sandbox: "read-only",
        approval_policy: "never",
        result_return_path: "worker-envelope",
      }),
    );
    expect(appServer.methods).toEqual(["initialize", "thread/start", "thread/name/set", "turn/start", "thread/read"]);
    expect(appServer.methods).not.toContain("thread/list");
    expect(appServer.threadName).toBe("CWF diff-review correctness abcdef123456");
  });

  it("falls back from app-thread to the SDK adapter when configured", async () => {
    const registry: WorkerAdapterRegistry = {
      "codex-app-thread": codexAppThreadAdapter,
      "codex-sdk-headless": {
        name: "codex-sdk-headless",
        async run(worker, _context, options) {
          return completed(worker.id, {
            adapter: "codex-sdk-headless",
            requested_adapter: options.requestedAdapter,
            fallback_adapter: options.fallbackUsed ? "codex-sdk-headless" : undefined,
            fallback_used: Boolean(options.fallbackUsed),
            fallback_reason: options.fallbackReason,
            agent_role: worker.id,
            transcript_read: false,
            sandbox: "read-only",
            approval_policy: "never",
          });
        },
      },
    };

    const result = await runWorkerWithAdapter(
      worker,
      context,
      {
        target: "/repo",
        timeoutMs: 1000,
        runtime: {
          preferred_worker_adapter: "codex-app-thread",
          fallback_worker_adapter: "codex-sdk-headless",
        },
        capability: unavailableCapability(),
      },
      registry,
    );

    expect(result.status).toBe("completed");
    expect(result.runtime).toEqual(
      expect.objectContaining({
        adapter: "codex-sdk-headless",
        requested_adapter: "codex-app-thread",
        fallback_adapter: "codex-sdk-headless",
        fallback_used: true,
      }),
    );
    expect(result.runtime?.fallback_reason).toContain("codex-app-thread unavailable");
  });

  it("falls back when app-thread starts but returns no readable result", async () => {
    const registry: WorkerAdapterRegistry = {
      "codex-app-thread": codexAppThreadAdapter,
      "codex-sdk-headless": {
        name: "codex-sdk-headless",
        async run(worker, _context, options) {
          return completed(worker.id, {
            adapter: "codex-sdk-headless",
            requested_adapter: options.requestedAdapter,
            fallback_adapter: options.fallbackUsed ? "codex-sdk-headless" : undefined,
            fallback_used: Boolean(options.fallbackUsed),
            fallback_reason: options.fallbackReason,
            agent_role: worker.id,
            transcript_read: false,
            sandbox: "read-only",
            approval_policy: "never",
          });
        },
      },
    };

    const result = await runWorkerWithAdapter(
      worker,
      context,
      {
        target: "/repo",
        timeoutMs: 10,
        runtime: {
          preferred_worker_adapter: "codex-app-thread",
          fallback_worker_adapter: "codex-sdk-headless",
        },
        appServer: new EmptyWorkerAppServer(),
        capability: availableCapability(),
      },
      registry,
    );

    expect(result.status).toBe("completed");
    expect(result.runtime).toEqual(
      expect.objectContaining({
        adapter: "codex-sdk-headless",
        requested_adapter: "codex-app-thread",
        fallback_adapter: "codex-sdk-headless",
        fallback_used: true,
      }),
    );
    expect(result.runtime?.fallback_reason).toContain("app-thread worker did not return a readable final response");
    expect(result.runtime?.fallback_reason).toContain("thread_id=thread_empty");
    expect(result.runtime?.fallback_reason).toContain("turn_id=turn_empty");
  });

  it("falls back before worker creation when the live app-thread probe cannot produce output", async () => {
    const probeServer = new NoOutputProbeAppServer();
    const registry: WorkerAdapterRegistry = {
      "codex-app-thread": codexAppThreadAdapter,
      "codex-sdk-headless": {
        name: "codex-sdk-headless",
        async run(worker, _context, options) {
          return completed(worker.id, {
            adapter: "codex-sdk-headless",
            requested_adapter: options.requestedAdapter,
            fallback_adapter: options.fallbackUsed ? "codex-sdk-headless" : undefined,
            fallback_used: Boolean(options.fallbackUsed),
            fallback_reason: options.fallbackReason,
            agent_role: worker.id,
            transcript_read: false,
            sandbox: "read-only",
            approval_policy: "never",
          });
        },
      },
    };

    const result = await runWorkerWithAdapter(
      worker,
      context,
      {
        target: "/repo",
        timeoutMs: 10,
        runtime: {
          preferred_worker_adapter: "codex-app-thread",
          fallback_worker_adapter: "codex-sdk-headless",
        },
        appServerFactory: () => probeServer,
        capability: availableCapability(),
      },
      registry,
    );

    expect(result.status).toBe("completed");
    expect(result.runtime).toEqual(
      expect.objectContaining({
        adapter: "codex-sdk-headless",
        requested_adapter: "codex-app-thread",
        fallback_adapter: "codex-sdk-headless",
        fallback_used: true,
      }),
    );
    expect(result.runtime?.fallback_reason).toContain("turn execution probe failed");
    expect(result.runtime?.fallback_reason).toContain("thread_id=thread_probe");
    expect(result.runtime?.fallback_reason).toContain("turn_id=turn_probe");
    expect(probeServer.workerThreadStarted).toBe(false);
  });

  it("fails explicitly when app-thread is unavailable and no fallback is configured", async () => {
    await expect(
      runWorkerWithAdapter(worker, context, {
        target: "/repo",
        timeoutMs: 1000,
        runtime: {
          preferred_worker_adapter: "codex-app-thread",
        },
        capability: unavailableCapability(),
      }),
    ).rejects.toThrow("codex-app-thread unavailable: Codex app-server schema does not expose required thread APIs");
  });

  it("falls back to the SDK adapter when a preferred native adapter is unavailable", async () => {
    const registry: WorkerAdapterRegistry = {
      "codex-subagent": {
        name: "codex-subagent",
        async run() {
          throw new WorkerAdapterUnavailableError("codex-subagent", "native API missing");
        },
      },
      "codex-sdk-headless": {
        name: "codex-sdk-headless",
        async run(worker, _context, options) {
          return completed(worker.id, {
            adapter: "codex-sdk-headless",
            requested_adapter: options.requestedAdapter,
            fallback_adapter: options.fallbackUsed ? "codex-sdk-headless" : undefined,
            fallback_used: Boolean(options.fallbackUsed),
            fallback_reason: options.fallbackReason,
            agent_role: worker.id,
            transcript_read: false,
            sandbox: "read-only",
            approval_policy: "never",
          });
        },
      },
    };

    const result = await runWorkerWithAdapter(
      worker,
      context,
      {
        target: "/repo",
        timeoutMs: 1000,
        runtime: {
          preferred_worker_adapter: "codex-subagent",
          fallback_worker_adapter: "codex-sdk-headless",
        },
      },
      registry,
    );

    expect(result.status).toBe("completed");
    expect(result.runtime).toEqual(
      expect.objectContaining({
        adapter: "codex-sdk-headless",
        requested_adapter: "codex-subagent",
        fallback_adapter: "codex-sdk-headless",
        fallback_used: true,
      }),
    );
    expect(result.runtime?.fallback_reason).toContain("codex-subagent unavailable");
  });

  it("throws when the preferred adapter fails and no fallback is configured", async () => {
    const registry: WorkerAdapterRegistry = {
      "codex-app-thread": {
        name: "codex-app-thread",
        async run() {
          throw new WorkerAdapterUnavailableError("codex-app-thread", "daemon offline");
        },
      },
    };

    await expect(
      runWorkerWithAdapter(
        worker,
        context,
        {
          target: "/repo",
          timeoutMs: 1000,
          runtime: {
            preferred_worker_adapter: "codex-app-thread",
          },
        },
        registry,
      ),
    ).rejects.toThrow("codex-app-thread unavailable: daemon offline");
  });

  it("returns a failed preferred result unchanged when no fallback is configured", async () => {
    const failedResult = failed("correctness", {
      adapter: "codex-app-thread",
      requested_adapter: "codex-app-thread",
      fallback_used: false,
      agent_role: "correctness",
      transcript_read: true,
      thread_id: "thread_failed",
      turn_id: "turn_failed",
    });
    const registry: WorkerAdapterRegistry = {
      "codex-app-thread": {
        name: "codex-app-thread",
        async run() {
          return failedResult;
        },
      },
    };

    const result = await runWorkerWithAdapter(
      worker,
      context,
      {
        target: "/repo",
        timeoutMs: 1000,
        runtime: {
          preferred_worker_adapter: "codex-app-thread",
        },
      },
      registry,
    );

    expect(result).toBe(failedResult);
    expect(result.status).toBe("failed");
    expect(result.runtime?.fallback_used).toBe(false);
  });

  it("normalizes native runtime metadata into the worker envelope", () => {
    const result = normalizeWorkerRuntimeMetadata(completed("tests"), "codex-subagent", { ...worker, id: "tests" }, {
      thread_id: "thr_123",
      turn_id: "turn_456",
      agent_role: "tests",
      agent_nickname: "Atlas",
      transcript_read: true,
      sandbox: "read-only",
      approval_policy: "never",
    });

    expect(result.runtime).toEqual(
      expect.objectContaining({
        adapter: "codex-subagent",
        thread_id: "thr_123",
        turn_id: "turn_456",
        agent_role: "tests",
        agent_nickname: "Atlas",
        transcript_read: true,
        fallback_used: false,
      }),
    );
  });
});

class FakeWorkerAppServer {
  readonly methods: string[] = [];
  threadName = "";

  async request(method: string, params?: unknown): Promise<unknown> {
    this.methods.push(method);
    if (method === "thread/start") {
      return { thread: { id: "thread_correctness" } };
    }
    if (method === "thread/name/set") {
      this.threadName = (params as { name?: string }).name ?? "";
      return {};
    }
    if (method === "turn/start") {
      return { turn: { id: "turn_correctness" } };
    }
    if (method === "thread/read") {
      return {
        thread: {
          id: "thread_correctness",
          turns: [
            {
              id: "turn_correctness",
              finalResponse: JSON.stringify({
                worker_id: "correctness",
                summary: "app-thread ok",
                findings: [],
                verification: ["fake app-server read"],
                artifacts: [],
                confidence: "high",
              }),
            },
          ],
        },
      };
    }
    return {};
  }

  async notify(method: string): Promise<void> {
    if (method !== "initialized") {
      this.methods.push(method);
    }
  }
}

class EmptyWorkerAppServer {
  async request(method: string): Promise<unknown> {
    if (method === "thread/start") {
      return { thread: { id: "thread_empty" } };
    }
    if (method === "turn/start") {
      return { turn: { id: "turn_empty" } };
    }
    if (method === "thread/read") {
      return { thread: { id: "thread_empty", turns: [] } };
    }
    return {};
  }

  async notify(_method: string): Promise<void> {}
}

class NoOutputProbeAppServer {
  threadStarts = 0;
  workerThreadStarted = false;

  async request(method: string, params?: unknown): Promise<unknown> {
    if (method === "thread/start") {
      this.threadStarts += 1;
      if (this.threadStarts > 1) {
        this.workerThreadStarted = true;
        return { thread: { id: "thread_worker" } };
      }
      return { thread: { id: "thread_probe" } };
    }
    if (method === "turn/start") {
      return { turn: { id: "turn_probe" } };
    }
    if (method === "thread/read") {
      return { thread: { id: "thread_probe", turns: [] } };
    }
    return {};
  }

  async notify(_method: string): Promise<void> {}
}

function completed(workerId: string, runtime?: WorkerResult["runtime"]): WorkerResult {
  return {
    worker_id: workerId,
    status: "completed",
    confidence: "medium",
    summary: "ok",
    findings: [],
    verification: [],
    artifacts: [],
    started_at: "2026-01-01T00:00:00.000Z",
    completed_at: "2026-01-01T00:00:01.000Z",
    duration_ms: 1000,
    prompt: "prompt",
    raw: "{}",
    raw_fallback: false,
    retry_count: 0,
    runtime,
  };
}

function failed(workerId: string, runtime?: WorkerResult["runtime"]): WorkerResult {
  return {
    worker_id: workerId,
    status: "failed",
    confidence: "low",
    summary: "preferred failed",
    findings: [],
    verification: [],
    artifacts: [],
    started_at: "2026-01-01T00:00:00.000Z",
    completed_at: "2026-01-01T00:00:01.000Z",
    duration_ms: 1000,
    prompt: "prompt",
    raw: "",
    raw_fallback: false,
    retry_count: 0,
    error: "preferred worker failed",
    runtime,
  };
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
    thread_apis_available: false,
  };
}
