import { describe, expect, it } from "vitest";
import { reduceDiffReview } from "../src/reducers/diff-review-reducer.js";
import type { ArtifactRef, WorkerResult } from "../src/types.js";

const artifacts: ArtifactRef[] = [
  {
    id: "result",
    type: "result",
    path: "result.md",
    description: "Rendered result.",
  },
];

function worker(worker_id: string, title: string, evidence: string, confidence: "high" | "medium" | "low" = "high"): WorkerResult {
  return {
    worker_id,
    status: "completed",
    confidence,
    summary: "summary",
    findings: [
      {
        severity: "high",
        title,
        evidence,
        reason: `reason from ${worker_id}`,
        suggested_fix: `fix from ${worker_id}`,
      },
    ],
    verification: [`verify ${worker_id}`],
    artifacts: [],
    started_at: "2026-01-01T00:00:00.000Z",
    completed_at: "2026-01-01T00:00:01.000Z",
    duration_ms: 1000,
    prompt: "prompt",
    raw: "{}",
    raw_fallback: false,
    retry_count: 0,
  };
}

function cleanWorker(worker_id: string, confidence: "high" | "medium" | "low" = "high"): WorkerResult {
  return {
    ...worker(worker_id, "unused", "unused", confidence),
    findings: [],
  };
}

describe("reduceDiffReview", () => {
  it("deduplicates matching findings", () => {
    const result = reduceDiffReview(
      [worker("correctness", "Missing zero check", "src/calc.js"), worker("tests", "Missing zero check", "src/calc.js")],
      artifacts,
    );

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.worker_ids).toEqual(["correctness", "tests"]);
    expect(result.worker_provenance.map((item) => item.worker_id)).toEqual(["correctness", "tests"]);
  });

  it("drops low-confidence unsupported findings", () => {
    const result = reduceDiffReview([worker("safety", "Speculative issue", "none", "low")], artifacts);

    expect(result.findings).toHaveLength(0);
    expect(result.verdict).toBe("pass");
  });

  it("marks partial worker failures as degraded and preserves provenance", () => {
    const failed = {
      ...cleanWorker("tests", "low"),
      status: "failed" as const,
      summary: "Codex worker failed",
      verification: [],
      error: "mock timeout",
    };

    const result = reduceDiffReview([cleanWorker("correctness", "medium"), failed], artifacts);

    expect(result.verdict).toBe("degraded");
    expect(result.verification_gaps).toContain("Worker tests did not complete: mock timeout");
    expect(result.worker_provenance).toContainEqual(
      expect.objectContaining({ worker_id: "tests", status: "failed", error: "mock timeout" }),
    );
  });

  it("marks raw fallback output as degraded and visible", () => {
    const fallback = {
      ...cleanWorker("safety", "medium"),
      raw_fallback: true,
      fallback_reason: "malformed structured output",
    };

    const result = reduceDiffReview([fallback], artifacts);

    expect(result.verdict).toBe("degraded");
    expect(result.verification_gaps).toContain("Worker safety used raw fallback: malformed structured output");
    expect(result.worker_provenance[0]).toEqual(expect.objectContaining({ raw_fallback: true, fallback_reason: "malformed structured output" }));
  });

  it("reduces mixed adapter worker results without changing review semantics", () => {
    const sdk = {
      ...cleanWorker("correctness", "medium"),
      runtime: {
        adapter: "codex-sdk-headless" as const,
        fallback_used: false,
        agent_role: "correctness",
        transcript_read: false,
        sandbox: "read-only" as const,
        approval_policy: "never" as const,
      },
    };
    const native = {
      ...worker("tests", "Missing branch check", "src/git.ts", "high"),
      runtime: {
        adapter: "codex-app-thread" as const,
        requested_adapter: "codex-app-thread" as const,
        thread_id: "thr_123",
        turn_id: "turn_456",
        agent_role: "tests",
        agent_nickname: "Atlas",
        transcript_read: true,
        fallback_used: false,
        sandbox: "read-only" as const,
        approval_policy: "never" as const,
        result_return_path: "worker-envelope" as const,
      },
    };

    const result = reduceDiffReview([sdk, native], artifacts);

    expect(result.verdict).toBe("fail");
    expect(result.findings).toHaveLength(1);
    expect(result.worker_provenance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          worker_id: "correctness",
          runtime: expect.objectContaining({ adapter: "codex-sdk-headless", transcript_read: false }),
        }),
        expect.objectContaining({
          worker_id: "tests",
          runtime: expect.objectContaining({ adapter: "codex-app-thread", thread_id: "thr_123", turn_id: "turn_456", transcript_read: true }),
        }),
      ]),
    );
  });
});
