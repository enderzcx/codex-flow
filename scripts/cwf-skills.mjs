import { readdir, readFile, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parseArgs, printHelp, wantsHelp } from "./lib/cli.mjs";

const defaultRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const readableRoots = new Set(["SKILL.md", "references", "templates", "evals"]);
const readableExtensions = new Set([".md", ".json", ".txt"]);

export async function listSkills(options = {}) {
  const root = resolve(options.root ?? defaultRoot);
  const skillsRoot = resolve(root, "skills");
  const version = await packageVersion(root);
  const names = await readdir(skillsRoot);
  const skills = [];
  for (const name of names.sort()) {
    const skillDir = resolveWithin(skillsRoot, [name]);
    const info = await safeStat(skillDir);
    if (!info?.isDirectory()) continue;
    const skillFile = join(skillDir, "SKILL.md");
    const skillInfo = await safeStat(skillFile);
    if (!skillInfo?.isFile()) continue;
    const text = await readFile(skillFile, "utf8");
    const metadata = parseSkillMetadata(text);
    skills.push({
      name: metadata.name || name,
      directory: name,
      description: metadata.description || "",
      sunny_skill_type: metadata.sunny_skill_type || "",
      version,
      path: `skills/${name}/SKILL.md`,
    });
  }
  return skills;
}

export async function listReadableEntries(target = "", options = {}) {
  if (!target) return listSkills(options);
  const root = resolve(options.root ?? defaultRoot);
  const { skillName, relParts } = parseSkillTarget(target);
  const skillDir = await resolveExistingSkillDir(root, skillName);
  const targetPath = relParts.length === 0 ? skillDir : resolveReadablePath(skillDir, relParts);
  const info = await stat(targetPath);
  if (info.isFile()) return [entryForPath(skillName, skillDir, targetPath, info)];

  const names = relParts.length === 0 ? [...readableRoots] : await readdir(targetPath);
  const entries = [];
  for (const name of names.sort()) {
    const child = relParts.length === 0 ? resolveReadablePath(skillDir, [name]) : resolveReadablePath(skillDir, [...relParts, name]);
    const childInfo = await safeStat(child);
    if (!childInfo) continue;
    if (childInfo.isDirectory() || isReadableFile(child)) entries.push(entryForPath(skillName, skillDir, child, childInfo));
  }
  return entries;
}

export async function readSkillContent(target, options = {}) {
  const root = resolve(options.root ?? defaultRoot);
  const { skillName, relParts } = parseSkillTarget(target);
  const skillDir = await resolveExistingSkillDir(root, skillName);
  const readParts = relParts.length === 0 ? ["SKILL.md"] : relParts;
  const path = resolveReadablePath(skillDir, readParts);
  const info = await stat(path);
  if (!info.isFile()) throw new Error(`not a readable file: ${target}`);
  if (!isReadableFile(path)) throw new Error(`not an agent-readable skill file: ${target}`);
  return readFile(path, "utf8");
}

export async function validateSkillRegistry(options = {}) {
  const root = resolve(options.root ?? defaultRoot);
  const requestedSkill = options.skill ? parseSkillTarget(options.skill).skillName : "";
  const skills = (await listSkills({ root })).filter((item) => !requestedSkill || item.directory === requestedSkill || item.name === requestedSkill);
  if (requestedSkill && skills.length === 0) throw new Error(`unknown skill: ${requestedSkill}`);

  const results = [];
  for (const skill of skills) {
    const problems = [];
    const skillDir = await resolveExistingSkillDir(root, skill.directory);
    const text = await readFile(join(skillDir, "SKILL.md"), "utf8");
    const metadata = parseSkillMetadata(text);
    if (!metadata.name) problems.push("SKILL.md frontmatter missing name");
    if (!metadata.description) problems.push("SKILL.md frontmatter missing description");
    if (!metadata.sunny_skill_type) problems.push("SKILL.md missing sunny_skill_type");
    if (metadata.sunny_skill_type === "library") {
      for (const required of ["references/routing.md", "evals/trigger_cases.json"]) {
        if (!(await safeStat(join(skillDir, required)))?.isFile()) problems.push(`library skill missing ${required}`);
      }
    }
    try {
      await readSkillContent(skill.directory, { root });
      await listReadableEntries(skill.directory, { root });
    } catch (error) {
      problems.push(error.message);
    }
    const triggerCases = join(skillDir, "evals/trigger_cases.json");
    if ((await safeStat(triggerCases))?.isFile()) {
      try {
        const parsed = JSON.parse(await readFile(triggerCases, "utf8"));
        for (const key of ["should_trigger", "should_not_trigger", "near_neighbors"]) {
          if (!Array.isArray(parsed[key])) problems.push(`trigger_cases.json missing ${key}`);
        }
      } catch (error) {
        problems.push(`trigger_cases.json is invalid JSON: ${error.message}`);
      }
    }
    results.push({ skill: skill.name, directory: skill.directory, ok: problems.length === 0, problems });
  }
  return { ok: results.every((item) => item.ok), skills: results };
}

