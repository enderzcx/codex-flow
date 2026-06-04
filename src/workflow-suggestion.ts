import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parse, stringify } from "yaml";
import { CODEX_WORKFLOWS_ROOT, RUNS_ROOT } from "./run-index.js";
import { RunStore } from "./run-store.js";
import { validateWorkflowSpec } from "./workflow-schema.js";
import type { WorkflowSpec } from "./types.js";

export const SUGGESTIONS_ROOT = join(CODEX_WORKFLOWS_ROOT, "suggestions");

export type SuggestWorkflowOptions = {
  goal?: string;
  target?: string;
  fromRunId?: string;
  output?: string;
  suggestionsRoot?: string;
  runsRoot?: string;
  now?: Date;
};

export type SuggestWorkflowResult = {
  path: string;
  spec: WorkflowSpec;
  valid: boolean;
  diagnostics: string[];
  installed: false;
  run_command?: string;
};

export type SuggestionValidation = {
  valid: boolean;
  diagnostics: string[];
};

export async function suggestWorkflow(options: SuggestWorkflowOptions): Promise<SuggestWorkflowResult> {
  const source = await resolveSuggestionSource(options);
  const spec = buildSuggestedWorkflow(source.goal, source.target);
  const outputPath = options.output ? resolve(options.output) : defaultSuggestionPath(spec.id, options.suggestionsRoot, options.now);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, stringify(spec, { lineWidth: 0 }), { flag: "wx" });
  const validation = await validateSuggestionFile(outputPath);
  return {
    path: outputPath,
    spec,
    valid: validation.valid,
    diagnostics: validation.diagnostics,
    installed: false,
    run_command: source.target ? `cwf run ${shellArg(outputPath)} --target ${shellArg(source.target)}` : undefined,
  };
}

export async function validateSuggestionFile(path: string): Promise<SuggestionValidation> {
  try {
    const raw = await readFile(path, "utf8");
    validateWorkflowSpec(parse(raw));
    return { valid: true, diagnostics: [] };
  } catch (error) {
    return { valid: false, diagnostics: [error instanceof Error ? error.message : String(error)] };
  }
}

function buildSuggestedWorkflow(goal: string, target?: string): WorkflowSpec {
  const slug = slugify(goal);
  return {
    id: `suggested-${slug}`,
    version: "0.1.0",
    title: titleFromGoal(goal),
    description: `Generated read-only workflow suggestion for: ${goal}`,
    tags: ["suggested", "read-only", "review"],
    inputs: {
      target: { type: "path", required: true, description: "Repository to review." },
    },
    capabilities: { writes: false },
    requires: { target: "git-repo" },
    defaults: { sandbox: "read-only", timeout_ms: 300000 },
    phases: [
      { id: "collect", kind: "command" },
      {
        id: "review",
        kind: "codex-parallel",
        workers: [
          {
            id: "reviewer",
            perspective: "targeted workflow review",
            prompt: buildWorkerPrompt(goal, target),
          },
        ],
      },
      { id: "reduce", kind: "reducer", reducer: "diff-review" },
    ],
    artifacts: ["result.md"],
  };
}

async function resolveSuggestionSource(options: SuggestWorkflowOptions): Promise<{ goal: string; target?: string }> {
  if (options.goal) {
    return { goal: options.goal, target: options.target ? resolve(options.target) : undefined };
  }
  if (options.fromRunId) {
    const store = new RunStore(options.fromRunId, join(options.runsRoot ?? RUNS_ROOT, options.fromRunId));
    const state = await store.readState();
    const workflow = await store.readWorkflow();
    return {
      goal: `Review ${workflow.title} follow-up from run ${state.id} with status ${state.status}`,
      target: options.target ? resolve(options.target) : state.target,
    };
  }
  throw new Error('Usage: cwf suggest-workflow --goal "<task>" [--target <repo>] [--output <path>]');
}

function defaultSuggestionPath(id: string, suggestionsRoot = SUGGESTIONS_ROOT, now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return join(suggestionsRoot, `${stamp}-${id}.yaml`);
}

function buildWorkerPrompt(goal: string, target?: string): string {
  const targetLine = target ? `Target repository: ${target}` : "Target repository will be provided at run time.";
  return [
    `Goal: ${goal}`,
    targetLine,
    "Review the collected git diff for correctness, tests, safety, and verification gaps.",
    "Return findings in the standard Codex Flow worker envelope. Do not modify files.",
  ].join("\n");
}

function titleFromGoal(goal: string): string {
  const cleaned = goal.replace(/\s+/g, " ").trim();
  const title = cleaned.length > 52 ? `${cleaned.slice(0, 49)}...` : cleaned;
  return `Suggested: ${title}`;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug || "workflow";
}

function shellArg(value: string): string {
  return /^[A-Za-z0-9_./:@-]+$/.test(value) ? value : `'${value.replace(/'/g, "'\\''")}'`;
}
