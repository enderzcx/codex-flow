import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import type { FailurePolicy, FailureSummary, PhaseStatus, RunIndex, RunIndexEntry, RunState } from "./types.js";

export const CODEX_WORKFLOWS_ROOT = join(homedir(), ".codex-workflows");
export const RUNS_ROOT = join(CODEX_WORKFLOWS_ROOT, "runs");
export const INDEX_PATH = join(CODEX_WORKFLOWS_ROOT, "index.json");

export type DiscoveryOptions = {
  runsRoot?: string;
  indexPath?: string;
};

export type ListRunsOptions = DiscoveryOptions & {
  limit?: number;
  status?: PhaseStatus;
  target?: string;
};

export const DEFAULT_FAILURE_POLICY: FailurePolicy = {
  worker_failure: "continue_if_any_worker_succeeds",
  all_workers_failed: "fail_run",
  target_diff_changed: "fail_run",
  unhandled_error: "fail_run",
};

export async function listRuns(options: ListRunsOptions = {}): Promise<RunIndexEntry[]> {
  const index = await ensureRunIndex(options);
  const target = options.target ? resolve(options.target) : undefined;
  let runs = index.runs;
  if (options.status) {
    runs = runs.filter((run) => run.status === options.status);
  }
  if (target) {
    runs = runs.filter((run) => run.target === target);
  }
  runs = sortRuns(runs);
  return typeof options.limit === "number" ? runs.slice(0, options.limit) : runs;
}

export async function latestRun(options: Omit<ListRunsOptions, "limit" | "status"> = {}): Promise<RunIndexEntry | undefined> {
  const [latest] = await listRuns({ ...options, limit: 1 });
  return latest;
}

export async function showRun(runId: string, options: DiscoveryOptions = {}): Promise<RunState> {
  await ensureRunIndex(options);
  const runsRoot = options.runsRoot ?? RUNS_ROOT;
  const raw = await readFile(join(runsRoot, runId, "state.json"), "utf8");
  return normalizeRunState(JSON.parse(raw) as RunState);
}

export async function upsertRunIndexEntry(state: RunState, indexPath = INDEX_PATH): Promise<void> {
  const root = dirname(indexPath);
  await mkdir(root, { recursive: true });
  let index: RunIndex;
  try {
    index = JSON.parse(await readFile(indexPath, "utf8")) as RunIndex;
    assertRunIndex(index);
  } catch {
    index = { version: 1, generated_at: isoNow(), runs: [] };
  }
  const entry = createRunIndexEntry(normalizeRunState(state));
  const runs = index.runs.filter((run) => run.id !== state.id);
  runs.push(entry);
  await writeRunIndex({ version: 1, generated_at: isoNow(), runs: sortRuns(runs) }, indexPath);
}

export async function rebuildRunIndex(options: DiscoveryOptions = {}): Promise<RunIndex> {
  const runsRoot = options.runsRoot ?? RUNS_ROOT;
  const indexPath = options.indexPath ?? indexPathForRunsRoot(runsRoot);
  await mkdir(runsRoot, { recursive: true });
  const names = await readdir(runsRoot);
  const states = await Promise.all(
    names.map(async (name): Promise<RunState | undefined> => {
      try {
        const raw = await readFile(join(runsRoot, name, "state.json"), "utf8");
        const state = normalizeRunState(JSON.parse(raw) as RunState);
        return state.id === name ? state : undefined;
      } catch {
        return undefined;
      }
    }),
  );
  const index: RunIndex = {
    version: 1,
    generated_at: isoNow(),
    runs: sortRuns(states.filter((state): state is RunState => Boolean(state)).map(createRunIndexEntry)),
  };
  await writeRunIndex(index, indexPath);
  return index;
}

export async function ensureRunIndex(options: DiscoveryOptions = {}): Promise<RunIndex> {
  const runsRoot = options.runsRoot ?? RUNS_ROOT;
  const indexPath = options.indexPath ?? indexPathForRunsRoot(runsRoot);
  try {
    const index = JSON.parse(await readFile(indexPath, "utf8")) as RunIndex;
    assertRunIndex(index);
    if (await isIndexFresh(index, runsRoot)) {
      return index;
    }
  } catch {
    // Missing, stale, or corrupt index: rebuild from run folders.
  }
  return rebuildRunIndex({ runsRoot, indexPath });
}

