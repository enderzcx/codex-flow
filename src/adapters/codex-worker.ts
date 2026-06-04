import { Codex } from "@openai/codex-sdk";
import type { DiffContext, WorkerAdapterName, WorkerResult, WorkflowWorker, WorkerOutput } from "../types.js";

export const WORKER_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["worker_id", "summary", "findings", "verification", "artifacts", "confidence"],
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
    artifacts: {
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
  requestedAdapter?: WorkerAdapterName;
  fallbackUsed?: boolean;
  fallbackReason?: string;
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
      fallback_reason: parsed.rawFallback ? "Worker returned malformed JSON; raw text was preserved as summary." : undefined,
      retry_count: 0,
      usage: turn.usage,
      runtime: buildSdkRuntime(worker, options),
    };
  } catch (error) {
    const completed = Date.now();
    return {
      worker_id: worker.id,
      status: "failed",
      confidence: "low",
      summary: "Worker failed before returning a usable result.",
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
      runtime: buildSdkRuntime(worker, options),
    };
  }
}

export function parseWorkerOutput(workerId: string, raw: string): { output: WorkerOutput; rawFallback: boolean } {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isWorkerOutput(parsed)) {
      throw new Error("Worker JSON did not match the worker envelope.");
    }
    return { output: normalizeWorkerOutput(workerId, parsed), rawFallback: false };
  } catch {
    return {
      output: {
        worker_id: workerId,
        summary: raw.trim() || "Worker returned malformed JSON.",
        findings: [],
        verification: [],
        artifacts: [],
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
    artifacts: Array.isArray(output.artifacts) ? output.artifacts : [],
    confidence: output.confidence || "medium",
  };
}

function isWorkerOutput(value: unknown): value is WorkerOutput {
  if (!value || typeof value !== "object") {
    return false;
  }
  const output = value as WorkerOutput;
  return (
    typeof output.summary === "string" &&
    Array.isArray(output.findings) &&
    output.findings.every(isFinding) &&
    Array.isArray(output.verification) &&
    output.verification.every((item) => typeof item === "string") &&
    Array.isArray(output.artifacts) &&
    output.artifacts.every((item) => typeof item === "string") &&
    (output.confidence === "high" || output.confidence === "medium" || output.confidence === "low")
  );
}

function isFinding(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  const finding = value as Record<string, unknown>;
  return (
    (finding.severity === "critical" || finding.severity === "high" || finding.severity === "medium" || finding.severity === "low" || finding.severity === "info") &&
    typeof finding.title === "string" &&
    typeof finding.evidence === "string" &&
    typeof finding.reason === "string" &&
    typeof finding.suggested_fix === "string"
  );
}

function buildSdkRuntime(worker: WorkflowWorker, options: RunCodexWorkerOptions): WorkerResult["runtime"] {
  return {
    adapter: "codex-sdk-headless",
    requested_adapter: options.requestedAdapter,
    fallback_adapter: options.fallbackUsed ? "codex-sdk-headless" : undefined,
    fallback_used: Boolean(options.fallbackUsed),
    fallback_reason: options.fallbackReason,
    agent_role: worker.perspective || worker.id,
    transcript_read: false,
    sandbox: "read-only",
    approval_policy: "never",
  };
}

export function buildWorkerPrompt(worker: WorkflowWorker, context: DiffContext): string {
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
- Use exactly this top-level JSON shape:
  {"worker_id":"${worker.id}","summary":"...","findings":[],"verification":[],"artifacts":[],"confidence":"high|medium|low"}
- Each finding must use exactly:
  {"severity":"critical|high|medium|low|info","title":"...","evidence":"...","reason":"...","suggested_fix":"..."}
- Do not use alternate finding keys such as file, line, message, issue, impact, or recommendation.
- Include an artifacts array; use [] when you did not create or reference extra artifacts.
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
