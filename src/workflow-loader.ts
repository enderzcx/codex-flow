import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import { validateWorkflowSpec } from "./workflow-schema.js";
import type { WorkflowSpec } from "./types.js";

export async function loadWorkflowSpec(path: string): Promise<WorkflowSpec> {
  const raw = await readFile(path, "utf8");
  const parsed = parse(raw);
  return validateWorkflowSpec(parsed);
}

