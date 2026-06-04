import { describe, expect, it } from "vitest";
import { DEFAULT_FAILURE_POLICY } from "../src/run-index.js";
import { formatHelp, formatRunList, formatRunShow, formatStatus, formatWatchFrame } from "../src/cli.js";
import type { RunState, WorkerResult } from "../src/types.js";

describe("CLI output formatting", () => {
  it("shows the normal workflow path in help", () => {
    const help = formatHelp();

    expect(help).toContain("cwf validate <workflow.yaml>");
    expect(help).toContain("cwf workflows list");
    expect(help).toContain("cwf workflows show <workflow-id-or-path>");
    expect(help).toContain("cwf run <workflow-id-or-path> --target <repo> [--background]");
    expect(help).toContain("cwf desktop check");
    expect(help).toContain("cwf desktop result <run-id> [--thread <thread-id>] [--new-thread] [--print]");
    expect(help).toContain("cwf github-pr <run-id> [--format comment|review] [--post --repo <owner/repo> --pr <number>]");
    expect(help).toContain('cwf suggest-workflow --goal "<task>" [--target <repo>] [--output <path>]');
    expect(help).toContain("cwf suggest-workflow --from-run <run-id> [--output <path>]");
    expect(help).toContain("cwf run diff-review --target . --background");
    expect(help).toContain("cwf desktop result <run-id> --print");
    expect(help).toContain("cwf github-pr <run-id> --format comment");
    expect(help).toContain('cwf suggest-workflow --goal "Review docs changes" --target .');
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
        confidence: "high",
        summary: "ok",
        findings: [],
        verification: [],
        artifacts: [],
        started_at: "2026-01-01T00:00:01.000Z",
        completed_at: "2026-01-01T00:00:03.000Z",
        duration_ms: 2000,
        prompt: "review",
        raw: "{}",
        raw_fallback: true,
        fallback_reason: "malformed structured output",
        retry_count: 0,
      },
    ];

    const output = formatStatus(state, workerResults, Date.parse("2026-01-01T00:00:05.000Z"));

    expect(output).toContain("Now: reviewing diff with tests");
    expect(output).toContain("Failure policy: worker failures are tolerated");
    expect(output).toContain("Workers: 1/3 completed, 1 fallback");
    expect(output).toContain("Active phase: review");
    expect(output).toContain("- tests: running (3s)");
    expect(output).toContain("- correctness: completed (2s), raw_fallback=malformed structured output, findings=0, artifacts=0");
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
      artifact_manifest_path: "/tmp/cwf/artifacts/manifest.json",
    });

    const output = formatStatus(state);

    expect(output).toContain("Now: done; open the result report");
    expect(output).toContain("- Result: /tmp/cwf/result.md");
    expect(output).toContain("- Manifest: /tmp/cwf/artifacts/manifest.json");
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
      error: "All Codex workers failed; verify worker adapter connectivity and worker logs before changing workflow design.",
      phases: [
        { id: "collect", status: "completed" },
        { id: "review", status: "failed", error: "All Codex workers failed; verify worker adapter connectivity and worker logs before changing workflow design." },
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
    expect(output).toContain("Check Codex worker adapter connectivity");
    expect(output).toContain("Discovery:");
    expect(output).toContain("cwf latest --target /tmp/repo");
  });

  it("explains waiting gates and the approval commands", () => {
    const output = formatRunShow(
      createState({
        status: "waiting",
        phases: [
          { id: "collect", status: "completed" },
          { id: "approve-review", status: "waiting", prompt: "Review before continuing." },
          { id: "review", status: "pending" },
        ],
      }),
    );

    expect(output).toContain("Now: waiting at gate approve-review; approve or reject before resume");
    expect(output).toContain("Gate: approve-review is waiting - Review before continuing.");
    expect(output).toContain("Approve: cwf approve run_test approve-review");
    expect(output).toContain("Reject: cwf reject run_test approve-review --reason <text>");
  });

  it("explains approved gates and rejected gates", () => {
    const approved = formatStatus(
      createState({
        status: "approved",
        phases: [
          { id: "collect", status: "completed" },
          { id: "approve-review", status: "approved" },
          { id: "review", status: "pending" },
        ],
        gate_decisions: [{ gate_id: "approve-review", decision: "approved", decided_at: "2026-01-01T00:00:02.000Z" }],
      }),
    );
    const rejected = formatStatus(
      createState({
        status: "rejected",
        phases: [
          { id: "collect", status: "completed" },
          { id: "approve-review", status: "rejected", decision_reason: "not safe" },
          { id: "review", status: "pending" },
        ],
        gate_decisions: [
          { gate_id: "approve-review", decision: "rejected", reason: "not safe", decided_at: "2026-01-01T00:00:02.000Z" },
        ],
      }),
    );

    expect(approved).toContain("Now: gate approve-review approved; run cwf resume run_test");
    expect(approved).toContain("Resume: cwf resume run_test");
    expect(rejected).toContain("Now: rejected at gate approve-review: not safe");
    expect(rejected).toContain("Gate: approve-review rejected - not safe");
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
    gate_decisions: [],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    phases: [],
    workers: [],
    ...overrides,
  };
}
