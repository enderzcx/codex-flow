import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  formatDynamicWorkflowList,
  formatDynamicWorkflowShow,
  listDynamicWorkflowEntries,
  resolveDynamicWorkflowReference,
  saveDynamicWorkflow,
} from "../src/dynamic-workflow-registry.js";

const cleanup: string[] = [];

afterEach(async () => {
  while (cleanup.length > 0) {
    const path = cleanup.pop();
    if (path) {
      await rm(path, { recursive: true, force: true });
    }
  }
});

describe("dynamic workflow registry", () => {
  it("discovers packaged dynamic templates with declared metadata", async () => {
    const { cwd, homeDir } = await createRoot();
    const path = join(cwd, "workflows", "dynamic", "local-review.workflow.js");
    await writeDynamicWorkflow(path, dynamicWorkflowSource({ id: "local-review", title: "Local Review" }));

    const entries = await listDynamicWorkflowEntries({ cwd, homeDir });
    const list = formatDynamicWorkflowList(entries);
    const show = formatDynamicWorkflowShow(entries[0]);

    expect(entries).toEqual([
      expect.objectContaining({
        id: "local-review",
        title: "Local Review",
        trust_state: "packaged",
        origin: "packaged",
      }),
    ]);
    expect(list).toContain("local-review");
    expect(show).toContain("Trust: packaged");
  });

  it("saves dynamic workflows with a local trust record and resolves by id", async () => {
    const { cwd, homeDir } = await createRoot();
    const sourcePath = join(cwd, "draft.workflow.js");
    await writeDynamicWorkflow(sourcePath, dynamicWorkflowSource({ id: "draft-review", title: "Draft Review" }));

    const saved = await saveDynamicWorkflow({
      sourcePath,
      id: "trusted-review",
      cwd,
      homeDir,
      now: new Date("2026-06-07T00:00:00.000Z"),
    });
    const trust = JSON.parse(await readFile(saved.path.replace(/\.workflow\.js$/, ".trust.json"), "utf8")) as { source_sha256: string };
    const resolved = await resolveDynamicWorkflowReference("trusted-review", { cwd, homeDir });

    expect(saved).toEqual(expect.objectContaining({ id: "trusted-review", trust_state: "local-trust-record" }));
    expect(trust.source_sha256).toBe(saved.source_sha256);
    expect(resolved.path).toBe(saved.path);
    expect(resolved.origin).toBe("local-trust-record");
  });

  it("does not run untrusted local dynamic workflows by id", async () => {
    const { cwd, homeDir } = await createRoot();
    const path = join(homeDir, ".codex-workflows", "dynamic", "loose.workflow.js");
    await writeDynamicWorkflow(path, dynamicWorkflowSource({ id: "loose", title: "Loose" }));

    await expect(resolveDynamicWorkflowReference("loose", { cwd, homeDir })).rejects.toThrow("untrusted-local");
    const explicit = await resolveDynamicWorkflowReference(path, { cwd, homeDir });
    expect(explicit.path).toBe(path);
  });

  it("rejects trust metadata SHA mismatches", async () => {
    const { cwd, homeDir } = await createRoot();
    const sourcePath = join(cwd, "draft.workflow.js");
    await writeDynamicWorkflow(sourcePath, dynamicWorkflowSource({ id: "draft-review", title: "Draft Review" }));
    const saved = await saveDynamicWorkflow({ sourcePath, id: "trusted-review", cwd, homeDir });
    await writeFile(saved.path, dynamicWorkflowSource({ id: "trusted-review", title: "Tampered" }));

    await expect(listDynamicWorkflowEntries({ cwd, homeDir })).rejects.toThrow("SHA mismatch");
  });

  it("does not run remote dynamic workflow URLs directly", async () => {
    await expect(resolveDynamicWorkflowReference("https://example.com/workflow.js")).rejects.toThrow("cannot run directly by URL");
  });
});

async function createRoot(): Promise<{ cwd: string; homeDir: string }> {
  const root = await mkdtemp(join(tmpdir(), "cwf-dynamic-registry-"));
  cleanup.push(root);
  return { cwd: join(root, "project"), homeDir: join(root, "home") };
}

async function writeDynamicWorkflow(path: string, value: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value);
}

function dynamicWorkflowSource(options: { id: string; title: string }): string {
  return `export const metadata = {
  "id": "${options.id}",
  "title": "${options.title}",
  "version": "1.0.0",
  "permissions": ["read-only"]
};

export default async function workflow(cwf) {
  return cwf.report.summarize([]);
}
`;
}
