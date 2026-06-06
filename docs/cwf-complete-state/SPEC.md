---
half_life: 30d
archive_at: 2026-07-06
scope_type: roadmap
scope_name: CWF complete-state SPEC
coverage: Runtime and safety contract for implementing the complete CWF dynamic workflow roadmap.
not_complete_for: Exact implementation details for every phase, hosted scheduling, unrestricted JS, non-Codex routing, production deploys, database/credential/payment/permission writes.
verification_level: docs-only
real_smoke_status: not_required
review_status: reviewed
reviewer: reasonix-v4pro
review_command: crb delegate --mode final-review --json review-payload-for-cwf-planning-docs-after-trq212-minli
review_notes: Derived from reviewed complete-state and usage plans.
review_owner: Codex
review_due: resolved 2026-06-06
---

# SPEC: CWF Complete-State

## Runtime Flow

```text
user asks for complex workflow
  -> Codex decides CWF is appropriate
  -> Codex generates workflow.js from intent
  -> CWF validates AST and capability use
  -> CWF renders preview and budget/write summary
  -> user approves approve-dynamic
  -> CWF child runtime executes through cwf APIs only
  -> workers run through Codex-native adapters
  -> safe writes go through safePatch or capped inherit-session
  -> reducer produces result and artifacts
  -> initiating Codex conversation receives summary + artifact links
  -> user may save workflow as template/skill
```

## Capability Surface

Required `cwf` APIs:

- `cwf.git.changedFiles`
- `cwf.git.diff`
- `cwf.agent.run`
- `cwf.map`
- `cwf.artifacts.write`
- `cwf.report.summarize`
- `cwf.write.safePatch`
- `cwf.verify.run`
- `cwf.classify.route`
- `cwf.tournament.run`
- `cwf.loop.until`
- `cwf.quarantine.read`
- `cwf.template.save`

## Runtime Controls

- source SHA binding;
- origin trust enum;
- AST policy gate;
- Node Permission Model child;
- no target repo read from the child;
- no network, shell, child process, or package import from workflow JS;
- max agents;
- max concurrency;
- wall-clock timeout;
- output byte limit;
- token usage recording where available;
- gate before dynamic execution;
- gate before writes;
- failure summary.

## Result Return Contract

Default:

- result returns to the initiating Codex conversation when launched from Codex.

Optional:

- `--new-thread` creates a separate coordinator/result thread only when explicitly requested;
- worker app threads are visible only when app-server execution is available and preflight proves real execution;
- CLI-only users still get `cwf result RUN_ID`.

Forbidden:

- do not guess the current thread from `thread/list`;
- do not make Desktop required for CLI users;
- do not hide fallback status.

## Write Contract

Dynamic JS never writes directly.

Allowed write routes:

1. `safePatch`
   - isolated writer target;
   - proposed patch artifact;
   - `allowed_paths`;
   - `forbidden_paths`;
   - drift check;
   - `git apply --check --3way`;
   - verification;
   - rollback artifact.

2. `inherit-session`
   - generated-current-session origin only;
   - approved script SHA only;
   - never exceeds parent sandbox or approval policy;
   - records runtime metadata;
   - still bounded by task prompt and artifacts.

Forbidden write routes:

- direct Desktop app-thread writes without stable Codex approval support;
- remote untrusted dynamic scripts with write permissions;
- external irreversible writes.

## Quarantine Contract

Quarantine is mandatory when a workflow reads untrusted public content, customer messages, third-party issues, Slack/Discord exports, web pages, or arbitrary uploaded files.

Worker classes:

- Reader workers read untrusted content and stay read-only.
- Verifier workers check reader outputs against rubric, source quality, duplication, or policy.
- Actor workers perform any proposed action only after gate, path policy, safePatch, or explicit external approval.

Safety invariant:

> The worker that reads untrusted content is not the worker that writes, posts, deletes, merges, deploys, or changes permissions.

## Built-In Dynamic Patterns

| Pattern | Use when | Shape |
|---|---|---|
| Classify-and-act | Items need routing. | Classifier labels; branches execute specific read-only or gated actions. |
| Fan-out-and-synthesize | Independent files, claims, or hypotheses need separate context. | `cwf.map` workers; reducer merges. |
| Adversarial verification | A proposal needs skeptical checking. | Verifier/challenger workers before final synthesis. |
| Generate-and-filter | Many candidates need dedupe and rubric filtering. | Generator workers propose; filters score. |
| Tournament | Ranking or selection benefits from comparison. | Pairwise judging until top candidates remain. |
| Loop-until-done | The amount of work is unknown. | Repeat until explicit stop condition or budget cap. |
| Quarantine triage | Inputs are untrusted and actions may be high privilege. | Isolated readers; gated actors. |
| Rule mining | Repeated corrections should become durable rules. | Mine, cluster, adversarially verify, propose rule updates. |

## Built-In Modes

- `deep-research`
- `repo-audit`
- `migration-plan`
- `adversarial-review`
- `safe-fix-loop`
- `root-cause-investigation`
- `rule-mining`
- `tournament-selection`
- `triage-quarantine`
- `eval-and-rubric`

## Availability Labels

- **Stable public core**: current package surface with CI-safe smoke.
- **Implemented preview**: implemented and tested on current branch, but not fully productized.
- **Planned**: roadmap only; not a shipped command or safety guarantee.
