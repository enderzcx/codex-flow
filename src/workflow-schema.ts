import type {
  WorkerAdapterName,
  WorkflowCapabilities,
  WorkflowInput,
  WorkflowPhase,
  WorkflowRuntime,
  WorkflowSpec,
  WritePolicy,
  WritePolicyMode,
} from "./types.js";

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
  const runtime = validateRuntime(spec.runtime);

  const phasesRaw = expectArray(spec.phases, "phases");
  const phases = phasesRaw.map((phase, index) => validatePhase(phase, `phases[${index}]`));
  validateWriteCapabilities(capabilities, phases);
  validateWriteGates(phases);
  validateAppThreadWriteBoundary(capabilities, runtime);
  const writePolicy = validateWritePolicy(spec.write_policy, capabilities, id);
  const phaseIds = phases.map((phase) => phase.id);
  for (const required of ["collect", "reduce"]) {
    if (!phaseIds.includes(required)) {
      throw new Error(`phases must include ${required}`);
    }
  }
  if (!phases.some((phase) => phase.kind === "codex-parallel" || phase.kind === "codex-write")) {
    throw new Error("phases must include a codex-parallel or codex-write phase");
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
    write_policy: writePolicy,
    requires: { target: "git-repo" },
    defaults: {
      sandbox: "read-only",
      timeout_ms: timeoutMs,
    },
    runtime,
    phases,
    artifacts,
  };
}

function validateRuntime(value: unknown): WorkflowRuntime | undefined {
  if (value === undefined) {
    return undefined;
  }
  const runtime = asRecord(value, "runtime");
  const preferred = expectOptionalWorkerAdapter(runtime.preferred_worker_adapter, "runtime.preferred_worker_adapter");
  const fallback = expectOptionalWorkerAdapter(runtime.fallback_worker_adapter, "runtime.fallback_worker_adapter");
  return {
    preferred_worker_adapter: preferred,
    fallback_worker_adapter: fallback,
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

function validateWritePolicy(value: unknown, capabilities: WorkflowCapabilities, workflowId: string): WritePolicy | undefined {
  if (!capabilities.writes) {
    if (value !== undefined) {
      throw new Error("write_policy is only valid when capabilities.writes is true");
    }
    return undefined;
  }

  if (value === undefined) {
    if (workflowId === "doc-refresh") {
      return defaultDocRefreshWritePolicy();
    }
    throw new Error("write_policy is required for write-capable workflows except doc-refresh direct-docs compatibility");
  }

  const policy = asRecord(value, "write_policy");
  const mode = expectWritePolicyMode(policy.mode, "write_policy.mode");
  const allowedPaths =
    policy.allowed_paths === undefined
      ? mode === "direct-docs"
        ? defaultDocRefreshWritePolicy().allowed_paths
        : []
      : expectArray(policy.allowed_paths, "write_policy.allowed_paths").map((item, index) => expectSafePathPattern(item, `write_policy.allowed_paths[${index}]`));
  const forbiddenPaths =
    policy.forbidden_paths === undefined
      ? defaultForbiddenPathPatterns()
      : expectArray(policy.forbidden_paths, "write_policy.forbidden_paths").map((item, index) => expectSafePathPattern(item, `write_policy.forbidden_paths[${index}]`));
  const verificationCommands =
    policy.verification_commands === undefined
      ? []
      : expectArray(policy.verification_commands, "write_policy.verification_commands").map((item, index) =>
          expectString(item, `write_policy.verification_commands[${index}]`),
        );

  if (allowedPaths.length === 0) {
    throw new Error("write_policy.allowed_paths must contain at least one path pattern");
  }

  return {
    mode,
    allowed_paths: allowedPaths,
    forbidden_paths: forbiddenPaths,
    verification_commands: verificationCommands,
  };
}

function expectWritePolicyMode(value: unknown, path: string): WritePolicyMode {
  const modes: WritePolicyMode[] = ["direct-docs", "patch"];
  if (typeof value !== "string" || !modes.includes(value as WritePolicyMode)) {
    throw new Error(`${path} must be one of ${modes.join(", ")}`);
  }
  return value as WritePolicyMode;
}

function expectSafePathPattern(value: unknown, path: string): string {
  const pattern = expectString(value, path);
  if (pattern.startsWith("/") || pattern.includes("..") || pattern.includes("\\")) {
    throw new Error(`${path} must be a safe repo-relative path pattern`);
  }
  return pattern;
}

function defaultDocRefreshWritePolicy(): WritePolicy {
  return {
    mode: "direct-docs",
    allowed_paths: ["docs/**", "README.md", "README.zh-CN.md", "CONTRIBUTING.md", "ACCEPTANCE.md", "RELEASE_NOTES.md"],
    forbidden_paths: defaultForbiddenPathPatterns(),
    verification_commands: [],
  };
}

function defaultForbiddenPathPatterns(): string[] {
  return [
    ".env",
    ".env.*",
    "**/.env",
    "**/.env.*",
    "**/*secret*",
    "**/*credential*",
    "**/*private-key*",
    ".git",
    ".git/**",
    "node_modules/**",
  ];
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

  if (kind === "write-preview") {
    return { id, kind, prompt: expectString(phase.prompt, `${path}.prompt`) };
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

  if (kind === "codex-write") {
    const workerRecord = asRecord(phase.worker, `${path}.worker`);
    return {
      id,
      kind,
      writes: true,
      worker: {
        id: expectString(workerRecord.id, `${path}.worker.id`),
        perspective: expectString(workerRecord.perspective, `${path}.worker.perspective`),
        prompt: expectString(workerRecord.prompt, `${path}.worker.prompt`),
        writes: true,
      },
    };
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

  throw new Error(`${path}.kind must be command, write-preview, codex-parallel, codex-write, gate, or reducer`);
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
    const codexWrite = phase.kind === "codex-write";
    if ((phaseWrites || workerWrites || codexWrite) && !hasPriorGate) {
      throw new Error(`phase ${phase.id} has writes:true but no prior gate phase`);
    }
  }
}

function validateWriteCapabilities(capabilities: WorkflowCapabilities, phases: WorkflowPhase[]): void {
  if (hasWritePhase(phases) && !capabilities.writes) {
    throw new Error("capabilities.writes must be true when any phase or worker declares writes:true");
  }
}

function validateAppThreadWriteBoundary(capabilities: WorkflowCapabilities, runtime?: WorkflowRuntime): void {
  if (!capabilities.writes || runtime?.preferred_worker_adapter !== "codex-app-thread") {
    return;
  }
  throw new Error("codex-app-thread is read-only only; write-capable workflows must use a gated write-proposal safePatch path");
}

function hasWritePhase(phases: WorkflowPhase[]): boolean {
  return phases.some((phase) => {
    const phaseWrites = "writes" in phase && phase.writes === true;
    const workerWrites = phase.kind === "codex-parallel" && phase.workers.some((worker) => worker.writes === true);
    return phaseWrites || workerWrites || phase.kind === "codex-write";
  });
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

function expectOptionalWorkerAdapter(value: unknown, path: string): WorkerAdapterName | undefined {
  if (value === undefined) {
    return undefined;
  }
  const adapters: WorkerAdapterName[] = ["codex-sdk-headless", "codex-app-thread", "codex-subagent", "codex-review-detached"];
  if (typeof value !== "string" || !adapters.includes(value as WorkerAdapterName)) {
    throw new Error(`${path} must be one of ${adapters.join(", ")}`);
  }
  return value as WorkerAdapterName;
}
