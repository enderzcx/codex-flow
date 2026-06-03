import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { executeWorkflow, type WorkerRunner } from "../src/phase-engine.js";
import { RunStore } from "../src/run-store.js";
import type { WorkflowSpec } from "../src/types.js";
import { listWorkflowEntries, resolveWorkflowReference } from "../src/workflow-registry.js";

const execFileAsync = promisify(execFile);
const cleanup: string[] = [];
const bundledWorkflowIds = ["diff-review", "implementation-plan", "release-review", "repo-audit", "research-crosscheck"];
const exampleWorkflowIds = ["implementation-plan", "release-review", "repo-audit", "research-crosscheck"];

afterEach(async () => {
  while (cleanup.length > 0) {
    const path = cleanup.pop();
    if (path) {
      await rm(path, { recursive: true, force: true });
    }
  }
});

describe("bundled workflow pack", () => {
  it("discovers all bundled workflows through the registry", async () => {
    const entries = await listWorkflowEntries({ cwd: process.cwd(), homeDir: await emptyHome() });

    expect(entries.map((entry) => entry.id)).toEqual(bundledWorkflowIds);
    for (const entry of entries) {
      expect(entry.capabilities.writes).toBe(false);
      expect(entry.tags).toContain("read-only");
    }
  });

  it("keeps example workflows on the shared read-only contract", async () => {
    for (const id of exampleWorkflowIds) {
      const { spec } = await resolveWorkflowReference(id, { cwd: process.cwd(), homeDir: await emptyHome() });

      expect(spec.capabilities.writes).toBe(false);
      expect(spec.defaults.sandbox).toBe("read-only");
      expect(spec.phases.map((phase) => phase.id)).toEqual(["collect", "review", "reduce"]);
      expect(spec.phases.find((phase) => phase.id === "reduce")).toEqual(
        expect.objectContaining({ kind: "reducer", reducer: "diff-review" }),
      );
      expect(JSON.stringify(spec)).not.toContain("writes\":true");
    }
  });

  it.each(exampleWorkflowIds)("runs %s with the shared worker and reducer envelopes", async (id) => {
    const { spec } = await resolveWorkflowReference(id, { cwd: process.cwd(), homeDir: await emptyHome() });
    const target = await createGitRepoWithDiff(id);
    const runsRoot = await mkdtemp(join(tmpdir(), `cwf-${id}-runs-`));
    cleanup.push(runsRoot);
    const store = await RunStore.create(spec, target, runsRoot);

    await executeWorkflow({
      spec,
      specPath: `workflows/${id}.yaml`,
      target,
      store,
      workerRunner: successfulRunner,
    });

    const state = await store.readState();
    const markdown = await readFile(join(store.runDir, "result.md"), "utf8");
    const reduced = JSON.parse(await readFile(join(store.runDir, "artifacts", "reduced-result.json"), "utf8")) as {
      workflow: string;
      worker_provenance: unknown[];
      verification_gaps: unknown[];
      artifacts: unknown[];
    };

    expect(state.status).toBe("completed");
    expect(markdown).toContain(`# codex-workflows ${id}`);
    expect(reduced.workflow).toBe(id);
    expect(reduced.worker_provenance).toHaveLength(reviewWorkerCount(spec));
    expect(reduced.verification_gaps.length).toBeGreaterThan(0);
    expect(reduced.artifacts.length).toBeGreaterThan(0);
  });
});

async function emptyHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), "cwf-pack-home-"));
  cleanup.push(home);
  return home;
}

async function createGitRepoWithDiff(id: string): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), `cwf-${id}-target-`));
  cleanup.push(target);
  await mkdir(join(target, "docs"), { recursive: true });
  await writeFile(join(target, "package.json"), `${JSON.stringify({ name: `fixture-${id}`, version: "0.0.0" }, null, 2)}\n`);
  await writeFile(join(target, "docs", "note.md"), "# Baseline\n\nInitial note.\n");
  await git(target, ["init"]);
  await git(target, ["config", "user.email", "codex-workflows@example.invalid"]);
  await git(target, ["config", "user.name", "codex-workflows"]);
  await git(target, ["add", "."]);
  await git(target, ["commit", "-m", "baseline"]);
  await writeFile(join(target, "docs", "note.md"), `# ${id}\n\nThis change needs verification evidence.\n`);
  return target;
}

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd });
}

function reviewWorkerCount(spec: WorkflowSpec): number {
  const review = spec.phases.find((phase) => phase.id === "review");
  return review?.kind === "codex-parallel" ? review.workers.length : 0;
}

const successfulRunner: WorkerRunner = async (worker) => ({
  worker_id: worker.id,
  status: "completed",
  confidence: "high",
  summary: `ok ${worker.id}`,
  findings: [],
  verification: [`verify ${worker.id}`],
  artifacts: [],
  started_at: "2026-01-01T00:00:00.000Z",
  completed_at: "2026-01-01T00:00:01.000Z",
  duration_ms: 1000,
  prompt: `mock ${worker.id}`,
  raw: "{}",
  raw_fallback: false,
  retry_count: 0,
});
