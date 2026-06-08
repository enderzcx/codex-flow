export default {
  name: "classify-and-act",
  goal: "Classify heterogeneous work first, then route each class to the smallest appropriate agent behavior.",
  when_to_use: [
    "The task contains mixed item types that need different handling.",
    "The workflow should spend expensive reasoning only on items that deserve it.",
  ],
  pattern: "classify-and-act",
  budget: {
    max_tokens: 10000,
    stop_when: "Every item has a route, action result, or explicit escalation reason.",
  },
  run_experience: {
    preview: "Show item count, routing classes, action boundaries, write candidates, visibility choices, budget, and quarantine rules.",
    status: "Report classified / acted / escalated counts plus current blocker and budget pressure.",
    cancel: "Stop new actions, keep completed route table rows, and summarize unhandled items.",
    resume: "Continue from the route table; if route state is missing, rerun classification only.",
    final_output: "Return a compact route table, completed actions, escalations, verification evidence, and next steps.",
  },
  phases: [
    {
      id: "collect",
      coordinator: "Collect items, trusted constraints, action boundaries, and the routing rubric before spawning agents.",
    },
    {
      id: "classify",
      agents: [
        {
          id: "classifier",
          type: "explorer",
          visibility: "inline",
          prompt: "Classify items by required action, complexity, risk, and confidence. Return item id, class, route, and evidence.",
        },
      ],
    },
    {
      id: "act",
      agents: [
        {
          id: "simple-actions",
          type: "explorer",
          visibility: "inline",
          prompt: "Handle low-risk read-only items. Return concrete answers, evidence, and items that should escalate.",
        },
        {
          id: "complex-actions",
          type: "explorer",
          visibility: "auto",
          prompt: "Handle complex items that need deeper analysis. Return findings, evidence, and recommended next steps.",
        },
        {
          id: "write-candidate",
          type: "worker",
          visibility: "auto",
          write_scope: "Only files explicitly approved by the coordinator after classification.",
          prompt: "Handle approved write items only. Do not touch unapproved files. Return changed files and verification evidence.",
        },
      ],
    },
    {
      id: "synthesize",
      coordinator: "Merge actions by item, dedupe escalations, and return a route table plus final recommendations.",
    },
  ],
  verification: [
    "Every item appears exactly once in the final route table.",
    "Any write action includes changed files and verification evidence.",
    "Escalated items include the missing input or approval needed.",
  ],
  stop_conditions: [
    "Every item is completed, escalated, or explicitly deferred.",
    "Classification confidence is too low for a safe action.",
    "An item requires credentials, deploys, databases, payments, or irreversible external writes.",
  ],
  quarantine_rules: [
    "Classifiers that read untrusted content cannot perform privileged actions.",
    "Write workers receive only sanitized task summaries and approved paths.",
  ],
  visibility_policy: [
    "Classifier and simple read-only actions stay inline.",
    "Complex or writable actions use auto visibility and may become desktop-thread when follow-up is likely.",
  ],
};
