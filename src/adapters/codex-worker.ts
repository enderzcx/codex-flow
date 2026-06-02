import { Codex } from "@openai/codex-sdk";
import type { DiffContext, WorkerResult, WorkflowWorker, WorkerOutput } from "../types.js";

export const WORKER_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["worker_id", "summary", "findings", "verification", "confidence"],
  properties: {
    worker_id: { type: "string" },
    summary: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["severity", "title", "evidence", "reason", "suggested_fix"],
        properties: {
          severity: { type: "string", enum: ["critical", "high", "medium", "low", "info"] },
          title: { type: "string" },
          evidence: { type: "string" },
          reason: { type: "string" },
          suggested_fix: { type: "string" },
        },
      },
    },
    verification: {
      type: "array",
      items: { type: "string" },
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
};

export type RunCodexWorkerOptions = {
  target: string;
  timeoutMs: number;
  codexPath?: string;
};

export async function runCodexWorker(
  worker: WorkflowWorker,
  context: DiffContext,
  options: RunCodexWorkerOptions,
): Promise<WorkerResult> {
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const prompt = buildWorkerPrompt(worker, context);

  try {
    const codex = new Codex({
      codexPathOverride: options.codexPath,
    });
    const thread = codex.startThread({
      workingDirectory: options.target,
      sandboxMode: "read-only",
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
      started_at: startedAt,
      completed_at: new Date(completed).toISOString(),
      duration_ms: completed - started,
      prompt,
      raw,
      result: parsed.output,
      raw_fallback: parsed.rawFallback,
      usage: turn.usage,
    };
  } catch (error) {
    const completed = Date.now();
    return {
      worker_id: worker.id,
      status: "failed",
      started_at: startedAt,
      completed_at: new Date(completed).toISOString(),
      duration_ms: completed - started,
      prompt,
      raw: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function parseWorkerOutput(workerId: string, raw: string): { output: WorkerOutput; rawFallback: boolean } {
  try {
    const parsed = JSON.parse(raw) as WorkerOutput;
    return { output: normalizeWorkerOutput(workerId, parsed), rawFallback: false };
  } catch {
    return {
      output: {
        worker_id: workerId,
        summary: raw.trim() || "Worker returned malformed JSON.",
        findings: [],
        verification: [],
        confidence: "low",
      },
      rawFallback: true,
    };
  }
}

function normalizeWorkerOutput(workerId: string, output: WorkerOutput): WorkerOutput {
  return {
    worker_id: output.worker_id || workerId,
    summary: output.summary || "",
    findings: Array.isArray(output.findings) ? output.findings : [],
    verification: Array.isArray(output.verification) ? output.verification : [],
    confidence: output.confidence || "medium",
  };
}

function buildWorkerPrompt(worker: WorkflowWorker, context: DiffContext): string {
  return `You are a read-only Codex worker inside the public codex-workflows diff-review MVP.

Worker id: ${worker.id}
Perspective: ${worker.perspective}

Task:
${worker.prompt}

Rules:
- Do not modify files.
- Review only the supplied context and diff.
- Prefer concrete findings with file/diff evidence.
- Do not invent line numbers if the diff does not provide them.
- Return JSON only. No Markdown, no prose outside JSON.
- If there are no findings, return an empty findings array and explain briefly in summary.

Target repo: ${context.target}
Branch: ${context.branch}
Changed files:
${context.changed_files.length > 0 ? context.changed_files.map((file) => `- ${file}`).join("\n") : "- none"}

Git status:
${context.status_short || "(clean)"}

Package metadata:
${context.package_metadata || "(none)"}

Diff hash: ${context.diff_hash}
Diff truncated: ${context.truncated ? "yes" : "no"}

Diff:
${context.diff}
`;
}
