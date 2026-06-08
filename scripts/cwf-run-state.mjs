import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { buildPreview, loadWorkflow, renderPreviewMarkdown } from "./cwf-run-preview.mjs";

const DEFAULT_STATE_DIR = ".cwf/runs";
const STATUSES = new Set(["planned", "running", "completed", "blocked", "cancelled"]);

async function initRun(args) {
  const options = parseOptions(args, {
    required: ["run-id", "workflow"],
    optional: ["objective"],
  });
  const stateDir = resolve(DEFAULT_STATE_DIR);
  const runDir = safeRunDir(stateDir, options["run-id"]);
  const loaded = await loadWorkflow(options.workflow);
  const preview = buildPreview(loaded.workflow, { runImmediately: false });
  const now = new Date().toISOString();
  const state = {
    run_id: options["run-id"],
    workflow_name: loaded.workflow.name,
    template_path: options.workflow,
    user_objective: options.objective ?? "",
    budget: loaded.workflow.budget ?? {},
    status: "planned",
    started_at: now,
    updated_at: now,
    phases: preview.phases.map((phase, index) => ({
      id: phase.id,
      index,
      status: "planned",
      evidence: [],
    })),
    workers: preview.agents.map((agent) => ({
      id: agent.id,
      phase_id: agent.phase_id,
      type: agent.type,
      visibility: agent.visibility,
      resolved_visibility: agent.resolved_visibility,
      status: "planned",
      output_summary: "",
      evidence: [],
      desktop_thread_id: "",
    })),
    verification_evidence: [],
    cancel: null,
    resume: {
      last_completed_phase_id: "",
      next_phase_id: preview.phases[0]?.id ?? "",
      reason: "No phase completed yet; smallest safe checkpoint is Phase 1.",
    },
    preview_skip: preview.preview_skip,
  };

  await mkdir(runDir, { recursive: true });
  await writeJson(join(runDir, "state.json"), state);
  await writeFile(join(runDir, "preview.md"), renderPreviewMarkdown(preview, options.workflow), "utf8");
  await writeFile(join(runDir, "final.md"), "", "utf8");
  console.log(JSON.stringify({ run_id: state.run_id, state: join(runDir, "state.json") }, null, 2));
}

async function updatePhase(args) {
  const options = parseOptions(args, {
    required: ["run-id", "phase", "status"],
    optional: ["evidence"],
  });
  assertStatus(options.status);
  const { state, path } = await readState(options);
  const phase = state.phases.find((item) => item.id === options.phase);
  if (!phase) throw new Error(`Unknown phase: ${options.phase}`);
  phase.status = options.status;
  if (options.evidence) phase.evidence.push(options.evidence);
  state.status = deriveRunStatus(state);
  refreshResume(state);
  await saveState(path, state);
}

async function updateWorker(args) {
  const options = parseOptions(args, {
    required: ["run-id", "worker", "status"],
    optional: ["summary", "evidence", "desktop-thread-id"],
  });
  assertStatus(options.status);
  const { state, path } = await readState(options);
  const worker = state.workers.find((item) => item.id === options.worker);
  if (!worker) throw new Error(`Unknown worker: ${options.worker}`);
  worker.status = options.status;
  if (options.summary) worker.output_summary = options.summary;
  if (options.evidence) worker.evidence.push(options.evidence);
  if (options["desktop-thread-id"]) worker.desktop_thread_id = options["desktop-thread-id"];
  state.status = deriveRunStatus(state);
  await saveState(path, state);
}

async function cancelRun(args) {
  const options = parseOptions(args, {
    required: ["run-id"],
    optional: ["reason"],
  });
  const { state, path, runDir } = await readState(options);
  state.status = "cancelled";
  state.cancel = {
    reason: options.reason ?? "cancelled",
    at: new Date().toISOString(),
  };
  await saveState(path, state);
  await writeFile(join(runDir, "final.md"), renderFinal(state), "utf8");
}

async function statusRun(args) {
  const options = parseOptions(args, {
    required: ["run-id"],
    optional: [],
  });
  const { state } = await readState(options);
  const counts = countStatuses(state.workers);
  console.log(
    JSON.stringify(
      {
        run_id: state.run_id,
        status: state.status,
        current_phase: currentPhase(state)?.id ?? "",
        workers: counts,
        elapsed_time_ms: elapsedMs(state),
        budget_pressure: budgetPressure(state),
        current_blocker: currentBlocker(state),
        last_verified_evidence: lastEvidence(state),
        resume: state.resume,
      },
      null,
      2,
    ),
  );
}

async function resumePlan(args) {
  const options = parseOptions(args, {
    required: ["run-id"],
    optional: [],
  });
  const { state } = await readState(options);
  refreshResume(state);
  console.log(JSON.stringify(state.resume, null, 2));
}

async function readState(options) {
  const stateDir = resolve(DEFAULT_STATE_DIR);
  const runDir = safeRunDir(stateDir, options["run-id"]);
  const path = join(runDir, "state.json");
  const state = JSON.parse(await readFile(path, "utf8"));
  return { state, path, runDir };
}