function parseSkillMetadata(text) {
  const metadata = {};
  if (!text.startsWith("---\n")) return metadata;
  const end = text.indexOf("\n---", 4);
  if (end === -1) return metadata;
  for (const line of text.slice(4, end).split("\n")) {
    const match = line.match(/^\s*([A-Za-z0-9_-]+):\s*(.+?)\s*$/);
    if (!match) continue;
    const value = match[2].replace(/^["']|["']$/g, "");
    metadata[match[1]] = value;
  }
  return metadata;
}

function parseSkillTarget(target) {
  if (!target || target === true) throw new Error("skill name is required");
  const raw = String(target);
  if (raw.startsWith("/") || raw.match(/^[A-Za-z]:[\\/]/)) throw new Error("absolute skill paths are not allowed");
  const parts = raw.split(/[\\/]+/).filter(Boolean);
  if (parts.some((part) => part === "." || part === "..")) throw new Error("dot segments are not allowed in skill paths");
  return { skillName: parts[0], relParts: parts.slice(1) };
}

async function resolveExistingSkillDir(root, skillName) {
  const skillsRoot = resolve(root, "skills");
  const skillDir = resolveWithin(skillsRoot, [skillName]);
  const info = await stat(skillDir);
  if (!info.isDirectory()) throw new Error(`not a skill directory: ${skillName}`);
  if (!(await safeStat(join(skillDir, "SKILL.md")))?.isFile()) throw new Error(`skill missing SKILL.md: ${skillName}`);
  return skillDir;
}

function resolveReadablePath(skillDir, relParts) {
  if (relParts.length === 0) return skillDir;
  const rootName = relParts[0];
  if (!readableRoots.has(rootName)) throw new Error(`not an agent-readable skill path: ${relParts.join("/")}`);
  if (rootName === "SKILL.md" && relParts.length > 1) throw new Error("SKILL.md cannot contain child paths");
  const path = resolveWithin(skillDir, relParts);
  const rel = relative(skillDir, path).split(sep).join("/");
  if (rel !== "SKILL.md" && ![...readableRoots].some((prefix) => rel === prefix || rel.startsWith(`${prefix}/`))) {
    throw new Error(`not an agent-readable skill path: ${rel}`);
  }
  return path;
}

function resolveWithin(base, parts) {
  const path = resolve(base, ...parts);
  const rel = relative(base, path);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) return path;
  throw new Error("resolved path escapes its root");
}

function entryForPath(skillName, skillDir, path, info) {
  const rel = relative(skillDir, path).split(sep).join("/");
  return {
    skill: skillName,
    path: `${skillName}/${rel}`,
    type: info.isDirectory() ? "directory" : "file",
    bytes: info.isFile() ? info.size : undefined,
  };
}

function isReadableFile(path) {
  return path.endsWith("SKILL.md") || readableExtensions.has(extname(path));
}

async function packageVersion(root) {
  try {
    const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
    return packageJson.version || "";
  } catch {
    return "";
  }
}

async function safeStat(path) {
  try {
    return await stat(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function renderMarkdown(items) {
  if (items.length === 0) return "- none\n";
  if ("description" in items[0]) {
    return [
      "| name | type | version | description |",
      "| --- | --- | --- | --- |",
      ...items.map((item) => `| ${item.name} | ${item.sunny_skill_type || "-"} | ${item.version || "-"} | ${escapeCell(item.description)} |`),
      "",
    ].join("\n");
  }
  return `${items.map((item) => `- ${item.path} (${item.type}${item.bytes == null ? "" : `, ${item.bytes} bytes`})`).join("\n")}\n`;
}

function renderValidationMarkdown(result) {
  const lines = [`status: ${result.ok ? "ok" : "failed"}`, ""];
  for (const item of result.skills) {
    lines.push(`- ${item.skill}: ${item.ok ? "ok" : item.problems.join("; ")}`);
  }
  return `${lines.join("\n")}\n`;
}

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const command = options._[0];
  if (wantsHelp(options) || !command) {
    printHelp(`
Usage:
  node scripts/cwf-skills.mjs list [skill[/path]] [--format json|markdown]
  node scripts/cwf-skills.mjs read <skill[/path]>
  node scripts/cwf-skills.mjs validate [skill] [--format json|markdown]

Notes:
  Reads only agent-readable skill content: SKILL.md, references/, templates/, and evals/.
  It deliberately refuses scripts/, assets/, absolute paths, and dot-segment escapes.
`);
    return;
  }

  if (command === "list") {
    const target = options._[1] ?? "";
    const items = await listReadableEntries(target);
    process.stdout.write(options.format === "markdown" ? renderMarkdown(items) : `${JSON.stringify(items, null, 2)}\n`);
    return;
  }

  if (command === "read") {
    process.stdout.write(await readSkillContent(options._[1]));
    return;
  }

  if (command === "validate") {
    const result = await validateSkillRegistry({ skill: options._[1] });
    process.stdout.write(options.format === "markdown" ? renderValidationMarkdown(result) : `${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
    return;
  }

  throw new Error(`unknown command: ${command}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
