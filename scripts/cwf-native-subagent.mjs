import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { writeReturnEnvelope } from "./cwf-return-envelope.mjs";
import { safeRunDir } from "./cwf-start.mjs";
import { parseArgs, printHelp, wantsHelp } from "./lib/cli.mjs";

const DEFAULT_RUN_ROOT = ".cwf/runs";

export async function recordNativeSubagent(options = {}) {
  const runId = requireOption(options.runId, "runId");
  const workerId = requireOption(options.workerId, "workerId");
  const runDir = safeRunDir(resolve(options.runRoot ?? DEFAULT_RUN_ROOT), runId);
  const { state, statePath } = await readState(runDir);
  const worker = state.workers.find((item) => item.id === workerId) ?? addSyntheticWorker(state, workerId);
  const mode = options.mode ?? "unavailable";
  const status = mode === "record-result" ? "completed" : "native-subagent-unavailable";
  const result = {
    schema_version: 1,
    run_id: runId,
    worker_id: workerId,
    runtime: "native-subagent",
    status,
    evidence_level: status === "completed" ? "real-smoke" : "unavailable",
    agent_id: options.agentId ?? "",
    summary: options.summary ?? "Native subagent tools are unavailable in this host/session.",
    evidence: options.evidence ? [options.evidence] : [],
    created_at: new Date().toISOString(),
  };

  await mkdir(join(runDir, "worker-results"), { recursive: true });
  await writeJson(join(runDir, "worker-results", `${workerId}.json`), result);
  worker.runtime = "native-subagent";
  worker.status = status === "completed" ? "completed" : "blocked";
  worker.output_summary = result.summary;
  worker.evidence = [...(worker.evidence ?? []), `worker-results/${workerId}.json`];
  state.adapter_status = { ...(state.adapter_status ?? {}), native_subagent: status };
  state.status = status === "completed" ? "running" : "blocked";
  state.updated_at = new Date().toISOString();
  await writeJson(statePath, state);
  await writeReturnEnvelope(runDir, state, { returnMode: state.return_mode ?? "coordinator_synthesis" });
  return { worker_result: join(runDir, "worker-results", `${workerId}.json`), result };
}

async function readState(runDir) {
  const statePath = join(runDir, "state.json");
  return { state: JSON.parse(await readFile(statePath, "utf8")), statePath };
}

function addSyntheticWorker(state, workerId) {
  const worker = {
    id: workerId,
    phase_id: "external",
    type: "explorer",
    visibility: "inline",
    resolved_visibility: "inline",
    runtime: "native-subagent",
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
    mode: options.mode ?? "unavailable",
    agentId: options["agent-id"],
    summary: options.summary,
    evidence: options.evidence,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (wantsHelp(options)) {
    printHelp(`
Usage:
  node scripts/cwf-native-subagent.mjs --run-id smoke --worker correctness --mode unavailable
  node scripts/cwf-native-subagent.mjs --run-id smoke --worker correctness --mode record-result --agent-id <id> --summary <text>

Options:
  --run-id <id>      Existing CWF run id.
  --worker <id>      Worker id to update.
  --mode <unavailable|record-result>
  --agent-id <id>    Native host subagent id when one exists.
  --summary <text>
  --evidence <text>
  --run-root <path>  Run root. Default: .cwf/runs.
  --help             Show this help.
`);
    return;
  }
  const result = await recordNativeSubagent(normalizeOptions(options));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
