---
half_life: 30d
archive_at: 2026-07-03
---

# Codex Flow Release Checklist

Use this checklist before publishing or tagging a release. CI covers the non-live checks; live Codex worker smokes stay manual unless a safe credential and cost-control path is explicitly configured.

## Required Local Checks

- [ ] Fresh install works.
  - Evidence: `npm ci`

- [ ] Build and tests pass.
  - Evidence: `npm run check`

- [ ] Package contents are inspectable.
  - Evidence: `npm pack --dry-run`

- [ ] CI-safe CLI smoke passes without live Codex worker calls.
  - Evidence: `bash scripts/smoke-cli.sh`

- [ ] Workflow registry is valid.
  - Evidence: `node dist/cli.js workflows validate`

- [ ] Default diff-review validation works.
  - Evidence: `node dist/cli.js validate workflows/diff-review.yaml`

- [ ] Write-capable workflow validation still requires a prior gate.
  - Evidence: `node dist/cli.js validate fixtures/workflows/write-without-gate.yaml` fails with `writes:true`

## Source And Dependency Audit

- [ ] Public runtime remains Codex-native.
  - Evidence: `rg -n "Reasonix|MiMo|Ollama|openrouter|anthropic|gemini|private adapter|model routing" src package.json workflows`

- [ ] Generated JavaScript execution is absent from the runtime.
  - Evidence: `rg -n "eval\\(|new Function|vm\\.|child_process.*generated|generated JavaScript" src`

- [ ] GitHub posting is not automatic.
  - Evidence: source audit shows posting requires an explicit command or approval path.

## Docs Claim Audit

- [ ] README command examples match the CLI help.
  - Evidence: compare `node dist/cli.js --help` with README command blocks.

- [ ] README.zh-CN mirrors public behavior and limitations.
  - Evidence: Chinese README includes the same install, smoke, discovery, gate, and limitation claims.

- [ ] PRD, SPEC, SKILL_PLAN, POST_V1_PLAN, FULL_PLAN, PHASE_CONTRACTS, and ACCEPTANCE match behavior changed in the release.
  - Evidence: docs diff reviewed before commit.

## Optional Live Smoke

- [ ] Foreground fixture diff-review completes.
  - Evidence: `cwf run diff-review --target <fixture-repo>`

- [ ] Background fixture diff-review completes and can be watched.
  - Evidence: `cwf run diff-review --target <fixture-repo> --background`, then `cwf watch <run-id>`

- [ ] Discovery can find the live smoke.
  - Evidence: `cwf latest --target <fixture-repo>`, `cwf show <run-id>`

- [ ] Cancellation still marks an in-progress background run as cancelled.
  - Evidence: `cwf cancel <run-id>`, then `cwf status <run-id>`

## Explicit Non-Goals

- Do not publish to npm from the CI smoke.
- Do not create GitHub releases from the CI smoke.
- Do not run live Codex workers in CI without explicit credential, timeout, and cost controls.
- Do not add private adapters or non-Codex model routing.
- Do not make Codex Desktop required for CLI release checks.
