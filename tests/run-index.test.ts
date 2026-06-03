import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_FAILURE_POLICY,
  ensureRunIndex,
  indexPathForRunsRoot,
  latestRun,
  listRuns,
  rebuildRunIndex,
  showRun,
} from "../src/run-index.js";
import type { RunState } from "../src/types.js";

const cleanup: string[] = [];

afterEach(async () => {
  while (cleanup.length > 0) {
    const path = cleanup.pop();
    if (path) {
      await rm(path, { recursive: true, force: true });
    }
  }
});

describe("run discovery index", () => {
  it("creates and rebuilds index data from run folders", async () => {
    const { base, runsRoot, indexPath } = await createDiscoveryRoot();
    await writeState(runsRoot, createState({ id: "run_a", created_at: "2026-01-01T00:00:00.000Z" }));
    await writeState(runsRoot, createState({ id: "run_b", created_at: "2026-01-02T00:00:00.000Z" }));

    const rebuilt = await rebuildRunIndex({ runsRoot, indexPath });
    const raw = await readFile(join(base, "index.json"), "utf8");

    expect(rebuilt.runs.map((run) => run.id)).toEqual(["run_b", "run_a"]);
    expect(raw).toContain("run_a");
    expect(raw).toContain("run_b");
  });

  it("recovers when the index is missing or corrupt", async () => {
    const { runsRoot, indexPath } = await createDiscoveryRoot();
    await writeState(runsRoot, createState({ id: "run_rebuilt" }));

    const missing = await ensureRunIndex({ runsRoot, indexPath });
    await writeFile(indexPath, "{not json");
    const corrupt = await ensureRunIndex({ runsRoot, indexPath });

    expect(missing.runs.map((run) => run.id)).toEqual(["run_rebuilt"]);
    expect(corrupt.runs.map((run) => run.id)).toEqual(["run_rebuilt"]);
  });

  it("rebuilds stale indexes when run folders change", async () => {
    const { runsRoot, indexPath } = await createDiscoveryRoot();
    await writeState(runsRoot, createState({ id: "run_first" }));
    await ensureRunIndex({ runsRoot, indexPath });
    await writeState(runsRoot, createState({ id: "run_second", created_at: "2026-01-02T00:00:00.000Z" }));

    const index = await ensureRunIndex({ runsRoot, indexPath });

    expect(index.runs.map((run) => run.id)).toEqual(["run_second", "run_first"]);
  });

  it("filters by status and target, limits results, and returns latest", async () => {
    const { runsRoot, indexPath } = await createDiscoveryRoot();
    const targetA = resolve("/tmp/target-a");
    const targetB = resolve("/tmp/target-b");
    await writeState(runsRoot, createState({ id: "run_a1", target: targetA, status: "completed", created_at: "2026-01-01T00:00:00.000Z" }));
    await writeState(runsRoot, createState({ id: "run_a2", target: targetA, status: "failed", created_at: "2026-01-03T00:00:00.000Z" }));
    await writeState(runsRoot, createState({ id: "run_b1", target: targetB, status: "completed", created_at: "2026-01-02T00:00:00.000Z" }));

    const failed = await listRuns({ runsRoot, indexPath, status: "failed" });
    const targetRuns = await listRuns({ runsRoot, indexPath, target: targetA, limit: 1 });
    const latest = await latestRun({ runsRoot, indexPath, target: targetA });

    expect(failed.map((run) => run.id)).toEqual(["run_a2"]);
    expect(targetRuns.map((run) => run.id)).toEqual(["run_a2"]);
    expect(latest?.id).toBe("run_a2");
  });

  it("shows a normalized run state with default failure metadata", async () => {
    const { runsRoot, indexPath } = await createDiscoveryRoot();
    await writeState(runsRoot, createState({ id: "run_show" }));

    const state = await showRun("run_show", { runsRoot, indexPath });

    expect(state.id).toBe("run_show");
    expect(state.failure_policy).toEqual(DEFAULT_FAILURE_POLICY);
  });
});

async function createDiscoveryRoot(): Promise<{ base: string; runsRoot: string; indexPath: string }> {
  const base = await mkdtemp(join(tmpdir(), "cwf-index-"));
  cleanup.push(base);
  const runsRoot = join(base, "runs");
  await mkdir(runsRoot, { recursive: true });
  return { base, runsRoot, indexPath: indexPathForRunsRoot(runsRoot) };
}

async function writeState(runsRoot: string, state: RunState): Promise<void> {
  const runDir = join(runsRoot, state.id);
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, "state.json"), `${JSON.stringify({ ...state, run_dir: runDir }, null, 2)}\n`);
}

function createState(overrides: Partial<RunState> = {}): RunState {
  return {
    id: "run_test",
    workflow: "diff-review",
    status: "running",
    target: resolve("/tmp/repo"),
    run_dir: "/tmp/cwf/run_test",
    failure_policy: DEFAULT_FAILURE_POLICY,
    gate_decisions: [],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    phases: [
      { id: "collect", status: "pending" },
      { id: "review", status: "pending" },
      { id: "reduce", status: "pending" },
    ],
    workers: [],
    ...overrides,
  };
}
