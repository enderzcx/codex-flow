import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, posix } from "node:path";
import { promisify } from "node:util";
import type { WritePolicy } from "./types.js";

const execFileAsync = promisify(execFile);

export type IsolatedWriteTarget = {
  path: string;
  cleanup(): Promise<void>;
};

export type VerificationResult = {
  command: string;
  status: "passed" | "failed";
  output: string;
};

export async function createIsolatedWriteTarget(target: string): Promise<IsolatedWriteTarget> {
  const root = await mkdtemp(join(tmpdir(), "cwf-write-target-"));
  const isolated = join(root, basename(target) || "repo");
  await git(tmpdir(), ["clone", "--local", "--no-hardlinks", target, isolated]);
  await git(isolated, ["config", "user.email", "codex-workflows@example.invalid"]);
  await git(isolated, ["config", "user.name", "codex-workflows"]);

  const preexistingPatch = [await git(target, ["diff", "--cached", "--binary"]), await git(target, ["diff", "--binary"])]
    .filter((part) => part.trim().length > 0)
    .join("\n");
  if (preexistingPatch.trim().length > 0) {
    await applyPatchText(isolated, preexistingPatch, ["--3way"]);
    await git(isolated, ["add", "-A"]);
    await git(isolated, ["commit", "-m", "cwf pre-write baseline"]);
  }

  return {
    path: isolated,
    async cleanup(): Promise<void> {
      await rm(root, { recursive: true, force: true });
    },
  };
}

export async function generatePatch(target: string): Promise<string> {
  await git(target, ["add", "-N", "."]);
  return [await git(target, ["diff", "--cached", "--binary"]), await git(target, ["diff", "--binary"])]
    .filter((part) => part.trim().length > 0)
    .join("\n");
}

export async function applySafePatch(target: string, patch: string, policy: WritePolicy, patchPath: string): Promise<string[]> {
  const patchPaths = parsePatchPaths(patch);
  enforceWritePolicy(policy, patchPaths);
  if (patch.trim().length === 0) {
    return [];
  }
  await git(target, ["apply", "--check", "--3way", patchPath]);
  try {
    await git(target, ["apply", "--3way", patchPath]);
  } catch (error) {
    try {
      await revertAppliedPatch(target, patchPath);
    } catch {
      // Preserve the original apply failure; callers surface rollback guidance.
    }
    throw error;
  }
  return patchPaths;
}

export async function revertAppliedPatch(target: string, patchPath: string): Promise<void> {
  await git(target, ["apply", "--reverse", "--3way", patchPath]);
}

export async function listChangedFiles(target: string): Promise<string[]> {
  return uniqueLines(
    [
      await git(target, ["diff", "--name-only"]),
      await git(target, ["diff", "--cached", "--name-only"]),
      await git(target, ["ls-files", "--others", "--exclude-standard"]),
    ].join("\n"),
  );
}

export function enforceWritePolicy(policy: WritePolicy, files: string[]): void {
  for (const file of files) {
    const normalized = normalizeRepoPath(file);
    if (!matchesAny(normalized, policy.allowed_paths)) {
      throw new Error(`write policy rejected ${normalized}: outside allowed_paths`);
    }
    if (matchesAny(normalized, policy.forbidden_paths)) {
      throw new Error(`write policy rejected ${normalized}: matches forbidden_paths`);
    }
  }
}

export function parsePatchPaths(patch: string): string[] {
  const paths = new Set<string>();
  for (const line of patch.split(/\r?\n/)) {
    if (!line.startsWith("diff --git ")) {
      continue;
    }
    const [left, right] = parseGitDiffHeader(line);
    paths.add(stripGitSidePrefix(left, "a"));
    paths.add(stripGitSidePrefix(right, "b"));
  }
  return [...paths].filter((path) => path !== "/dev/null");
}

