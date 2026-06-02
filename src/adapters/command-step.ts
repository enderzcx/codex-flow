import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DiffContext } from "../types.js";

const execFileAsync = promisify(execFile);
const MAX_DIFF_CHARS = 120_000;

export async function collectDiffContext(target: string): Promise<DiffContext> {
  await git(target, ["rev-parse", "--is-inside-work-tree"]);
  const branch = (await git(target, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
  const statusShort = await git(target, ["status", "--short"]);
  const changedFiles = uniqueLines(
    `${await git(target, ["diff", "--name-only"])}\n${await git(target, ["diff", "--cached", "--name-only"])}`,
  );
  const unstaged = await git(target, ["diff", "--no-ext-diff", "--unified=80"]);
  const staged = await git(target, ["diff", "--cached", "--no-ext-diff", "--unified=80"]);
  const fullDiff = [staged.trim() ? `# Staged diff\n${staged}` : "", unstaged.trim() ? `# Unstaged diff\n${unstaged}` : ""]
    .filter(Boolean)
    .join("\n\n");
  const { text: diff, truncated } = truncate(fullDiff || "(no git diff detected)");
  const packageMetadata = await readPackageMetadata(target);
  const diffHash = hash(fullDiff);

  return {
    target,
    branch,
    status_short: statusShort,
    changed_files: changedFiles,
    package_metadata: packageMetadata,
    diff,
    diff_hash: diffHash,
    truncated,
  };
}

export async function currentDiffHash(target: string): Promise<string> {
  const staged = await git(target, ["diff", "--cached", "--binary"]);
  const unstaged = await git(target, ["diff", "--binary"]);
  return hash(`${staged}\n${unstaged}`);
}

async function readPackageMetadata(target: string): Promise<string | undefined> {
  try {
    const raw = await readFile(join(target, "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { name?: unknown; version?: unknown; scripts?: unknown };
    return JSON.stringify({
      name: typeof parsed.name === "string" ? parsed.name : undefined,
      version: typeof parsed.version === "string" ? parsed.version : undefined,
      scripts: parsed.scripts && typeof parsed.scripts === "object" ? parsed.scripts : undefined,
    });
  } catch {
    return undefined;
  }
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout, stderr } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (stderr && stderr.trim().length > 0) {
    return stdout.toString();
  }
  return stdout.toString();
}

function uniqueLines(value: string): string[] {
  return [...new Set(value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))];
}

function truncate(value: string): { text: string; truncated: boolean } {
  if (value.length <= MAX_DIFF_CHARS) {
    return { text: value, truncated: false };
  }
  return {
    text: `${value.slice(0, MAX_DIFF_CHARS)}\n\n[diff truncated at ${MAX_DIFF_CHARS} characters]`,
    truncated: true,
  };
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

