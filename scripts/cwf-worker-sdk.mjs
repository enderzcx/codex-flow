import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { writeReturnEnvelope } from "./cwf-return-envelope.mjs";
import { safeRunDir } from "./cwf-start.mjs";
import { parseArgs, printHelp, wantsHelp } from "./lib/cli.mjs";

const DEFAULT_RUN_ROOT = ".cwf/runs";

export async function recordSdkWorker(options = {}) {
  const runId = requireOption(options.runId, "runId");
  const workerId = requireOption(options.workerId, "workerId");
  const runDir = safeRunDir(resolve(options.runRoot ?? DEFAULT_RUN_ROOT), runId);
  const { state, statePath } = await readState(runDir);
  const worker = state.workers.find((item) => item.id === workerId) ?? addSyntheticWorker(state, workerId);
  const mode = options.mode ?? "fixture";
  let result;

  if (mode === "fixture") {
    result = buildResult({
      runId,
      workerId,
      runtime: "sdk-background",
      status: "completed",
      evidence_level: "fixture",
      sdk_thread_id: options.sdkThreadId ?? "fixture-sdk-thread",
      marker: options.marker ?? "CWF_SDK_FIXTURE_OK",
      summary: options.summary ?? "Mock SDK worker returned a fixed marker without credentials.",
    });
  } else if (mode === "real") {
    result = await runRealSdkSmoke({
      runId,
      workerId,
      marker: options.marker ?? "CWF_SDK_REAL_SMOKE",
      timeoutMs: options.timeoutMs,
      cwd: options.cwd,
    });
  } else if (mode === "unavailable") {
    result = buildResult({
      runId,
      workerId,
      runtime: "sdk-background",
      status: "unavailable",
      evidence_level: "unavailable",
      marker: "",
      sdk_thread_id: "",
      summary: options.summary ?? "Codex SDK worker unavailable in this environment.",
    });
  } else {
    throw new Error(`Unsupported SDK mode: ${mode}`);
  }

  await writeWorkerResult(runDir, workerId, result);
  worker.runtime = "sdk-background";
  worker.status = result.status === "completed" ? "completed" : "blocked";
  worker.sdk_thread_id = result.sdk_thread_id ?? "";
  worker.output_summary = result.summary;
  worker.evidence = [...(worker.evidence ?? []), `worker-results/${workerId}.json`];
  state.adapter_status = { ...(state.adapter_status ?? {}), sdk_background_worker: result.status };
  state.status = result.status === "completed" ? "running" : "blocked";
  state.updated_at = new Date().toISOString();
  await writeJson(statePath, state);
  await writeReturnEnvelope(runDir, state, { returnMode: state.return_mode ?? "coordinator_synthesis" });
  return { worker_result: join(runDir, "worker-results", `${workerId}.json`), result };
}

async function runRealSdkSmoke({ runId, workerId, marker, timeoutMs = 120000, cwd = process.cwd() }) {
  let timeout = null;
  const controller = new AbortController();
  const startedAt = new Date().toISOString();
  try {
    const { Codex } = await import("@openai/codex-sdk");
    timeout = setTimeout(() => controller.abort(new Error(`SDK worker timed out after ${timeoutMs}ms`)), timeoutMs);
    const codex = new Codex();
    const thread = codex.startThread({
      workingDirectory: cwd,
      sandboxMode: "read-only",
      approvalPolicy: "never",
      modelReasoningEffort: "low",
      webSearchMode: "disabled",
    });
    const prompt = [
      "You are a Codex SDK fixed-marker smoke worker.",
      "Do not edit files. Do not run commands unless absolutely necessary.",
      `Reply with this exact marker and nothing else: ${marker}`,
    ].join("\n");
    const sdkResult = await thread.run(prompt, { signal: controller.signal });
    const finalResponse = sdkResult.finalResponse ?? "";
    const markerPresent = finalResponse.includes(marker);
    return buildResult({
      runId,
      workerId,
      runtime: "sdk-background",
      status: markerPresent ? "completed" : "failed",
      evidence_level: "real-smoke",
      marker,
      sdk_thread_id: thread.id ?? "",
      summary: markerPresent
        ? "Real Codex SDK worker returned the fixed marker."
        : "Real Codex SDK worker finished but did not return the required marker.",
      final_response: finalResponse,
      usage: sdkResult.usage ?? null,
      item_count: sdkResult.items?.length ?? 0,
      timeout_ms: timeoutMs,
      started_at: startedAt,
    });
  } catch (error) {
    return buildResult({
      runId,
      workerId,
      runtime: "sdk-background",
      status: error.name === "AbortError" ? "timeout" : "failed",
      evidence_level: "real-smoke",
      marker: "",
      sdk_thread_id: "",
      summary: `Real Codex SDK worker failed: ${error.code ?? error.message}`,
      error: {
        name: error.name ?? "",
        code: error.code ?? "",
        message: error.message ?? String(error),
      },
      timeout_ms: timeoutMs,
      started_at: startedAt,
    });
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function buildResult(fields) {
  return {
    schema_version: 1,
    run_id: fields.runId,
    worker_id: fields.workerId,
    runtime: fields.runtime,
    status: fields.status,
    evidence_level: fields.evidence_level,
    sdk_thread_id: fields.sdk_thread_id,
    marker: fields.marker,
    summary: fields.summary,
    final_response: fields.final_response ?? "",
    usage: fields.usage ?? null,
    item_count: fields.item_count ?? 0,
    timeout_ms: fields.timeout_ms ?? null,
    error: fields.error ?? null,
    started_at: fields.started_at ?? "",
    created_at: new Date().toISOString(),
  };
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
    visibility: "inline",
    resolved_visibility: "inline",
    runtime: "sdk-background",
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
    mode: options.mode ?? "fixture",
    marker: options.marker,
    summary: options.summary,
    sdkThreadId: options["sdk-thread-id"],
    timeoutMs: options["timeout-ms"] ? Number(options["timeout-ms"]) : undefined,
    cwd: options.cwd,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (wantsHelp(options)) {
    printHelp(`
Usage:
  node scripts/cwf-worker-sdk.mjs --run-id smoke --worker correctness --mode fixture
  node scripts/cwf-worker-sdk.mjs --run-id smoke --worker sdk-marker --mode real --marker CWF_SDK_REAL_SMOKE

Options:
  --run-id <id>          Existing CWF run id.
  --worker <id>          Worker id to update.
  --mode <fixture|real|unavailable>
  --marker <text>        Fixed marker for smoke evidence.
  --summary <text>       Result summary.
  --sdk-thread-id <id>   Fixture SDK thread id.
  --timeout-ms <ms>      Real SDK worker timeout. Default: 120000.
  --cwd <path>           Working directory for real SDK worker. Default: current cwd.
  --run-root <path>      Run root. Default: .cwf/runs.
  --help                 Show this help.
`);
    return;
  }
  const result = await recordSdkWorker(normalizeOptions(options));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
