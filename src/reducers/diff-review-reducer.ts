import type { ArtifactRef, ReducedFinding, ReducedResult, Severity, WorkerProvenance, WorkerResult } from "../types.js";

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

export function reduceDiffReview(workerResults: WorkerResult[], artifacts: ArtifactRef[]): ReducedResult {
  const findingsByKey = new Map<string, ReducedFinding>();
  const verificationGaps = new Set<string>();
  const nextActions = new Set<string>();
  const workerProvenance = workerResults.map(toWorkerProvenance);

  for (const result of workerResults) {
    if (result.status !== "completed") {
      verificationGaps.add(`Worker ${result.worker_id} did not complete: ${result.error || "unknown error"}`);
      continue;
    }
    if (result.raw_fallback) {
      verificationGaps.add(`Worker ${result.worker_id} used raw fallback: ${result.fallback_reason || "malformed structured output"}`);
    }

    for (const check of result.verification) {
      if (check.trim()) {
        verificationGaps.add(check.trim());
      }
    }

    for (const finding of result.findings) {
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
        existing.confidence = mergeConfidence(existing.confidence, result.confidence);
      } else {
        findingsByKey.set(key, {
          ...finding,
          worker_ids: [result.worker_id],
          confidence: result.confidence,
        });
      }
      if (finding.suggested_fix.trim()) {
        nextActions.add(finding.suggested_fix.trim());
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

  const degraded = workerResults.some((result) => result.status !== "completed" || result.raw_fallback);
  const verdict = findings.some((finding) => finding.severity === "critical" || finding.severity === "high")
    ? "fail"
    : degraded
      ? "degraded"
      : findings.length > 0
        ? "review"
        : "pass";

  return {
    verdict,
    summary: summarizeReduction(verdict, workerResults, findings.length),
    findings,
    verification_gaps: [...verificationGaps],
    next_actions: [...nextActions],
    worker_provenance: workerProvenance,
    artifacts,
  };
}

function isUnsupported(result: WorkerResult, evidence: string): boolean {
  const normalizedEvidence = evidence.trim().toLowerCase();
  return result.confidence === "low" && (!normalizedEvidence || normalizedEvidence === "none" || normalizedEvidence === "n/a");
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

function toWorkerProvenance(result: WorkerResult): WorkerProvenance {
  return {
    worker_id: result.worker_id,
    status: result.status,
    confidence: result.confidence,
    summary: result.summary,
    finding_count: result.findings.length,
    verification_count: result.verification.length,
    artifact_count: result.artifacts.length,
    raw_fallback: result.raw_fallback,
    fallback_reason: result.fallback_reason,
    error: result.error,
  };
}

function summarizeReduction(verdict: ReducedResult["verdict"], workerResults: WorkerResult[], findingCount: number): string {
  const failed = workerResults.filter((result) => result.status !== "completed").length;
  const fallback = workerResults.filter((result) => result.raw_fallback).length;
  const completed = workerResults.length - failed;
  if (verdict === "degraded") {
    return `Review completed with degraded evidence: ${completed}/${workerResults.length} workers completed, ${fallback} raw fallback, ${findingCount} supported findings.`;
  }
  return `Review completed: ${completed}/${workerResults.length} workers completed, ${fallback} raw fallback, ${findingCount} supported findings.`;
}
