import { execFile } from "node:child_process";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { collectDiffContext, currentDiffHash } from "./adapters/command-step.js";
import { runCodexWriteWorker, type RunCodexWriteOptions } from "./adapters/codex-write.js";
import { runWorkerWithAdapter, type WorkerAdapterOptions, type WorkerAdapterRegistry } from "./adapters/worker-adapter.js";
import { reduceDiffReview } from "./reducers/diff-review-reducer.js";
import { renderMarkdownResult } from "./renderers/markdown-result.js";
import { buildFailureSummary } from "./run-index.js";
import { RunStore } from "./run-store.js";
import {
  applySafePatch,
  createIsolatedWriteTarget,
  generatePatch,
  revertAppliedPatch,
  runVerificationCommands,
  type VerificationResult,
} from "./safe-write.js";
import type { ArtifactManifest, ArtifactRef, DiffContext, PhaseState, WorkerResult, WorkflowPhase, WorkflowSpec, WorkflowWorker, WritePolicy } from "./types.js";

const execFileAsync = promisify(execFile);

export type WorkerRunner = (
  worker: WorkflowWorker,
  context: DiffContext,
  options: WorkerAdapterOptions,
) => Promise<WorkerResult>;

export type WriteRunner = (
  worker: WorkflowWorker,
  context: DiffContext,
  options: RunCodexWriteOptions,
) => Promise<WorkerResult>;

export type RunWorkflowOptions = {
  spec: WorkflowSpec;
  specPath: string;
  target: string;
  workerRunner?: WorkerRunner;
  writeRunner?: WriteRunner;
  workerAdapters?: WorkerAdapterRegistry;
  resume?: boolean;
};

export async function runWorkflow(options: RunWorkflowOptions): Promise<RunStore> {
  const target = resolve(options.target);
  const store = await RunStore.create(options.spec, target);
  await executeWorkflow({ ...options, target, store });
  return store;
}

export type ExecuteWorkflowOptions = RunWorkflowOptions & {
  store: RunStore;
};

export async function executeWorkflow(options: ExecuteWorkflowOptions): Promise<RunStore> {
  const target = resolve(options.target);
  const store = options.store;
  let context: DiffContext | undefined;

  if (options.resume) {
    await assertResumable(store);
  }

  try {
    for (const phase of options.spec.phases) {
      const phaseState = await readPhaseState(store, phase.id);
      if (isPhaseCompleteForExecution(phaseState)) {
        continue;
      }

      if (phase.kind === "command") {
        if (phase.id !== "collect") {
          throw new Error(`Unsupported command phase: ${phase.id}`);
        }
        context = await runCollectPhase(store, target);
        continue;
      }

      if (phase.kind === "gate") {
        if (phaseState.status === "waiting") {
          return store;
        }
        await store.waitAtGate(phase.id, phase.prompt);
        return store;
      }

      if (phase.kind === "write-preview") {
        context = context ?? (await loadContextForRun(store, target));
        await runWritePreviewPhase(store, phase, context, resolveWritePolicy(options.spec));
        continue;
      }

      if (phase.kind === "codex-parallel") {
        context = context ?? (await loadContextForRun(store, target));
        await assertTargetDiffUnchanged(target, expectedTrackedDiffHash(context), "Target repo diff changed before Codex workers resumed.");
        await runCodexParallelPhase(store, phase, context, target, options);
        continue;
      }

      if (phase.kind === "codex-write") {
        context = context ?? (await loadContextForRun(store, target));
        await assertTargetDiffUnchanged(target, expectedTrackedDiffHash(context), "Target repo diff changed after write preview; rerun the workflow before writing.");
        await runCodexWritePhase(store, phase, context, target, options);
        continue;
      }

      if (phase.kind === "reducer") {
        context = context ?? (await loadContextForRun(store, target));
        if (!options.spec.capabilities?.writes) {
          await assertTargetDiffUnchanged(target, expectedTrackedDiffHash(context), "Target repo diff changed during read-only diff-review run.");
        }
        await runReducerPhase(store, phase, context);
      }
    }

    const finalState = await store.readState();
    if (finalState.phases.every((phase) => phase.status === "completed" || phase.status === "approved")) {
      await store.appendEvent("run.completed", { run_id: store.runId });
    }
    return store;
  } catch (error) {
    const state = await store.readState();
    state.status = "failed";
    state.error = error instanceof Error ? error.message : String(error);
    state.failure_summary = buildFailureSummary(state, state.error);
    await store.writeState(state);
    await store.appendEvent("run.failed", { error: state.error });
    throw error;
  }
}

