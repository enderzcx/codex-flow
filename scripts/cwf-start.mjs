import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { loadWorkflow, renderPreviewMarkdown } from "./cwf-run-preview.mjs";
import { buildRunPlanFromWorkflow, renderRunPlanMarkdown } from "./cwf-run-plan.mjs";
import { writeReturnEnvelope } from "./cwf-return-envelope.mjs";
import { parseArgs, printHelp, wantsHelp } from "./lib/cli.mjs";

const DEFAULT_RUN_ROOT = ".cwf/runs";

export async function startRun(options = {}) {
  const workflowPath = options.workflow;
  if (!workflowPath) throw new Error("Missing workflow path");
  const runId = options.runId || createRunId();
  const runRoot = resolve(options.runRoot ?? DEFAULT_RUN_ROOT);
  const runDir = safeRunDir(runRoot, runId);
  const loaded = await loadWorkflow(workflowPath);
  const runPlan = await buildRunPlanFromWorkflow(workflowPath, {
    runId,
    objective: options.objective ?? "",
    inspectWorker: Boolean(options.inspectWorker),
    rawPrivilegedPath: Boolean(options.rawPrivilegedPath),
  });
  const preview = runPlan.preview;
  const now = new Date().toISOString();

  const state = {
    schema_version: 1,
    run_id: runId,
    workflow_name: loaded.workflow.name,
    template_path: workflowPath,
    user_objective: options.objective ?? "",
    runtime_mode: options.runtimeMode ?? "controller_only",
    return_mode: options.returnMode ?? "coordinator_synthesis",
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
      runtime: selectRuntime(agent),
      status: "planned",
      output_summary: "",
      evidence: [],
      sdk_thread_id: "",
      desktop_thread_id: "",
      worker_result_path: `worker-results/${agent.id}.json`,
      worker_packet_path: `worker-packets/${agent.id}.md`,
    })),
    verification_evidence: [],
    verifier_evaluations: [],
    adapter_status: {
      native_subagent: "pending",
      sdk_background_worker: "pending",
      desktop_thread_worker: "requires_approval",
      heartbeat_return: "pending",
    },
    deferred_items: [
      {
        id: "platform-automatic-callback",
        status: "deferred",
        reason: "Coordinator synthesis is proven locally; platform automatic callback is not claimed without real smoke.",
      },
      {
        id: "desktop-thread-real-smoke",
        status: "requires_approval",
        reason: "Visible Codex Desktop threads are created only after Ender approves the exact smoke.",
      },
    ],
    cancel: null,
    resume: {
      last_completed_phase_id: "",
      next_phase_id: preview.phases[0]?.id ?? "",
      action: "safely_restarted",
      reason: "No phase completed yet; smallest safe checkpoint is Phase 1.",
    },
    preview_skip: preview.preview_skip,
  };

  await mkdir(join(runDir, "worker-packets"), { recursive: true });
  await mkdir(join(runDir, "worker-results"), { recursive: true });
  await writeJson(join(runDir, "state.json"), state);
  await writeFile(join(runDir, "preview.md"), renderPreviewMarkdown(preview, workflowPath), "utf8");
  await writeFile(join(runDir, "run-plan.md"), renderRunPlanMarkdown(runPlan), "utf8");
  await writeFile(join(runDir, "final.md"), renderInitialFinal(state), "utf8");
  await writeWorkerPackets(runDir, state, preview);
  await writeReturnEnvelope(runDir, state, { returnMode: state.return_mode });

  return {
    run_id: runId,
    run_dir: runDir,
    state: join(runDir, "state.json"),
    preview: join(runDir, "preview.md"),
    run_plan: join(runDir, "run-plan.md"),
    return_envelope: join(runDir, "return-envelope.json"),
    worker_packets: join(runDir, "worker-packets"),
    worker_results: join(runDir, "worker-results"),
    final: join(runDir, "final.md"),
  };
}

