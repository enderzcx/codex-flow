import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, extname, isAbsolute, join, resolve } from "node:path";
import { validateDynamicWorkflowSource, type DynamicWorkflowOrigin } from "./dynamic-workflow.js";

export type DynamicWorkflowRegistryOptions = {
  cwd?: string;
  homeDir?: string;
};

export type DynamicWorkflowTrustMetadata = {
  id: string;
  source_sha256: string;
  origin: DynamicWorkflowOrigin;
  saved_at: string;
  source_path: string;
};

export type DynamicWorkflowEntry = {
  id: string;
  title: string;
  version: string;
  path: string;
  search_path: string;
  source_sha256: string;
  origin: DynamicWorkflowOrigin;
  trust_state: "packaged" | "local-trust-record" | "untrusted-local";
  capabilities: {
    writes: boolean;
    permissions: string[];
  };
};

export type ResolvedDynamicWorkflow = {
  entry: DynamicWorkflowEntry;
  path: string;
  origin: DynamicWorkflowOrigin;
};

export type SaveDynamicWorkflowOptions = DynamicWorkflowRegistryOptions & {
  sourcePath: string;
  id: string;
  now?: Date;
};

export function dynamicWorkflowSearchPaths(options: DynamicWorkflowRegistryOptions = {}): string[] {
  const cwd = options.cwd ?? process.cwd();
  const home = options.homeDir ?? homedir();
  return [resolve(cwd, "workflows", "dynamic"), resolve(cwd, ".codex-flow", "dynamic-workflows"), resolve(home, ".codex-workflows", "dynamic")];
}

export async function listDynamicWorkflowEntries(options: DynamicWorkflowRegistryOptions = {}): Promise<DynamicWorkflowEntry[]> {
  const entries: DynamicWorkflowEntry[] = [];
  for (const searchPath of dynamicWorkflowSearchPaths(options)) {
    let files: string[];
    try {
      files = await readdir(searchPath);
    } catch {
      continue;
    }
    for (const file of files) {
      const path = join(searchPath, file);
      if (!isDynamicWorkflowFile(path)) {
        continue;
      }
      const source = await readFile(path, "utf8");
      validateDynamicWorkflowSource(source);
      entries.push(await dynamicEntryFromSource(path, searchPath, source, options));
    }
  }
  assertUniqueDynamicWorkflowIds(entries);
  return entries.sort((left, right) => left.id.localeCompare(right.id) || left.path.localeCompare(right.path));
}

export async function resolveDynamicWorkflowReference(reference: string, options: DynamicWorkflowRegistryOptions = {}): Promise<ResolvedDynamicWorkflow> {
  if (looksLikeRemoteReference(reference)) {
    throw new Error("Remote dynamic workflows cannot run directly by URL. Inspect and save a local trusted copy first.");
  }
  if (looksLikeDynamicWorkflowPath(reference)) {
    const path = resolve(options.cwd ?? process.cwd(), reference);
    const source = await readFile(path, "utf8");
    validateDynamicWorkflowSource(source);
    const entry = await dynamicEntryFromSource(path, resolve(path, ".."), source, options);
    return { entry, path, origin: entry.origin };
  }
  const entries = await listDynamicWorkflowEntries(options);
  const entry = entries.find((item) => item.id === reference);
  if (!entry) {
    throw new Error(`Unknown dynamic workflow id: ${reference}. Try: cwf dynamic list`);
  }
  if (entry.trust_state === "untrusted-local") {
    throw new Error(`Dynamic workflow ${reference} is untrusted-local. Run it by explicit path or save it with cwf dynamic save before using its id.`);
  }
  return { entry, path: entry.path, origin: entry.origin };
}

export async function saveDynamicWorkflow(options: SaveDynamicWorkflowOptions): Promise<DynamicWorkflowEntry> {
  const sourcePath = resolve(options.sourcePath);
  const source = await readFile(sourcePath, "utf8");
  validateDynamicWorkflowSource(source);
  const id = normalizeDynamicWorkflowId(options.id);
  const root = join(options.homeDir ?? homedir(), ".codex-workflows", "dynamic");
  await mkdir(root, { recursive: true });
  const destination = join(root, `${id}.workflow.js`);
  await copyFile(sourcePath, destination, constants.COPYFILE_EXCL);
  const sha = sha256(source);
  const trust: DynamicWorkflowTrustMetadata = {
    id,
    source_sha256: sha,
    origin: "local-trust-record",
    saved_at: (options.now ?? new Date()).toISOString(),
    source_path: sourcePath,
  };
  await writeFile(join(root, `${id}.trust.json`), `${JSON.stringify(trust, null, 2)}\n`, { flag: "wx" });
  return dynamicEntryFromSource(destination, root, source, options);
}

