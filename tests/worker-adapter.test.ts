import { describe, expect, it, vi } from "vitest";
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

  it("reads app-thread worker output from thread/read with a small timeout", async () => {
    const result = await runWorkerWithAdapter(worker, context, {
      target: "/repo",
      timeoutMs: 20,
      runtime: {
        preferred_worker_adapter: "codex-app-thread",
      },
      appServer: new FakeWorkerAppServer(),
      capability: availableCapability(),
    });

    expect(result.status).toBe("completed");
    expect(result.summary).toBe("app-thread ok");
    expect(result.runtime?.transcript_read).toBe(true);
  });

  it("uses direct turn output without waiting for thread/read", async () => {
    const startedAt = Date.now();
    const result = await runWorkerWithAdapter(worker, context, {
      target: "/repo",
      timeoutMs: 20,
      runtime: {
        preferred_worker_adapter: "codex-app-thread",
      },
      appServer: new DirectRawHangingReadAppServer(),
      capability: availableCapability(),
    });

    expect(Date.now() - startedAt).toBeLessThan(1000);
    expect(result.status).toBe("completed");
    expect(result.summary).toBe("direct turn output ok");
    expect(result.runtime?.transcript_read).toBe(false);
  });

  it("keeps direct turn output even when the overall deadline is exhausted before read", async () => {
    const now = vi.spyOn(Date, "now");
    const times = [0, 0, 1, 2, 3, 4, 5, 11, 12, 12];
    now.mockImplementation(() => times.shift() ?? 12);
    try {
      const result = await runWorkerWithAdapter(worker, context, {
        target: "/repo",
        timeoutMs: 10,
        runtime: {
          preferred_worker_adapter: "codex-app-thread",
        },
        appServer: new DirectRawHangingReadAppServer(),
        capability: availableCapability(),
      });

      expect(result.status).toBe("completed");
      expect(result.summary).toBe("direct turn output ok");
      expect(result.runtime?.transcript_read).toBe(false);
    } finally {
      now.mockRestore();
    }
  });

  it("runs the app-thread worker only after the fixed JSON execution probe succeeds", async () => {
    const appServer = new JsonProbeThenWorkerAppServer();

    const result = await runWorkerWithAdapter(worker, context, {
      target: "/repo",
      timeoutMs: 1000,
      workflowId: "diff-review",
      runId: "run_probe_ok",
      runtime: {
        preferred_worker_adapter: "codex-app-thread",
      },
      appServerFactory: () => appServer,
      capability: availableCapability(),
    });

    expect(result.status).toBe("completed");
    expect(result.summary).toBe("app-thread ok after probe");
    expect(result.runtime).toEqual(expect.objectContaining({ adapter: "codex-app-thread", fallback_used: false }));
    expect(appServer.threadStarts).toBe(2);
    expect(appServer.workerThreadStarted).toBe(true);
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

    const startedAt = Date.now();
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

    expect(Date.now() - startedAt).toBeLessThan(1000);
    expect(result.status).toBe("completed");
    expect(result.runtime).toEqual(
      expect.objectContaining({
        adapter: "codex-sdk-headless",
        requested_adapter: "codex-app-thread",
        fallback_adapter: "codex-sdk-headless",
        fallback_used: true,
      }),
    );
    expect(result.runtime?.fallback_reason).toContain("app-thread-execution-unavailable");
    expect(result.runtime?.fallback_reason).toContain("thread APIs are available, but the model execution channel did not return a readable assistant response");
    expect(result.runtime?.fallback_reason).toContain("thread_id=thread_empty");
    expect(result.runtime?.fallback_reason).toContain("turn_id=turn_empty");
  });

  it("falls back when the real app-thread worker request hangs", async () => {
    const appServer = new HangingWorkerStartAppServer();
    const result = await runWorkerWithAdapter(
      worker,
      context,
      {
        target: "/repo",
        timeoutMs: 25,
        runtime: {
          preferred_worker_adapter: "codex-app-thread",
          fallback_worker_adapter: "codex-sdk-headless",
        },
        appServer,
        capability: availableCapability(),
      },
      fallbackRegistry(),
    );

    expect(result.status).toBe("completed");
    expect(result.runtime?.fallback_reason).toContain("thread/start timed out");
    expect(appServer.closeCalled).toBe(true);
  });

  it("ignores invalid worker request timeout env values", async () => {
    const previousTimeout = process.env.CWF_APP_THREAD_WORKER_REQUEST_TIMEOUT_MS;
    process.env.CWF_APP_THREAD_WORKER_REQUEST_TIMEOUT_MS = "abc";
    try {
      const result = await runWorkerWithAdapter(
        worker,
        context,
        {
          target: "/repo",
          timeoutMs: 25,
          runtime: {
            preferred_worker_adapter: "codex-app-thread",
            fallback_worker_adapter: "codex-sdk-headless",
          },
          appServer: new HangingWorkerStartAppServer(),
          capability: availableCapability(),
        },
        fallbackRegistry(),
      );

      expect(result.status).toBe("completed");
      expect(result.runtime?.fallback_reason).toContain("thread/start timed out after 25ms");
      expect(result.runtime?.fallback_reason).not.toContain("NaN");
    } finally {
      if (previousTimeout === undefined) {
        delete process.env.CWF_APP_THREAD_WORKER_REQUEST_TIMEOUT_MS;
      } else {
        process.env.CWF_APP_THREAD_WORKER_REQUEST_TIMEOUT_MS = previousTimeout;
      }
    }
  });

  it("ignores invalid worker result timeout env values", async () => {
    const previousTimeout = process.env.CWF_APP_THREAD_RESULT_TIMEOUT_MS;
    process.env.CWF_APP_THREAD_RESULT_TIMEOUT_MS = "abc";
    try {
      const result = await runWorkerWithAdapter(worker, context, {
        target: "/repo",
        timeoutMs: 20,
        runtime: {
          preferred_worker_adapter: "codex-app-thread",
        },
        appServer: new FakeWorkerAppServer(),
        capability: availableCapability(),
      });

      expect(result.status).toBe("completed");
      expect(result.summary).toBe("app-thread ok");
      expect(result.error).toBeUndefined();
      expect(JSON.stringify(result)).not.toContain("NaN");
    } finally {
      if (previousTimeout === undefined) {
        delete process.env.CWF_APP_THREAD_RESULT_TIMEOUT_MS;
      } else {
        process.env.CWF_APP_THREAD_RESULT_TIMEOUT_MS = previousTimeout;
      }
    }
  });

  it("enforces an overall timeout across real app-thread worker requests", async () => {
    const startedAt = Date.now();
    const result = await runWorkerWithAdapter(
      worker,
      context,
      {
        target: "/repo",
        timeoutMs: 35,
        runtime: {
          preferred_worker_adapter: "codex-app-thread",
          fallback_worker_adapter: "codex-sdk-headless",
        },
        appServer: new SlowSetupWorkerAppServer(),
        capability: availableCapability(),
      },
      fallbackRegistry(),
    );

    expect(Date.now() - startedAt).toBeLessThan(1000);
    expect(result.status).toBe("completed");
    expect(result.runtime?.fallback_reason).toMatch(/timed out after \d+ms|app-thread worker timed out after 35ms/);
  });

  it("does not let a hanging real app-thread close block a completed worker", async () => {
    const appServer = new HangingCloseWorkerAppServer();
    const startedAt = Date.now();

    const result = await runWorkerWithAdapter(worker, context, {
      target: "/repo",
      timeoutMs: 20,
      runtime: {
        preferred_worker_adapter: "codex-app-thread",
      },
      appServer,
      capability: availableCapability(),
    });

    expect(Date.now() - startedAt).toBeLessThan(1000);
    expect(result.status).toBe("completed");
    expect(result.summary).toBe("app-thread ok");
  });

  it("ignores invalid close timeout env values", async () => {
    const previousTimeout = process.env.CWF_APP_THREAD_CLOSE_TIMEOUT_MS;
    process.env.CWF_APP_THREAD_CLOSE_TIMEOUT_MS = "abc";
    try {
      const result = await runWorkerWithAdapter(worker, context, {
        target: "/repo",
        timeoutMs: 20,
        runtime: {
          preferred_worker_adapter: "codex-app-thread",
        },
        appServer: new HangingCloseWorkerAppServer(),
        capability: availableCapability(),
      });

      expect(result.status).toBe("completed");
      expect(result.summary).toBe("app-thread ok");
    } finally {
      if (previousTimeout === undefined) {
        delete process.env.CWF_APP_THREAD_CLOSE_TIMEOUT_MS;
      } else {
        process.env.CWF_APP_THREAD_CLOSE_TIMEOUT_MS = previousTimeout;
      }
    }
  });

  it("preserves thread/read errors in app-thread execution-unavailable fallback reasons", async () => {
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
        appServer: new ThrowingReadWorkerAppServer(),
        capability: availableCapability(),
      },
      registry,
    );

    expect(result.status).toBe("completed");
    expect(result.runtime?.fallback_reason).toContain("app-thread-execution-unavailable");
    expect(result.runtime?.fallback_reason).toContain("thread APIs are available, but the model execution channel did not return a readable assistant response");
    expect(result.runtime?.fallback_reason).toContain("last thread/read error");
    expect(result.runtime?.fallback_reason).toContain("fake thread/read failed");
    expect(result.runtime?.fallback_reason).toContain("thread_id=thread_read_error");
    expect(result.runtime?.fallback_reason).toContain("turn_id=turn_read_error");
  });

  it("does not close the transport on recoverable thread/read polling timeouts", async () => {
    const appServer = new HangingReadCloseCountWorkerAppServer();
    const result = await runWorkerWithAdapter(
      worker,
      context,
      {
        target: "/repo",
        timeoutMs: 5,
        runtime: {
          preferred_worker_adapter: "codex-app-thread",
          fallback_worker_adapter: "codex-sdk-headless",
        },
        appServer,
        capability: availableCapability(),
      },
      fallbackRegistry(),
    );

    expect(result.status).toBe("completed");
    expect(result.runtime?.fallback_reason).toContain("thread/read timed out");
    expect(appServer.closeCalls).toBe(1);
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
    expect(result.runtime?.fallback_reason).toContain("app-thread-execution-unavailable");
    expect(result.runtime?.fallback_reason).toContain("thread APIs are available, but the model execution channel did not return a readable assistant response");
    expect(result.runtime?.fallback_reason).toContain("thread_id=thread_probe");
    expect(result.runtime?.fallback_reason).toContain("turn_id=turn_probe");
    expect(probeServer.workerThreadStarted).toBe(false);
  });

  it("falls back before worker creation when the probe does not return the fixed JSON response", async () => {
    const probeServer = new UnexpectedProbeResponseAppServer();

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
        appServerFactory: () => probeServer,
        capability: availableCapability(),
      },
      fallbackRegistry(),
    );

    expect(result.status).toBe("completed");
    expect(result.runtime?.fallback_reason).toContain("app-thread-execution-unavailable");
    expect(result.runtime?.fallback_reason).toContain("probe returned an unexpected response");
    expect(result.runtime?.fallback_reason).toContain("thread_id=thread_bad_probe");
    expect(result.runtime?.fallback_reason).toContain("turn_id=turn_bad_probe");
    expect(probeServer.workerThreadStarted).toBe(false);
  });

  it("keeps probe setup failures separate from model execution failures", async () => {
    const probeServer = new SetupFailingProbeAppServer();
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
        appServerFactory: () => probeServer,
        capability: availableCapability(),
      },
      registry,
    );

    expect(result.status).toBe("completed");
    expect(result.runtime?.fallback_reason).toContain("app-thread-probe-setup-failed");
    expect(result.runtime?.fallback_reason).toContain("fake thread/start failed");
    expect(result.runtime?.fallback_reason).not.toContain("app-thread-execution-unavailable");
  });

  it("labels missing probe thread ids as setup failures", async () => {
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
        appServerFactory: () => new MissingThreadIdProbeAppServer(),
        capability: availableCapability(),
      },
      registry,
    );

    expect(result.status).toBe("completed");
    expect(result.runtime?.fallback_reason).toContain("app-thread-probe-setup-failed");
    expect(result.runtime?.fallback_reason).toContain("thread/start did not return thread.id");
    expect(result.runtime?.fallback_reason).not.toContain("app-thread-execution-unavailable");
  });

  it("labels probe turn/start failures before a turn id as setup failures", async () => {
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
        appServerFactory: () => new TurnStartFailingProbeAppServer(),
        capability: availableCapability(),
      },
      fallbackRegistry(),
    );

    expect(result.status).toBe("completed");
    expect(result.runtime?.fallback_reason).toContain("app-thread-probe-setup-failed");
    expect(result.runtime?.fallback_reason).toContain("fake turn/start failed");
    expect(result.runtime?.fallback_reason).toContain("thread_id=thread_turn_start_error");
    expect(result.runtime?.fallback_reason).not.toContain("app-thread-execution-unavailable");
  });

  it("labels missing probe turn ids as setup failures", async () => {
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
        appServerFactory: () => new MissingTurnIdProbeAppServer(),
        capability: availableCapability(),
      },
      fallbackRegistry(),
    );

    expect(result.status).toBe("completed");
    expect(result.runtime?.fallback_reason).toContain("app-thread-probe-setup-failed");
    expect(result.runtime?.fallback_reason).toContain("turn/start did not return turn.id");
    expect(result.runtime?.fallback_reason).toContain("thread_id=thread_missing_turn_id");
    expect(result.runtime?.fallback_reason).not.toContain("turn_id=");
    expect(result.runtime?.fallback_reason).not.toContain("app-thread-execution-unavailable");
  });

  it("times out hanging probe notify as a setup failure", async () => {
    const previousProbeTimeout = process.env.CWF_APP_THREAD_PROBE_TIMEOUT_MS;
    process.env.CWF_APP_THREAD_PROBE_TIMEOUT_MS = "5";
    try {
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
          appServerFactory: () => new HangingNotifyProbeAppServer(),
          capability: availableCapability(),
        },
        fallbackRegistry(),
      );

      expect(result.status).toBe("completed");
      expect(result.runtime?.fallback_reason).toContain("app-thread-probe-setup-failed");
      expect(result.runtime?.fallback_reason).toContain("notify/initialized timed out");
      expect(result.runtime?.fallback_reason).not.toContain("app-thread-execution-unavailable");
    } finally {
      if (previousProbeTimeout === undefined) {
        delete process.env.CWF_APP_THREAD_PROBE_TIMEOUT_MS;
      } else {
        process.env.CWF_APP_THREAD_PROBE_TIMEOUT_MS = previousProbeTimeout;
      }
    }
  });

  it("ignores invalid probe timeout env values", async () => {
    const previousProbeTimeout = process.env.CWF_APP_THREAD_PROBE_TIMEOUT_MS;
    process.env.CWF_APP_THREAD_PROBE_TIMEOUT_MS = "abc";
    try {
      const result = await runWorkerWithAdapter(
        worker,
        context,
        {
          target: "/repo",
          timeoutMs: 25,
          runtime: {
            preferred_worker_adapter: "codex-app-thread",
            fallback_worker_adapter: "codex-sdk-headless",
          },
          appServerFactory: () => new HangingNotifyProbeAppServer(),
          capability: availableCapability(),
        },
        fallbackRegistry(),
      );

      expect(result.status).toBe("completed");
      expect(result.runtime?.fallback_reason).toContain("app-thread-probe-setup-failed");
      expect(result.runtime?.fallback_reason).toContain("notify/initialized timed out after");
      expect(result.runtime?.fallback_reason).not.toContain("NaN");
    } finally {
      if (previousProbeTimeout === undefined) {
        delete process.env.CWF_APP_THREAD_PROBE_TIMEOUT_MS;
      } else {
        process.env.CWF_APP_THREAD_PROBE_TIMEOUT_MS = previousProbeTimeout;
      }
    }
  });

  it("does not expose hanging probe close as the fallback reason", async () => {
    const previousProbeTimeout = process.env.CWF_APP_THREAD_PROBE_TIMEOUT_MS;
    process.env.CWF_APP_THREAD_PROBE_TIMEOUT_MS = "5";
    try {
      const startedAt = Date.now();
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
          appServerFactory: () => new HangingCloseNoOutputProbeAppServer(),
          capability: availableCapability(),
        },
        fallbackRegistry(),
      );

      expect(Date.now() - startedAt).toBeLessThan(1000);
      expect(result.status).toBe("completed");
      expect(result.runtime?.fallback_reason).toContain("app-thread-execution-unavailable");
      expect(result.runtime?.fallback_reason).not.toContain("app-server close");
    } finally {
      if (previousProbeTimeout === undefined) {
        delete process.env.CWF_APP_THREAD_PROBE_TIMEOUT_MS;
      } else {
        process.env.CWF_APP_THREAD_PROBE_TIMEOUT_MS = previousProbeTimeout;
      }
    }
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

