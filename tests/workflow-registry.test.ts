import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  formatWorkflowList,
  formatWorkflowShow,
  listWorkflowEntries,
  resolveWorkflowReference,
  showWorkflow,
  validateWorkflowRegistry,
  workflowSearchPaths,
} from "../src/workflow-registry.js";

const cleanup: string[] = [];

afterEach(async () => {
  while (cleanup.length > 0) {
    const path = cleanup.pop();
    if (path) {
      await rm(path, { recursive: true, force: true });
    }
  }
});

describe("workflow registry", () => {
  it("discovers workflows from project and home search paths", async () => {
    const { cwd, homeDir } = await createRoot();
    await writeWorkflow(join(cwd, "workflows", "diff-review.yaml"), workflowYaml({ id: "diff-review", title: "Diff Review" }));
    await writeWorkflow(join(homeDir, ".codex-flow", "workflows", "home-review.yaml"), workflowYaml({ id: "home-review", title: "Home Review" }));

    const paths = workflowSearchPaths({ cwd, homeDir });
    const entries = await listWorkflowEntries({ cwd, homeDir });
    const output = formatWorkflowList(entries);

    expect(paths).toEqual([
      join(cwd, ".codex-flow", "workflows"),
      join(cwd, "workflows"),
      join(homeDir, ".codex-flow", "workflows"),
    ]);
    expect(entries.map((entry) => entry.id)).toEqual(["diff-review", "home-review"]);
    expect(output).toContain("diff-review");
    expect(output).toContain("Home Review");
  });

  it("resolves workflows by id or path and renders show output", async () => {
    const { cwd, homeDir } = await createRoot();
    const path = join(cwd, "workflows", "diff-review.yaml");
    await writeWorkflow(path, workflowYaml({ id: "diff-review", title: "Diff Review" }));

    const byId = await resolveWorkflowReference("diff-review", { cwd, homeDir });
    const byPath = await resolveWorkflowReference(path, { cwd, homeDir });
    const shown = await showWorkflow("diff-review", { cwd, homeDir });
    const output = formatWorkflowShow(shown);

    expect(byId.path).toBe(path);
    expect(byPath.spec.id).toBe("diff-review");
    expect(output).toContain("Workflow ID: diff-review");
    expect(output).toContain("Capabilities: writes=false");
    expect(output).toContain("- target: path, required");
  });

  it("fails duplicate workflow ids clearly", async () => {
    const { cwd, homeDir } = await createRoot();
    await writeWorkflow(join(cwd, ".codex-flow", "workflows", "a.yaml"), workflowYaml({ id: "diff-review", title: "A" }));
    await writeWorkflow(join(cwd, "workflows", "b.yaml"), workflowYaml({ id: "diff-review", title: "B" }));

    await expect(listWorkflowEntries({ cwd, homeDir })).rejects.toThrow('Duplicate workflow id "diff-review"');
  });

  it("preserves field-level validation errors with the file path", async () => {
    const { cwd, homeDir } = await createRoot();
    await writeWorkflow(
      join(cwd, "workflows", "invalid.yaml"),
      workflowYaml({ id: "bad", title: "Bad" }).replace("title: Bad\n", ""),
    );

    await expect(validateWorkflowRegistry({ cwd, homeDir })).rejects.toThrow("title must be a non-empty string");
  });
});

async function createRoot(): Promise<{ cwd: string; homeDir: string }> {
  const root = await mkdtemp(join(tmpdir(), "cwf-registry-"));
  cleanup.push(root);
  return { cwd: join(root, "project"), homeDir: join(root, "home") };
}

async function writeWorkflow(path: string, value: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value);
}

function workflowYaml(options: { id: string; title: string }): string {
  return `id: ${options.id}
version: 0.5.0-test
title: ${options.title}
description: Test workflow.
tags:
  - test
capabilities:
  writes: false
inputs:
  target:
    type: path
    required: true
requires:
  target: git-repo
defaults:
  sandbox: read-only
  timeout_ms: 300000
phases:
  - id: collect
    kind: command
  - id: review
    kind: codex-parallel
    workers:
      - id: correctness
        perspective: correctness
        prompt: Review correctness.
  - id: reduce
    kind: reducer
    reducer: diff-review
artifacts:
  - result.md
`;
}
