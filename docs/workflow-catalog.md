# Codex Flow Workflow Catalog

This catalog covers the public workflows bundled with Codex Flow.

Bundled review workflows:

- use only Codex SDK workers
- run through the local workflow registry
- use `collect -> review -> reduce`
- use the shared worker result envelope
- use the shared reduced result envelope
- preserve worker provenance, verification gaps, and artifact references
- write no files in the target repo

The `doc-refresh` workflow is the exception: it is write-capable, documentation-only, gated, and requires preview artifacts plus explicit approval before its Codex write phase.

## diff-review

Review a tracked git diff from correctness, tests, and safety perspectives.

Use when:

- you want a focused branch or PR-style review
- the main question is whether a code diff is safe and well-tested
- you need concrete findings tied to diff evidence

Do not use when:

- you need Codex to modify files
- the work is not represented in a tracked git diff
- you need a broad repository audit rather than a changed-diff review

Run:

```bash
cwf run diff-review --target <repo>
```

## repo-audit

Audit a tracked repo diff for structure, maintainability, project hygiene, and release risk.

Use when:

- a change affects project shape, dependencies, public interfaces, or maintainability
- you want broader review than bug finding
- you need release-risk and rollback gaps surfaced beside code-quality issues

Do not use when:

- you need a whole-repo crawl beyond the supplied diff context
- you want generated refactors or automatic cleanup
- you only need a narrow correctness review

Run:

```bash
cwf run repo-audit --target <repo>
```

## implementation-plan

Review a tracked plan or implementation diff for scope, sequencing, risk, and verification.

Use when:

- a plan, PRD, spec, or implementation slice needs a design sanity check
- you want scope boundaries, dependencies, and acceptance criteria challenged
- verification criteria are at risk of being vague or incomplete

Do not use when:

- you need a plan written from scratch
- the relevant plan is not in the git diff
- you need a write-capable implementation workflow

Run:

```bash
cwf run implementation-plan --target <repo>
```

## research-crosscheck

Review a tracked research or documentation diff for source fidelity, unsupported claims, and synthesis quality.

Use when:

- a document includes factual claims, citations, comparisons, or recommendations
- you want weak evidence and overconfident wording called out
- you need a read-only check of what is visible in the diff

Do not use when:

- you need live web research
- the sources are outside the supplied repo diff
- you need private or authenticated source access

Run:

```bash
cwf run research-crosscheck --target <repo>
```

## release-review

Review a tracked release diff for ship readiness, rollout risk, rollback evidence, and regression coverage.

Use when:

- a change is close to shipping
- you need rollout, rollback, monitoring, and regression gaps surfaced together
- release notes, package metadata, config, or test evidence changed

Do not use when:

- you need deployment automation
- you need Codex to push, publish, or write release artifacts
- the release state is not represented in a tracked diff

Run:

```bash
cwf run release-review --target <repo>
```

## doc-refresh

Run a gated documentation-only write workflow.

Use when:

- you want Codex to refresh Markdown/text documentation
- the change is reversible and can be reviewed in git diff
- you want pre-write preview, explicit approval, diff summary, rollback, and verification artifacts

Do not use when:

- the task touches source code, credentials, databases, deployments, payment, permissions, or irreversible external systems
- you want an ungated automatic edit
- you need a broad multi-file implementation workflow

Run:

```bash
cwf run doc-refresh --target <repo>
cwf status <run-id>
cwf approve <run-id> approve-write
cwf resume <run-id>
```

## Choosing Quickly

Use `diff-review` for code correctness, `repo-audit` for maintainability and project health, `implementation-plan` for plan quality, `research-crosscheck` for factual/source discipline, `release-review` for ship readiness, and `doc-refresh` only for gated documentation writes.