async function runCollectPhase(store: RunStore, target: string): Promise<DiffContext> {
  await store.updatePhase("collect", "running");
  const context = {
    ...(await collectDiffContext(target)),
    tracked_diff_hash: await currentDiffHash(target),
  };
  await store.writeContext(context);
  await store.appendEvent("collect.context", {
    branch: context.branch,
    changed_files: context.changed_files,
    diff_hash: context.diff_hash,
    truncated: context.truncated,
  });
  await store.updatePhase("collect", "completed");
  return context;
}

async function runWritePreviewPhase(
  store: RunStore,
  phase: Extract<WorkflowPhase, { kind: "write-preview" }>,
  context: DiffContext,
  policy: WritePolicy,
): Promise<void> {
  await store.updatePhase(phase.id, "running");
  await writeRunArtifact(
    store,
    "write-plan.md",
    [
      "# Write Plan",
      "",
      phase.prompt,
      "",
      "## Scope",
      "",
      `Target: ${context.target}`,
      `Branch: ${context.branch}`,
      "",
      "## Pre-write Changed Files",
      "",
      ...(context.changed_files.length > 0 ? context.changed_files.map((file) => `- ${file}`) : ["- none"]),
      "",
      "## Safety",
      "",
      "- This preview phase does not modify target files.",
      "- The workflow must pause at a gate before any phase with `writes:true` runs.",
      `- Write policy mode: \`${policy.mode}\`.`,
      `- Allowed paths: ${policy.allowed_paths.map((path) => `\`${path}\``).join(", ")}`,
      `- Forbidden paths: ${policy.forbidden_paths.map((path) => `\`${path}\``).join(", ")}`,
      "- Rollback evidence is generated before and after the write phase.",
    ].join("\n"),
  );
  await writeRunArtifact(
    store,
    "dry-run-preview.md",
    [
      "# Dry Run Preview",
      "",
      "No target files were modified by this preview.",
      "",
      "The approved write worker will receive the collected diff context and must keep edits scoped to the workflow prompt.",
      "Write workflows generate `artifacts/proposed.patch` from an isolated copy before CWF applies it to the target repo.",
      "",
      "Pre-write diff hash:",
      "",
      `\`${context.diff_hash}\``,
    ].join("\n"),
  );
  await writeRunArtifact(
    store,
    "verification-plan.md",
    [
      "# Verification Plan",
      "",
      policy.verification_commands.length > 0
        ? "CWF will run these verification commands after applying an approved patch:"
        : "No workflow-level verification commands are configured.",
      "",
      ...(policy.verification_commands.length > 0 ? policy.verification_commands.map((command) => `- \`${command}\``) : ["- none"]),
    ].join("\n"),
  );
  await writeRunArtifact(
    store,
    "rollback.md",
    [
      "# Rollback",
      "",
      "Before approval, no target-file rollback is required because the preview phase only wrote run artifacts.",
      "",
      "After approval, inspect `artifacts/diff-summary.md` for changed files and use normal git rollback commands on the disposable or working repo if needed.",
    ].join("\n"),
  );
  await store.appendEvent("write.preview", {
    phase: phase.id,
    artifacts: ["artifacts/write-plan.md", "artifacts/dry-run-preview.md", "artifacts/verification-plan.md", "artifacts/rollback.md"],
  });
  await store.updatePhase(phase.id, "completed");
}

