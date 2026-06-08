export default {
  name: "tournament",
  goal: "Generate or compare multiple candidates with isolated judges and choose the best result through pairwise comparison.",
  when_to_use: [
    "The task is taste-heavy, judgment-heavy, or hard to score absolutely.",
    "The user wants several approaches compared fairly before choosing.",
  ],
  pattern: "tournament",
  budget: {
    max_tokens: 15000,
    stop_when: "A winner survives the bracket or the remaining candidates are indistinguishable by the rubric.",
  },
  run_experience: {
    preview: "Show rubric, candidate count, judging method, visibility choices, budget, and hard constraints.",
    status: "Report generated candidates, completed pairwise comparisons, current winner, and budget pressure.",
    cancel: "Stop new comparisons and summarize the current bracket state without declaring a final winner.",
    resume: "Continue from the saved bracket; if pairwise evidence is missing, rerun only affected comparisons.",
    final_output: "Return winner, pairwise evidence, disqualifiers, runner-up ideas, and any user-taste decisions needed.",
  },
  phases: [
    {
      id: "rubric",
      coordinator: "Define the comparison rubric, hard constraints, and what counts as a disqualifying flaw.",
    },
    {
      id: "generate",
      agents: [
        {
          id: "candidate-a",
          type: "explorer",
          visibility: "inline",
          prompt: "Produce candidate A using a direct, conservative approach. Return the candidate and rationale.",
        },
        {
          id: "candidate-b",
          type: "explorer",
          visibility: "inline",
          prompt: "Produce candidate B using a more ambitious or alternative approach. Return the candidate and rationale.",
        },
        {
          id: "candidate-c",
          type: "explorer",
          visibility: "inline",
          prompt: "Produce candidate C optimized for a different tradeoff. Return the candidate and rationale.",
        },
      ],
    },
    {
      id: "pairwise-judge",
      agents: [
        {
          id: "judge",
          type: "explorer",
          visibility: "inline",
          prompt: "Compare candidates pairwise against the rubric. Return winners, losses, disqualifiers, and concrete evidence.",
        },
      ],
    },
    {
      id: "synthesize",
      coordinator: "Select the winner, explain the tradeoffs, and preserve useful runner-up ideas when they should be merged.",
    },
  ],
  verification: [
    "The final winner cites pairwise evidence, not only absolute scores.",
    "Hard constraints are checked before taste preferences.",
    "Runner-up ideas are labeled separately from the selected result.",
  ],
  stop_conditions: [
    "One candidate wins the bracket under the rubric.",
    "All candidates violate a hard constraint.",
    "The comparison requires user taste input that was not provided.",
  ],
  quarantine_rules: [
    "If candidates include untrusted content, judges compare sanitized candidate summaries.",
    "Do not let a candidate agent judge its own output.",
  ],
  visibility_policy: [
    "Candidate and judge agents stay inline by default.",
    "Promote to desktop-thread only for long design explorations or a candidate the user wants to continue separately.",
  ],
};
