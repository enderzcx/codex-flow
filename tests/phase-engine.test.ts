import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { executeWorkflow, type WorkerRunner, type WriteRunner } from "../src/phase-engine.js";
import { RunStore } from "../src/run-store.js";
import type { ArtifactManifest, WorkflowSpec } from "../src/types.js";

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
      confidence: "low",
      summary: "mock Codex SDK unreachable",
      findings: [],
      verification: [],
      artifacts: [],
      started_at: "2026-01-01T00:00:00.000Z",
      completed_at: "2026-01-01T00:00:01.000Z",
      duration_ms: 1000,
      prompt: `mock ${worker.id}`,
      raw: "",
      raw_fallback: false,
      retry_count: 0,
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
    ).rejects.toThrow("All Codex workers failed");

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
    expect(events).toContain("All Codex workers failed");
    expect(correctness).toContain("mock Codex SDK unreachable");
  });

  it("pauses at a gate and explains the pending approval", async () => {
    const target = await createGitRepoWithDiff();
    const runsRoot = await mkdtemp(join(tmpdir(), "cwf-runs-"));
    cleanup.push(runsRoot);
    const gated = createGatedSpec();
    const store = await RunStore.create(gated, target, runsRoot);

    await executeWorkflow({
      spec: gated,
      specPath: "fixtures/workflows/gated-diff-review.yaml",
      target,
      store,
      workerRunner: successfulRunner,
    });

    const state = await store.readState();
    const events = await readFile(join(store.runDir, "events.jsonl"), "utf8");

    expect(state.status).toBe("waiting");
    expect(state.phases.find((phase) => phase.id === "collect")?.status).toBe("completed");
    expect(state.phases.find((phase) => phase.id === "approve-review")?.status).toBe("waiting");
    expect(state.phases.find((phase) => phase.id === "review")?.status).toBe("pending");
    expect(events).toContain("gate.waiting");
  });

  it("approves and resumes without rerunning completed phases", async () => {
    const target = await createGitRepoWithDiff();
    const runsRoot = await mkdtemp(join(tmpdir(), "cwf-runs-"));
    cleanup.push(runsRoot);
    const gated = createGatedSpec();
    const store = await RunStore.create(gated, target, runsRoot);

    await executeWorkflow({
      spec: gated,
      specPath: "fixtures/workflows/gated-diff-review.yaml",
      target,
      store,
      workerRunner: successfulRunner,
    });
    await store.approveGate("approve-review");
    await executeWorkflow({
      spec: gated,
      specPath: "fixtures/workflows/gated-diff-review.yaml",
      target,
      store,
      workerRunner: successfulRunner,
      resume: true,
    });

    const state = await store.readState();
    const events = await readFile(join(store.runDir, "events.jsonl"), "utf8");

    expect(state.status).toBe("completed");
    expect(state.gate_decisions).toEqual([
      expect.objectContaining({ gate_id: "approve-review", decision: "approved" }),
    ]);
    expect(state.phases.map((phase) => [phase.id, phase.status])).toEqual([
      ["collect", "completed"],
      ["approve-review", "approved"],
      ["review", "completed"],
      ["reduce", "completed"],
    ]);
    const eventTypes = events.trim().split(/\r?\n/).map((line) => (JSON.parse(line) as { type: string }).type);
    expect(eventTypes.filter((type) => type === "collect.context")).toHaveLength(1);
    expect(events).toContain("gate.approved");
    expect(events).toContain("run.completed");
  });

  it("writes reduced result and artifact manifest for completed runs", async () => {
    const target = await createGitRepoWithDiff();
    const runsRoot = await mkdtemp(join(tmpdir(), "cwf-runs-"));
    cleanup.push(runsRoot);
    const store = await RunStore.create(spec, target, runsRoot);
    await store.markBackground(12345, join(store.runDir, "run.log"));

    await executeWorkflow({
      spec,
      specPath: "workflows/diff-review.yaml",
      target,
      store,
      workerRunner: successfulRunner,
    });

    const state = await store.readState();
    const manifest = JSON.parse(await readFile(join(store.runDir, "artifacts", "manifest.json"), "utf8")) as ArtifactManifest;
    const reduced = await readFile(join(store.runDir, "artifacts", "reduced-result.json"), "utf8");

    expect(state.status).toBe("completed");
    expect(state.artifact_manifest_path).toBe(join(store.runDir, "artifacts", "manifest.json"));
    expect(manifest).toEqual(expect.objectContaining({ version: 1, run_id: store.runId, workflow: "diff-review" }));
    expect(manifest.artifacts.map((artifact) => artifact.id)).toEqual(
      expect.arrayContaining(["workflow", "state", "events", "context", "worker:correctness", "worker:tests", "worker:safety", "reduced-result", "result", "manifest", "log"]),
    );
    expect(reduced).toContain('"worker_provenance"');
    expect(reduced).toContain('"artifacts"');
  });

  it("rejects a waiting gate and blocks resume", async () => {
    const target = await createGitRepoWithDiff();
    const runsRoot = await mkdtemp(join(tmpdir(), "cwf-runs-"));
    cleanup.push(runsRoot);
    const gated = createGatedSpec();
    const store = await RunStore.create(gated, target, runsRoot);

    await executeWorkflow({
      spec: gated,
      specPath: "fixtures/workflows/gated-diff-review.yaml",
      target,
      store,
      workerRunner: successfulRunner,
    });
    await store.rejectGate("approve-review", "not safe");

    await expect(
      executeWorkflow({
        spec: gated,
        specPath: "fixtures/workflows/gated-diff-review.yaml",
        target,
        store,
        workerRunner: successfulRunner,
        resume: true,
      }),
    ).rejects.toThrow("was rejected and cannot be resumed");

    const state = await store.readState();
    const events = await readFile(join(store.runDir, "events.jsonl"), "utf8");

    expect(state.status).toBe("rejected");
    expect(state.phases.find((phase) => phase.id === "approve-review")?.status).toBe("rejected");
    expect(state.gate_decisions).toEqual([
      expect.objectContaining({ gate_id: "approve-review", decision: "rejected", reason: "not safe" }),
    ]);
    expect(events).toContain("gate.rejected");
  });

  it("pauses a write-capable workflow after producing preview artifacts", async () => {
    const target = await createGitRepoWithDiff();
    const runsRoot = await mkdtemp(join(tmpdir(), "cwf-runs-"));
    cleanup.push(runsRoot);
    const writeSpec = createGatedWriteSpec();
    const store = await RunStore.create(writeSpec, target, runsRoot);

    await executeWorkflow({
      spec: writeSpec,
      specPath: "fixtures/workflows/gated-doc-refresh.yaml",
      target,
      store,
    });

    const state = await store.readState();
    const writePlan = await readFile(join(store.runDir, "artifacts", "write-plan.md"), "utf8");
    const preview = await readFile(join(store.runDir, "artifacts", "dry-run-preview.md"), "utf8");
    const status = await gitOutput(target, ["status", "--short"]);

    expect(state.status).toBe("waiting");
    expect(state.phases.map((phase) => [phase.id, phase.status])).toEqual([
      ["collect", "completed"],
      ["preview-write", "completed"],
      ["approve-write", "waiting"],
      ["review", "pending"],
      ["reduce", "pending"],
    ]);
    expect(writePlan).toContain("This preview phase does not modify target files.");
    expect(preview).toContain("No target files were modified by this preview.");
    expect(status).not.toContain("docs/codex-flow-v14-fixture.md");
  });

  it("approves and resumes a write-capable workflow with rollback evidence", async () => {
    const target = await createGitRepoWithDiff();
    const runsRoot = await mkdtemp(join(tmpdir(), "cwf-runs-"));
    cleanup.push(runsRoot);
    const writeSpec = createGatedWriteSpec();
    const store = await RunStore.create(writeSpec, target, runsRoot);

    await executeWorkflow({
      spec: writeSpec,
      specPath: "fixtures/workflows/gated-doc-refresh.yaml",
      target,
      store,
    });
    await store.approveGate("approve-write");
    await executeWorkflow({
      spec: writeSpec,
      specPath: "fixtures/workflows/gated-doc-refresh.yaml",
      target,
      store,
      resume: true,
      writeRunner: fixtureWriteRunner,
    });

    const state = await store.readState();
    const writtenDoc = await readFile(join(target, "docs", "codex-flow-v14-fixture.md"), "utf8");
    const manifest = JSON.parse(await readFile(join(store.runDir, "artifacts", "manifest.json"), "utf8")) as ArtifactManifest;
    const worker = await readFile(join(store.runDir, "workers", "doc-refresh.json"), "utf8");
    const rollback = await readFile(join(store.runDir, "artifacts", "rollback.md"), "utf8");
    const verification = await readFile(join(store.runDir, "artifacts", "verification.md"), "utf8");

    expect(state.status).toBe("completed");
    expect(writtenDoc).toContain("Codex Flow v1.4 fixture");
    expect(worker).toContain('"sandbox": "workspace-write"');
    expect(worker).toContain('"approval_policy": "never"');
    expect(rollback).toContain("git restore <changed-file>");
    expect(verification).toContain("test -f docs/codex-flow-v14-fixture.md");
    expect(manifest.artifacts.map((artifact) => artifact.id)).toEqual(
      expect.arrayContaining(["write-plan", "dry-run-preview", "diff-summary", "rollback", "verification", "worker:doc-refresh"]),
    );
  });

  it("rejects a write-capable workflow before target writes", async () => {
    const target = await createGitRepoWithDiff();
    const runsRoot = await mkdtemp(join(tmpdir(), "cwf-runs-"));
    cleanup.push(runsRoot);
    const writeSpec = createGatedWriteSpec();
    const store = await RunStore.create(writeSpec, target, runsRoot);

    await executeWorkflow({
      spec: writeSpec,
      specPath: "fixtures/workflows/gated-doc-refresh.yaml",
      target,
      store,
    });
    await store.rejectGate("approve-write", "skip write");

    await expect(
      executeWorkflow({
        spec: writeSpec,
        specPath: "fixtures/workflows/gated-doc-refresh.yaml",
        target,
        store,
        resume: true,
        writeRunner: fixtureWriteRunner,
      }),
    ).rejects.toThrow("was rejected and cannot be resumed");

    const state = await store.readState();
    const status = await gitOutput(target, ["status", "--short"]);

    expect(state.status).toBe("rejected");
    expect(status).not.toContain("docs/codex-flow-v14-fixture.md");
  });

  it("fails a write-capable workflow if the target diff changed after preview", async () => {
    const target = await createGitRepoWithDiff();
    const runsRoot = await mkdtemp(join(tmpdir(), "cwf-runs-"));
    cleanup.push(runsRoot);
    const writeSpec = createGatedWriteSpec();
    const store = await RunStore.create(writeSpec, target, runsRoot);

    await executeWorkflow({
      spec: writeSpec,
      specPath: "fixtures/workflows/gated-doc-refresh.yaml",
      target,
      store,
    });
    await store.approveGate("approve-write");
    await writeFile(join(target, "src", "calc.js"), "export const answer = 99;\n");

    await expect(
      executeWorkflow({
        spec: writeSpec,
        specPath: "fixtures/workflows/gated-doc-refresh.yaml",
        target,
        store,
        resume: true,
        writeRunner: fixtureWriteRunner,
      }),
    ).rejects.toThrow("Target repo diff changed after write preview");

    const status = await gitOutput(target, ["status", "--short"]);
    expect(status).not.toContain("docs/codex-flow-v14-fixture.md");
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

async function gitOutput(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout;
}

function createGatedSpec(): WorkflowSpec {
  return {
    ...spec,
    version: "0.4.0-fixture",
    phases: [
      { id: "collect", kind: "command" },
      { id: "approve-review", kind: "gate", prompt: "Review the collected diff before continuing.", requires_approval: true },
      ...spec.phases.slice(1),
    ],
  };
}

function createGatedWriteSpec(): WorkflowSpec {
  return {
    id: "doc-refresh",
    version: "1.4.0-fixture",
    title: "Gated Doc Refresh Fixture",
    tags: ["write-capable", "fixture"],
    inputs: {
      target: { type: "path", required: true },
    },
    capabilities: { writes: true },
    requires: { target: "git-repo" },
    defaults: { sandbox: "read-only", timeout_ms: 300000 },
    phases: [
      { id: "collect", kind: "command" },
      { id: "preview-write", kind: "write-preview", prompt: "Prepare fixture documentation refresh." },
      { id: "approve-write", kind: "gate", prompt: "Approve fixture documentation write.", requires_approval: true },
      {
        id: "review",
        kind: "codex-write",
        writes: true,
        worker: {
          id: "doc-refresh",
          perspective: "documentation write",
          prompt: "Create docs/codex-flow-v14-fixture.md with a short fixture note.",
          writes: true,
        },
      },
      { id: "reduce", kind: "reducer", reducer: "diff-review" },
    ],
    artifacts: ["result.md"],
  };
}

const successfulRunner: WorkerRunner = async (worker) => ({
  worker_id: worker.id,
  status: "completed",
  confidence: "high",
  summary: "ok",
  findings: [],
  verification: [],
  artifacts: [],
  started_at: "2026-01-01T00:00:00.000Z",
  completed_at: "2026-01-01T00:00:01.000Z",
  duration_ms: 1000,
  prompt: `mock ${worker.id}`,
  raw: JSON.stringify({
    worker_id: worker.id,
    summary: "ok",
    findings: [],
    verification: [],
    artifacts: [],
    confidence: "high",
  }),
  raw_fallback: false,
  retry_count: 0,
});

const fixtureWriteRunner: WriteRunner = async (worker, _context, options) => {
  await mkdir(join(options.target, "docs"), { recursive: true });
  await writeFile(join(options.target, "docs", "codex-flow-v14-fixture.md"), "# Codex Flow v1.4 fixture\n\nApproved write smoke.\n");
  return {
    worker_id: worker.id,
    status: "completed",
    confidence: "high",
    summary: "fixture write completed",
    findings: [],
    verification: ["test -f docs/codex-flow-v14-fixture.md"],
    artifacts: ["docs/codex-flow-v14-fixture.md"],
    started_at: "2026-01-01T00:00:00.000Z",
    completed_at: "2026-01-01T00:00:01.000Z",
    duration_ms: 1000,
    prompt: `mock write ${worker.id}`,
    raw: JSON.stringify({
      worker_id: worker.id,
      summary: "fixture write completed",
      findings: [],
      verification: ["test -f docs/codex-flow-v14-fixture.md"],
      artifacts: ["docs/codex-flow-v14-fixture.md"],
      confidence: "high",
    }),
    raw_fallback: false,
    retry_count: 0,
    runtime: {
      adapter: "codex-sdk-headless",
      fallback_used: false,
      agent_role: worker.perspective,
      transcript_read: false,
      sandbox: "workspace-write",
      approval_policy: "never",
      worktree_path: options.target,
    },
  };
};