function expectedTrackedDiffHash(context: DiffContext): string {
  return context.tracked_diff_hash ?? context.diff_hash;
}

async function runCodexParallelPhase(
  store: RunStore,
  phase: Extract<WorkflowPhase, { kind: "codex-parallel" }>,
  context: DiffContext,
  target: string,
  options: ExecuteWorkflowOptions,
): Promise<void> {
  await store.updatePhase(phase.id, "running");
  const workerResults = await Promise.all(
    phase.workers.map(async (worker): Promise<WorkerResult> => {
      await store.updateWorker(worker.id, "running");
      const runnerOptions = {
        target,
        timeoutMs: Number(process.env.CWF_WORKER_TIMEOUT_MS || options.spec.defaults.timeout_ms),
        codexPath: process.env.CWF_CODEX_PATH,
        runtime: options.spec.runtime,
        workflowId: options.spec.id,
        runId: store.runId,
      };
      const result = options.workerRunner
        ? await options.workerRunner(worker, context, runnerOptions)
        : await runWorkerWithAdapter(worker, context, runnerOptions, options.workerAdapters);
      await store.writeWorkerResult(result);
      await store.updateWorker(worker.id, result.status, result.error);
      return result;
    }),
  );

  if (workerResults.every((result) => result.status === "failed")) {
    const error = "All Codex workers failed; verify worker adapter connectivity and worker logs before changing workflow design.";
    await store.updatePhase(phase.id, "failed", error);
    throw new Error(error);
  }
  await store.updatePhase(phase.id, "completed");
}

async function runCodexWritePhase(
  store: RunStore,
  phase: Extract<WorkflowPhase, { kind: "codex-write" }>,
  context: DiffContext,
  target: string,
  options: ExecuteWorkflowOptions,
): Promise<void> {
  await store.updatePhase(phase.id, "running");
  await store.updateWorker(phase.worker.id, "running");
  const runner = options.writeRunner ?? runCodexWriteWorker;
  const policy = resolveWritePolicy(options.spec);
  const result = await runPatchWriteWorker(store, phase.worker, context, target, options, runner, policy);
  await store.writeWorkerResult(result);
  await store.updateWorker(phase.worker.id, result.status, result.error);
  if (result.status === "failed") {
    const error = result.error ?? `Write worker ${phase.worker.id} failed.`;
    await store.updatePhase(phase.id, "failed", error);
    throw new Error(error);
  }
  await store.updatePhase(phase.id, "completed");
}

