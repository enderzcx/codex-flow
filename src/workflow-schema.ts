import type { WorkflowPhase, WorkflowSpec } from "./types.js";

export function validateWorkflowSpec(value: unknown): WorkflowSpec {
  const spec = asRecord(value, "workflow");
  expectString(spec.id, "id");
  if (spec.id !== "diff-review") {
    throw new Error("id must be diff-review for the MVP");
  }

  const version = expectString(spec.version, "version");
  const requires = asRecord(spec.requires, "requires");
  if (requires.target !== "git-repo") {
    throw new Error("requires.target must be git-repo");
  }

  const defaults = asRecord(spec.defaults, "defaults");
  if (defaults.sandbox !== "read-only") {
    throw new Error("defaults.sandbox must be read-only");
  }
  const timeoutMs = expectNumber(defaults.timeout_ms, "defaults.timeout_ms");

  const phasesRaw = expectArray(spec.phases, "phases");
  const phases = phasesRaw.map((phase, index) => validatePhase(phase, `phases[${index}]`));
  const phaseIds = phases.map((phase) => phase.id);
  for (const required of ["collect", "review", "reduce"]) {
    if (!phaseIds.includes(required)) {
      throw new Error(`phases must include ${required}`);
    }
  }

  const artifacts = expectArray(spec.artifacts, "artifacts").map((artifact, index) =>
    expectString(artifact, `artifacts[${index}]`),
  );

  return {
    id: "diff-review",
    version,
    description: typeof spec.description === "string" ? spec.description : undefined,
    requires: { target: "git-repo" },
    defaults: {
      sandbox: "read-only",
      timeout_ms: timeoutMs,
    },
    phases,
    artifacts,
  };
}

function validatePhase(value: unknown, path: string): WorkflowPhase {
  const phase = asRecord(value, path);
  const id = expectString(phase.id, `${path}.id`);
  const kind = expectString(phase.kind, `${path}.kind`);

  if (kind === "command") {
    return { id, kind };
  }

  if (kind === "codex-parallel") {
    const workers = expectArray(phase.workers, `${path}.workers`).map((worker, index) => {
      const workerRecord = asRecord(worker, `${path}.workers[${index}]`);
      return {
        id: expectString(workerRecord.id, `${path}.workers[${index}].id`),
        perspective: expectString(workerRecord.perspective, `${path}.workers[${index}].perspective`),
        prompt: expectString(workerRecord.prompt, `${path}.workers[${index}].prompt`),
      };
    });
    if (workers.length === 0) {
      throw new Error(`${path}.workers must not be empty`);
    }
    return { id, kind, workers };
  }

  if (kind === "reducer") {
    if (phase.reducer !== "diff-review") {
      throw new Error(`${path}.reducer must be diff-review`);
    }
    return { id, kind, reducer: "diff-review" };
  }

  throw new Error(`${path}.kind must be command, codex-parallel, or reducer`);
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function expectArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array`);
  }
  return value;
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value;
}

function expectNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number`);
  }
  return value;
}
