import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  resumeDynamicWorkflow,
  startDynamicWorkflow,
  validateDynamicWorkflowSource,
  type DynamicWorkerRunner,
} from "../src/dynamic-workflow.js";
import type { ArtifactManifest, WorkerResult } from "../src/types.js";

const execFileAsync = promisify(execFile);
const cleanup: string[] = [];

afterEach(async () => {
  while (cleanup.length > 0) {
    const path = cleanup.pop();
    if (path) {
      await rm(path, { recursive: true, force: true });
    }
  }
});

describe("dynamic workflow AST policy", () => {
  it.each([
    ["import fs from 'node:fs'; export default async function workflow(cwf) { return cwf.report.summarize([]); }", "imports"],
    ["export default async function workflow(cwf) { return process.env.HOME; }", "process"],
    ["export default async function workflow(cwf) { return globalThis.process; }", "globalThis"],
    ["export default async function workflow(cwf) { return (() => {}).constructor('return process')(); }", "constructor"],
    ["export default async function workflow(cwf) { return fetch('https://example.com'); }", "fetch"],
    ["export default async function workflow(cwf) { setTimeout(() => cwf.report.summarize([]), 0); }", "setTimeout"],
    ["export default async function workflow(cwf) { queueMicrotask(() => cwf.report.summarize([])); }", "queueMicrotask"],
    ["export default async function workflow(cwf) { return 'rm -rf /tmp/example'; }", "shell"],
    ["export default async function workflow(cwf) { return `curl https://example.com`; }", "shell"],
  ])("rejects forbidden source: %s", (source, expected) => {
    expect(() => validateDynamicWorkflowSource(source)).toThrow(expected);
  });
});

