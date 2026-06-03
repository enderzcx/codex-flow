import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { executeWorkflow, type WorkerRunner } from "../src/phase-engine.js";
import { RunStore } from "../src/run-store.js";
import type { WorkflowSpec } from "../src/types.js";

const execFileAsync = promisify(execFile);
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
        { id: "correctness", perspective: "correctness", prompt: "review correctness" },
        { id: "tests", perspective: "tests", prompt: "review tests" },
        { id: "safety", perspective: "safety", prompt: "review safety" },
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

describe("executeWorkflow", () => {
  it("records a failed run when all Codex SDK workers fail", async () => {
    const target = await createGitRepoWithDiff();
    const runsRoot = await mkdtemp(join(tmpdir(), "cwf-runs-"));
    cleanup.push(runsRoot);
    const store = await RunStore.create(spec, target, runsRoot);
    const failedRunner: WorkerRunner = async (worker) => ({
      worker_id: worker.id,
      status: "failed",
      started_at: "2026-01-01T00:00:00.000Z",
      completed_at: "2026-01-01T00:00:01.000Z",
      duration_ms: 1000,
      prompt: `mock ${worker.id}`,
      raw: "",
      error: "mock Codex SDK unreachable",
    });

    await expect(
      executeWorkflow({
        spec,
        specPath: "workflows/diff-review.yaml",
        target,
        store,
        workerRunner: failedRunner,
      }),
    ).rejects.toThrow("All Codex SDK workers failed");

    const state = await store.readState();
    const events = await readFile(join(store.runDir, "events.jsonl"), "utf8");
    const correctness = await readFile(join(store.runDir, "workers", "correctness.json"), "utf8");

    expect(state.status).toBe("failed");
    expect(state.failure_policy.worker_failure).toBe("continue_if_any_worker_succeeds");
    expect(state.failure_summary?.title).toBe("review phase failed");
    expect(state.failure_summary?.failed_workers).toEqual(["correctness", "tests", "safety"]);
    expect(state.phases.find((phase) => phase.id === "collect")?.status).toBe("completed");
    expect(state.phases.find((phase) => phase.id === "review")?.status).toBe("failed");
    expect(state.phases.find((phase) => phase.id === "reduce")?.status).toBe("pending");
    expect(state.workers.every((worker) => worker.status === "failed")).toBe(true);
    expect(events).toContain("run.failed");
    expect(events).toContain("All Codex SDK workers failed");
    expect(correctness).toContain("mock Codex SDK unreachable");
  });
});

async function createGitRepoWithDiff(): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "cwf-target-"));
  cleanup.push(target);
  await mkdir(join(target, "src"), { recursive: true });
  await writeFile(join(target, "package.json"), `${JSON.stringify({ name: "fixture", version: "0.0.0" }, null, 2)}\n`);
  await writeFile(join(target, "src", "calc.js"), "export const answer = 42;\n");
  await git(target, ["init"]);
  await git(target, ["config", "user.email", "codex-workflows@example.invalid"]);
  await git(target, ["config", "user.name", "codex-workflows"]);
  await git(target, ["add", "."]);
  await git(target, ["commit", "-m", "baseline"]);
  await writeFile(join(target, "src", "calc.js"), "export const answer = 0;\n");
  return target;
}

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd });
}