class DirectRawHangingReadAppServer {
  async request(method: string): Promise<unknown> {
    if (method === "thread/start") {
      return { thread: { id: "thread_direct_raw" } };
    }
    if (method === "turn/start") {
      return {
        turn: {
          id: "turn_direct_raw",
          finalResponse: JSON.stringify({
            worker_id: "correctness",
            summary: "direct turn output ok",
            findings: [],
            verification: ["direct raw used"],
            artifacts: [],
            confidence: "high",
          }),
        },
      };
    }
    if (method === "thread/read") {
      return new Promise(() => {});
    }
    return {};
  }

  async notify(_method: string): Promise<void> {}
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

class HangingWorkerStartAppServer {
  closeCalled = false;

  async request(method: string): Promise<unknown> {
    if (method === "thread/start") {
      return new Promise(() => {});
    }
    return {};
  }

  async notify(_method: string): Promise<void> {}

  async close(): Promise<void> {
    this.closeCalled = true;
  }
}

class SlowSetupWorkerAppServer {
  async request(method: string): Promise<unknown> {
    if (method === "initialize" || method === "thread/start" || method === "thread/name/set" || method === "turn/start") {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    if (method === "thread/start") {
      return { thread: { id: "thread_slow_setup" } };
    }
    if (method === "turn/start") {
      return { turn: { id: "turn_slow_setup" } };
    }
    return {};
  }

  async notify(_method: string): Promise<void> {}
}

class HangingCloseWorkerAppServer extends FakeWorkerAppServer {
  async close(): Promise<void> {
    return new Promise(() => {});
  }
}

class JsonProbeThenWorkerAppServer {
  threadStarts = 0;
  workerThreadStarted = false;

