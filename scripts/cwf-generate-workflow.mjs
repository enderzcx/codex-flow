import { pathToFileURL } from "node:url";

const FAMILY_ALIASES = [
  ["safe-fix-loop", /\b(fix|bug|repair|patch|write)\b/i],
  ["repo-audit", /\b(audit|review|scan|risk|read-only|readonly)\b/i],
];

const UNSAFE_PATTERNS = [
  /\bimport\b/i,
  /\brequire\s*\(/i,
  /\bprocess\b/i,
  /\bchild_process\b/i,
  /\bfs\b/i,
  /\bfetch\s*\(/i,
  /\beval\s*\(/i,
  /\bFunction\s*\(/,
  /=>/,
  /`/,
  /\bconstructor\b/i,
  /\bglobalThis\b/i,
  /\bmodule\.exports\b/i,
];

export function generateWorkflowFromObjective(objective, options = {}) {
  scanUnsafeWorkflowText(objective, "objective");
  const family = options.family ?? inferFamily(objective);
  if (family === "repo-audit") return repoAuditWorkflow(objective);
  if (family === "safe-fix-loop") return safeFixWorkflow(objective, options);
  throw new Error(`unsupported workflow generation family: ${family}`);
}

export function renderGeneratedWorkflow(workflow) {
  const text = `export default ${JSON.stringify(workflow, null, 2)};\n`;
  scanUnsafeWorkflowText(text, "generated workflow");
  return text;
}

export function scanUnsafeWorkflowText(text, label = "workflow") {
  for (const pattern of UNSAFE_PATTERNS) {
    if (pattern.test(text)) {
      throw new Error(`${label}: unsafe generated workflow token ${pattern}`);
    }
  }
}

function inferFamily(objective) {
  for (const [family, pattern] of FAMILY_ALIASES) {
    if (pattern.test(objective)) return family;
  }
  throw new Error("objective does not match a supported workflow family");
}

function repoAuditWorkflow(objective) {
  return {
    name: "generated-repo-audit",
    goal: objective,
    when_to_use: ["Generated for a repo-audit style read-only objective."],
    pattern: "fan-out-and-synthesize",
    budget: {
      max_tokens: 12000,
      timeout_ms: 600000,
      stop_when: "All read-only audit workers return or a concrete blocker is recorded.",
    },
    run_experience: {
      preview: "Show scope, exclusions, workers, verifier, budget, stop rules, and evidence path.",
      status: "Report phase, worker status, blockers, evidence, and next action.",
      cancel: "Stop read-only workers and preserve returned evidence.",
      resume: "Resume only from the last contiguous completed phase.",
      final_output: "Start with a human conclusion, then findings and evidence.",
    },
    scope: ["current repository", "user objective"],
    exclusions: ["external systems", "writes", "credentials", "deploys"],
    phases: [
      { id: "scope", coordinator: "Confirm repo state, scope, exclusions, and evidence paths." },
      {
        id: "fanout",
        agents: [
          { id: "correctness", type: "explorer", visibility: "inline", prompt: "Find correctness risks with file evidence." },
          { id: "tests", type: "explorer", visibility: "inline", prompt: "Find verification gaps and commands." },
          { id: "maintainability", type: "explorer", visibility: "inline", prompt: "Find maintainability risks." },
        ],
      },
      { id: "synthesize", coordinator: "Dedupe findings and return only evidence-backed results." },
    ],
    verification: ["Evidence-backed findings only.", "No writes."],
    stop_conditions: ["Workers returned.", "A local evidence blocker is recorded."],
    quarantine_rules: ["Untrusted raw input remains read-only."],
    visibility_policy: ["Default inline; desktop-thread only after explicit approval."],
  };
}

function safeFixWorkflow(objective, options) {
  const allowedPaths = options.allowed_paths ?? ["APPROVED_PATH"];
  return {
    name: "generated-safe-fix-loop",
    goal: objective,
    when_to_use: ["Generated for a bounded safe-fix objective."],
    pattern: "loop-until-done",
    budget: {
      max_tokens: 15000,
      timeout_ms: 900000,
      stop_when: "Approved patch passes apply check and verification, or a blocker is recorded.",
    },
    run_experience: {
      preview: "Show write scope, approval gate, workers, verifier, budget, stop rules, and rollback path.",
      status: "Report phase, worker status, changed files, blockers, evidence, and next action.",
      cancel: "Stop before additional writes and preserve rollback command.",
      resume: "Resume only from the last contiguous completed phase and recheck patch evidence.",
      final_output: "Start with a human conclusion, then changed files, verification, and rollback evidence.",
    },
    scope: allowedPaths,
    exclusions: ["forbidden paths", "credentials", "deploys", "external systems"],
    phases: [
      { id: "diagnose", coordinator: "Diagnose without writing and preview write scope." },
      {
        id: "patch",
        agent: {
          id: "patch-proposer",
          type: "worker",
          visibility: "auto",
          write_scope: `Only approved paths: ${allowedPaths.join(", ")}`,
          prompt: "Propose a bounded patch after approve-write only. Return changed files and verification evidence.",
        },
      },
      { id: "verify", coordinator: "Run apply check and declared verification before final synthesis." },
    ],
    verification: ["approve-write gate present.", "Path policy passes.", "Apply check passes.", "Declared verification passes."],
    stop_conditions: ["Verification passes.", "Approval is missing.", "Path policy refuses.", "Patch conflicts."],
    quarantine_rules: ["Patch proposer receives sanitized facts and approved paths only."],
    visibility_policy: ["Write worker uses auto visibility and is approval-gated."],
  };
}

function main() {
  const objective = process.argv.slice(2).join(" ");
  if (!objective) throw new Error("Usage: node scripts/cwf-generate-workflow.mjs <objective>");
  const workflow = generateWorkflowFromObjective(objective);
  process.stdout.write(renderGeneratedWorkflow(workflow));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
