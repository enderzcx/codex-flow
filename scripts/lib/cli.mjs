import { readFile } from "node:fs/promises";

export function parseArgs(args, options = {}) {
  const parsed = { _: [] };
  const repeatable = new Set(options.repeatable ?? []);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      parsed._.push(...args.slice(index + 1));
      break;
    }
    if (!arg.startsWith("--")) {
      parsed._.push(arg);
      continue;
    }
    const equalIndex = arg.indexOf("=");
    const key = arg.slice(2, equalIndex === -1 ? undefined : equalIndex);
    const next = equalIndex === -1 ? args[index + 1] : arg.slice(equalIndex + 1);
    const value = equalIndex === -1 && next && !next.startsWith("--") ? args[++index] : equalIndex === -1 ? true : next;
    if (repeatable.has(key)) {
      parsed[key] = [...(parsed[key] ?? []), value];
    } else {
      parsed[key] = value;
    }
  }
  return parsed;
}

export function wantsHelp(options) {
  return Boolean(options.help || options.h);
}

export function printHelp(text) {
  process.stdout.write(`${text.trim()}\n`);
}

export async function readJsonFile(path) {
  if (!path || path === true) throw new Error("JSON file path is required");
  return JSON.parse(await readFile(path, "utf8"));
}

export function stringList(value) {
  if (value == null || value === true) return [];
  const values = Array.isArray(value) ? value : [value];
  return values
    .flatMap((item) => String(item).split(","))
    .map((item) => item.trim())
    .filter(Boolean);
}