async function runPatchWriteWorker(
  store: RunStore,
  worker: WorkflowWorker,
  context: DiffContext,
  target: string,
  options: ExecuteWorkflowOptions,
  runner: WriteRunner,
  policy: WritePolicy,
): Promise<WorkerResult> {
  const isolated = await createIsolatedWriteTarget(target);
  try {
    const result = await runner(worker, { ...context, target: isolated.path }, {
      target: isolated.path,
      timeoutMs: Number(process.env.CWF_WORKER_TIMEOUT_MS || options.spec.defaults.timeout_ms),
      codexPath: process.env.CWF_CODEX_PATH,
    });
    if (result.status === "failed") {
      await writePostWriteArtifacts(store, target, context, result, [], []);
      return result;
    }

    const patch = await generatePatch(isolated.path);
    const patchPath = await writeRunFile(store, "proposed.patch", patch);
    await writeRunArtifact(
      store,
      "proposed-patch.md",
      [
        "# Proposed Patch",
        "",
        `Generated from isolated target: \`${isolated.path}\``,
        `Patch artifact: \`${patchPath}\``,
        "",
        "CWF scans this patch against `write_policy`, runs `git apply --check --3way`, and only then applies it to the target repo.",
      ].join("\n"),
    );

    let changedFiles: string[] = [];
    let verificationResults: VerificationResult[] = [];
    try {
      await assertTargetDiffUnchanged(target, expectedTrackedDiffHash(context), "Target repo diff changed before safe patch apply; rerun the workflow before writing.");
      changedFiles = await applySafePatch(target, patch, policy, patchPath);
      verificationResults = await runVerificationCommands(target, policy.verification_commands);
      const failedVerification = verificationResults.find((item) => item.status === "failed");
      if (failedVerification) {
        try {
          await revertAppliedPatch(target, patchPath);
          await writePostWriteArtifacts(store, target, context, result, [], verificationResults);
          return failedWriteResult(result, new Error(`verification failed: ${failedVerification.command}; applied patch was reverted`));
        } catch (rollbackError) {
          await writePostWriteArtifacts(store, target, context, result, changedFiles, verificationResults);
          return failedWriteResult(
            result,
            new Error(
              `verification failed: ${failedVerification.command}; rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
            ),
          );
        }
      }
      await writePostWriteArtifacts(store, target, context, result, changedFiles, verificationResults);
    } catch (error) {
      await writePostWriteArtifacts(store, target, context, result, changedFiles, verificationResults);
      return failedWriteResult(result, error);
    }

    return {
      ...result,
      artifacts: [...new Set([...result.artifacts, "artifacts/proposed.patch", "artifacts/proposed-patch.md", "artifacts/diff-summary.md", "artifacts/verification.md", "artifacts/rollback.md"])],
    };
  } finally {
    await isolated.cleanup();
  }
}

async function runReducerPhase(
  store: RunStore,
  phase: Extract<WorkflowPhase, { kind: "reducer" }>,
  context: DiffContext,
): Promise<void> {
  await store.updatePhase(phase.id, "running");
  const workerResults = await store.readWorkerResults();
  const state = await store.readState();
  const artifacts = [...buildArtifactRefs(store, workerResults, state.log_path), ...(await buildGeneratedArtifactRefs(store))];
  const workflow = await store.readWorkflow();
  const reduced = reduceDiffReview(workerResults, artifacts, workflow.id);
  await store.writeReducedResult(reduced);
  const markdown = renderMarkdownResult(reduced, context, workerResults, store.runDir);
  await store.updatePhase(phase.id, "completed");
  await store.writeResult(markdown);
  await store.writeArtifactManifest(buildArtifactManifest(store, workflow.id, artifacts));
}

function buildArtifactRefs(store: RunStore, workerResults: WorkerResult[], logPath?: string): ArtifactRef[] {
  const artifacts: ArtifactRef[] = [
    {
      id: "workflow",
      type: "workflow",
      path: join(store.runDir, "workflow.json"),
      description: "Validated workflow spec snapshot for this run.",
    },
    {
      id: "state",
      type: "state",
      path: join(store.runDir, "state.json"),
      description: "Mutable run state, phase status, worker status, and discovery metadata.",
    },
    {
      id: "events",
      type: "events",
      path: join(store.runDir, "events.jsonl"),
      description: "Append-only chronological event log.",
    },
    {
      id: "context",
      type: "context",
      path: join(store.runDir, "context.json"),
      description: "Collected git diff context reviewed by workers.",
    },
    ...workerResults.map<ArtifactRef>((worker) => ({
      id: `worker:${worker.worker_id}`,
      type: "worker",
      path: join(store.runDir, "workers", `${worker.worker_id}.json`),
      description: `Standard worker result envelope for ${worker.worker_id}.`,
    })),
    {
      id: "reduced-result",
      type: "generated",
      path: join(store.runDir, "artifacts", "reduced-result.json"),
      description: "Stable reduced result envelope used to render the final report.",
    },
    {
      id: "result",
      type: "result",
      path: join(store.runDir, "result.md"),
      description: "Human-readable reduced Markdown report.",
    },
    {
      id: "manifest",
      type: "manifest",
      path: join(store.runDir, "artifacts", "manifest.json"),
      description: "Rebuildable artifact manifest for this run.",
    },
  ];
  if (logPath) {
    artifacts.push({
      id: "log",
      type: "log",
      path: logPath,
      description: "Background process log for this run.",
    });
  }
  return artifacts;
}

async function buildGeneratedArtifactRefs(store: RunStore): Promise<ArtifactRef[]> {
  let files: string[];
  try {
    files = await readdir(join(store.runDir, "artifacts"));
  } catch {
    return [];
  }
  return files
    .filter((file) => (file.endsWith(".md") || file.endsWith(".patch")) && file !== "result.md")
    .sort()
    .map<ArtifactRef>((file) => ({
      id: artifactIdForFile(file),
      type: "generated",
      path: join(store.runDir, "artifacts", file),
      description: generatedArtifactDescription(file),
    }));
}

function buildArtifactManifest(store: RunStore, workflow: string, artifacts: ArtifactRef[]): ArtifactManifest {
  return {
    version: 1,
    run_id: store.runId,
    workflow,
    generated_at: new Date().toISOString(),
    artifacts,
  };
}

async function writeRunArtifact(store: RunStore, fileName: string, markdown: string): Promise<string> {
  return writeRunFile(store, fileName, `${markdown.trimEnd()}\n`);
}

async function writeRunFile(store: RunStore, fileName: string, content: string): Promise<string> {
  await mkdir(join(store.runDir, "artifacts"), { recursive: true });
  const path = join(store.runDir, "artifacts", fileName);
  await writeFile(path, content);
  await store.appendEvent("artifact.generated", { path });
  return path;
}

async function writePostWriteArtifacts(
  store: RunStore,
  target: string,
  context: DiffContext,
  result: WorkerResult,
  policyChangedFiles: string[],
  verificationResults: VerificationResult[],
): Promise<void> {
  const [statusShort, workingTreeDiffStat, stagedDiffStat] = await Promise.all([
    gitOutput(target, ["status", "--short"]),
    gitOutput(target, ["diff", "--stat"]),
    gitOutput(target, ["diff", "--cached", "--stat"]),
  ]);
  const diffStat = [workingTreeDiffStat, stagedDiffStat].filter((part) => part.trim().length > 0).join("\n");
  const changedFiles = statusShort
    .split(/\r?\n/)
    .map((line) => line.trim().slice(2).trim())
    .filter(Boolean);
  await writeRunArtifact(
    store,
    "diff-summary.md",
    [
      "# Diff Summary",
      "",
      `Pre-write diff hash: \`${context.diff_hash}\``,
      `Write worker: \`${result.worker_id}\``,
      "",
      "## Git Status",
      "",
      "```text",
      statusShort.trim() || "(clean)",
      "```",
      "",
      "## Diff Stat",
      "",
      "```text",
      diffStat.trim() || "(no diff)",
      "```",
      "",
      "## Changed Files",
      "",
      ...(changedFiles.length > 0 ? changedFiles.map((file) => `- ${file}`) : ["- none"]),
      "",
      "## Policy-Applied Files",
      "",
      ...(policyChangedFiles.length > 0 ? policyChangedFiles.map((file) => `- ${file}`) : ["- none recorded"]),
    ].join("\n"),
  );
  await writeRunArtifact(
    store,
    "verification.md",
    [
      "# Verification Evidence",
      "",
      `Worker status: \`${result.status}\``,
      `Worker confidence: \`${result.confidence}\``,
      "",
      "## Worker Verification",
      "",
      ...(result.verification.length > 0 ? result.verification.map((item) => `- ${item}`) : ["- No verification evidence returned by worker."]),
      "",
      "## Workflow Verification Commands",
      "",
      ...(verificationResults.length > 0
        ? verificationResults.flatMap((item) => [
            `- ${item.status}: \`${item.command}\``,
            item.output ? `  - Output: ${item.output.replace(/\r?\n/g, " ").slice(0, 500)}` : "  - Output: (none)",
          ])
        : ["- No workflow-level verification commands configured."]),
    ].join("\n"),
  );
  await writeRunArtifact(
    store,
    "rollback.md",
    [
      "# Rollback",
      "",
      "The write phase is intentionally scoped to git-tracked workspace changes.",
      "",
      "Review changed files in `artifacts/diff-summary.md`, then use normal git rollback commands if needed:",
      "",
      "```bash",
      "git diff",
      "git restore <changed-file>",
      "```",
      "",
      "Changed files recorded after write:",
      "",
      ...(changedFiles.length > 0 ? changedFiles.map((file) => `- ${file}`) : ["- none"]),
    ].join("\n"),
  );
}

function resolveWritePolicy(spec: WorkflowSpec): WritePolicy {
  return spec.write_policy ?? {
    mode: "direct-docs",
    allowed_paths: ["docs/**", "README.md", "README.zh-CN.md", "CONTRIBUTING.md", "ACCEPTANCE.md", "RELEASE_NOTES.md"],
    forbidden_paths: [".env", ".env.*", "**/.env", "**/.env.*", "**/*secret*", "**/*credential*", "**/*private-key*", ".git", ".git/**", "node_modules/**"],
    verification_commands: [],
  };
}

function failedWriteResult(result: WorkerResult, error: unknown): WorkerResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    ...result,
    status: "failed",
    confidence: "low",
    summary: `${result.summary}\n\nSafe write failed: ${message}`,
    error: message,
    verification: [...result.verification, `Safe write failed: ${message}`],
  };
}

async function loadContextForRun(store: RunStore, target: string): Promise<DiffContext> {
  try {
    return await store.readContext();
  } catch {
    return collectDiffContext(target);
  }
}

async function assertTargetDiffUnchanged(target: string, expectedDiffHash: string, message: string): Promise<void> {
  const current = await currentDiffHash(target);
  if (current !== expectedDiffHash) {
    throw new Error(message);
  }
}

async function assertResumable(store: RunStore): Promise<void> {
  const state = await store.readState();
  if (state.status === "waiting") {
    const gate = state.phases.find((phase) => phase.status === "waiting");
    throw new Error(`Run is waiting at gate ${gate?.id ?? "(unknown)"}. Approve or reject it before resume.`);
  }
  if (state.status === "rejected") {
    throw new Error(`Run ${store.runId} was rejected and cannot be resumed.`);
  }
  if (state.status === "completed") {
    throw new Error(`Run ${store.runId} is already completed.`);
  }
  if (!state.phases.some((phase) => phase.status === "approved")) {
    throw new Error(`Run ${store.runId} has no approved gate to resume.`);
  }
}

async function readPhaseState(store: RunStore, id: string): Promise<PhaseState> {
  const state = await store.readState();
  const phase = state.phases.find((item) => item.id === id);
  if (!phase) {
    throw new Error(`Unknown phase: ${id}`);
  }
  return phase;
}

function isPhaseCompleteForExecution(phase: PhaseState): boolean {
  return phase.status === "completed" || phase.status === "approved";
}

async function gitOutput(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd });
    return stdout;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function artifactIdForFile(file: string): string {
  if (file === "proposed.patch") {
    return "proposed-patch-file";
  }
  return file.replace(/\.md$/, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

function generatedArtifactDescription(file: string): string {
  if (file === "proposed.patch") {
    return "Patch generated in an isolated write target before safe apply.";
  }
  if (file === "proposed-patch.md") {
    return "Human-readable proposed patch pointer and apply policy note.";
  }
  if (file === "write-plan.md") {
    return "Pre-approval write plan for a gated write-capable workflow.";
  }
  if (file === "dry-run-preview.md") {
    return "Pre-approval dry-run preview proving no target files were changed yet.";
  }
  if (file === "diff-summary.md") {
    return "Post-write git status, diff stat, and changed-file summary.";
  }
  if (file === "rollback.md") {
    return "Rollback notes for the gated write phase.";
  }
  if (file === "verification.md") {
    return "Verification evidence returned by the write worker.";
  }
  return "Generated workflow artifact.";
}
