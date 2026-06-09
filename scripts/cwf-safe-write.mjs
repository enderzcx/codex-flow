import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import { posix } from "node:path";

import { parseArgs, printHelp, readJsonFile, stringList, wantsHelp } from "./lib/cli.mjs";

const VERIFIER_STATUSES = new Set(["pass", "blocked", "needs-waiver", "advisory"]);

export function evaluateVerifierGate(evaluations = []) {
  if (evaluations.length === 0) {
    return {
      status: "pending",
      final_pass: false,
      blockers: [],
      waivers_required: [],
      advisories: [],
    };
  }
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
  const pathInfo = extractChangedFileInfo(request.patch ?? "");
  const changedFiles = pathInfo.changed_files;
  const applyCheck = normalizeApplyCheck(request);
  const reasons = [];
  const proposerRuntime = request.proposer_runtime ?? "coordinator";

  if (request.prior_gate !== "previewed") reasons.push("no prior preview gate");
  if (request.approval !== "approve-write") reasons.push("missing approve-write approval");
  if (proposerRuntime !== "coordinator" && request.coordinator_approval !== "accepted") {
    reasons.push(`${proposerRuntime} patch proposal must return to coordinator safe-write gate`);
  }
  if (changedFiles.length === 0) reasons.push("patch has no changed files");
  for (const invalid of pathInfo.invalid_paths) {
    reasons.push(`invalid patch path: ${invalid.path} (${invalid.reason})`);
  }
  if ((request.patch ?? "").includes("<<<<<<<") || (request.patch ?? "").includes(">>>>>>>")) {
    reasons.push("patch contains conflict markers");
  }

  const allowedPaths = normalizePathList(request.allowed_paths ?? []);
  const forbiddenPaths = normalizePathList(request.forbidden_paths ?? []);
  for (const file of changedFiles) {
    if (!isAllowed(file, allowedPaths)) reasons.push(`out-of-scope path: ${file}`);
    if (isForbidden(file, forbiddenPaths)) reasons.push(`forbidden path: ${file}`);
  }

  if (applyCheck.status !== "passed") reasons.push("apply check did not pass");
  if (!applyCheck.evidence) reasons.push("apply check evidence missing");
  if (request.verification?.status !== "pass") reasons.push("declared verification did not pass");

  return {
    status: reasons.length === 0 ? "pass" : "refused",
    reasons,
    changed_files: changedFiles,
    invalid_paths: pathInfo.invalid_paths,
    apply_check: applyCheck.status,
    apply_check_command: applyCheck.command,
    apply_check_evidence: applyCheck.evidence,
    verification: request.verification ?? { status: "not_run" },
    proposer_runtime: proposerRuntime,
    coordinator_approval: request.coordinator_approval ?? "",
    rollback_command: changedFiles.length > 0
      ? `git checkout -- ${changedFiles.map((file) => quoteShell(file)).join(" ")}`
      : "",
  };
}

export function extractChangedFiles(patchText) {
  return extractChangedFileInfo(patchText).changed_files;
}

function extractChangedFileInfo(patchText) {
  const files = new Set();
  const invalidPaths = [];
  const invalidSeen = new Set();
  for (const line of patchText.split(/\r?\n/)) {
    const diffMatch = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (diffMatch) {
      addPatchPath(files, invalidPaths, invalidSeen, diffMatch[2]);
      continue;
    }
    const plusMatch = line.match(/^\+\+\+ b\/(.+)$/);
    if (plusMatch) addPatchPath(files, invalidPaths, invalidSeen, plusMatch[1]);
  }
  return {
    changed_files: [...files].filter(Boolean).sort(),
    invalid_paths: invalidPaths,
  };
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
  return paths
    .map((item) => normalizePatchPath(item))
    .filter((item) => item.path)
    .map((item) => item.path);
}

function cleanPatchPath(path) {
  return normalizePatchPath(path).path;
}

function addPatchPath(files, invalidPaths, invalidSeen, rawPath) {
  const normalized = normalizePatchPath(rawPath);
  if (normalized.skip) return;
  if (normalized.reason) {
    const key = `${rawPath}\0${normalized.reason}`;
    if (!invalidSeen.has(key)) {
      invalidSeen.add(key);
      invalidPaths.push({ path: String(rawPath), reason: normalized.reason });
    }
    return;
  }
  files.add(normalized.path);
}

function normalizePatchPath(rawPath) {
  let path = String(rawPath ?? "").replace(/\\/g, "/").trim();
  if (!path) return { path: "", reason: "empty path" };
  if (path === "/dev/null" || path === "dev/null") return { path: "", skip: true };
  if (/^[A-Za-z]:\//.test(path) || path.startsWith("/")) {
    return { path: "", reason: "absolute paths are not allowed" };
  }
  path = path.replace(/^\.?\//, "");
  const segments = path.split("/");
  if (segments.includes("..") || segments.includes(".")) {
    return { path: "", reason: "dot segments are not allowed" };
  }
  const normalized = posix.normalize(path);
  if (!normalized || normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    return { path: "", reason: "path resolves outside the allowed root" };
  }
  return { path: normalized };
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

function normalizeApplyCheck(request) {
  if (request.apply_check && typeof request.apply_check === "object") {
    return {
      status: request.apply_check.status ?? "not_run",
      command: request.apply_check.command ?? "",
      evidence: request.apply_check.evidence ?? "",
    };
  }
  return {
    status: request.apply_check ?? "not_run",
    command: request.apply_check_command ?? "",
    evidence: request.apply_check_evidence ?? "",
  };
}

export function sampleSafeWriteRequest() {
  return {
    prior_gate: "previewed",
    approval: "approve-write",
    allowed_paths: ["src"],
    forbidden_paths: [".env"],
    apply_check: "passed",
    apply_check_command: "git apply --check change.patch",
    apply_check_evidence: "git apply --check passed",
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
  node scripts/cwf-safe-write.mjs --patch change.patch --allowed docs --approval approve-write --prior-gate previewed --apply-check passed --apply-check-evidence "git apply --check passed" --verification-status pass
  node scripts/cwf-safe-write.mjs --sample

Options:
  --request <path>              JSON request file.
  --patch <path>                Unified diff patch file. Overrides request.patch.
  --allowed <paths>             Comma-separated allowed paths. Repeatable.
  --forbidden <paths>           Comma-separated forbidden paths. Repeatable.
  --approval <value>            Must be approve-write for pass.
  --prior-gate <value>          Must be previewed for pass.
  --apply-check <value>         Must be passed for pass.
  --apply-check-command <text>  Command used to produce apply-check evidence.
  --apply-check-evidence <text> Evidence from git apply --check or equivalent.
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
  if (options["apply-check-command"]) request.apply_check_command = options["apply-check-command"];
  if (options["apply-check-evidence"]) request.apply_check_evidence = options["apply-check-evidence"];
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