export function safeRunDir(runRoot, runId) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(runId)) {
    throw new Error("run-id must be a single safe filename segment");
  }
  const root = resolve(runRoot);
  const runDir = resolve(root, runId);
  if (runDir !== root && !runDir.startsWith(`${root}${sep}`)) {
    throw new Error("run-id resolves outside state directory");
  }
  return runDir;
}

function selectRuntime(agent) {
  if (agent.resolved_visibility === "desktop-thread") return "desktop-thread";
  if (agent.type === "explorer" || agent.type === "verifier") return "native-subagent";
  return "sdk-background";
}

async function writeWorkerPackets(runDir, state, preview) {
  for (const worker of state.workers) {
    const agent = preview.agents.find((item) => item.id === worker.id);
    const lines = [
      `# CWF Worker Packet: ${worker.id}`,
      "",
      `Run: ${state.run_id}`,
      `Workflow: ${state.workflow_name}`,
      `Objective: ${state.user_objective || "not specified"}`,
      `Phase: ${worker.phase_id}`,
      `Type: ${worker.type}`,
      `Runtime: ${worker.runtime}`,
      `Visibility: ${worker.visibility} -> ${worker.resolved_visibility}`,
      "",
      "## Prompt",
      agent?.prompt ?? "Follow the workflow role and return evidence-backed output.",
      "",
      "## Return Contract",
      "- Write or report a normalized worker result with status, summary, evidence, and runtime ids.",
      "- Do not apply writes directly; patch proposals must return to the coordinator safe-write gate.",
      "- Label fixture, local, real-smoke, unavailable, deferred, and requires_approval honestly.",
      "",
    ];
    await writeFile(join(runDir, worker.worker_packet_path), lines.join("\n"), "utf8");
  }
}

function renderInitialFinal(state) {
  return [
    `结论：这次 CWF run 已初始化，尚未完成；证据目录在 .cwf/runs/${state.run_id}/。`,
    "",
    `# CWF Run ${state.run_id}`,
    "",
    `Workflow: ${state.workflow_name}`,
    `Runtime mode: ${state.runtime_mode}`,
    `Return mode: ${state.return_mode}`,
    "Verifier: pending",
    "Next action: dispatch bounded workers or record unavailable adapter status.",
    "",
  ].join("\n");
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createRunId() {
  return `run-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
}

function normalizeOptions(options) {
  const workflow = options.workflow ?? options._[0];
  if (!workflow) throw new Error("Missing workflow. Run with --help for usage.");
  return {
    workflow,
    runId: options["run-id"] === true ? "" : options["run-id"],
    runRoot: options["run-root"] === true ? "" : options["run-root"],
    objective: options.objective === true ? "" : options.objective,
    returnMode: options["return-mode"] === true ? "" : options["return-mode"],
    runtimeMode: options["runtime-mode"] === true ? "" : options["runtime-mode"],
    inspectWorker: Boolean(options["inspect-worker"]),
    rawPrivilegedPath: Boolean(options["raw-privileged-path"]),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (wantsHelp(options)) {
    printHelp(`
Usage:
  node scripts/cwf-start.mjs workflows/repo-audit.workflow.js --objective "audit this repo"
  node scripts/cwf-start.mjs --workflow workflows/repo-audit.workflow.js --run-id smoke --format json

Options:
  --workflow <path>              Workflow template path. Positional path is also accepted.
  --objective <text>             User objective for the run.
  --run-id <id>                  Safe run id. Default: timestamp id.
  --run-root <path>              Run root. Default: .cwf/runs.
  --return-mode <mode>           Default: coordinator_synthesis.
  --runtime-mode <mode>          Default: controller_only.
  --inspect-worker               Resolve auto visibility as inspectable Desktop thread.
  --raw-privileged-path          Mark raw content as reaching a privileged worker.
  --format <json|text>           Default: json.
  --help                         Show this help.
`);
    return;
  }
  const result = await startRun(normalizeOptions(options));
  if (options.format === "text") {
    process.stdout.write(`结论：CWF run 已初始化，run_id=${result.run_id}，state=${result.state}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
