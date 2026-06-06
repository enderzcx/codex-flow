import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { CODEX_WORKFLOWS_ROOT } from "./run-index.js";

export type DynamicIntentPreview = {
  goal: string;
  agents: Array<{
    id: string;
    role: string;
    permissions: "read-only" | "safePatch" | "inherit-session";
    purpose: string;
  }>;
  write_intent: string;
  stop_rules: string[];
};

export type GenerateDynamicWorkflowOptions = {
  goal: string;
  output?: string;
  suggestionsRoot?: string;
  now?: Date;
};

export type GenerateDynamicWorkflowResult = {
  path: string;
  source: string;
  preview: DynamicIntentPreview;
};

export async function generateDynamicWorkflowFromIntent(options: GenerateDynamicWorkflowOptions): Promise<GenerateDynamicWorkflowResult> {
  const goal = normalizeGoal(options.goal);
  const preview = buildIntentPreview(goal);
  const source = renderGeneratedWorkflowSource(preview);
  const outputPath = options.output ? resolve(options.output) : defaultGeneratedWorkflowPath(goal, options.suggestionsRoot, options.now);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, source, { flag: "wx" });
  return { path: outputPath, source, preview };
}

export function buildIntentPreview(goal: string): DynamicIntentPreview {
  return {
    goal,
    agents: [
      {
        id: "intent-review",
        role: "targeted repo reviewer",
        permissions: "read-only",
        purpose: "Review the current target diff against the user request and report findings without modifying files.",
      },
    ],
    write_intent: "read-only: generated Phase A workflows may inspect diff context and write run artifacts only; they do not modify the target repo.",
    stop_rules: [
      "Pause at approve-dynamic before executing the generated workflow.js.",
      "Fail before execution if AST policy rejects forbidden APIs or direct shell-like strings.",
      "Fail the run if a read-only worker changes the target diff.",
    ],
  };
}

function renderGeneratedWorkflowSource(preview: DynamicIntentPreview): string {
  const goalExpression = charCodeExpression(preview.goal);
  return `export const metadata = ${JSON.stringify(
    {
      kind: "cwf-generated-dynamic-workflow",
      version: 1,
      generator: "intent-to-preview",
      permissions: ["read-only"],
    },
    null,
    2,
  )};

export default async function workflow(cwf) {
  const goal = ${goalExpression};
  const changedFiles = await cwf.git.changedFiles();
  const diff = await cwf.git.diff();
  await cwf.artifacts.write({
    name: "intent.md",
    content: "# Dynamic Workflow Intent\\n\\n" + goal + "\\n\\n## Changed Files\\n\\n" + JSON.stringify(changedFiles, null, 2) + "\\n"
  });
  const review = await cwf.agent.run({
    id: "intent-review",
    role: "targeted repo reviewer",
    permissions: "read-only",
    prompt: "User request:\\n" + goal + "\\n\\nChanged files JSON:\\n" + JSON.stringify(changedFiles, null, 2) + "\\n\\nDiff:\\n" + diff + "\\n\\nReturn correctness, safety, and verification findings. Do not modify files."
  });
  return cwf.report.summarize([review]);
}
`;
}

function normalizeGoal(goal: string): string {
  const normalized = goal.replace(/\s+/g, " ").trim();
  if (!normalized) {
    throw new Error('Usage: cwf dynamic generate --goal "<task>" --target <repo> [--output <workflow.js>]');
  }
  if (normalized.length > 2000) {
    throw new Error("dynamic workflow generation goal must be 2000 characters or fewer");
  }
  return normalized;
}

function defaultGeneratedWorkflowPath(goal: string, suggestionsRoot = join(CODEX_WORKFLOWS_ROOT, "dynamic"), now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return join(suggestionsRoot, `${stamp}-${slugify(goal)}.workflow.js`);
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

function charCodeExpression(value: string): string {
  return `String.fromCodePoint(${Array.from(value).map((char) => char.codePointAt(0) ?? 0).join(", ")})`;
}
