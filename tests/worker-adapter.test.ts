import { describe, expect, it } from "vitest";
import {
  WorkerAdapterUnavailableError,
  normalizeWorkerRuntimeMetadata,
  runWorkerWithAdapter,
  type WorkerAdapterRegistry,
} from "../src/adapters/worker-adapter.js";
import type { DiffContext, WorkerResult, WorkflowWorker } from "../src/types.js";

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
