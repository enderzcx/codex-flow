export default {
  name: "repo-audit",
  goal: "Audit a repository from several independent perspectives and synthesize one owner-quality result.",
  when_to_use: [
    "The user asks for a repo audit, PR review, release review, or broad risk scan.",
    "The task benefits from clean parallel contexts.",
  ],
  pattern: "fan-out-and-synthesize",
  budget: {
    max_tokens: 12000,
    stop_when: "All audit agents return or a blocker makes further audit evidence impossible.",
  },
  run_experience: {
    preview: "Show audit scope, agents, visibility choices, budget, quarantine rules, and evidence requirements.",
    status: "Report agents started / completed / blocked, current synthesis state, and budget pressure.",
    cancel: "Stop new audit passes and summarize confirmed findings separately from incomplete areas.",
    resume: "Continue from completed agent reports; rerun only missing audit perspectives.",
    final_output: "Return confirmed findings, evidence, severity, test gaps, and residual risk.",
  },
  phases: [
    {
      id: "scope",
      coordinator: "Read the user goal, current repo state, and changed files. Decide exact audit scope before spawning agents.",
    },
    {
      id: "fanout",
      agents: [
        {
          id: "correctness",
          type: "explorer",
          visibility: "inline",
          prompt: "Find behavior bugs, broken assumptions, edge cases, and risky implementation details. Return file references and severity.",
        },
        {
          id: "tests",
          type: "explorer",
          visibility: "inline",
          prompt: "Find missing or weak tests, verification gaps, and commands needed before shipping. Return concrete evidence.",
        },
        {
          id: "maintainability",
          type: "explorer",
          visibility: "inline",
          prompt: "Find complexity, coupling, unclear boundaries, and future maintenance risks. Prioritize actionable issues.",
        },
      ],
    },
    {
      id: "synthesize",
      coordinator: "Wait for all agents, dedupe findings, sort by severity, and report only actionable issues.",
    },
  ],
  verification: [
    "If code changed during the audit, run the relevant test or check command before closeout.",
    "If this is review-only, include exact files/lines or say when evidence is insufficient.",
  ],
  stop_conditions: [
    "All spawned agents returned or failed explicitly.",
    "The final answer separates confirmed findings from assumptions.",
  ],
  quarantine_rules: [
    "If audit input includes untrusted web, issue, or ticket content, raw reader agents stay read-only.",
    "Do not pass raw untrusted content to workers that can write files or take privileged actions.",
  ],
  visibility_policy: [
    "Default audit explorers stay inline.",
    "Promote an explorer to desktop-thread only when the user needs to inspect or continue that worker separately.",
  ],
};