  async request(method: string, params?: unknown): Promise<unknown> {
    if (method === "thread/start") {
      this.threadStarts += 1;
      if (this.threadStarts > 1) {
        this.workerThreadStarted = true;
        return { thread: { id: "thread_worker_after_probe" } };
      }
      return { thread: { id: "thread_json_probe" } };
    }
    if (method === "turn/start") {
      return { turn: { id: this.workerThreadStarted ? "turn_worker_after_probe" : "turn_json_probe" } };
    }
    if (method === "thread/read") {
      const threadId = (params as { threadId?: string }).threadId;
      if (threadId === "thread_json_probe") {
        return {
          thread: {
            id: "thread_json_probe",
            turns: [{ id: "turn_json_probe", finalResponse: "{\"probe\":\"cwf-app-thread-ok\"}" }],
          },
        };
      }
      return {
        thread: {
          id: "thread_worker_after_probe",
          turns: [
            {
              id: "turn_worker_after_probe",
              finalResponse: JSON.stringify({
                worker_id: "correctness",
                summary: "app-thread ok after probe",
                findings: [],
                verification: ["fixed JSON probe succeeded"],
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

  async notify(_method: string): Promise<void> {}
}

class UnexpectedProbeResponseAppServer {
  threadStarts = 0;
  workerThreadStarted = false;

  async request(method: string): Promise<unknown> {
    if (method === "thread/start") {
      this.threadStarts += 1;
      if (this.threadStarts > 1) {
        this.workerThreadStarted = true;
        return { thread: { id: "thread_worker_should_not_start" } };
      }
      return { thread: { id: "thread_bad_probe" } };
    }
    if (method === "turn/start") {
      return { turn: { id: "turn_bad_probe" } };
    }
    if (method === "thread/read") {
      return {
        thread: {
          id: "thread_bad_probe",
          turns: [{ id: "turn_bad_probe", finalResponse: "{\"probe\":\"wrong\"}" }],
        },
      };
    }
    return {};
  }

  async notify(_method: string): Promise<void> {}
}

class ThrowingReadWorkerAppServer {
  async request(method: string): Promise<unknown> {
    if (method === "thread/start") {
      return { thread: { id: "thread_read_error" } };
    }
    if (method === "turn/start") {
      return { turn: { id: "turn_read_error" } };
    }
    if (method === "thread/read") {
      throw new Error("fake thread/read failed");
    }
    return {};
  }

  async notify(_method: string): Promise<void> {}
}

class HangingReadCloseCountWorkerAppServer {
  closeCalls = 0;

  async request(method: string): Promise<unknown> {
    if (method === "thread/start") {
      return { thread: { id: "thread_hanging_read" } };
    }
    if (method === "turn/start") {
      return { turn: { id: "turn_hanging_read" } };
    }
    if (method === "thread/read") {
      return new Promise(() => {});
    }
    return {};
  }

  async notify(_method: string): Promise<void> {}

  async close(): Promise<void> {
    this.closeCalls += 1;
  }
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

class SetupFailingProbeAppServer {
  async request(method: string): Promise<unknown> {
    if (method === "thread/start") {
      throw new Error("fake thread/start failed");
    }
    return {};
  }

  async notify(_method: string): Promise<void> {}
}

class MissingThreadIdProbeAppServer {
  async request(method: string): Promise<unknown> {
    if (method === "thread/start") {
      return { thread: {} };
    }
    return {};
  }

  async notify(_method: string): Promise<void> {}
}

class TurnStartFailingProbeAppServer {
  async request(method: string): Promise<unknown> {
    if (method === "thread/start") {
      return { thread: { id: "thread_turn_start_error" } };
    }
    if (method === "turn/start") {
      throw new Error("fake turn/start failed");
    }
    return {};
  }

  async notify(_method: string): Promise<void> {}
}

class MissingTurnIdProbeAppServer {
  async request(method: string): Promise<unknown> {
    if (method === "thread/start") {
      return { thread: { id: "thread_missing_turn_id" } };
    }
    if (method === "turn/start") {
      return { turn: {} };
    }
    if (method === "thread/read") {
      return { thread: { id: "thread_missing_turn_id", turns: [] } };
    }
    return {};
  }

  async notify(_method: string): Promise<void> {}
}

class HangingNotifyProbeAppServer {
  async request(_method: string): Promise<unknown> {
    return {};
  }

  async notify(_method: string): Promise<void> {
    return new Promise(() => {});
  }
}

class HangingCloseNoOutputProbeAppServer extends NoOutputProbeAppServer {
  async close(): Promise<void> {
    return new Promise(() => {});
  }
}

function fallbackRegistry(): WorkerAdapterRegistry {
  return {
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
