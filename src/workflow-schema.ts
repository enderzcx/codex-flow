import type { WorkflowCapabilities, WorkflowInput, WorkflowPhase, WorkflowSpec } from "./types.js";

export function validateWorkflowSpec(value: unknown): WorkflowSpec {
  const spec = asRecord(value, "workflow");
  const id = expectString(spec.id, "id");
  const version = expectString(spec.version, "version");
  const title = expectString(spec.title, "title");
  const tags = expectArray(spec.tags, "tags").map((tag, index) => expectString(tag, `tags[${index}]`));
  const inputs = validateInputs(spec.inputs);
  validateTargetInput(inputs);
  const capabilities = validateCapabilities(spec.capabilities);
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
  validateWriteGates(phases);
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
    id,
    version,
    title,
    description: typeof spec.description === "string" ? spec.description : undefined,
    tags,
    inputs,
    capabilities,
    requires: { target: "git-repo" },
    defaults: {
      sandbox: "read-only",
      timeout_ms: timeoutMs,
    },
    phases,
    artifacts,
  };
}

function validateInputs(value: unknown): Record<string, WorkflowInput> {
  const inputs = asRecord(value, "inputs");
  const normalized: Record<string, WorkflowInput> = {};
  for (const [name, rawInput] of Object.entries(inputs)) {
    const input = asRecord(rawInput, `inputs.${name}`);
    normalized[name] = {
      type: expectString(input.type, `inputs.${name}.type`),
      required: expectBoolean(input.required, `inputs.${name}.required`),
      description: typeof input.description === "string" ? input.description : undefined,
    };
  }
  return normalized;
}

function validateCapabilities(value: unknown): WorkflowCapabilities {
  const capabilities = asRecord(value, "capabilities");
  return {
    writes: expectBoolean(capabilities.writes, "capabilities.writes"),
  };
}

function validateTargetInput(inputs: Record<string, WorkflowInput>): void {
  const target = inputs.target;
  if (!target) {
    throw new Error("inputs.target is required");
  }
  if (target.type !== "path") {
    throw new Error("inputs.target.type must be path");
  }
  if (target.required !== true) {
    throw new Error("inputs.target.required must be true");
  }
}

function validatePhase(value: unknown, path: string): WorkflowPhase {
  const phase = asRecord(value, path);
  const id = expectString(phase.id, `${path}.id`);
  const kind = expectString(phase.kind, `${path}.kind`);

  if (kind === "command") {
    return { id, kind, writes: expectOptionalBoolean(phase.writes, `${path}.writes`) };
  }

  if (kind === "codex-parallel") {
    const workers = expectArray(phase.workers, `${path}.workers`).map((worker, index) => {
      const workerRecord = asRecord(worker, `${path}.workers[${index}]`);
      return {
        id: expectString(workerRecord.id, `${path}.workers[${index}].id`),
        perspective: expectString(workerRecord.perspective, `${path}.workers[${index}].perspective`),
        prompt: expectString(workerRecord.prompt, `${path}.workers[${index}].prompt`),
        writes: expectOptionalBoolean(workerRecord.writes, `${path}.workers[${index}].writes`),
      };
    });
    if (workers.length === 0) {
      throw new Error(`${path}.workers must not be empty`);
    }
    return { id, kind, workers, writes: expectOptionalBoolean(phase.writes, `${path}.writes`) };
  }

  if (kind === "gate") {
    if (phase.requires_approval !== true) {
      throw new Error(`${path}.requires_approval must be true`);
    }
    return {
      id,
      kind,
      prompt: expectString(phase.prompt, `${path}.prompt`),
      requires_approval: true,
    };
  }

  if (kind === "reducer") {
    if (phase.reducer !== "diff-review") {
      throw new Error(`${path}.reducer must be diff-review`);
    }
    return { id, kind, reducer: "diff-review", writes: expectOptionalBoolean(phase.writes, `${path}.writes`) };
  }

  throw new Error(`${path}.kind must be command, codex-parallel, gate, or reducer`);
}

function validateWriteGates(phases: WorkflowPhase[]): void {
  let hasPriorGate = false;
  for (const phase of phases) {
    if (phase.kind === "gate") {
      hasPriorGate = true;
      continue;
    }
    const phaseWrites = "writes" in phase && phase.writes === true;
    const workerWrites = phase.kind === "codex-parallel" && phase.workers.some((worker) => worker.writes === true);
    if ((phaseWrites || workerWrites) && !hasPriorGate) {
      throw new Error(`phase ${phase.id} has writes:true but no prior gate phase`);
    }
  }
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

function expectBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${path} must be a boolean`);
  }
  return value;
}

function expectOptionalBoolean(value: unknown, path: string): true | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value !== true) {
    throw new Error(`${path} must be true when present`);
  }
  return true;
}
