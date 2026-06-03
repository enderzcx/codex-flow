export type PhaseStatus = "pending" | "running" | "waiting" | "approved" | "rejected" | "completed" | "failed" | "cancelled";

export type WorkerStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export type Confidence = "high" | "medium" | "low";

export type WorkflowPhase =
  | {
      id: string;
      kind: "command";
      writes?: boolean;
    }
  | {
      id: string;
      kind: "codex-parallel";
      workers: WorkflowWorker[];
      writes?: boolean;
    }
  | {
      id: string;
      kind: "gate";
      prompt: string;
      requires_approval: true;
    }
  | {
      id: string;
      kind: "reducer";
      reducer: "diff-review";
      writes?: boolean;
    };

export type WorkflowWorker = {
  id: string;
  perspective: string;
  prompt: string;
  writes?: boolean;
};

export type WorkflowInput = {
  type: string;
  required: boolean;
  description?: string;
};

export type WorkflowCapabilities = {
  writes: boolean;
};

export type WorkflowSpec = {
  id: string;
  version: string;
  title: string;
  description?: string;
  tags: string[];
  inputs: Record<string, WorkflowInput>;
  capabilities: WorkflowCapabilities;
  requires: {
    target: "git-repo";
  };
  defaults: {
    sandbox: "read-only";
    timeout_ms: number;
  };
  phases: WorkflowPhase[];
  artifacts: string[];
};

export type PhaseState = {
  id: string;
  status: PhaseStatus;
  started_at?: string;
  completed_at?: string;
  error?: string;
  prompt?: string;
  decision_reason?: string;
};

export type WorkerState = {
  id: string;
  status: WorkerStatus;
  started_at?: string;
  completed_at?: string;
  error?: string;
};

export type RunState = {
  id: string;
  workflow: string;
  status: PhaseStatus;
  target: string;
  run_dir: string;
  failure_policy: FailurePolicy;
  phases: PhaseState[];
  workers: WorkerState[];
  gate_decisions: GateDecision[];
  created_at: string;
  updated_at: string;
  result_path?: string;
  log_path?: string;
  background_pid?: number;
  error?: string;
  failure_summary?: FailureSummary;
};

export type GateDecision = {
  gate_id: string;
  decision: "approved" | "rejected";
  reason?: string;
  decided_at: string;
};

export type FailurePolicy = {
  worker_failure: "continue_if_any_worker_succeeds";
  all_workers_failed: "fail_run";
  target_diff_changed: "fail_run";
  unhandled_error: "fail_run";
};

export type FailureSummary = {
  title: string;
  detail: string;
  failed_phase?: string;
  failed_workers: string[];
  next_step: string;
};

export type RunIndexEntry = {
  id: string;
  workflow: string;
  status: PhaseStatus;
  target: string;
  run_dir: string;
  created_at: string;
  updated_at: string;
  result_path?: string;
  log_path?: string;
  error?: string;
  failure_summary?: FailureSummary;
};

export type RunIndex = {
  version: 1;
  generated_at: string;
  runs: RunIndexEntry[];
};

export type DiffContext = {
  target: string;
  branch: string;
  status_short: string;
  changed_files: string[];
  package_metadata?: string;
  diff: string;
  diff_hash: string;
  tracked_diff_hash?: string;
  truncated: boolean;
};

export type Finding = {
  severity: Severity;
  title: string;
  evidence: string;
  reason: string;
  suggested_fix: string;
};

export type WorkerOutput = {
  worker_id: string;
  summary: string;
  findings: Finding[];
  verification: string[];
  confidence: Confidence;
};

export type WorkerResult = {
  worker_id: string;
  status: WorkerStatus;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  prompt: string;
  raw: string;
  result?: WorkerOutput;
  raw_fallback?: boolean;
  error?: string;
  usage?: unknown;
};

export type ReducedFinding = Finding & {
  worker_ids: string[];
  confidence: Confidence;
};

export type ReducedResult = {
  verdict: "pass" | "review" | "fail";
  findings: ReducedFinding[];
  verification_gaps: string[];
  suggested_next_actions: string[];
  artifacts: string[];
};
