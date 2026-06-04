import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { executeWorkflow, type WorkerRunner } from "../src/phase-engine.js";
import { RunStore } from "../src/run-store.js";
import { loadWorkflowSpec } from "../src/workflow-loader.js";
import { suggestWorkflow, validateSuggestionFile } from "../src/workflow-suggestion.js";
import { listWorkflowEntries } from "../src/workflow-registry.js";
import type { WorkflowSpec } from "../src/types.js";

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

describe("workflow suggestions", () => {
  it("writes a valid read-only suggestion without installing it", async () => {
    const root = await tempDir("cwf-suggestions-");
    const cwd = await tempDir("cwf-empty-cwd-");
    const home = await tempDir("cwf-empty-home-");
    const before = await listWorkflowEntries({ cwd, homeDir: home });

    const result = await suggestWorkflow({
      goal: "Review docs changes",
      target: cwd,
      suggestionsRoot: root,
      now: new Date("2026-01-02T03:04:05.000Z"),
    });
    const after = await listWorkflowEntries({ cwd, homeDir: home });
    const raw = await readFile(result.path, "utf8");

    expect(result.valid).toBe(true);
    expect(result.installed).toBe(false);
    expect(result.path).toBe(join(root, "20260102030405-suggested-review-docs-changes.yaml"));
    expect(result.run_command).toContain("cwf run");
    expect(raw).toContain("kind: codex-parallel");
    expect(raw).not.toContain("generated JavaScript");
    expect(raw).not.toContain("eval(");
    expect(before).toEqual([]);
    expect(after).toEqual([]);
  });

  it("honors an explicit output path", async () => {
    const root = await tempDir("cwf-suggestion-output-");
    const output = join(root, "custom.yaml");

    const result = await suggestWorkflow({ goal: "Review release notes", output });

    expect(result.path).toBe(output);
    expect((await loadWorkflowSpec(output)).id).toBe("suggested-review-release-notes");
  });

  it("does not overwrite an existing output file", async () => {
    const root = await tempDir("cwf-suggestion-existing-");
    const output = join(root, "custom.yaml");
    await writeFile(output, "keep me\n");

    await expect(suggestWorkflow({ goal: "Review release notes", output })).rejects.toThrow("EEXIST");
    await expect(readFile(output, "utf8")).resolves.toBe("keep me\n");
  });

  it("can derive a suggestion from a previous run", async () => {
    const runsRoot = await tempDir("cwf-suggestion-runs-");
    const target = await tempDir("cwf-suggestion-target-");
    const store = await RunStore.create(spec, target, runsRoot);
    const output = join(await tempDir("cwf-suggestion-from-run-"), "from-run.yaml");

    const result = await suggestWorkflow({ fromRunId: store.runId, output, runsRoot });
    const suggested = await loadWorkflowSpec(result.path);

    expect(suggested.description).toContain(store.runId);
    expect(result.run_command).toContain(target);
  });

  it("returns validation diagnostics for invalid suggestion files", async () => {
    const path = join(await tempDir("cwf-invalid-suggestion-"), "bad.yaml");
    await writeFile(path, "id: broken\n");

    const result = await validateSuggestionFile(path);

    expect(result.valid).toBe(false);
    expect(result.diagnostics.join("\n")).toContain("version");
  });

  it("runs a valid suggestion by explicit path with a mocked Codex worker", async () => {
    const output = join(await tempDir("cwf-explicit-suggestion-"), "suggested.yaml");
    await suggestWorkflow({ goal: "Review fixture docs", output });
    const suggested = await loadWorkflowSpec(output);
    const target = await createGitRepoWithDiff();
    const runsRoot = await tempDir("cwf-explicit-suggestion-runs-");
    const store = await RunStore.create(suggested, target, runsRoot);

    await executeWorkflow({
      spec: suggested,
      specPath: output,
      target,
      store,
      workerRunner: successfulRunner,
    });

    const state = await store.readState();
    const result = await readFile(join(store.runDir, "result.md"), "utf8");

    expect(state.status).toBe("completed");
    expect(result).toContain("# codex-workflows suggested-review-fixture-docs");
  });
});

async function tempDir(prefix: string): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), prefix));
  cleanup.push(path);
  return path;
}

async function createGitRepoWithDiff(): Promise<string> {
  const target = await tempDir("cwf-suggestion-repo-");
  await mkdir(join(target, "docs"), { recursive: true });
  await writeFile(join(target, "docs", "note.md"), "# Baseline\n");
  await git(target, ["init"]);
  await git(target, ["config", "user.email", "codex-workflows@example.invalid"]);
  await git(target, ["config", "user.name", "codex-workflows"]);
  await git(target, ["add", "."]);
  await git(target, ["commit", "-m", "baseline"]);
  await writeFile(join(target, "docs", "note.md"), "# Changed\n\nNeeds review.\n");
  return target;
}

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd });
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

const spec: WorkflowSpec = {
  id: "diff-review",
  version: "1.0.0",
  title: "Diff Review",
  tags: ["review", "read-only"],
  inputs: {
    target: { type: "path", required: true },
  },
  capabilities: { writes: false },
  requires: { target: "git-repo" },
  defaults: { sandbox: "read-only", timeout_ms: 300000 },
  phases: [
    { id: "collect", kind: "command" },
    {
      id: "review",
      kind: "codex-parallel",
      workers: [{ id: "correctness", perspective: "correctness", prompt: "review correctness" }],
    },
    { id: "reduce", kind: "reducer", reducer: "diff-review" },
  ],
  artifacts: ["result.md"],
};
