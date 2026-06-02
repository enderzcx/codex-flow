import { describe, expect, it } from "vitest";
import { validateWorkflowSpec } from "../src/workflow-schema.js";

const validSpec = {
  id: "diff-review",
  version: "0.1.0",
  requires: { target: "git-repo" },
  defaults: { sandbox: "read-only", timeout_ms: 300000 },
  phases: [
    { id: "collect", kind: "command" },
    {
      id: "review",
      kind: "codex-parallel",
      workers: [{ id: "correctness", perspective: "correctness", prompt: "review correctness" }],
    },
    { id: "reduce", kind: "reducer", reducer: "diff-review" },
  ],
  artifacts: ["result.md"],
};

describe("validateWorkflowSpec", () => {
  it("accepts the minimal diff-review spec", () => {
    expect(validateWorkflowSpec(validSpec).id).toBe("diff-review");
  });

  it("fails with a useful field path for invalid workers", () => {
    expect(() =>
      validateWorkflowSpec({
        ...validSpec,
        phases: [{ id: "review", kind: "codex-parallel", workers: [{}] }],
      }),
    ).toThrow("phases[0].workers[0].id");
  });
});

