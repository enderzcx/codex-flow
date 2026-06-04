import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateGithubPrArtifacts } from "../src/github-pr.js";
import { RunStore } from "../src/run-store.js";
import type { WorkflowSpec } from "../src/types.js";

const cleanup: string[] = [];

afterEach(async () => {
  while (cleanup.length > 0) {
    const path = cleanup.pop();
    if (path) {
      await rm(path, { recursive: true, force: true });
    }
  }
});

describe("github-pr artifacts", () => {
  it("generates comment and review artifacts without posting", async () => {
    const store = await createCompletedRun();
    let called = false;

    const result = await generateGithubPrArtifacts(store, {
      format: "comment",
      execFileImpl: async () => {
        called = true;
      },
    });

    const comment = await readFile(result.comment_path, "utf8");
    const review = JSON.parse(await readFile(result.review_path, "utf8")) as { event: string; body: string };

    expect(result.posted).toBe(false);
    expect(called).toBe(false);
    expect(comment).toContain("<!-- codex-flow-run:");
    expect(comment).toContain("# Codex Flow Review: diff-review");
    expect(comment).toContain("Looks safe.");
    expect(review.event).toBe("COMMENT");
    expect(review.body).toContain("Looks safe.");
  });

  it("posts a comment only when post options are explicit", async () => {
    const store = await createCompletedRun();
    const calls: Array<{ file: string; args: string[] }> = [];

    const result = await generateGithubPrArtifacts(store, {
      format: "comment",
      post: true,
      repo: "owner/repo",
      pr: "123",
      ghPath: "fake-gh",
      execFileImpl: async (file, args) => {
        calls.push({ file, args });
      },
    });

    expect(result.posted).toBe(true);
    expect(calls).toEqual([
      {
        file: "fake-gh",
        args: ["pr", "comment", "123", "--repo", "owner/repo", "--body-file", result.comment_path],
      },
    ]);
  });

  it("posts review format through gh pr review when explicit", async () => {
    const store = await createCompletedRun();
    const calls: Array<{ file: string; args: string[] }> = [];

    const result = await generateGithubPrArtifacts(store, {
      format: "review",
      post: true,
      repo: "owner/repo",
      pr: "123",
      execFileImpl: async (file, args) => {
        calls.push({ file, args });
      },
    });

    expect(result.posted).toBe(true);
    expect(calls[0]).toEqual({
      file: "gh",
      args: ["pr", "review", "123", "--repo", "owner/repo", "--comment", "--body-file", result.comment_path],
    });
  });

  it("requires repo and PR number before posting", async () => {
    const store = await createCompletedRun();

    await expect(generateGithubPrArtifacts(store, { post: true, repo: "owner/repo" })).rejects.toThrow(
      "Posting requires explicit --repo <owner/repo> and --pr <number>",
    );
  });

  it("requires a completed run", async () => {
    const store = await createRun();

    await expect(generateGithubPrArtifacts(store)).rejects.toThrow("GitHub PR artifacts require a completed run");
  });

  it("leaves local artifacts when gh posting fails", async () => {
    const store = await createCompletedRun();

    await expect(
      generateGithubPrArtifacts(store, {
        post: true,
        repo: "owner/repo",
        pr: "123",
        execFileImpl: async () => {
          throw new Error("auth required");
        },
      }),
    ).rejects.toThrow("GitHub post failed via gh: auth required");

    await expect(readFile(join(store.runDir, "artifacts", "github-pr-comment.md"), "utf8")).resolves.toContain("Looks safe.");
    await expect(readFile(join(store.runDir, "artifacts", "github-pr-review.json"), "utf8")).resolves.toContain('"event": "COMMENT"');
  });
});

async function createCompletedRun(): Promise<RunStore> {
  const store = await createRun();
  await store.writeResult("# Review\n\nLooks safe.\n");
  return store;
}

async function createRun(): Promise<RunStore> {
  const target = await mkdtemp(join(tmpdir(), "cwf-gh-target-"));
  const runsRoot = await mkdtemp(join(tmpdir(), "cwf-gh-runs-"));
  cleanup.push(target, runsRoot);
  await mkdir(join(target, "src"), { recursive: true });
  await writeFile(join(target, "src", "app.js"), "export const ok = true;\n");
  return RunStore.create(spec, target, runsRoot);
}

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
