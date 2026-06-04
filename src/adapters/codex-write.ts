import { Codex } from "@openai/codex-sdk";
import { parseWorkerOutput, WORKER_OUTPUT_SCHEMA } from "./codex-worker.js";
import type { DiffContext, WorkerResult, WorkflowWorker } from "../types.js";

export type RunCodexWriteOptions = {
  target: string;
  timeoutMs: number;
  codexPath?: string;
};

export async function runCodexWriteWorker(
  worker: WorkflowWorker,
  context: DiffContext,
  options: RunCodexWriteOptions,
): Promise<WorkerResult> {
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const prompt = buildWritePrompt(worker, context);

  try {
    const codex = new Codex({
      codexPathOverride: options.codexPath,
    });
    const thread = codex.startThread({
      workingDirectory: options.target,
      sandboxMode: "workspace-write",
      approvalPolicy: "never",
      modelReasoningEffort: "low",
      webSearchMode: "disabled",
      webSearchEnabled: false,
      skipGitRepoCheck: false,
    });
    const signal = AbortSignal.timeout(options.timeoutMs);
    const turn = await thread.run(prompt, {
      outputSchema: WORKER_OUTPUT_SCHEMA,
      signal,
    });
    const completed = Date.now();
    const raw = turn.finalResponse;
    const parsed = parseWorkerOutput(worker.id, raw);

    return {
      worker_id: worker.id,
      status: "completed",
      confidence: parsed.output.confidence,
      summary: parsed.output.summary,
      findings: parsed.output.findings,
      verification: parsed.output.verification,
      artifacts: parsed.output.artifacts,
      started_at: startedAt,
      completed_at: new Date(completed).toISOString(),
      duration_ms: completed - started,
      prompt,
      raw,
      raw_fallback: parsed.rawFallback,
      fallback_reason: parsed.rawFallback ? "Writer returned malformed JSON; raw text was preserved as summary." : undefined,
      retry_count: 0,
      usage: turn.usage,
      runtime: {
        adapter: "codex-sdk-headless",
        fallback_used: false,
        agent_role: worker.perspective || worker.id,
        transcript_read: false,
        sandbox: "workspace-write",
        approval_policy: "never",
        worktree_path: options.target,
      },
    };
  } catch (error) {
    const completed = Date.now();
    return {
      worker_id: worker.id,
      status: "failed",
      confidence: "low",
      summary: "Write worker failed before returning a usable result.",
      findings: [],
      verification: [],
      artifacts: [],
      started_at: startedAt,
      completed_at: new Date(completed).toISOString(),
      duration_ms: completed - started,
      prompt,
      raw: "",
      raw_fallback: false,
      retry_count: 0,
      error: error instanceof Error ? error.message : String(error),
      runtime: {
        adapter: "codex-sdk-headless",
        fallback_used: false,
        agent_role: worker.perspective || worker.id,
        transcript_read: false,
        sandbox: "workspace-write",
        approval_policy: "never",
        worktree_path: options.target,
      },
    };
  }
}

function buildWritePrompt(worker: WorkflowWorker, context: DiffContext): string {
  return `You are a Codex write worker inside a gated Codex Flow run.

Worker id: ${worker.id}
Perspective: ${worker.perspective}

Task:
${worker.prompt}

Rules:
- The workflow already paused for explicit human approval before this write phase.
- Modify only files directly required by the task.
- Do not touch credentials, databases, deployments, payment, permissions, or irreversible external systems.
- Keep changes reversible and small.
- Return JSON only. No Markdown, no prose outside JSON.
- Include verification commands or manual checks in the verification array.
- Include artifacts or changed file paths in the artifacts array.

Target repo: ${context.target}
Branch: ${context.branch}
Pre-write changed files:
${context.changed_files.length > 0 ? context.changed_files.map((file) => `- ${file}`).join("\n") : "- none"}

Pre-write git status:
${context.status_short || "(clean)"}

Pre-write diff hash: ${context.diff_hash}
Diff truncated: ${context.truncated ? "yes" : "no"}

Pre-write diff:
${context.diff}
`;
}
