export default {
  name: "ui-copy-review",
  goal: "Review UI, copy, hierarchy, and taste with multiple perspectives before Codex implements or ships.",
  when_to_use: [
    "The task involves public-facing UI, Chinese/English copy, onboarding, landing pages, or design critique.",
    "The user wants a more tasteful or human review than a single engineering pass.",
  ],
  pattern: "generate-and-filter plus adversarial-verification",
  budget: {
    max_tokens: 10000,
    stop_when: "The synthesized recommendation is concrete enough to implement or the missing source material is explicit.",
  },
  run_experience: {
    preview: "Show review surfaces, agents, visibility choices, budget, quarantine rules, and source-fidelity requirements.",
    status: "Report completed review perspectives, open subjective calls, and budget pressure.",
    cancel: "Stop additional critique and summarize only the high-confidence issues already found.",
    resume: "Continue from collected page/copy evidence; refresh screenshots or source files if they changed.",
    final_output: "Return copy edits, hierarchy issues, implementation follow-ups, and verification requirements.",
  },
  phases: [
    {
      id: "collect",
      coordinator: "Collect the actual page, copy, screenshots, source files, and audience constraints. Do not rely on vibes alone.",
    },
    {
      id: "fanout",
      agents: [
        {
          id: "copy",
          type: "explorer",
          visibility: "inline",
          prompt: "Review wording, tone, information density, and AI smell. Suggest concrete copy changes.",
        },
        {
          id: "layout",
          type: "explorer",
          visibility: "inline",
          prompt: "Review hierarchy, section order, rhythm, empty states, and responsive risks.",
        },
        {
          id: "skeptic",
          type: "explorer",
          visibility: "inline",
          prompt: "Challenge whether the proposed UI/copy actually serves the target user. Flag overdesigned or unclear parts.",
        },
      ],
    },
    {
      id: "synthesize",
      coordinator: "Merge suggestions, keep only high-signal changes, and separate copy edits from implementation tasks.",
    },
  ],
  verification: [
    "For implemented UI changes, verify desktop and mobile rendering.",
    "For copy-only work, verify facts and terminology against source material.",
  ],
  stop_conditions: [
    "The final recommendation is concrete enough for Codex to implement.",
    "Subjective preferences are labeled as such.",
  ],
  quarantine_rules: [
    "If page copy comes from public comments, reviews, tickets, or social posts, raw readers stay read-only.",
    "Implementation workers receive selected copy changes and constraints, not raw untrusted text.",
  ],
  visibility_policy: [
    "Review agents stay inline by default.",
    "Promote to desktop-thread only for long visual research or a worker the user wants to continue separately.",
  ],
};