export async function runVerificationCommands(target: string, commands: string[]): Promise<VerificationResult[]> {
  const results: VerificationResult[] = [];
  for (const command of commands) {
    try {
      const { stdout, stderr } = await execFileAsync("sh", ["-lc", command], {
        cwd: target,
        maxBuffer: 16 * 1024 * 1024,
      });
      results.push({ command, status: "passed", output: `${stdout}${stderr}`.trim() });
    } catch (error) {
      const output = error && typeof error === "object" && "stdout" in error
        ? `${String((error as { stdout?: unknown }).stdout ?? "")}${String((error as { stderr?: unknown }).stderr ?? "")}`.trim()
        : error instanceof Error
          ? error.message
          : String(error);
      results.push({ command, status: "failed", output });
    }
  }
  return results;
}

function normalizeRepoPath(file: string): string {
  const normalized = posix.normalize(file.replace(/\\/g, "/"));
  if (normalized.startsWith("../") || normalized === ".." || normalized.startsWith("/") || normalized.includes("\0")) {
    throw new Error(`unsafe repo-relative path: ${file}`);
  }
  return normalized;
}

function matchesAny(file: string, patterns: string[]): boolean {
  return patterns.some((pattern) => globToRegex(pattern).test(file));
}

function globToRegex(pattern: string): RegExp {
  const normalized = normalizeRepoPath(pattern);
  let regex = "";
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];
    if (char === "*" && next === "*") {
      regex += ".*";
      index += 1;
      continue;
    }
    if (char === "*") {
      regex += "[^/]*";
      continue;
    }
    regex += escapeRegex(char);
  }
  return new RegExp(`^${regex}$`);
}

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function parseGitDiffHeader(line: string): [string, string] {
  const rest = line.slice("diff --git ".length);
  const first = readGitPathToken(rest, 0);
  if (!first) {
    throw new Error(`unsupported git patch header: ${line}`);
  }
  const second = readGitPathToken(rest, first.nextIndex);
  if (!second) {
    throw new Error(`unsupported git patch header: ${line}`);
  }
  if (readGitPathToken(rest, second.nextIndex, true)) {
    throw new Error(`unsupported git patch header: ${line}`);
  }
  return [first.path, second.path];
}

function readGitPathToken(input: string, startIndex: number, optional = false): { path: string; nextIndex: number } | undefined {
  let index = startIndex;
  while (input[index] === " ") {
    index += 1;
  }
  if (index >= input.length) {
    if (optional) {
      return undefined;
    }
    throw new Error(`missing path token in git patch header: ${input}`);
  }
  if (input[index] !== '"') {
    const nextSpace = input.indexOf(" ", index);
    const end = nextSpace === -1 ? input.length : nextSpace;
    return { path: input.slice(index, end), nextIndex: end };
  }

  let escaped = false;
  let end = index + 1;
  for (; end < input.length; end += 1) {
    const char = input[end];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      const token = input.slice(index, end + 1);
      return { path: unquoteGitPath(token), nextIndex: end + 1 };
    }
  }
  throw new Error(`unterminated quoted path in git patch header: ${input}`);
}

function stripGitSidePrefix(path: string, side: "a" | "b"): string {
  if (path === "/dev/null") {
    return path;
  }
  const prefix = `${side}/`;
  if (!path.startsWith(prefix)) {
    throw new Error(`unsupported git patch path: ${path}`);
  }
  return path.slice(prefix.length);
}

function unquoteGitPath(path: string): string {
  try {
    return JSON.parse(path) as string;
  } catch {
    return path.slice(1, -1).replace(/\\(["\\])/g, "$1");
  }
}

function uniqueLines(value: string): string[] {
  return [...new Set(value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))];
}

async function applyPatchText(cwd: string, patch: string, extraArgs: string[]): Promise<void> {
  const patchDir = await mkdtemp(join(tmpdir(), "cwf-preexisting-patch-"));
  const patchPath = join(patchDir, "preexisting.patch");
  try {
    await writeFile(patchPath, patch);
    await git(cwd, ["apply", ...extraArgs, patchPath]);
  } finally {
    await rm(patchDir, { recursive: true, force: true });
  }
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout.toString();
}
