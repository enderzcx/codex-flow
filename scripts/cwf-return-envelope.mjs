import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import { evaluateVerifierGate } from "./cwf-safe-write.mjs";

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
    return_mode: options.returnMode ?? "coordinator_synthesis",
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
    verifier_status: verifier.status,
    verifier: verifier,
    deferred_items: deferredItems,
    completion_status: completionStatus,
    run_status: state.status ?? "planned",
    updated_at: state.updated_at ?? new Date().toISOString(),
  };
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
  const statePath = process.argv[2];
  if (!statePath) {
    throw new Error("Usage: node scripts/cwf-return-envelope.mjs <state.json>");
  }
  const state = JSON.parse(await readFile(statePath, "utf8"));
  const envelope = buildReturnEnvelope(state);
  process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
