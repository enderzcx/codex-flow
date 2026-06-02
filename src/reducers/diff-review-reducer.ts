import type { ReducedFinding, ReducedResult, Severity, WorkerResult } from "../types.js";

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

export function reduceDiffReview(workerResults: WorkerResult[], artifacts: string[]): ReducedResult {
  const findingsByKey = new Map<string, ReducedFinding>();
  const verificationGaps = new Set<string>();
  const suggestedNextActions = new Set<string>();

  for (const result of workerResults) {
    if (result.status !== "completed" || !result.result) {
      verificationGaps.add(`Worker ${result.worker_id} did not complete: ${result.error || "unknown error"}`);
      continue;
    }

    for (const check of result.result.verification) {
      if (check.trim()) {
        verificationGaps.add(check.trim());
      }
    }

    for (const finding of result.result.findings) {
      if (isUnsupported(result, finding.evidence)) {
        continue;
      }
      const key = findingKey(finding.title, finding.evidence);
      const existing = findingsByKey.get(key);
      if (existing) {
        existing.worker_ids = [...new Set([...existing.worker_ids, result.worker_id])];
        if (SEVERITY_RANK[finding.severity] > SEVERITY_RANK[existing.severity]) {
          existing.severity = finding.severity;
        }
        if (finding.reason.length > existing.reason.length) {
          existing.reason = finding.reason;
        }
        if (finding.suggested_fix.length > existing.suggested_fix.length) {
          existing.suggested_fix = finding.suggested_fix;
        }
        existing.confidence = mergeConfidence(existing.confidence, result.result.confidence);
      } else {
        findingsByKey.set(key, {
          ...finding,
          worker_ids: [result.worker_id],
          confidence: result.result.confidence,
        });
      }
      if (finding.suggested_fix.trim()) {
        suggestedNextActions.add(finding.suggested_fix.trim());
      }
    }
  }

  const findings = [...findingsByKey.values()].sort((a, b) => {
    const severityDelta = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (severityDelta !== 0) {
      return severityDelta;
    }
    return a.title.localeCompare(b.title);
  });

  return {
    verdict: findings.some((finding) => finding.severity === "critical" || finding.severity === "high")
      ? "fail"
      : findings.length > 0
        ? "review"
        : "pass",
    findings,
    verification_gaps: [...verificationGaps],
    suggested_next_actions: [...suggestedNextActions],
    artifacts,
  };
}

function isUnsupported(result: WorkerResult, evidence: string): boolean {
  const normalizedEvidence = evidence.trim().toLowerCase();
  return result.result?.confidence === "low" && (!normalizedEvidence || normalizedEvidence === "none" || normalizedEvidence === "n/a");
}

function findingKey(title: string, evidence: string): string {
  return `${normalize(title)}::${normalize(evidence)}`;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9/._:-]+/g, " ").trim();
}

function mergeConfidence(a: "high" | "medium" | "low", b: "high" | "medium" | "low"): "high" | "medium" | "low" {
  if (a === "high" || b === "high") {
    return "high";
  }
  if (a === "medium" || b === "medium") {
    return "medium";
  }
  return "low";
}