export function indexPathForRunsRoot(runsRoot: string): string {
  return join(basename(runsRoot) === "runs" ? dirname(runsRoot) : runsRoot, "index.json");
}

export function normalizeRunState(state: RunState): RunState {
  return {
    ...state,
    failure_policy: state.failure_policy ?? DEFAULT_FAILURE_POLICY,
    gate_decisions: state.gate_decisions ?? [],
    failure_summary: state.failure_summary ?? (state.status === "failed" ? buildFailureSummary(state, state.error) : undefined),
  };
}

export function buildFailureSummary(state: RunState, error?: string): FailureSummary {
  const failedPhase = state.phases.find((phase) => phase.status === "failed");
  const failedWorkers = state.workers.filter((worker) => worker.status === "failed").map((worker) => worker.id);
  const detail = error || failedPhase?.error || state.error || "Run failed without a recorded error.";
  return {
    title: failedPhase ? `${failedPhase.id} phase failed` : "Run failed",
    detail,
    failed_phase: failedPhase?.id,
    failed_workers: failedWorkers,
    next_step: describeFailureNextStep(state, detail, failedWorkers),
  };
}

export function describeFailurePolicy(policy: FailurePolicy = DEFAULT_FAILURE_POLICY): string {
  const workerPolicy =
    policy.worker_failure === "continue_if_any_worker_succeeds"
      ? "worker failures are tolerated when at least one Codex worker succeeds"
      : "worker failures stop the run";
  return `${workerPolicy}; all-worker failure, target diff changes, and unhandled errors fail the run.`;
}

export function createRunIndexEntry(state: RunState): RunIndexEntry {
  const normalized = normalizeRunState(state);
  return {
    id: normalized.id,
    workflow: normalized.workflow,
    status: normalized.status,
    target: normalized.target,
    run_dir: normalized.run_dir,
    created_at: normalized.created_at,
    updated_at: normalized.updated_at,
    result_path: normalized.result_path,
    artifact_manifest_path: normalized.artifact_manifest_path,
    log_path: normalized.log_path,
    error: normalized.error,
    failure_summary: normalized.failure_summary,
  };
}

function describeFailureNextStep(state: RunState, detail: string, failedWorkers: string[]): string {
  if (failedWorkers.length === state.workers.length && failedWorkers.length > 0) {
    return "Check Codex SDK connectivity and worker logs before changing workflow design.";
  }
  if (detail.includes("diff changed")) {
    return "Re-run after the target repository diff is stable.";
  }
  return "Open state.json, events.jsonl, and worker JSON artifacts for the failed step.";
}

async function isIndexFresh(index: RunIndex, runsRoot: string): Promise<boolean> {
  let names: string[];
  try {
    names = await readdir(runsRoot);
  } catch {
    return index.runs.length === 0;
  }
  const indexedIds = new Set(index.runs.map((run) => run.id));
  const stateIds = new Set<string>();
  for (const name of names) {
    try {
      const state = normalizeRunState(JSON.parse(await readFile(join(runsRoot, name, "state.json"), "utf8")) as RunState);
      stateIds.add(state.id);
      const indexed = index.runs.find((run) => run.id === state.id);
      if (!indexed || indexed.updated_at !== state.updated_at || indexed.status !== state.status) {
        return false;
      }
    } catch {
      // Ignore malformed run folders; they are not discoverable runs.
    }
  }
  for (const id of indexedIds) {
    if (!stateIds.has(id)) {
      return false;
    }
  }
  return true;
}

function assertRunIndex(index: RunIndex): void {
  if (index.version !== 1 || !Array.isArray(index.runs)) {
    throw new Error("Invalid run index");
  }
}

function sortRuns<T extends { created_at: string; id: string }>(runs: T[]): T[] {
  return [...runs].sort((left, right) => {
    const dateOrder = Date.parse(right.created_at) - Date.parse(left.created_at);
    return dateOrder === 0 ? right.id.localeCompare(left.id) : dateOrder;
  });
}

async function writeRunIndex(index: RunIndex, indexPath: string): Promise<void> {
  await mkdir(dirname(indexPath), { recursive: true });
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
}

function isoNow(): string {
  return new Date().toISOString();
}