describe("dynamic workflow runtime", () => {
  it("writes preview artifacts and pauses before starting agents", async () => {
    const target = await createGitRepoWithDiff();
    const script = await writeScript(`
export default async function workflow(cwf) {
  const files = await cwf.git.changedFiles();
  return cwf.report.summarize(files);
}
`);

    const store = await startDynamicWorkflow({ scriptPath: script, target, runsRoot: await runsRoot() });
    const state = await store.readState();
    const preview = await readFile(join(store.runDir, "artifacts", "dynamic-preview.md"), "utf8");
    const scriptCopy = await readFile(join(store.runDir, "artifacts", "workflow.js"), "utf8");

    expect(state.status).toBe("waiting");
    expect(state.phases.map((phase) => [phase.id, phase.status])).toEqual([
      ["collect", "completed"],
      ["dynamic-preview", "completed"],
      ["approve-dynamic", "waiting"],
      ["dynamic-execute", "pending"],
    ]);
    expect(preview).toContain("Node Permission Model child process");
    expect(preview).toContain("SHA-256");
    expect(scriptCopy).toContain("cwf.git.changedFiles");
  });

  it("executes an approved read-only workflow through cwf APIs", async () => {
    const target = await createGitRepoWithDiff();
    const script = await writeScript(`
export default async function workflow(cwf) {
  const files = await cwf.git.changedFiles();
  const reviews = await cwf.map(files, async (file) => {
    return cwf.agent.run({
      id: "review",
      role: "reviewer",
      prompt: "Review " + file,
      permissions: "read-only"
    });
  }, { concurrency: 2 });
  await cwf.artifacts.write({ name: "note.md", content: "dynamic artifact ok\\n" });
  return cwf.report.summarize(reviews);
}
`);
    const store = await startDynamicWorkflow({ scriptPath: script, target, runsRoot: await runsRoot() });
    await store.approveGate("approve-dynamic");
    await resumeDynamicWorkflow({ store, workerRunner: fixtureWorker });

    const state = await store.readState();
    const result = await store.readResult();
    const dynamicArtifact = await readFile(join(store.runDir, "artifacts", "dynamic-note.md"), "utf8");
    const worker = await readFile(join(store.runDir, "workers", "review.json"), "utf8");
    const manifest = JSON.parse(await readFile(join(store.runDir, "artifacts", "manifest.json"), "utf8")) as ArtifactManifest;

    expect(state.status).toBe("completed");
    expect(state.workers).toEqual(expect.arrayContaining([expect.objectContaining({ id: "review", status: "completed" })]));
    expect(result).toContain("Dynamic JS Workflow Result");
    expect(dynamicArtifact).toBe("dynamic artifact ok\n");
    expect(worker).toContain('"sandbox": "read-only"');
    expect(manifest.artifacts.map((artifact) => artifact.id)).toEqual(expect.arrayContaining(["dynamic-script", "dynamic-preview", "dynamic-events", "worker:review"]));
  });

  it("rejects read-only dynamic agents that mutate the target", async () => {
    const target = await createGitRepoWithDiff();
    const script = await writeScript(`
export default async function workflow(cwf) {
  return cwf.agent.run({ id: "mutator", role: "mutator", prompt: "mutate", permissions: "read-only" });
}
`);
    const store = await startDynamicWorkflow({ scriptPath: script, target, runsRoot: await runsRoot() });
    await store.approveGate("approve-dynamic");

    await expect(resumeDynamicWorkflow({ store, workerRunner: mutatingWorker(target) })).rejects.toThrow("read-only-worker-violation");
    const state = await store.readState();
    expect(state.status).toBe("failed");
  });

  it("rejects inherit-session when origin or parent cap is not trusted", async () => {
    const target = await createGitRepoWithDiff();
    const script = await writeScript(`
export default async function workflow(cwf) {
  return cwf.agent.run({ id: "writer", role: "writer", prompt: "write", permissions: "inherit-session" });
}
`);
    const store = await startDynamicWorkflow({
      scriptPath: script,
      target,
      runsRoot: await runsRoot(),
      origin: "copied-local",
      parentPermissionCap: { sandbox: "workspace-write", approval_policy: "never" },
    });
    await store.approveGate("approve-dynamic");

    await expect(resumeDynamicWorkflow({ store, workerRunner: fixtureWorker })).rejects.toThrow("inherit-session rejected");
  });

  it("allows generated-current-session inherit-session under a write-capable parent cap", async () => {
    const target = await createGitRepoWithDiff();
    let capturedSandbox: string | undefined;
    let capturedApproval: string | undefined;
    const capturingWorker: DynamicWorkerRunner = async (worker, _context, options) => {
      capturedSandbox = options.sandboxMode;
      capturedApproval = options.approvalPolicy;
      return workerResult(worker.id, options.target);
    };
    const script = await writeScript(`
export default async function workflow(cwf) {
  return cwf.agent.run({ id: "writer", role: "writer", prompt: "write", permissions: "inherit-session" });
}
`);
    const store = await startDynamicWorkflow({
      scriptPath: script,
      target,
      runsRoot: await runsRoot(),
      origin: "generated-current-session",
      parentPermissionCap: { sandbox: "workspace-write", approval_policy: "never" },
    });
    await store.approveGate("approve-dynamic");
    await resumeDynamicWorkflow({ store, workerRunner: capturingWorker });

    const worker = await readFile(join(store.runDir, "workers", "writer.json"), "utf8");
    const preview = await readFile(join(store.runDir, "artifacts", "dynamic-preview.md"), "utf8");

    expect(capturedSandbox).toBe("workspace-write");
    expect(capturedApproval).toBe("never");
    expect(worker).toContain('"sandbox": "workspace-write"');
    expect(preview).toContain("Broad parent authority detected");
  });

  it("caps dynamic map concurrency to the workflow budget", async () => {
    const target = await createGitRepoWithDiff();
    let active = 0;
    let maxActive = 0;
    const delayedWorker: DynamicWorkerRunner = async (worker, _context, options) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await sleep(25);
      active -= 1;
      return workerResult(worker.id, options.target);
    };
    const script = await writeScript(`
export default async function workflow(cwf) {
  const items = [0, 1, 2, 3, 4];
  const reviews = await cwf.map(items, async (item) => {
    return cwf.agent.run({
      id: "parallel-" + item,
      role: "reviewer",
      prompt: "Review item " + item,
      permissions: "read-only"
    });
  }, { concurrency: 99 });
  return cwf.report.summarize(reviews);
}
`);
    const store = await startDynamicWorkflow({
      scriptPath: script,
      target,
      runsRoot: await runsRoot(),
      budget: { max_concurrency: 2 },
    });
    await store.approveGate("approve-dynamic");
    await resumeDynamicWorkflow({ store, workerRunner: delayedWorker });

    const state = await store.readState();
    const events = await readFile(join(store.runDir, "artifacts", "dynamic-events.jsonl"), "utf8");

    expect(maxActive).toBeLessThanOrEqual(2);
    expect(state.workers.filter((worker) => worker.status === "completed")).toHaveLength(5);
    expect(events).toContain("budget.concurrency_capped");
  });

  it("uses the default dynamic concurrency budget when none is provided", async () => {
    const target = await createGitRepoWithDiff();
    let active = 0;
    let maxActive = 0;
    const delayedWorker: DynamicWorkerRunner = async (worker, _context, options) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await sleep(25);
      active -= 1;
      return workerResult(worker.id, options.target);
    };
    const script = await writeScript(`
export default async function workflow(cwf) {
  const items = [0, 1, 2, 3, 4];
  const reviews = await cwf.map(items, async (item) => {
    return cwf.agent.run({
      id: "default-budget-" + item,
      role: "reviewer",
      prompt: "Review item " + item,
      permissions: "read-only"
    });
  }, { concurrency: 99 });
  return cwf.report.summarize(reviews);
}
`);
    const store = await startDynamicWorkflow({
      scriptPath: script,
      target,
      runsRoot: await runsRoot(),
    });
    await store.approveGate("approve-dynamic");
    await resumeDynamicWorkflow({ store, workerRunner: delayedWorker });

    expect(maxActive).toBeGreaterThan(1);
    expect(maxActive).toBeLessThanOrEqual(4);
  });
});

async function createGitRepoWithDiff(): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "cwf-dynamic-target-"));
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

async function writeScript(source: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "cwf-dynamic-script-"));
  cleanup.push(dir);
  const path = join(dir, "workflow.js");
  await writeFile(path, source.trimStart());
  return path;
}

async function runsRoot(): Promise<string> {
  const tmpRoot = join(process.cwd(), ".tmp");
  await mkdir(tmpRoot, { recursive: true });
  const root = await mkdtemp(join(tmpRoot, "cwf-dynamic-runs-"));
  cleanup.push(root);
  return root;
}

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd });
}

const fixtureWorker: DynamicWorkerRunner = async (worker, _context, options) => workerResult(worker.id, options.target);

function mutatingWorker(target: string): DynamicWorkerRunner {
  return async (worker, _context, options) => {
    await writeFile(join(target, "src", "calc.js"), "export const answer = 100;\n");
    return workerResult(worker.id, options.target);
  };
}

function workerResult(workerId: string, target: string): WorkerResult {
  return {
    worker_id: workerId,
    status: "completed",
    confidence: "high",
    summary: `reviewed ${target}`,
    findings: [],
    verification: ["fixture worker"],
    artifacts: [],
    started_at: "2026-01-01T00:00:00.000Z",
    completed_at: "2026-01-01T00:00:01.000Z",
    duration_ms: 1000,
    prompt: `mock ${workerId}`,
    raw: "{}",
    raw_fallback: false,
    retry_count: 0,
  };
}
