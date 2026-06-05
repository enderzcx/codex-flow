import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, isAbsolute, join, resolve } from "node:path";
import { loadWorkflowSpec } from "./workflow-loader.js";
import type { WorkflowSpec } from "./types.js";

export type WorkflowSearchOptions = {
  cwd?: string;
  homeDir?: string;
};

export type WorkflowEntry = {
  id: string;
  version: string;
  title: string;
  description?: string;
  tags: string[];
  capabilities: WorkflowSpec["capabilities"];
  write_policy?: WorkflowSpec["write_policy"];
  inputs: WorkflowSpec["inputs"];
  path: string;
  search_path: string;
};

export type ResolvedWorkflow = {
  spec: WorkflowSpec;
  path: string;
};

export function workflowSearchPaths(options: WorkflowSearchOptions = {}): string[] {
  const cwd = options.cwd ?? process.cwd();
  const home = options.homeDir ?? homedir();
  return [resolve(cwd, ".codex-flow", "workflows"), resolve(cwd, "workflows"), resolve(home, ".codex-flow", "workflows")];
}

export async function listWorkflowEntries(options: WorkflowSearchOptions = {}): Promise<WorkflowEntry[]> {
  const entries = await discoverWorkflowEntries(options);
  assertUniqueWorkflowIds(entries);
  return entries.sort((left, right) => left.id.localeCompare(right.id) || left.path.localeCompare(right.path));
}

export async function validateWorkflowRegistry(options: WorkflowSearchOptions = {}): Promise<WorkflowEntry[]> {
  return listWorkflowEntries(options);
}

export async function showWorkflow(reference: string, options: WorkflowSearchOptions = {}): Promise<WorkflowEntry> {
  const resolved = await resolveWorkflowReference(reference, options);
  return workflowEntryFromSpec(resolved.spec, resolved.path, searchPathForFile(resolved.path, options));
}

export async function resolveWorkflowReference(reference: string, options: WorkflowSearchOptions = {}): Promise<ResolvedWorkflow> {
  if (looksLikeWorkflowPath(reference)) {
    const path = resolve(options.cwd ?? process.cwd(), reference);
    return { spec: await loadWorkflowSpec(path), path };
  }

  const entries = await listWorkflowEntries(options);
  const match = entries.find((entry) => entry.id === reference);
  if (!match) {
    throw new Error(`Unknown workflow id: ${reference}. Try: cwf workflows list`);
  }
  return { spec: await loadWorkflowSpec(match.path), path: match.path };
}

export function formatWorkflowList(entries: WorkflowEntry[]): string {
  if (entries.length === 0) {
    return "No workflows found.";
  }
  const lines = ["Workflow ID                    Version        Title                         Path"];
  for (const entry of entries) {
    lines.push(`${pad(entry.id, 30)} ${pad(entry.version, 14)} ${pad(entry.title, 29)} ${entry.path}`);
  }
  return lines.join("\n");
}

export function formatWorkflowShow(entry: WorkflowEntry): string {
  const inputLines = Object.entries(entry.inputs).map(([name, input]) => `- ${name}: ${input.type}${input.required ? ", required" : ""}`);
  const writePolicyLines = entry.write_policy
    ? [
        `Write policy: mode=${entry.write_policy.mode}`,
        `Allowed paths: ${entry.write_policy.allowed_paths.join(", ")}`,
        `Forbidden paths: ${entry.write_policy.forbidden_paths.join(", ")}`,
        `Verification commands: ${entry.write_policy.verification_commands.length > 0 ? entry.write_policy.verification_commands.join(" && ") : "(none)"}`,
      ]
    : [];
  return [
    `Workflow ID: ${entry.id}`,
    `Title: ${entry.title}`,
    `Version: ${entry.version}`,
    `Path: ${entry.path}`,
    `Tags: ${entry.tags.length > 0 ? entry.tags.join(", ") : "(none)"}`,
    `Capabilities: writes=${entry.capabilities.writes}`,
    ...writePolicyLines,
    "Inputs:",
    ...(inputLines.length > 0 ? inputLines : ["- none"]),
    entry.description ? `Description: ${entry.description}` : undefined,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

async function discoverWorkflowEntries(options: WorkflowSearchOptions): Promise<WorkflowEntry[]> {
  const entries: WorkflowEntry[] = [];
  for (const searchPath of workflowSearchPaths(options)) {
    let files: string[];
    try {
      files = await readdir(searchPath);
    } catch {
      continue;
    }
    for (const file of files) {
      const path = join(searchPath, file);
      if (!(await isWorkflowFile(path))) {
        continue;
      }
      try {
        const spec = await loadWorkflowSpec(path);
        entries.push(workflowEntryFromSpec(spec, path, searchPath));
      } catch (error) {
        throw new Error(`Invalid workflow spec ${path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  return entries;
}

function workflowEntryFromSpec(spec: WorkflowSpec, path: string, searchPath: string): WorkflowEntry {
  return {
    id: spec.id,
    version: spec.version,
    title: spec.title,
    description: spec.description,
    tags: spec.tags,
    capabilities: spec.capabilities,
    write_policy: spec.write_policy,
    inputs: spec.inputs,
    path,
    search_path: searchPath,
  };
}

function assertUniqueWorkflowIds(entries: WorkflowEntry[]): void {
  const byId = new Map<string, WorkflowEntry[]>();
  for (const entry of entries) {
    byId.set(entry.id, [...(byId.get(entry.id) ?? []), entry]);
  }
  for (const [id, matches] of byId.entries()) {
    if (matches.length > 1) {
      throw new Error(`Duplicate workflow id "${id}" found in:\n${matches.map((entry) => `- ${entry.path}`).join("\n")}`);
    }
  }
}

async function isWorkflowFile(path: string): Promise<boolean> {
  const ext = extname(path);
  if (ext !== ".yaml" && ext !== ".yml") {
    return false;
  }
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function looksLikeWorkflowPath(reference: string): boolean {
  return (
    isAbsolute(reference) ||
    reference.startsWith(".") ||
    reference.includes("/") ||
    reference.includes("\\") ||
    extname(reference) === ".yaml" ||
    extname(reference) === ".yml"
  );
}

function searchPathForFile(path: string, options: WorkflowSearchOptions): string {
  const match = workflowSearchPaths(options).find((searchPath) => path.startsWith(`${searchPath}/`));
  return match ?? resolve(path, "..");
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : `${value}${" ".repeat(width - value.length)}`;
}
