export default {
  name: "pipeline",
  goal: "Process a stream of related items through ordered stages while keeping each item moving independently.",
  when_to_use: [
    "The task has sequential stages, but each item can move forward without waiting for every other item.",
    "The user needs throughput, staged refinement, or progressive triage.",
  ],
  pattern: "pipeline",
  budget: {
    max_tokens: 12000,
    stop_when: "All items finish the final stage or a stage-level blocker is proven.",
  },
  run_experience: {
    preview: "Show item source, ordered stages, advance criteria, visibility choices, budget, and quarantine rules.",
    status: "Report each stage count, blocked items, elapsed time, and budget pressure.",
    cancel: "Stop moving new items to later stages and summarize the last stable stage per item.",
    resume: "Continue from the last completed stage for each item; restart only blocked or unknown items.",
    final_output: "Return final item statuses, stage evidence, blockers, and the smallest next action.",
  },
  phases: [
    {
      id: "prepare",
      coordinator: "Define the item list, stage contracts, and the minimum evidence needed before an item advances.",
    },
    {
      id: "stage-1-classify",
      agents: [
        {
          id: "classifier",
          type: "explorer",
          visibility: "inline",
          prompt: "Classify each item into the next-stage route. Return item id, route, confidence, and evidence.",
        },
      ],
    },
    {
      id: "stage-2-process",
      agents: [
        {
          id: "processor",
          type: "explorer",
          visibility: "auto",
          prompt: "Process routed items stage by stage. Return transformed output, blockers, and evidence for each item.",
        },
      ],
    },
    {
      id: "stage-3-verify",
      agents: [
        {
          id: "verifier",
          type: "explorer",
          visibility: "inline",
          prompt: "Verify final item outputs against the rubric. Return pass/fail, concrete evidence, and retry recommendations.",
        },
      ],
    },
    {
      id: "synthesize",
      coordinator: "Summarize completed items, blocked items, retry paths, and the smallest next action.",
    },
  ],
  verification: [
    "Every item has a final status: passed, blocked, or explicitly deferred.",
    "Each stage output names the source evidence that justified advancing the item.",
  ],
  stop_conditions: [
    "All items reached a terminal status.",
    "A required stage cannot proceed without user input.",
    "The token budget would be exceeded before another useful stage can complete.",
  ],
  quarantine_rules: [
    "If items include untrusted user or web content, reader agents stay read-only.",
    "Actors that write files or take actions must receive sanitized summaries, not raw untrusted text.",
  ],
  visibility_policy: [
    "Pipeline stages stay inline by default.",
    "Promote a stage to desktop-thread only when it is long-running or the user may need to steer that stage separately.",
  ],
};
