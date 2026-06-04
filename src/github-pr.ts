import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { RunStore } from "./run-store.js";
import type { RunState } from "./types.js";

const execFileAsync = promisify(execFile);

export type GitHubPrFormat = "comment" | "review";

export type GitHubPrOptions = {
  format?: GitHubPrFormat;
  post?: boolean;
  repo?: string;
  pr?: string;
  ghPath?: string;
  execFileImpl?: (file: string, args: string[]) => Promise<unknown>;
};

export type GitHubPrResult = {
  run_id: string;
  format: GitHubPrFormat;
  comment_path: string;
  review_path: string;
  posted: boolean;
  post_command?: string[];
};

export async function handleGithubPr(runId: string, options: GitHubPrOptions = {}): Promise<GitHubPrResult> {
  return generateGithubPrArtifacts(RunStore.fromRunId(runId), options);
}

export async function generateGithubPrArtifacts(store: RunStore, options: GitHubPrOptions = {}): Promise<GitHubPrResult> {
  const format = options.format ?? "comment";
  if (format !== "comment" && format !== "review") {
    throw new Error(`Invalid GitHub PR format: ${format}`);
  }
  const state = await store.readState();
  if (state.status !== "completed") {
    throw new Error(`GitHub PR artifacts require a completed run. Run ${store.runId} is ${state.status}.`);
  }
  const result = await readRunResult(store, state);
  const artifactsDir = join(store.runDir, "artifacts");
  await mkdir(artifactsDir, { recursive: true });

  const commentPath = join(artifactsDir, "github-pr-comment.md");
  const reviewPath = join(artifactsDir, "github-pr-review.json");
  const comment = renderGithubPrComment(state, result);
  const review = renderGithubPrReview(state, comment);
  await writeFile(commentPath, `${comment.trimEnd()}\n`);
  await writeFile(reviewPath, `${JSON.stringify(review, null, 2)}\n`);

  const response: GitHubPrResult = {
    run_id: store.runId,
    format,
    comment_path: commentPath,
    review_path: reviewPath,
    posted: false,
  };

  if (!options.post) {
    return response;
  }
  if (!options.repo || !options.pr) {
    throw new Error("Posting requires explicit --repo <owner/repo> and --pr <number>.");
  }

  const command = buildGhCommand(format, options.repo, options.pr, commentPath);
  const execImpl = options.execFileImpl ?? ((file, args) => execFileAsync(file, args));
  try {
    await execImpl(options.ghPath ?? "gh", command);
  } catch (error) {
    throw new Error(`GitHub post failed via gh: ${error instanceof Error ? error.message : String(error)}. Local artifacts remain at ${commentPath} and ${reviewPath}.`);
  }

  return {
    ...response,
    posted: true,
    post_command: [options.ghPath ?? "gh", ...command],
  };
}

function buildGhCommand(format: GitHubPrFormat, repo: string, pr: string, commentPath: string): string[] {
  if (format === "review") {
    return ["pr", "review", pr, "--repo", repo, "--comment", "--body-file", commentPath];
  }
  return ["pr", "comment", pr, "--repo", repo, "--body-file", commentPath];
}

async function readRunResult(store: RunStore, state: RunState): Promise<string> {
  try {
    return await store.readResult();
  } catch {
    if (state.result_path) {
      return readFile(state.result_path, "utf8");
    }
    throw new Error(`No completed result found for ${store.runId}. Run status is ${state.status}.`);
  }
}

function renderGithubPrComment(state: RunState, result: string): string {
  return [
    `<!-- codex-flow-run:${state.id} -->`,
    `# Codex Flow Review: ${state.workflow}`,
    "",
    `Run: \`${state.id}\``,
    `Status: \`${state.status}\``,
    `Target: \`${state.target}\``,
    "",
    "## Result",
    "",
    result.trim(),
    "",
    "## Local Evidence",
    "",
    `- State: \`${join(state.run_dir, "state.json")}\``,
    `- Events: \`${join(state.run_dir, "events.jsonl")}\``,
    `- Workers: \`${join(state.run_dir, "workers")}\``,
    state.artifact_manifest_path ? `- Manifest: \`${state.artifact_manifest_path}\`` : undefined,
    state.result_path ? `- Result: \`${state.result_path}\`` : undefined,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function renderGithubPrReview(state: RunState, body: string): Record<string, unknown> {
  return {
    event: "COMMENT",
    body,
    comments: [],
    codex_flow: {
      run_id: state.id,
      workflow: state.workflow,
      status: state.status,
      target: state.target,
      generated_at: new Date().toISOString(),
    },
  };
}