export function formatDynamicWorkflowList(entries: DynamicWorkflowEntry[]): string {
  if (entries.length === 0) {
    return "No dynamic workflows found.";
  }
  const lines = ["Dynamic workflow ID            Version        Trust                 Title                         Path"];
  for (const entry of entries) {
    lines.push(`${pad(entry.id, 30)} ${pad(entry.version, 14)} ${pad(entry.trust_state, 21)} ${pad(entry.title, 29)} ${entry.path}`);
  }
  return lines.join("\n");
}

export function formatDynamicWorkflowShow(entry: DynamicWorkflowEntry): string {
  return [
    `Dynamic workflow ID: ${entry.id}`,
    `Title: ${entry.title}`,
    `Version: ${entry.version}`,
    `Path: ${entry.path}`,
    `Origin: ${entry.origin}`,
    `Trust: ${entry.trust_state}`,
    `SHA-256: ${entry.source_sha256}`,
    `Capabilities: writes=${entry.capabilities.writes}`,
    `Permissions: ${entry.capabilities.permissions.length > 0 ? entry.capabilities.permissions.join(", ") : "read-only"}`,
  ].join("\n");
}

async function dynamicEntryFromSource(
  path: string,
  searchPath: string,
  source: string,
  options: DynamicWorkflowRegistryOptions,
): Promise<DynamicWorkflowEntry> {
  const sha = sha256(source);
  const declared = parseDeclaredMetadata(source);
  const trust = await readTrustMetadata(path);
  if (trust && trust.source_sha256 !== sha) {
    throw new Error(`Dynamic workflow trust metadata SHA mismatch for ${path}`);
  }
  const packaged = resolve(searchPath) === resolve(options.cwd ?? process.cwd(), "workflows", "dynamic");
  const id = trust?.id ?? normalizeDynamicWorkflowId(stringValue(declared.id) ?? basename(path).replace(/\.workflow\.js$/, ""));
  const permissions = Array.isArray(declared.permissions)
    ? declared.permissions.filter((value): value is string => typeof value === "string")
    : requestedPermissions(source);
  return {
    id,
    title: stringValue(declared.title) ?? titleFromId(id),
    version: stringValue(declared.version) ?? "1.0.0",
    path,
    search_path: searchPath,
    source_sha256: sha,
    origin: trust?.origin ?? (packaged ? "packaged" : "copied-local"),
    trust_state: trust ? "local-trust-record" : packaged ? "packaged" : "untrusted-local",
    capabilities: {
      writes: permissions.includes("safePatch") || permissions.includes("inherit-session"),
      permissions,
    },
  };
}

async function readTrustMetadata(path: string): Promise<DynamicWorkflowTrustMetadata | undefined> {
  const trustPath = path.replace(/\.workflow\.js$/, ".trust.json");
  try {
    await access(trustPath);
    return JSON.parse(await readFile(trustPath, "utf8")) as DynamicWorkflowTrustMetadata;
  } catch {
    return undefined;
  }
}

function parseDeclaredMetadata(source: string): Record<string, unknown> {
  const match = /export\s+const\s+metadata\s*=\s*(\{[\s\S]*?\});/.exec(source);
  if (!match) {
    return {};
  }
  try {
    return JSON.parse(match[1]) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function requestedPermissions(source: string): string[] {
  const values = new Set<string>(["read-only"]);
  if (source.includes("safePatch")) {
    values.add("safePatch");
  }
  if (source.includes("inherit-session")) {
    values.add("inherit-session");
  }
  return [...values];
}

function looksLikeRemoteReference(reference: string): boolean {
  return /^https?:\/\//i.test(reference);
}

function looksLikeDynamicWorkflowPath(reference: string): boolean {
  return (
    isAbsolute(reference) ||
    reference.startsWith(".") ||
    reference.includes("/") ||
    reference.includes("\\") ||
    extname(reference) === ".js" ||
    reference.endsWith(".workflow.js")
  );
}

function isDynamicWorkflowFile(path: string): boolean {
  return path.endsWith(".workflow.js");
}

function normalizeDynamicWorkflowId(value: string): string {
  const normalized = value.trim();
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(normalized)) {
    throw new Error("dynamic workflow id must start with a letter or number and contain only letters, numbers, dots, underscores, or dashes");
  }
  return normalized;
}

function assertUniqueDynamicWorkflowIds(entries: DynamicWorkflowEntry[]): void {
  const byId = new Map<string, DynamicWorkflowEntry[]>();
  for (const entry of entries) {
    byId.set(entry.id, [...(byId.get(entry.id) ?? []), entry]);
  }
  for (const [id, matches] of byId.entries()) {
    if (matches.length > 1) {
      throw new Error(`Duplicate dynamic workflow id "${id}" found in:\n${matches.map((entry) => `- ${entry.path}`).join("\n")}`);
    }
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function titleFromId(id: string): string {
  return id
    .split(/[-_.]+/g)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function sha256(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : `${value}${" ".repeat(width - value.length)}`;
}
