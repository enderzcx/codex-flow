import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import { evaluateVerifierGate } from "./cwf-safe-write.mjs";
import { parseArgs, printHelp, readJsonFile, wantsHelp } from "./lib/cli.mjs";

export function buildReturnEnvelope(state, options = {}) {
  const runDir = options.runDir ?? `.cwf/runs/${state.run_id}`;
  const verifier = evaluateVerifierGate(state.verifier_evaluations ?? []);
  const completionStatus = deriveCompletionStatus(state, verifier);
  const deferredItems = [
    ...(state.deferred_items ?? []),
    ...(options.deferredItems ?? []),
  ];

  return {
    schema_version: 1,
    run_id: state.run_id,
    workflow: {
      name: state.workflow_name ?? "",
      template_path: state.template_path ?? "",
    },
    final_destination: options.finalDestination ?? "originating-codex-conversation",
    runtime_mode: options.runtimeMode ?? state.runtime_mode ?? "foreground",
    return_mode: options.returnMode ?? state.return_mode ?? "coordinator_synthesis",
    heartbeat_status: state.adapter_status?.heartbeat_return ?? "not_requested",
    coordinator_synthesis: {
      status: "required",
      final_summary_path: join(runDir, "final.md"),
    },
    platform_callback: {
      status: options.platformCallbackStatus ?? "deferred",
      evidence: options.platformCallbackEvidence ?? "",
    },
    final_summary_path: join(runDir, "final.md"),
    evidence_path: join(runDir, "state.json"),
    sdk_thread_ids: collectWorkerIds(state, "sdk_thread_id"),
    desktop_thread_ids: collectWorkerIds(state, "desktop_thread_id"),
    verifier_status: verifier.status,
    verifier: verifier,
    deferred_items: deferredItems,
    completion_status: completionStatus,
    run_status: state.status ?? "planned",
    updated_at: state.updated_at ?? new Date().toISOString(),
  };
}

function collectWorkerIds(state, key) {
  return [...new Set((state.workers ?? []).map((worker) => worker[key]).filter(Boolean))];
}

export async function writeReturnEnvelope(runDir, state, options = {}) {
  const envelope = buildReturnEnvelope(state, { ...options, runDir });
  const outputPath = join(runDir, "return-envelope.json");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
  return { path: outputPath, envelope };
}

function deriveCompletionStatus(state, verifier) {
  if (state.status === "completed" && verifier.final_pass) return "completed";
  if (verifier.status === "blocked") return "blocked";
  if (verifier.status === "needs-waiver") return "needs-waiver";
  if (state.status === "cancelled") return "cancelled";
  if (state.status === "blocked") return "blocked";
  return state.status ?? "planned";
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (wantsHelp(options)) {
    printHelp(`
Usage:
  node scripts/cwf-return-envelope.mjs --state .cwf/runs/RUN_ID/state.json
  node scripts/cwf-return-envelope.mjs .cwf/runs/RUN_ID/state.json

Options:
  --state <path>                       State JSON path. Positional path is also accepted.
  --run-dir <path>                     Override run artifact directory for rendered paths.
  --return-mode <mode>                 Default: coordinator_synthesis.
  --platform-callback-status <status>  Default: deferred.
  --platform-callback-evidence <text>  Evidence string when callback is proven.
  --help                               Show this help.
`);
    return;
  }
  const statePath = options.state ?? options._[0];
  if (!statePath) throw new Error("Missing --state. Run with --help for usage.");
  const state = await readJsonFile(statePath);
  const envelopeOptions = {};
  if (options["run-dir"]) envelopeOptions.runDir = options["run-dir"];
  if (options["return-mode"]) envelopeOptions.returnMode = options["return-mode"];
  if (options["platform-callback-status"]) envelopeOptions.platformCallbackStatus = options["platform-callback-status"];
  if (options["platform-callback-evidence"]) envelopeOptions.platformCallbackEvidence = options["platform-callback-evidence"];
  const envelope = buildReturnEnvelope(state, envelopeOptions);
  process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
