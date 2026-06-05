import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { applySafePatch, enforceWritePolicy, parsePatchPaths, runVerificationCommands } from "../src/safe-write.js";
import type { WritePolicy } from "../src/types.js";

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

describe("safe write policy", () => {
  const policy: WritePolicy = {
    mode: "patch",
    allowed_paths: ["src/generated/**"],
    forbidden_paths: [".env", ".git/**"],
    verification_commands: [],
  };

  it("parses git patch paths from diff headers", () => {
    expect(parsePatchPaths("diff --git a/src/generated/a.js b/src/generated/a.js\n")).toEqual(["src/generated/a.js"]);
  });

  it("parses quoted git patch paths with spaces", () => {
    expect(parsePatchPaths('diff --git "a/src/generated/my notes.js" "b/src/generated/my notes.js"\n')).toEqual(["src/generated/my notes.js"]);
  });

  it("rejects changed files outside allowed_paths", () => {
    expect(() => enforceWritePolicy(policy, ["src/app.js"])).toThrow("outside allowed_paths");
  });

  it("rejects changed files matching forbidden_paths", () => {
    expect(() => enforceWritePolicy({ ...policy, allowed_paths: ["**"] }, [".env"])).toThrow("matches forbidden_paths");
  });

  it("records passed and failed verification commands", async () => {
    const target = await createGitRepo();
    const results = await runVerificationCommands(target, ["test -f src/generated/value.js", "test -f src/generated/missing.js"]);

    expect(results).toEqual([
      expect.objectContaining({ command: "test -f src/generated/value.js", status: "passed" }),
      expect.objectContaining({ command: "test -f src/generated/missing.js", status: "failed" }),
    ]);
  });

  it("stops conflicting patches at git apply --check --3way and leaves target unchanged", async () => {
    const target = await createGitRepo();
    const patch = [
      "diff --git a/src/generated/value.js b/src/generated/value.js",
      "index df967b9..b35f459 100644",
      "--- a/src/generated/value.js",
      "+++ b/src/generated/value.js",
      "@@ -1 +1 @@",
      "-export const value = 'base';",
      "+export const value = 'patched';",
      "",
    ].join("\n");
    const patchPath = join(target, "conflicting.patch");
    await writeFile(patchPath, patch);
    await writeFile(join(target, "src", "generated", "value.js"), "export const value = 'target';\n");

    await expect(applySafePatch(target, patch, policy, patchPath)).rejects.toThrow();

    await rm(patchPath);
    const body = await readFile(join(target, "src", "generated", "value.js"), "utf8");
    const status = await gitOutput(target, ["status", "--short"]);

    expect(body).toBe("export const value = 'target';\n");
    expect(status.trim()).toBe("M src/generated/value.js");
  });

  it("applies safe patches for allowed files with spaces", async () => {
    const target = await createGitRepo();
    const patch = [
      'diff --git "a/src/generated/my notes.js" "b/src/generated/my notes.js"',
      "new file mode 100644",
      "index 0000000..4d5e8f0",
      "--- /dev/null",
      '+++ "b/src/generated/my notes.js"',
      "@@ -0,0 +1 @@",
      "+export const spaced = true;",
      "",
    ].join("\n");
    const patchPath = join(target, "spaced.patch");
    await writeFile(patchPath, patch);

    await applySafePatch(target, patch, policy, patchPath);

    const body = await readFile(join(target, "src", "generated", "my notes.js"), "utf8");
    await rm(patchPath);
    expect(body).toBe("export const spaced = true;\n");
  });
});

async function createGitRepo(): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "cwf-safe-write-"));
  cleanup.push(target);
  await mkdir(join(target, "src", "generated"), { recursive: true });
  await writeFile(join(target, "src", "generated", "value.js"), "export const value = 'base';\n");
  await git(target, ["init"]);
  await git(target, ["config", "user.email", "codex-workflows@example.invalid"]);
  await git(target, ["config", "user.name", "codex-workflows"]);
  await git(target, ["add", "."]);
  await git(target, ["commit", "-m", "baseline"]);
  return target;
}

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd });
}

async function gitOutput(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout;
}
