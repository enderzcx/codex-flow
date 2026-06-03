import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  buildFailureSummary,
  DEFAULT_FAILURE_POLICY,
  indexPathForRunsRoot,
  RUNS_ROOT,
  upsertRunIndexEntry,
} from "./run-index.js";
import type { PhaseState, PhaseStatus, RunState, WorkerResult, WorkerState, WorkerStatus, WorkflowSpec } from "./types.js";

export class RunStore {
  readonly runId: string;
  readonly runDir: string;
  readonly indexPath: string;
  private stateLock: Promise<void> = Promise.resolve();

  constructor(runId: string, runDir = join(RUNS_ROOT, runId), indexPath = indexPathForRunsRoot(RUNS_ROOT)) {
    this.runId = runId;
    this.runDir = runDir;
    this.indexPath = indexPath;
  }

  static async create(spec: WorkflowSpec, target: string, runsRoot = RUNS_ROOT): Promise<RunStore> {
    const runId = createRunId();
    const store = new RunStore(runId, join(runsRoot, runId), indexPathForRunsRoot(runsRoot));
    await mkdir(join(store.runDir, "workers"), { recursive: true });
    const now = isoNow();
    const state: RunState = {
      id: runId,
      workflow: spec.id,
      status: "running",
      target: resolve(target),
      run_dir: store.runDir,
      failure_policy: DEFAULT_FAILURE_POLICY,
      phases: spec.phases.map<PhaseState>((phase) => ({ id: phase.id, status: "pending" })),
      workers: spec.phases.flatMap<WorkerState>((phase) =>
        phase.kind === "codex-parallel" ? phase.workers.map((worker) => ({ id: worker.id, status: "pending" })) : [],
      ),
      created_at: now,
      updated_at: now,
    };
    await store.writeJson("workflow.json", spec);
    await store.writeState(state);
    await store.appendEvent("run.created", { run_id: runId, workflow: spec.id, target: resolve(target) });
    return store;
  }

  static fromRunId(runId: string): RunStore {
    return new RunStore(runId);
  }

  async readState(): Promise<RunState> {
    return JSON.parse(await readFile(join(this.runDir, "state.json"), "utf8")) as RunState;
  }

  async writeState(state: RunState): Promise<void> {
    state.updated_at = isoNow();
    await this.writeJson("state.json", state);
    try {
      await upsertRunIndexEntry(state, this.indexPath);
    } catch {
      // Run folders are the source of truth; discovery can rebuild the index later.
    }
  }

  async updatePhase(id: string, status: PhaseStatus, error?: string): Promise<void> {
    await this.mutateState((state) => {
      const phase = state.phases.find((item) => item.id === id);
      if (!phase) {
        throw new Error(`Unknown phase: ${id}`);
      }
      applyStatusTimestamps(phase, status);
      phase.status = status;
      phase.error = error;
      state.status = deriveRunStatus(state.phases);
      if (status === "failed") {
        state.error = error;
        state.failure_summary = buildFailureSummary(state, error);
      }
    });
    await this.appendEvent("phase.updated", { phase: id, status, error });
  }

  async updateWorker(id: string, status: WorkerStatus, error?: string): Promise<void> {
    await this.mutateState((state) => {
      const worker = state.workers.find((item) => item.id === id);
      if (!worker) {
        throw new Error(`Unknown worker: ${id}`);
      }
      applyStatusTimestamps(worker, status);
      worker.status = status;
      worker.error = error;
    });
    await this.appendEvent("worker.updated", { worker: id, status, error });
  }

  async writeWorkerResult(result: WorkerResult): Promise<void> {
    await this.writeJson(join("workers", `${result.worker_id}.json`), result);
    await this.appendEvent("worker.result", {
      worker: result.worker_id,
      status: result.status,
      raw_fallback: Boolean(result.raw_fallback),
      finding_count: result.result?.findings.length ?? 0,
    });
  }

  async writeResult(markdown: string): Promise<void> {
    await writeFile(join(this.runDir, "result.md"), markdown);
    const resultPath = join(this.runDir, "result.md");
    await this.mutateState((state) => {
      state.result_path = resultPath;
      state.status = "completed";
    });
    await this.appendEvent("run.result", { result_path: resultPath });
  }

  async markBackground(pid: number, logPath: string): Promise<void> {
    await this.mutateState((state) => {
      state.background_pid = pid;
      state.log_path = logPath;
    });
    await this.appendEvent("run.background_started", { run_id: this.runId, pid, log_path: logPath });
  }

  async cancel(): Promise<RunState> {
    const state = await this.mutateState((draft) => {
      if (draft.status === "completed" || draft.status === "failed" || draft.status === "cancelled") {
        return;
      }
      draft.status = "cancelled";
      for (const phase of draft.phases) {
        if (phase.status === "pending" || phase.status === "running") {
          phase.status = "cancelled";
        }
      }
      for (const worker of draft.workers) {
        if (worker.status === "pending" || worker.status === "running") {
          worker.status = "cancelled";
        }
      }
    });
    if (state.status === "cancelled") {
      await this.appendEvent("run.cancelled", { run_id: this.runId });
    } else {
      await this.appendEvent("run.cancel_ignored", { run_id: this.runId, status: state.status });
    }
    return state;
  }

  async readResult(): Promise<string> {
    return readFile(join(this.runDir, "result.md"), "utf8");
  }

  async appendEvent(type: string, payload: Record<string, unknown>): Promise<void> {
    const line = JSON.stringify({ type, at: isoNow(), ...payload });
    await writeFile(join(this.runDir, "events.jsonl"), `${line}\n`, { flag: "a" });
  }

  private async writeJson(relativePath: string, value: unknown): Promise<void> {
    await writeFile(join(this.runDir, relativePath), `${JSON.stringify(value, null, 2)}\n`);
  }

  private async mutateState(mutator: (state: RunState) => void | Promise<void>): Promise<RunState> {
    const previous = this.stateLock;
    let release: () => void = () => undefined;
    this.stateLock = new Promise<void>((resolveLock) => {
      release = resolveLock;
    });
    await previous;
    try {
      const state = await this.readState();
      await mutator(state);
      await this.writeState(state);
      return state;
    } finally {
      release();
    }
  }
}

function createRunId(): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `run_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}_${suffix}`;
}

function applyStatusTimestamps(item: PhaseState | WorkerState, status: PhaseStatus | WorkerStatus): void {
  if (status === "running" && !item.started_at) {
    item.started_at = isoNow();
  }
  if ((status === "completed" || status === "failed" || status === "cancelled") && !item.completed_at) {
    item.completed_at = isoNow();
  }
}

function deriveRunStatus(phases: PhaseState[]): PhaseStatus {
  if (phases.some((phase) => phase.status === "failed")) {
    return "failed";
  }
  if (phases.every((phase) => phase.status === "completed")) {
    return "completed";
  }
  if (phases.some((phase) => phase.status === "cancelled")) {
    return "cancelled";
  }
  return "running";
}

function isoNow(): string {
  return new Date().toISOString();
}
