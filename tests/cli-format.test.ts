import { describe, expect, it } from "vitest";
import { DEFAULT_FAILURE_POLICY } from "../src/run-index.js";
import { formatHelp, formatRunList, formatRunShow, formatStatus, formatWatchFrame } from "../src/cli.js";
import type { RunState, WorkerResult } from "../src/types.js";

describe("CLI output formatting", () => {
  it("shows the normal workflow path in help", () => {
    const help = formatHelp();

    expect(help).toContain("cwf validate <workflow.yaml>");
    expect(help).toContain("cwf run workflows/diff-review.yaml --target . --background");
    expect(help).toContain("cwf status <run-id>");
    expect(help).toContain("cwf watch <run-id>");
    expect(help).toContain("cwf list [--limit <n>] [--status <status>] [--target <repo>]");
    expect(help).toContain("cwf latest [--target <repo>]");
    expect(help).toContain("cwf show <run-id>");
  });

  it("explains active work and artifact paths in status output", () => {
    const state = createState({
      phases: [
        { id: "collect", status: "completed", started_at: "2026-01-01T00:00:00.000Z", completed_at: "2026-01-01T00:00:01.000Z" },
        { id: "review", status: "running", started_at: "2026-01-01T00:00:01.000Z" },
        { id: "reduce", status: "pending" },
      ],
      workers: [
        { id: "correctness", status: "completed", started_at: "2026-01-01T00:00:01.000Z", completed_at: "2026-01-01T00:00:03.000Z" },
        { id: "tests", status: "running", started_at: "2026-01-01T00:00:02.000Z" },
        { id: "safety", status: "pending" },
      ],
      background_pid: 12345,
      log_path: "/tmp/cwf/run.log",
    });
    const workerResults: WorkerResult[] = [
      {
        worker_id: "correctness",
        status: "completed",
        started_at: "2026-01-01T00:00:01.000Z",
        completed_at: "2026-01-01T00:00:03.000Z",
        duration_ms: 2000,
        prompt: "review",
        raw: "{}",
        raw_fallback: true,
        result: {
          worker_id: "correctness",
          summary: "ok",
          findings: [],
          verification: [],
          confidence: "high",
        },
      },
    ];

    const output = formatStatus(state, workerResults, Date.parse("2026-01-01T00:00:05.000Z"));

    expect(output).toContain("Now: reviewing diff with tests");
    expect(output).toContain("Failure policy: worker failures are tolerated");
    expect(output).toContain("Workers: 1/3 completed, 1 fallback");
    expect(output).toContain("Active phase: review");
    expect(output).toContain("- tests: running (3s)");
    expect(output).toContain("- correctness: completed (2s), fallback, findings=0");
    expect(output).toContain("- Result: not ready yet");
    expect(output).toContain("- Log: /tmp/cwf/run.log");
    expect(output).toContain("PID: 12345");
  });

  it("points completed runs at their final report", () => {
    const state = createState({
      status: "completed",
      phases: [
        { id: "collect", status: "completed" },
        { id: "review", status: "completed" },
        { id: "reduce", status: "completed" },
      ],
      workers: [{ id: "correctness", status: "completed" }],
      result_path: "/tmp/cwf/result.md",
    });

    const output = formatStatus(state);

    expect(output).toContain("Now: done; open the result report");
    expect(output).toContain("- Result: /tmp/cwf/result.md");
  });

  it("renders a live watch frame around status output", () => {
    const state = createState({
      workers: [{ id: "correctness", status: "running", started_at: "2026-01-01T00:00:01.000Z" }],
    });

    const output = formatWatchFrame(state, [], 500, Date.parse("2026-01-01T00:00:03.000Z"));

    expect(output).toContain("cwf watch run_test");
    expect(output).toContain("Auto-refresh: 500ms");
    expect(output).toContain("Now: reviewing diff with correctness");
  });

  it("formats discovered run lists", () => {
    const output = formatRunList([
      {
        id: "run_20260101000000_a",
        workflow: "diff-review",
        status: "completed",
        target: "/tmp/repo",
        run_dir: "/tmp/runs/run_20260101000000_a",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:01.000Z",
      },
    ]);

    expect(output).toContain("Run ID");
    expect(output).toContain("run_20260101000000_a");
    expect(output).toContain("completed");
    expect(output).toContain("/tmp/repo");
  });

  it("shows failure summaries in run detail output", () => {
    const state = createState({
      status: "failed",
      error: "All Codex SDK workers failed; verify Codex SDK connectivity before changing architecture.",
      phases: [
        { id: "collect", status: "completed" },
        { id: "review", status: "failed", error: "All Codex SDK workers failed; verify Codex SDK connectivity before changing architecture." },
        { id: "reduce", status: "pending" },
      ],
      workers: [
        { id: "correctness", status: "failed", error: "mock failure" },
        { id: "tests", status: "failed", error: "mock failure" },
      ],
    });

    const output = formatRunShow(state);

    expect(output).toContain("Failure summary: review phase failed");
    expect(output).toContain("Failed workers: correctness, tests");
    expect(output).toContain("Check Codex SDK connectivity");
    expect(output).toContain("Discovery:");
    expect(output).toContain("cwf latest --target /tmp/repo");
  });
});

function createState(overrides: Partial<RunState> = {}): RunState {
  return {
    id: "run_test",
    workflow: "diff-review",
    status: "running",
    target: "/tmp/repo",
    run_dir: "/tmp/cwf",
    failure_policy: DEFAULT_FAILURE_POLICY,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    phases: [],
    workers: [],
    ...overrides,
  };
}
