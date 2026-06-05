import { describe, expect, it } from "vitest";
import { validateWorkflowSpec } from "../src/workflow-schema.js";

const validSpec = {
  id: "diff-review",
  version: "0.1.0",
  title: "Diff Review",
  tags: ["review", "read-only"],
  inputs: {
    target: { type: "path", required: true },
  },
  capabilities: { writes: false },
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

  it("accepts a gate phase before review", () => {
    const spec = validateWorkflowSpec({
      ...validSpec,
      phases: [
        { id: "collect", kind: "command" },
        { id: "approve-review", kind: "gate", prompt: "Approve before continuing.", requires_approval: true },
        ...validSpec.phases.slice(1),
      ],
    });

    expect(spec.phases.map((phase) => phase.kind)).toContain("gate");
  });

  it("fails when writes:true appears before any gate", () => {
    expect(() =>
      validateWorkflowSpec({
        ...validSpec,
        capabilities: { writes: true },
        phases: [{ id: "collect", kind: "command", writes: true }, ...validSpec.phases.slice(1)],
      }),
    ).toThrow("phase collect has writes:true but no prior gate phase");
  });

  it("accepts writes:true after a gate", () => {
    expect(() =>
      validateWorkflowSpec({
        ...validSpec,
        capabilities: { writes: true },
        write_policy: {
          mode: "patch",
          allowed_paths: ["docs/**"],
        },
        phases: [
          { id: "collect", kind: "command" },
          { id: "approve-write", kind: "gate", prompt: "Approve write-capable phase.", requires_approval: true },
          {
            id: "review",
            kind: "codex-parallel",
            workers: [{ id: "correctness", perspective: "correctness", prompt: "review correctness", writes: true }],
          },
          { id: "reduce", kind: "reducer", reducer: "diff-review" },
        ],
      }),
    ).not.toThrow();
  });

  it("rejects writes:true when workflow capabilities claim read-only", () => {
    expect(() =>
      validateWorkflowSpec({
        ...validSpec,
        phases: [
          { id: "collect", kind: "command" },
          { id: "approve-write", kind: "gate", prompt: "Approve write-capable phase.", requires_approval: true },
          {
            id: "review",
            kind: "codex-parallel",
            workers: [{ id: "correctness", perspective: "correctness", prompt: "review correctness", writes: true }],
          },
          { id: "reduce", kind: "reducer", reducer: "diff-review" },
        ],
      }),
    ).toThrow("capabilities.writes must be true");
  });

  it("accepts a gated Codex write phase", () => {
    const spec = validateWorkflowSpec({
      ...validSpec,
      id: "doc-refresh",
      capabilities: { writes: true },
      phases: [
        { id: "collect", kind: "command" },
        { id: "preview-write", kind: "write-preview", prompt: "Preview docs write." },
        { id: "approve-write", kind: "gate", prompt: "Approve docs write.", requires_approval: true },
        {
          id: "review",
          kind: "codex-write",
          writes: true,
          worker: {
            id: "doc-refresh",
            perspective: "documentation write",
            prompt: "Update docs only.",
          },
        },
        { id: "reduce", kind: "reducer", reducer: "diff-review" },
      ],
    });

    expect(spec.phases.map((phase) => phase.kind)).toEqual(["command", "write-preview", "gate", "codex-write", "reducer"]);
    expect(spec.write_policy?.mode).toBe("direct-docs");
  });

  it("requires write_policy for non-doc write-capable workflows", () => {
    expect(() =>
      validateWorkflowSpec({
        ...validSpec,
        id: "safe-write-fixture",
        capabilities: { writes: true },
        phases: [
          { id: "collect", kind: "command" },
          { id: "preview-write", kind: "write-preview", prompt: "Preview safe write." },
          { id: "approve-write", kind: "gate", prompt: "Approve safe write.", requires_approval: true },
          {
            id: "review",
            kind: "codex-write",
            writes: true,
            worker: {
              id: "safe-write",
              perspective: "safe write",
              prompt: "Update a bounded file.",
            },
          },
          { id: "reduce", kind: "reducer", reducer: "diff-review" },
        ],
      }),
    ).toThrow("write_policy is required for write-capable workflows except doc-refresh direct-docs compatibility");
  });

  it("accepts explicit patch write_policy for bounded non-doc writes", () => {
    const spec = validateWorkflowSpec({
      ...validSpec,
      id: "safe-write-fixture",
      capabilities: { writes: true },
      write_policy: {
        mode: "patch",
        allowed_paths: ["src/generated/**"],
        forbidden_paths: [".env", ".git", ".git/**"],
        verification_commands: ["test -f src/generated/result.js"],
      },
      phases: [
        { id: "collect", kind: "command" },
        { id: "preview-write", kind: "write-preview", prompt: "Preview safe write." },
        { id: "approve-write", kind: "gate", prompt: "Approve safe write.", requires_approval: true },
        {
          id: "review",
          kind: "codex-write",
          writes: true,
          worker: {
            id: "safe-write",
            perspective: "safe write",
            prompt: "Update a bounded file.",
          },
        },
        { id: "reduce", kind: "reducer", reducer: "diff-review" },
      ],
    });

    expect(spec.write_policy).toEqual({
      mode: "patch",
      allowed_paths: ["src/generated/**"],
      forbidden_paths: [".env", ".git", ".git/**"],
      verification_commands: ["test -f src/generated/result.js"],
    });
  });

  it("rejects unsafe write_policy path patterns", () => {
    expect(() =>
      validateWorkflowSpec({
        ...validSpec,
        id: "safe-write-fixture",
        capabilities: { writes: true },
        write_policy: {
          mode: "patch",
          allowed_paths: ["../outside"],
        },
        phases: [
          { id: "collect", kind: "command" },
          { id: "preview-write", kind: "write-preview", prompt: "Preview safe write." },
          { id: "approve-write", kind: "gate", prompt: "Approve safe write.", requires_approval: true },
          {
            id: "review",
            kind: "codex-write",
            writes: true,
            worker: {
              id: "safe-write",
              perspective: "safe write",
              prompt: "Update a bounded file.",
            },
          },
          { id: "reduce", kind: "reducer", reducer: "diff-review" },
        ],
      }),
    ).toThrow("write_policy.allowed_paths[0] must be a safe repo-relative path pattern");
  });

  it("rejects a Codex write phase before a gate", () => {
    expect(() =>
      validateWorkflowSpec({
        ...validSpec,
        capabilities: { writes: true },
        phases: [
          { id: "collect", kind: "command" },
          {
            id: "review",
            kind: "codex-write",
            writes: true,
            worker: {
              id: "doc-refresh",
              perspective: "documentation write",
              prompt: "Update docs only.",
            },
          },
          { id: "reduce", kind: "reducer", reducer: "diff-review" },
        ],
      }),
    ).toThrow("phase review has writes:true but no prior gate phase");
  });

  it("accepts public Codex worker runtime adapter preferences", () => {
    const spec = validateWorkflowSpec({
      ...validSpec,
      runtime: {
        preferred_worker_adapter: "codex-subagent",
        fallback_worker_adapter: "codex-sdk-headless",
      },
    });

    expect(spec.runtime).toEqual({
      preferred_worker_adapter: "codex-subagent",
      fallback_worker_adapter: "codex-sdk-headless",
    });
  });

  it("rejects non-Codex or private worker runtime adapters", () => {
    expect(() =>
      validateWorkflowSpec({
        ...validSpec,
        runtime: {
          preferred_worker_adapter: "ollama",
        },
      }),
    ).toThrow("runtime.preferred_worker_adapter must be one of codex-sdk-headless, codex-app-thread, codex-subagent, codex-review-detached");
  });
});
