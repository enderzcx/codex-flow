import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { writeReturnEnvelope } from "./cwf-return-envelope.mjs";
import { deriveRunStatus, refreshResume } from "./cwf-run-state.mjs";
import { safeRunDir } from "./cwf-start.mjs";
import { parseArgs, printHelp, wantsHelp } from "./lib/cli.mjs";

const DEFAULT_RUN_ROOT = ".cwf/runs";

export async function recordHeartbeatReturn(options = {}) {
  const runId = requireOption(options.runId, "runId");
  const runDir = safeRunDir(resolve(options.runRoot ?? DEFAULT_RUN_ROOT), runId);
  const { state, statePath } = await readState(runDir);
  const mode = options.mode ?? "unavailable";
  let heartbeat;

  if (mode === "fixture") {
    heartbeat = {
      status: "heartbeat-fixture",
      evidence_level: "fixture",
      automation_id: "",
      marker: "",
      summary: options.summary ?? "Fixture heartbeat validates artifact shape only; it does not prove a real originating-thread reply.",
      resume_prompt: buildResumePrompt(runId, runDir),
    };
  } else if (mode === "scheduled") {
    heartbeat = {
      status: "heartbeat-scheduled",
      evidence_level: "scheduled",
      automation_id: options.automationId ?? "",
      marker: options.marker ?? "",
      summary: options.summary ?? "Heartbeat automation has been scheduled but has not yet returned to the originating conversation.",
      resume_prompt: buildResumePrompt(runId, runDir),
    };
  } else if (mode === "scheduled-not-returned") {
    heartbeat = {
      status: "heartbeat-scheduled-not-returned",
      evidence_level: "blocked",
      automation_id: options.automationId ?? "",
      marker: options.marker ?? "",
      summary: options.summary ?? "Heartbeat automation was scheduled, but the marker was not observed in the originating conversation after the expected window.",
      resume_prompt: buildResumePrompt(runId, runDir),
    };
  } else if (mode === "record-real-smoke") {
    const marker = requireOption(options.marker, "marker");
    const originatingThreadId = requireOption(options.originatingThreadId, "originatingThreadId");
    heartbeat = {
      status: "heartbeat_synthesis",
      evidence_level: "real-smoke",
      automation_id: options.automationId ?? "",
      marker,
      originating_thread_id: originatingThreadId,
      confirmed_at: options.confirmedAt ?? new Date().toISOString(),
      summary: options.summary ?? "Heartbeat automation returned to the originating conversation and posted the run summary; coordinator observed the marker before recording this real smoke.",
      resume_prompt: "",
    };
  } else if (mode === "unavailable") {
    heartbeat = {
      status: "heartbeat-unavailable",
      evidence_level: "unavailable",
      automation_id: "",
      marker: "",
      summary: options.summary ?? "Heartbeat automation is unavailable in this environment.",
      resume_prompt: buildResumePrompt(runId, runDir),
    };
  } else {
    throw new Error(`Unsupported heartbeat mode: ${mode}`);
  }

  const heartbeatPath = join(runDir, "heartbeat-return.json");
  await writeJson(heartbeatPath, { schema_version: 1, run_id: runId, ...heartbeat, created_at: new Date().toISOString() });
  if (["heartbeat-scheduled", "heartbeat-scheduled-not-returned", "heartbeat_synthesis"].includes(heartbeat.status)) {
    state.runtime_mode = "background+heartbeat";
  }
  state.adapter_status = { ...(state.adapter_status ?? {}), heartbeat_return: heartbeat.status };
  state.return_mode = heartbeat.status === "heartbeat_synthesis" ? "heartbeat_synthesis" : "coordinator_synthesis";
  state.deferred_items = upsertDeferred(state.deferred_items ?? [], heartbeat);
  state.verification_evidence = [...(state.verification_evidence ?? []), "heartbeat-return.json"];
  if (heartbeat.status === "heartbeat_synthesis") {
    state.verifier_evaluations = clearHeartbeatBlockers(state.verifier_evaluations ?? []);
  }
  if (heartbeat.status === "heartbeat-scheduled-not-returned") {
    state.verifier_evaluations = [
      ...(state.verifier_evaluations ?? []),
      {
        status: "blocked",
        summary: heartbeat.summary,
        evidence: "heartbeat-return.json",
      },
    ];
  }
  state.status = deriveRunStatus(state);
  refreshResume(state);
  state.updated_at = new Date().toISOString();
  await writeJson(statePath, state);
  await writeReturnEnvelope(runDir, state, { returnMode: state.return_mode });
  return { heartbeat_return: heartbeatPath, heartbeat };
}

function clearHeartbeatBlockers(items) {
  return items.filter((item) => {
    if (item.evidence !== "heartbeat-return.json") return true;
    if (item.status !== "blocked") return true;
    return !String(item.summary ?? "").toLowerCase().includes("heartbeat");
  });
}

function buildResumePrompt(runId, runDir = `.cwf/runs/${runId}`) {
  return `/goal resume CWF run ${runId}: read ${runDir}/final.md and ${runDir}/return-envelope.json, then summarize status, evidence, blockers, next action, and verifier status in the originating conversation.`;
}

function upsertDeferred(items, heartbeat) {
  const filtered = items.filter((item) => item.id !== "heartbeat-return");
  if (heartbeat.status === "heartbeat_synthesis") return filtered;
  const statusByHeartbeat = {
    "heartbeat-scheduled": "scheduled",
    "heartbeat-scheduled-not-returned": "blocked",
    "heartbeat-fixture": "fixture",
    "heartbeat-unavailable": "unavailable",
  };
  return [
    ...filtered,
    {
      id: "heartbeat-return",
      status: statusByHeartbeat[heartbeat.status] ?? "unavailable",
      reason: heartbeat.summary,
      automation_id: heartbeat.automation_id ?? "",
      marker: heartbeat.marker ?? "",
      resume_prompt: heartbeat.resume_prompt,
    },
  ];
}

async function readState(runDir) {
  const statePath = join(runDir, "state.json");
  return { state: JSON.parse(await readFile(statePath, "utf8")), statePath };
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
    runRoot: options["run-root"],
    mode: options.mode ?? "unavailable",
    summary: options.summary,
    automationId: options["automation-id"],
    marker: options.marker,
    originatingThreadId: options["originating-thread-id"],
    confirmedAt: options["confirmed-at"],
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (wantsHelp(options)) {
    printHelp(`
Usage:
  node scripts/cwf-return-heartbeat.mjs --run-id smoke --mode unavailable
  node scripts/cwf-return-heartbeat.mjs --run-id smoke --mode fixture
  node scripts/cwf-return-heartbeat.mjs --run-id smoke --mode scheduled --automation-id cwf-heartbeat-real-smoke
  node scripts/cwf-return-heartbeat.mjs --run-id smoke --mode scheduled-not-returned --automation-id cwf-heartbeat-real-smoke --marker CWF_HEARTBEAT_REAL_SMOKE
  node scripts/cwf-return-heartbeat.mjs --run-id smoke --mode record-real-smoke --marker CWF_HEARTBEAT_REAL_SMOKE --originating-thread-id <id>

Options:
  --run-id <id>      Existing CWF run id.
  --mode <fixture|scheduled|scheduled-not-returned|record-real-smoke|unavailable>
  --summary <text>
  --automation-id <id>
  --marker <text>
  --originating-thread-id <id>
  --confirmed-at <iso>
  --run-root <path>  Run root. Default: .cwf/runs.
  --help             Show this help.
`);
    return;
  }
  const result = await recordHeartbeatReturn(normalizeOptions(options));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
