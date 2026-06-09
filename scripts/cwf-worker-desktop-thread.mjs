import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { writeReturnEnvelope } from "./cwf-return-envelope.mjs";
import { deriveRunStatus, refreshResume } from "./cwf-run-state.mjs";
import { safeRunDir } from "./cwf-start.mjs";
import { parseArgs, printHelp, wantsHelp } from "./lib/cli.mjs";

const DEFAULT_RUN_ROOT = ".cwf/runs";

export async function recordDesktopThreadWorker(options = {}) {
  const runId = requireOption(options.runId, "runId");
  const workerId = requireOption(options.workerId, "workerId");
  const runDir = safeRunDir(resolve(options.runRoot ?? DEFAULT_RUN_ROOT), runId);
  const { state, statePath } = await readState(runDir);
  const worker = state.workers.find((item) => item.id === workerId) ?? addSyntheticWorker(state, workerId);
  const mode = options.mode ?? "failure-fixture";
  let result;

  if (mode === "failure-fixture") {
    result = desktopResult({
      runId,
      workerId,
      status: "desktop-thread-execution-unavailable",
      evidence_level: "fixture",
      marker: "",
      desktop_thread_id: "",
      summary: options.summary ?? "App-server preflight failed in fixture; no visible Desktop thread was created.",
    });
  } else if (mode === "requires-approval") {
    result = desktopResult({
      runId,
      workerId,
      status: "requires_approval",
      evidence_level: "requires_approval",
      marker: options.marker ?? "CWF_DESKTOP_THREAD_SMOKE_PENDING",
      desktop_thread_id: "",
      summary: "Visible Desktop-thread real-smoke is gated on Ender approving the exact smoke.",
    });
  } else if (mode === "record-real-smoke") {
    if (!options.approved) throw new Error("record-real-smoke requires --approved after Ender approves the exact visible Desktop-thread smoke");
    result = desktopResult({
      runId,
      workerId,
      status: "completed",
      evidence_level: "real-smoke",
      marker: requireOption(options.marker, "marker"),
      desktop_thread_id: requireOption(options.desktopThreadId, "desktopThreadId"),
      summary: options.summary ?? "Approved visible Desktop-thread smoke returned the marker.",
    });
  } else {
    throw new Error(`Unsupported Desktop-thread mode: ${mode}`);
  }

  await writeWorkerResult(runDir, workerId, result);
  worker.runtime = "desktop-thread";
  worker.status = result.status === "completed" ? "completed" : "blocked";
  worker.desktop_thread_id = result.desktop_thread_id ?? "";
  worker.output_summary = result.summary;
  worker.evidence = [...(worker.evidence ?? []), `worker-results/${workerId}.json`];
  state.adapter_status = { ...(state.adapter_status ?? {}), desktop_thread_worker: result.status };
  state.deferred_items = updateDeferredItems(state.deferred_items ?? [], result);
  state.status = deriveRunStatus(state);
  refreshResume(state);
  state.updated_at = new Date().toISOString();
  await writeJson(statePath, state);
  await writeReturnEnvelope(runDir, state, { returnMode: state.return_mode ?? "coordinator_synthesis" });
  return { worker_result: join(runDir, "worker-results", `${workerId}.json`), result };
}

function desktopResult(fields) {
  return {
    schema_version: 1,
    run_id: fields.runId,
    worker_id: fields.workerId,
    runtime: "desktop-thread",
    status: fields.status,
    evidence_level: fields.evidence_level,
    desktop_thread_id: fields.desktop_thread_id,
    marker: fields.marker,
    summary: fields.summary,
    created_visible_thread: Boolean(fields.desktop_thread_id),
    created_at: new Date().toISOString(),
  };
}

function updateDeferredItems(items, result) {
  const filtered = items.filter((item) => item.id !== "desktop-thread-real-smoke");
  if (result.status === "completed") return filtered;
  return [
    ...filtered,
    {
      id: "desktop-thread-real-smoke",
      status: result.status === "requires_approval" ? "requires_approval" : "unavailable",
      reason: result.summary,
    },
  ];
}

async function readState(runDir) {
  const statePath = join(runDir, "state.json");
  return { state: JSON.parse(await readFile(statePath, "utf8")), statePath };
}

function addSyntheticWorker(state, workerId) {
  const worker = {
    id: workerId,
    phase_id: "external",
    type: "worker",
    visibility: "desktop-thread",
    resolved_visibility: "desktop-thread",
    runtime: "desktop-thread",
    status: "planned",
    output_summary: "",
    evidence: [],
    sdk_thread_id: "",
    desktop_thread_id: "",
    worker_packet_path: `worker-packets/${workerId}.md`,
    worker_result_path: `worker-results/${workerId}.json`,
  };
  state.workers.push(worker);
  return worker;
}

async function writeWorkerResult(runDir, workerId, result) {
  await mkdir(join(runDir, "worker-results"), { recursive: true });
  await writeJson(join(runDir, "worker-results", `${workerId}.json`), result);
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function requireOption(value, name) {
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function normalizeOptions(options) {
  return {
    runId: options["run-id"],
    workerId: options.worker,
    runRoot: options["run-root"],
    mode: options.mode ?? "failure-fixture",
    marker: options.marker,
    summary: options.summary,
    approved: Boolean(options.approved),
    desktopThreadId: options["desktop-thread-id"],
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (wantsHelp(options)) {
    printHelp(`
Usage:
  node scripts/cwf-worker-desktop-thread.mjs --run-id smoke --worker visible --mode failure-fixture
  node scripts/cwf-worker-desktop-thread.mjs --run-id smoke --worker visible --mode requires-approval
  node scripts/cwf-worker-desktop-thread.mjs --run-id smoke --worker visible --mode record-real-smoke --approved --desktop-thread-id <id> --marker <marker>

Options:
  --run-id <id>          Existing CWF run id.
  --worker <id>          Worker id to update.
  --mode <failure-fixture|requires-approval|record-real-smoke>
  --approved             Required for record-real-smoke after Ender GO.
  --desktop-thread-id <id>
  --marker <text>
  --summary <text>
  --run-root <path>      Run root. Default: .cwf/runs.
  --help                 Show this help.
`);
    return;
  }
  const result = await recordDesktopThreadWorker(normalizeOptions(options));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
