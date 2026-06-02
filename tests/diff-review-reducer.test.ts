import { describe, expect, it } from "vitest";
import { reduceDiffReview } from "../src/reducers/diff-review-reducer.js";
import type { WorkerResult } from "../src/types.js";

function worker(worker_id: string, title: string, evidence: string, confidence: "high" | "medium" | "low" = "high"): WorkerResult {
  return {
    worker_id,
    status: "completed",
    started_at: "2026-01-01T00:00:00.000Z",
    completed_at: "2026-01-01T00:00:01.000Z",
    duration_ms: 1000,
    prompt: "prompt",
    raw: "{}",
    result: {
      worker_id,
      summary: "summary",
      confidence,
      verification: [`verify ${worker_id}`],
      findings: [
        {
          severity: "high",
          title,
          evidence,
          reason: `reason from ${worker_id}`,
          suggested_fix: `fix from ${worker_id}`,
        },
      ],
    },
  };
}

describe("reduceDiffReview", () => {
  it("deduplicates matching findings", () => {
    const result = reduceDiffReview(
      [worker("correctness", "Missing zero check", "src/calc.js"), worker("tests", "Missing zero check", "src/calc.js")],
      ["result.md"],
    );

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.worker_ids).toEqual(["correctness", "tests"]);
  });

  it("drops low-confidence unsupported findings", () => {
    const result = reduceDiffReview([worker("safety", "Speculative issue", "none", "low")], ["result.md"]);

    expect(result.findings).toHaveLength(0);
    expect(result.verdict).toBe("pass");
  });
});

