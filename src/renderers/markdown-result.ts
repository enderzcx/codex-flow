import type { DiffContext, ReducedResult, WorkerResult } from "../types.js";

export function renderMarkdownResult(result: ReducedResult, context: DiffContext, workerResults: WorkerResult[], runDir: string): string {
  const lines: string[] = [];
  lines.push(`# codex-workflows ${result.workflow}`);
  lines.push("");
  lines.push("## Verdict");
  lines.push("");
  lines.push(`- Verdict: ${result.verdict.toUpperCase()}`);
  lines.push(`- Summary: ${result.summary}`);
  lines.push(`- Target: ${context.target}`);
  lines.push(`- Branch: ${context.branch}`);
  lines.push(`- Diff hash: ${context.diff_hash}`);
  lines.push(`- Run artifacts: ${runDir}`);
  lines.push("");
  lines.push("## Findings");
  lines.push("");

  if (result.findings.length === 0) {
    lines.push("No supported findings.");
  } else {
    for (const finding of result.findings) {
      lines.push(`### [${finding.severity.toUpperCase()}] ${finding.title}`);
      lines.push("");
      lines.push(`- Evidence: ${finding.evidence}`);
      lines.push(`- Reason: ${finding.reason}`);
      lines.push(`- Suggested fix: ${finding.suggested_fix}`);
      lines.push(`- Workers: ${finding.worker_ids.join(", ")}`);
      lines.push(`- Confidence: ${finding.confidence}`);
      lines.push("");
    }
  }

  lines.push("");
  lines.push("## Verification Gaps");
  lines.push("");
  if (result.verification_gaps.length === 0) {
    lines.push("No verification gaps reported.");
  } else {
    for (const gap of result.verification_gaps) {
      lines.push(`- ${gap}`);
    }
  }

  lines.push("");
  lines.push("## Suggested Next Actions");
  lines.push("");
  if (result.next_actions.length === 0) {
    lines.push("No next actions reported.");
  } else {
    for (const action of result.next_actions) {
      lines.push(`- ${action}`);
    }
  }

  lines.push("");
  lines.push("## Worker Summary");
  lines.push("");
  for (const worker of result.worker_provenance) {
    const details = [
      `status=${worker.status}`,
      `confidence=${worker.confidence}`,
      `findings=${worker.finding_count}`,
      `verification=${worker.verification_count}`,
      `artifacts=${worker.artifact_count}`,
      worker.raw_fallback ? `raw_fallback=true${worker.fallback_reason ? ` (${worker.fallback_reason})` : ""}` : "raw_fallback=false",
      worker.error ? `error=${worker.error}` : undefined,
    ].filter(Boolean);
    lines.push(`- ${worker.worker_id}: ${details.join(", ")}`);
  }

  lines.push("");
  lines.push("## Artifacts");
  lines.push("");
  for (const artifact of result.artifacts) {
    lines.push(`- ${artifact.id} (${artifact.type}): ${artifact.path} - ${artifact.description}`);
  }

  return `${lines.join("\n")}\n`;
}
