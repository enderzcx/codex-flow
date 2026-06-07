import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

  it("uses the spawned stdio app-server transport by default", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cwf-worker-stdio-"));
    const fakeCodex = join(dir, "fake-codex");
    const fakeServer = join(dir, "fake-app-server.mjs");
    const methodLog = join(dir, "methods.log");
    await writeFile(fakeServer, fakeStdioWorkerAppServerScript());
    await writeFile(fakeCodex, `#!/bin/sh\nexec "${process.execPath}" "${fakeServer}" "$@"\n`);
    await chmod(fakeCodex, 0o755);

    try {
      await withEnv(
        {
          CWF_FAKE_STDIO_LOG: methodLog,
          CWF_APP_THREAD_TRANSPORT: undefined,
        },
        async () => {
          const result = await runWorkerWithAdapter(worker, context, {
            target: "/repo",
            timeoutMs: 5000,
            runtime: {
              preferred_worker_adapter: "codex-app-thread",
            },
            codexPath: fakeCodex,
            capability: availableCapability(),
          });

          expect(result.status).toBe("completed");
          expect(result.summary).toBe("stdio app-thread ok");
          expect(result.runtime).toEqual(
            expect.objectContaining({
              adapter: "codex-app-thread",
              thread_id: "thread_stdio",
              turn_id: "turn_stdio_worker",
              transcript_read: true,
            }),
          );
          const methods = await readFile(methodLog, "utf8");
          expect(methods.match(/^thread\/start /gm)).toHaveLength(2);
          expect(methods.match(/^turn\/start /gm)).toHaveLength(2);
          expect(methods).toContain('"outputSchema"');
          expect(methods).toContain('"cwf-app-thread-ok"');
          expect(methods).toContain("thread/read");
          expect(methods.match(/"model":"gpt-5\.3-codex-spark"/g)).toHaveLength(4);
          expect(methods.match(/"effort":"low"/g)).toHaveLength(2);
        },
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("uses the daemon app-server socket when explicitly requested", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cwf-worker-daemon-"));
    const socketPath = join(dir, "app-server.sock");
    const fakeAppServer = await startFakeWorkerWebSocketAppServer(socketPath);
    try {
      await withEnv(
        {
          CWF_APP_THREAD_EXECUTION_PREFLIGHT: "0",
          CWF_APP_THREAD_TRANSPORT: "daemon",
          CWF_APP_SERVER_SOCKET: socketPath,
        },
        async () => {
          const result = await runWorkerWithAdapter(worker, context, {
            target: "/repo",
            timeoutMs: 1000,
            runtime: {
              preferred_worker_adapter: "codex-app-thread",
            },
            capability: availableCapability(),
          });

          expect(result.status).toBe("completed");
          expect(result.summary).toBe("daemon app-thread ok");
          expect(result.runtime).toEqual(
            expect.objectContaining({
              adapter: "codex-app-thread",
              thread_id: "thread_daemon_worker",
              turn_id: "turn_daemon_worker",
              transcript_read: true,
            }),
          );
          expect(fakeAppServer.methods).toContain("thread/read");
        },
      );
    } finally {
      await fakeAppServer.close();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("defaults app-thread workers to the Codex Spark quota lane", async () => {
    await withAppThreadModelEnv({}, async () => {
      const appServer = new FakeWorkerAppServer();

      const result = await runWorkerWithAdapter(worker, context, {
        target: "/repo",
        timeoutMs: 1000,
        runtime: {
          preferred_worker_adapter: "codex-app-thread",
        },
        appServer,
        capability: availableCapability(),
      });

      expect(result.status).toBe("completed");
      expect(appServer.threadStartParams[0]).toEqual(expect.objectContaining({ model: "gpt-5.3-codex-spark" }));
      expect(appServer.turnStartParams[0]).toEqual(expect.objectContaining({ model: "gpt-5.3-codex-spark", effort: "low" }));
      expect(result.runtime).toEqual(
        expect.objectContaining({
          model: "gpt-5.3-codex-spark",
          reasoning_effort: "low",
        }),
      );
    });
  });

  it("can opt back into the host default app-thread model", async () => {
    await withAppThreadModelEnv({ CWF_APP_THREAD_MODEL: "host-default" }, async () => {
      const appServer = new FakeWorkerAppServer();

      const result = await runWorkerWithAdapter(worker, context, {
        target: "/repo",
        timeoutMs: 1000,
        runtime: {
          preferred_worker_adapter: "codex-app-thread",
        },
        appServer,
        capability: availableCapability(),
      });

      expect(result.status).toBe("completed");
      expect(appServer.threadStartParams[0]).not.toEqual(expect.objectContaining({ model: expect.any(String) }));
      expect(appServer.turnStartParams[0]).not.toEqual(expect.objectContaining({ model: expect.any(String) }));
      expect(appServer.turnStartParams[0]).not.toEqual(expect.objectContaining({ effort: expect.any(String) }));
      expect(result.runtime?.model).toBeUndefined();
      expect(result.runtime?.reasoning_effort).toBeUndefined();
    });
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
    expect(appServer.turnStartParams[0]).toEqual(
      expect.objectContaining({
        input: [{ type: "text", text: 'Return exactly {"probe":"cwf-app-thread-ok"} and nothing else.', text_elements: [] }],
        outputSchema: expect.objectContaining({
          type: "object",
          additionalProperties: false,
          required: ["probe"],
        }),
      }),
    );
  });

  it("passes explicit app-thread model settings to the execution probe and worker turn", async () => {
    const previousModel = process.env.CWF_APP_THREAD_MODEL;
    const previousProvider = process.env.CWF_APP_THREAD_MODEL_PROVIDER;
    const previousEffort = process.env.CWF_APP_THREAD_REASONING_EFFORT;
    process.env.CWF_APP_THREAD_MODEL = "gpt-5.1";
    process.env.CWF_APP_THREAD_MODEL_PROVIDER = "openai";
    process.env.CWF_APP_THREAD_REASONING_EFFORT = "low";
    try {
      const appServer = new JsonProbeThenWorkerAppServer();

      const result = await runWorkerWithAdapter(worker, context, {
        target: "/repo",
        timeoutMs: 1000,
        workflowId: "diff-review",
        runId: "run_model_override",
        runtime: {
          preferred_worker_adapter: "codex-app-thread",
        },
        appServerFactory: () => appServer,
        capability: availableCapability(),
      });

      expect(result.status).toBe("completed");
      expect(appServer.threadStartParams).toHaveLength(2);
      expect(appServer.turnStartParams).toHaveLength(2);
      expect(appServer.threadStartParams[0]).toEqual(expect.objectContaining({ model: "gpt-5.1", modelProvider: "openai" }));
      expect(appServer.threadStartParams[1]).toEqual(expect.objectContaining({ model: "gpt-5.1", modelProvider: "openai" }));
      expect(appServer.turnStartParams[0]).toEqual(expect.objectContaining({ model: "gpt-5.1", effort: "low" }));
      expect(appServer.turnStartParams[1]).toEqual(expect.objectContaining({ model: "gpt-5.1", effort: "low" }));
      expect(result.runtime).toEqual(
        expect.objectContaining({
          model: "gpt-5.1",
          model_provider: "openai",
          reasoning_effort: "low",
        }),
      );
    } finally {
      restoreEnv("CWF_APP_THREAD_MODEL", previousModel);
      restoreEnv("CWF_APP_THREAD_MODEL_PROVIDER", previousProvider);
      restoreEnv("CWF_APP_THREAD_REASONING_EFFORT", previousEffort);
    }
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

  it("falls back with model-channel diagnostics when app-thread credits are unavailable", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cwf-worker-test-"));
    const previousCodexHome = process.env.CODEX_HOME;
    process.env.CODEX_HOME = dir;
    const sessionPath = join(dir, "sessions", "2026", "06", "07", "rollout-zero-credits.jsonl");
    await mkdir(join(dir, "sessions", "2026", "06", "07"), { recursive: true });
    await writeFile(
      sessionPath,
      [
        JSON.stringify({ type: "turn_context", payload: { turn_id: "turn_other_before", model: "unrelated-before", effort: "high" } }),
        JSON.stringify({ type: "event_msg", payload: { type: "token_count", turn_id: "turn_other_before", rate_limits: { credits: { has_credits: true, balance: "999" } } } }),
        JSON.stringify({ type: "turn_context", payload: { model: "unscoped-model", effort: "xhigh" } }),
        JSON.stringify({ type: "event_msg", payload: { type: "token_count", rate_limits: { credits: { has_credits: false, balance: "777" } } } }),
        JSON.stringify({ type: "event_msg", payload: { type: "task_complete", last_agent_message: "unscoped" } }),
        JSON.stringify({ type: "turn_context", payload: { turn_id: "turn_zero_credits", model: "gpt-5.4-mini", effort: "low" } }),
        JSON.stringify({ type: "event_msg", payload: { type: "token_count", turn_id: "turn_zero_credits", rate_limits: { credits: { has_credits: false, balance: "0" } } } }),
        JSON.stringify({ type: "event_msg", payload: { type: "task_complete", turn_id: "turn_zero_credits", last_agent_message: null } }),
        JSON.stringify({ type: "turn_context", payload: { turn_id: "turn_other_after", model: "unrelated-after", effort: "xhigh" } }),
        JSON.stringify({ type: "event_msg", payload: { type: "token_count", turn_id: "turn_other_after", rate_limits: { credits: { has_credits: true, balance: "1000" } } } }),
      ].join("\n"),
    );
    try {
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
          appServer: new ZeroCreditsWorkerAppServer(sessionPath),
          capability: availableCapability(),
        },
        fallbackRegistry(),
      );

      expect(result.status).toBe("completed");
      expect(result.runtime?.adapter).toBe("codex-sdk-headless");
      expect(result.runtime?.fallback_reason).toContain("quota_unavailable=true");
      expect(result.runtime?.fallback_reason).not.toContain("balance=0");
      expect(result.runtime?.fallback_reason).not.toContain("unrelated-before");
      expect(result.runtime?.fallback_reason).not.toContain("unrelated-after");
      expect(result.runtime?.fallback_reason).not.toContain("unscoped-model");
      expect(result.runtime?.fallback_reason).not.toContain("balance=777");
      expect(result.runtime?.fallback_reason).toContain("model=gpt-5.4-mini");
      expect(result.runtime?.fallback_reason).toContain("session_log=rollout-zero-credits.jsonl");
      expect(result.runtime?.fallback_reason).not.toContain(dir);
    } finally {
      restoreEnv("CODEX_HOME", previousCodexHome);
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not read app-thread diagnostics from paths outside Codex sessions", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cwf-worker-test-"));
    const outsidePath = join(dir, "rollout-outside.jsonl");
    await writeFile(
      outsidePath,
      [
        JSON.stringify({ type: "turn_context", payload: { turn_id: "turn_zero_credits", model: "gpt-5.4-mini", effort: "low" } }),
        JSON.stringify({ type: "event_msg", payload: { type: "token_count", turn_id: "turn_zero_credits", rate_limits: { credits: { has_credits: false, balance: "0" } } } }),
        JSON.stringify({ type: "event_msg", payload: { type: "task_complete", turn_id: "turn_zero_credits", last_agent_message: null } }),
      ].join("\n"),
    );
    try {
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
          appServer: new ZeroCreditsWorkerAppServer(outsidePath),
          capability: availableCapability(),
        },
        fallbackRegistry(),
      );

      expect(result.status).toBe("completed");
      expect(result.runtime?.fallback_reason).toContain("session_log=rollout-outside.jsonl");
      expect(result.runtime?.fallback_reason).not.toContain("quota_unavailable=true");
      expect(result.runtime?.fallback_reason).not.toContain("model=gpt-5.4-mini");
      expect(result.runtime?.fallback_reason).not.toContain(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not follow symlinked app-thread diagnostics outside Codex sessions", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cwf-worker-symlink-"));
    const outsidePath = join(dir, "outside-secret.jsonl");
    const linkedPath = join(dir, "sessions", "2026", "06", "07", "linked.jsonl");
    await mkdir(join(dir, "sessions", "2026", "06", "07"), { recursive: true });
    await writeFile(
      outsidePath,
      [
        JSON.stringify({ type: "turn_context", payload: { turn_id: "turn_zero_credits", model: "outside-secret-model", effort: "low" } }),
        JSON.stringify({ type: "event_msg", payload: { type: "token_count", turn_id: "turn_zero_credits", rate_limits: { credits: { has_credits: false, balance: "0" } } } }),
      ].join("\n"),
    );
    await symlink(outsidePath, linkedPath);
    try {
      await withEnv({ CODEX_HOME: dir }, async () => {
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
            appServer: new ZeroCreditsWorkerAppServer(linkedPath),
            capability: availableCapability(),
          },
          fallbackRegistry(),
        );

        expect(result.status).toBe("completed");
        expect(result.runtime?.fallback_reason).toContain("session_log=linked.jsonl");
        expect(result.runtime?.fallback_reason).not.toContain("outside-secret-model");
        expect(result.runtime?.fallback_reason).not.toContain("quota_unavailable=true");
        expect(result.runtime?.fallback_reason).not.toContain(outsidePath);
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("limits app-thread diagnostics to a safe session-log tail", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cwf-worker-tail-"));
    const sessionPath = join(dir, "sessions", "2026", "06", "07", "rollout-tail.jsonl");
    await mkdir(join(dir, "sessions", "2026", "06", "07"), { recursive: true });
    const unrelated = Array.from({ length: 40 }, (_, index) => JSON.stringify({
      type: "turn_context",
      payload: { turn_id: `turn_unrelated_${index}`, model: `unrelated-model-${index}`, effort: "high" },
    }));
    await writeFile(
      sessionPath,
      [
        ...unrelated,
        JSON.stringify({ type: "turn_context", payload: { turn_id: "turn_zero_credits", model: "gpt-tail-target", effort: "low" } }),
        JSON.stringify({ type: "event_msg", payload: { type: "token_count", turn_id: "turn_zero_credits", rate_limits: { credits: { has_credits: false, balance: "0" } } } }),
        JSON.stringify({ type: "event_msg", payload: { type: "task_complete", turn_id: "turn_zero_credits", last_agent_message: null } }),
      ].join("\n"),
    );
    try {
      await withEnv(
        {
          CODEX_HOME: dir,
          CWF_APP_THREAD_DIAGNOSTICS_MAX_BYTES: "700",
        },
        async () => {
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
              appServer: new ZeroCreditsWorkerAppServer(sessionPath),
              capability: availableCapability(),
            },
            fallbackRegistry(),
          );

          expect(result.status).toBe("completed");
          expect(result.runtime?.fallback_reason).toContain("model=gpt-tail-target");
          expect(result.runtime?.fallback_reason).toContain("quota_unavailable=true");
          expect(result.runtime?.fallback_reason).not.toContain("balance=0");
          expect(result.runtime?.fallback_reason).not.toContain("unrelated-model-0");
          expect(result.runtime?.fallback_reason).not.toContain(dir);
        },
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
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
      expect(result.runtime?.fallback_reason).toMatch(/thread\/start timed out after \d+ms/);
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
    expect(result.runtime?.fallback_reason).toContain("thread-read-failed");
    expect(result.runtime?.fallback_reason).not.toContain("fake thread/read failed");
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
  threadStartParams: unknown[] = [];
  turnStartParams: unknown[] = [];

  async request(method: string, params?: unknown): Promise<unknown> {
    this.methods.push(method);
    if (method === "thread/start") {
      this.threadStartParams.push(params);
      return { thread: { id: "thread_correctness" } };
    }
    if (method === "thread/name/set") {
      this.threadName = (params as { name?: string }).name ?? "";
      return {};
    }
    if (method === "turn/start") {
      this.turnStartParams.push(params);
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

class ZeroCreditsWorkerAppServer {
  constructor(private readonly sessionPath: string) {}

  async request(method: string): Promise<unknown> {
    if (method === "thread/start") {
      return { thread: { id: "thread_zero_credits" } };
    }
    if (method === "turn/start") {
      return { turn: { id: "turn_zero_credits" } };
    }
    if (method === "thread/read") {
      return {
        thread: {
          id: "thread_zero_credits",
          status: { type: "systemError" },
          path: this.sessionPath,
          turns: [{ id: "turn_zero_credits" }],
        },
      };
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
  threadStartParams: unknown[] = [];
  turnStartParams: unknown[] = [];

  async request(method: string, params?: unknown): Promise<unknown> {
    if (method === "thread/start") {
      this.threadStarts += 1;
      this.threadStartParams.push(params);
      if (this.threadStarts > 1) {
        this.workerThreadStarted = true;
        return { thread: { id: "thread_worker_after_probe" } };
      }
      return { thread: { id: "thread_json_probe" } };
    }
    if (method === "turn/start") {
      this.turnStartParams.push(params);
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

async function withEnv(values: Record<string, string | undefined>, run: () => Promise<void>): Promise<void> {
  const previous = Object.fromEntries(Object.keys(values).map((name) => [name, process.env[name]])) as Record<string, string | undefined>;
  try {
    for (const [name, value] of Object.entries(values)) {
      restoreEnv(name, value);
    }
    await run();
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      restoreEnv(name, value);
    }
  }
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

async function withAppThreadModelEnv(values: Record<string, string | undefined>, run: () => Promise<void>): Promise<void> {
  const names = ["CWF_APP_THREAD_MODEL", "CWF_APP_THREAD_MODEL_PROVIDER", "CWF_APP_THREAD_REASONING_EFFORT"];
  await withEnv(Object.fromEntries(names.map((name) => [name, values[name]])), run);
}

function fakeStdioWorkerAppServerScript(): string {
  return `#!/usr/bin/env node
import { appendFileSync } from "node:fs";

const logPath = process.env.CWF_FAKE_STDIO_LOG;
let buffer = "";
let mode = "worker";

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
    if (logPath) appendFileSync(logPath, message.method + " " + JSON.stringify(message.params ?? {}) + "\\n");
    let result = {};
    if (message.method === "thread/start") {
      result = { thread: { id: "thread_stdio" } };
    }
    if (message.method === "turn/start") {
      mode = message.params?.outputSchema ? "probe" : "worker";
      result = { turn: { id: mode === "probe" ? "turn_stdio_probe" : "turn_stdio_worker" } };
    }
    if (message.method === "thread/read") {
      if (mode === "probe") {
        result = {
          thread: {
            id: "thread_stdio",
            turns: [
              {
                id: "turn_stdio_probe",
                finalResponse: "{\\"probe\\":\\"cwf-app-thread-ok\\"}"
              }
            ]
          }
        };
      } else {
      result = {
        thread: {
          id: "thread_stdio",
          turns: [
            {
              id: "turn_stdio_worker",
              finalResponse: JSON.stringify({
                worker_id: "correctness",
                summary: "stdio app-thread ok",
                findings: [],
                verification: ["stdio transport selected by adapter default"],
                artifacts: [],
                confidence: "high"
              })
            }
          ]
        }
      };
      }
    }
    process.stdout.write(JSON.stringify({ id: message.id, result }) + "\\n");
  }
});
`;
}

async function startFakeWorkerWebSocketAppServer(socketPath: string): Promise<{ methods: string[]; close(): Promise<void> }> {
  const methods: string[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    handleFakeWorkerWebSocket(socket, methods);
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

function handleFakeWorkerWebSocket(socket: Socket, methods: string[]): void {
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
    buffer = readFakeWorkerFrames(socket, buffer, methods);
  });
}

function readFakeWorkerFrames(socket: Socket, input: Buffer, methods: string[]): Buffer {
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
      handleFakeWorkerMessage(socket, payload.toString("utf8"), methods);
    } else if (opcode === 0x8) {
      writeFakeWorkerFrame(socket, 0x8, Buffer.alloc(0));
      socket.end();
      return buffer;
    }
  }
  return buffer;
}

function handleFakeWorkerMessage(socket: Socket, raw: string, methods: string[]): void {
  const message = JSON.parse(raw) as { id?: number; method?: string };
  if (typeof message.id !== "number" || !message.method) {
    return;
  }
  methods.push(message.method);
  let result: unknown = {};
  if (message.method === "thread/start") {
    result = { thread: { id: "thread_daemon_worker" } };
  }
  if (message.method === "turn/start") {
    result = { turn: { id: "turn_daemon_worker" } };
  }
  if (message.method === "thread/read") {
    result = {
      thread: {
        id: "thread_daemon_worker",
        turns: [
          {
            id: "turn_daemon_worker",
            finalResponse: JSON.stringify({
              worker_id: "correctness",
              summary: "daemon app-thread ok",
              findings: [],
              verification: ["daemon transport selected by explicit env"],
              artifacts: [],
              confidence: "high",
            }),
          },
        ],
      },
    };
  }
  writeFakeWorkerFrame(socket, 0x1, Buffer.from(JSON.stringify({ id: message.id, result }), "utf8"));
}

function writeFakeWorkerFrame(socket: Socket, opcode: number, payload: Buffer): void {
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
      "thread/read": true,
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
