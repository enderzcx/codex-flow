import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { RunStore } from "../src/run-store.js";
import type { WorkflowSpec } from "../src/types.js";

const cleanup: string[] = [];

const spec: WorkflowSpec = {
  id: "diff-review",
  version: "0.1.0",
  requires: { target: "git-repo" },
  defaults: { sandbox: "read-only", timeout_ms: 300000 },
  phases: [
    { id: "collect", kind: "command" },
    {
      id: "review",
      kind: "codex-parallel",
      workers: [
        { id: "correctness", perspective: "correctness", prompt: "review" },
        { id: "tests", perspective: "tests", prompt: "review" },
        { id: "safety", perspective: "safety", prompt: "review" },
      ],
    },
    { id: "reduce", kind: "reducer", reducer: "diff-review" },
  ],
  artifacts: ["result.md"],
};

afterEach(async () => {
  while (cleanup.length > 0) {
    const path = cleanup.pop();
    if (path) {
      await rm(path, { recursive: true, force: true });
    }
  }
});

describe("RunStore", () => {
  it("creates state and event files", async () => {
    const root = await mkdtemp(join(tmpdir(), "cwf-runs-"));
    cleanup.push(root);
    const store = await RunStore.create(spec, process.cwd(), root);
    await store.updatePhase("collect", "completed");
    const state = await store.readState();
    const events = await readFile(join(store.runDir, "events.jsonl"), "utf8");

    expect(state.workflow).toBe("diff-review");
    expect(state.phases.find((phase) => phase.id === "collect")?.status).toBe("completed");
    expect(events).toContain("run.created");
    expect(events).toContain("phase.updated");
  });

  it("cancels pending phases and workers", async () => {
    const root = await mkdtemp(join(tmpdir(), "cwf-runs-"));
    cleanup.push(root);
    const store = await RunStore.create(spec, process.cwd(), root);
    await store.updatePhase("collect", "running");

    const cancelled = await store.cancel();
    const state = await store.readState();

    expect(cancelled.status).toBe("cancelled");
    expect(state.phases.find((phase) => phase.id === "collect")?.status).toBe("cancelled");
    expect(state.workers.every((worker) => worker.status === "cancelled")).toBe(true);
  });

  it("records background process metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "cwf-runs-"));
    cleanup.push(root);
    const store = await RunStore.create(spec, process.cwd(), root);

    await store.markBackground(12345, join(store.runDir, "run.log"));
    const state = await store.readState();
    const events = await readFile(join(store.runDir, "events.jsonl"), "utf8");

    expect(state.background_pid).toBe(12345);
    expect(state.log_path).toBe(join(store.runDir, "run.log"));
    expect(events).toContain("run.background_started");
  });

  it("preserves concurrent worker state updates", async () => {
    const root = await mkdtemp(join(tmpdir(), "cwf-runs-"));
    cleanup.push(root);
    const store = await RunStore.create(spec, process.cwd(), root);

    await Promise.all([
      store.updateWorker("correctness", "running"),
      store.updateWorker("tests", "running"),
      store.updateWorker("safety", "running"),
    ]);
    const state = await store.readState();

    expect(state.workers.map((worker) => [worker.id, worker.status])).toEqual([
      ["correctness", "running"],
      ["tests", "running"],
      ["safety", "running"],
    ]);
  });
});
