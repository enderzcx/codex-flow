import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";

import { parseArgs, printHelp, readJsonFile, stringList, wantsHelp } from "./lib/cli.mjs";

const VERIFIER_STATUSES = new Set(["pass", "blocked", "needs-waiver", "advisory"]);

export function evaluateVerifierGate(evaluations = []) {
  const normalized = evaluations.map((item) => normalizeVerifierEvaluation(item));
  const blockers = normalized.filter((item) => item.status === "blocked");
  const unwaived = normalized.filter(
    (item) => item.status === "needs-waiver" && (!item.waiver?.text || !item.waiver?.owner),
  );
  const advisories = normalized.filter((item) => item.status === "advisory");

  if (blockers.length > 0) {
    return {
      status: "blocked",
      final_pass: false,
      blockers,
      waivers_required: unwaived,
      advisories,
    };
  }

  if (unwaived.length > 0) {
    return {
      status: "needs-waiver",
      final_pass: false,
      blockers: [],
      waivers_required: unwaived,
      advisories,
    };
  }

  return {
    status: "pass",
    final_pass: true,
    blockers: [],
    waivers_required: [],
    advisories,
  };
}

export function evaluateSafeWriteRequest(request) {
  const changedFiles = extractChangedFiles(request.patch ?? "");
  const reasons = [];
  const proposerRuntime = request.proposer_runtime ?? "coordinator";

  if (request.prior_gate !== "previewed") reasons.push("no prior preview gate");
  if (request.approval !== "approve-write") reasons.push("missing approve-write approval");
  if (proposerRuntime !== "coordinator" && request.coordinator_approval !== "accepted") {
    reasons.push(`${proposerRuntime} patch proposal must return to coordinator safe-write gate`);
  }
  if (changedFiles.length === 0) reasons.push("patch has no changed files");
  if ((request.patch ?? "").includes("<<<<<<<") || (request.patch ?? "").includes(">>>>>>>")) {
    reasons.push("patch contains conflict markers");
  }

  const allowedPaths = normalizePathList(request.allowed_paths ?? []);
  const forbiddenPaths = normalizePathList(request.forbidden_paths ?? []);
  for (const file of changedFiles) {
    if (!isAllowed(file, allowedPaths)) reasons.push(`out-of-scope path: ${file}`);
    if (isForbidden(file, forbiddenPaths)) reasons.push(`forbidden path: ${file}`);
  }

  if (request.apply_check !== "passed") reasons.push("apply check did not pass");
  if (request.verification?.status !== "pass") reasons.push("declared verification did not pass");

  return {
    status: reasons.length === 0 ? "pass" : "refused",
    reasons,
    changed_files: changedFiles,
    apply_check: request.apply_check ?? "not_run",
    verification: request.verification ?? { status: "not_run" },
    proposer_runtime: proposerRuntime,
    coordinator_approval: request.coordinator_approval ?? "",
    rollback_command: changedFiles.length > 0
      ? `git checkout -- ${changedFiles.map((file) => quoteShell(file)).join(" ")}`
      : "",
  };
}

export function extractChangedFiles(patchText) {
  const files = new Set();
  for (const line of patchText.split(/\r?\n/)) {
    const diffMatch = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (diffMatch) {
      files.add(cleanPatchPath(diffMatch[2]));
      continue;
    }
    const plusMatch = line.match(/^\+\+\+ b\/(.+)$/);
    if (plusMatch) files.add(cleanPatchPath(plusMatch[1]));
  }
  return [...files].filter(Boolean).sort();
}

function normalizeVerifierEvaluation(item) {
  const status = item.status ?? "";
  if (!VERIFIER_STATUSES.has(status)) {
    throw new Error(`invalid verifier status: ${status}`);
  }
  return {
    status,
    summary: item.summary ?? "",
    evidence: item.evidence ?? "",
    waiver: item.waiver ?? null,
  };
}

function normalizePathList(paths) {
  return paths.map((item) => cleanPatchPath(item)).filter(Boolean);
}

function cleanPatchPath(path) {
  return path.replace(/\\/g, "/").replace(/^\.?\//, "").trim();
}

function isAllowed(file, allowedPaths) {
  if (allowedPaths.length === 0) return false;
  return allowedPaths.some((allowed) => file === allowed || file.startsWith(`${allowed.replace(/\/$/, "")}/`));
}

function isForbidden(file, forbiddenPaths) {
  return forbiddenPaths.some((forbidden) => file === forbidden || file.startsWith(`${forbidden.replace(/\/$/, "")}/`));
}

function quoteShell(value) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function sampleSafeWriteRequest() {
  return {
    prior_gate: "previewed",
    approval: "approve-write",
    allowed_paths: ["src"],
    forbidden_paths: [".env"],
    apply_check: "passed",
    verification: { status: "pass" },
    proposer_runtime: "coordinator",
    patch: "diff --git a/src/a.js b/src/a.js\n--- a/src/a.js\n+++ b/src/a.js\n@@\n-old\n+new\n",
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2), { repeatable: ["allowed", "forbidden", "allowed-path", "forbidden-path"] });
  if (wantsHelp(options)) {
    printHelp(`
Usage:
  node scripts/cwf-safe-write.mjs --request request.json
  node scripts/cwf-safe-write.mjs --patch change.patch --allowed docs --approval approve-write --prior-gate previewed --apply-check passed --verification-status pass
  node scripts/cwf-safe-write.mjs --sample

Options:
  --request <path>              JSON request file.
  --patch <path>                Unified diff patch file. Overrides request.patch.
  --allowed <paths>             Comma-separated allowed paths. Repeatable.
  --forbidden <paths>           Comma-separated forbidden paths. Repeatable.
  --approval <value>            Must be approve-write for pass.
  --prior-gate <value>          Must be previewed for pass.
  --apply-check <value>         Must be passed for pass.
  --verification-status <value> Must be pass for pass.
  --sample                      Print a sample request.
  --help                        Show this help.
`);
    return;
  }
  if (process.argv.slice(2).length === 0) {
    process.stdout.write(`${JSON.stringify(evaluateSafeWriteRequest(sampleSafeWriteRequest()), null, 2)}\n`);
    return;
  }
  if (options.sample) {
    process.stdout.write(`${JSON.stringify(sampleSafeWriteRequest(), null, 2)}\n`);
    return;
  }

  const request = options.request ? await readJsonFile(options.request) : {};
  if (options.patch && options.patch !== true) request.patch = await readFile(options.patch, "utf8");
  if (options.approval) request.approval = options.approval;
  if (options["prior-gate"]) request.prior_gate = options["prior-gate"];
  if (options["apply-check"]) request.apply_check = options["apply-check"];
  if (options["verification-status"]) request.verification = { ...(request.verification ?? {}), status: options["verification-status"] };

  const allowed = [...stringList(options.allowed), ...stringList(options["allowed-path"])];
  const forbidden = [...stringList(options.forbidden), ...stringList(options["forbidden-path"])];
  if (allowed.length > 0) request.allowed_paths = allowed;
  if (forbidden.length > 0) request.forbidden_paths = forbidden;

  if (!request.patch) throw new Error("Missing patch. Provide --request with patch or --patch <file>.");
  process.stdout.write(`${JSON.stringify(evaluateSafeWriteRequest(request), null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