function safeRunDir(stateDir, runId) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(runId)) {
    throw new Error("run-id must be a single safe filename segment");
  }
  const root = resolve(stateDir);
  const runDir = resolve(root, runId);
  if (runDir !== root && !runDir.startsWith(`${root}${sep}`)) {
    throw new Error("run-id resolves outside state directory");
  }
  return runDir;
}

async function saveState(path, state) {
  state.updated_at = new Date().toISOString();
  await writeJson(path, state);
  console.log(JSON.stringify({ run_id: state.run_id, status: state.status, state: path }, null, 2));
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function refreshResume(state) {
  const completed = state.phases.filter((phase) => phase.status === "completed").at(-1);
  if (!completed) {
    state.resume = {
      last_completed_phase_id: "",
      next_phase_id: state.phases[0]?.id ?? "",
      reason: "No phase completed yet; smallest safe checkpoint is Phase 1.",
    };
    return;
  }

  const next = state.phases.find((phase) => phase.index === completed.index + 1);
  state.resume = {
    last_completed_phase_id: completed.id,
    next_phase_id: next?.id ?? "",
    reason: next
      ? `Resume from phase after completed boundary ${completed.id}.`
      : "All recorded phases are complete.",
  };
}

function deriveRunStatus(state) {
  if (state.status === "cancelled") return "cancelled";
  if (state.workers.some((worker) => worker.status === "blocked")) return "blocked";
  if (
    state.phases.every((phase) => phase.status === "completed") &&
    state.workers.every((worker) => worker.status === "completed")
  ) {
    return "completed";
  }
  if (
    state.phases.some((phase) => phase.status === "running" || phase.status === "completed") ||
    state.workers.some((worker) => worker.status === "running" || worker.status === "completed")
  ) {
    return "running";
  }
  return "planned";
}

function currentPhase(state) {
  return state.phases.find((phase) => phase.status === "running") ?? state.phases.find((phase) => phase.status !== "completed");
}

function elapsedMs(state) {
  const start = Date.parse(state.started_at);
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Date.now() - start);
}

function budgetPressure(state) {
  const maxTokens = state.budget?.max_tokens;
  if (!maxTokens) return "unknown";
  return "not tracked by local fixture; token cap recorded";
}

function currentBlocker(state) {
  const blockedWorker = state.workers.find((worker) => worker.status === "blocked");
  if (blockedWorker) {
    return blockedWorker.output_summary || blockedWorker.evidence.at(-1) || `worker ${blockedWorker.id} blocked`;
  }
  const blockedPhase = state.phases.find((phase) => phase.status === "blocked");
  if (blockedPhase) {
    return blockedPhase.evidence.at(-1) || `phase ${blockedPhase.id} blocked`;
  }
  return "";
}

function lastEvidence(state) {
  return (
    state.verification_evidence.at(-1) ??
    state.workers.flatMap((worker) => worker.evidence).at(-1) ??
    state.phases.flatMap((phase) => phase.evidence).at(-1) ??
    ""
  );
}

function countStatuses(items) {
  const counts = {};
  for (const status of STATUSES) counts[status] = 0;
  for (const item of items) counts[item.status] = (counts[item.status] ?? 0) + 1;
  return counts;
}

function renderFinal(state) {
  const completedEvidence = [
    ...state.verification_evidence,
    ...state.phases.flatMap((phase) => phase.evidence),
    ...state.workers.flatMap((worker) => worker.evidence),
  ].filter(Boolean);

  return [
    `# CWF Run ${state.run_id}`,
    "",
    `Status: ${state.status}`,
    `Workflow: ${state.workflow_name}`,
    `Cancelled: ${state.cancel?.reason ?? "no"}`,
    "",
    "## Confirmed Evidence",
    ...(completedEvidence.length > 0 ? completedEvidence.map((item) => `- ${item}`) : ["- none"]),
    "",
    "## Incomplete Areas",
    ...state.phases.filter((phase) => phase.status !== "completed").map((phase) => `- ${phase.id}: ${phase.status}`),
    "",
  ].join("\n");
}

function assertStatus(status) {
  if (!STATUSES.has(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
}

function parseOptions(args, schema) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);
    const key = arg.slice(2);
    options[key] = args[++index] ?? "";
  }

  const allowed = new Set([...schema.required, ...schema.optional]);
  for (const key of Object.keys(options)) {
    if (!allowed.has(key)) throw new Error(`Unknown option: --${key}`);
  }
  for (const key of schema.required) {
    if (!options[key]) throw new Error(`Missing required option: --${key}`);
  }
  return options;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "init") return initRun(args);
  if (command === "phase") return updatePhase(args);
  if (command === "worker") return updateWorker(args);
  if (command === "cancel") return cancelRun(args);
  if (command === "status") return statusRun(args);
  if (command === "resume-plan") return resumePlan(args);
  throw new Error(
    "Usage: node scripts/cwf-run-state.mjs <init|phase|worker|cancel|status|resume-plan> --run-id <id> ...",
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
