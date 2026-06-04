# Codex Flow 1.0.0 Release Notes

Codex Flow 1.0.0 is the first stable public release of the Codex-native workflow runner.

## What Is Stable

- CLI command surface:
  - `cwf validate`
  - `cwf dry-run`
  - `cwf workflows list`
  - `cwf workflows show`
  - `cwf workflows validate`
  - `cwf run`
  - `cwf status`
  - `cwf watch`
  - `cwf list`
  - `cwf latest`
  - `cwf show`
  - `cwf approve`
  - `cwf reject`
  - `cwf resume`
  - `cwf result`
  - `cwf cancel`
  - `cwf github-pr`
  - `cwf suggest-workflow`
- Filesystem run store under `~/.codex-workflows/runs/<run-id>/`
- Rebuildable run index at `~/.codex-workflows/index.json`
- Shared worker result envelope
- Shared reduced result envelope in `artifacts/reduced-result.json`
- Artifact manifest in `artifacts/manifest.json`
- Gate, approval, rejection, and resume primitives
- Local workflow registry from project and user workflow folders
- Read-only bundled workflow catalog:
  - `diff-review`
  - `repo-audit`
  - `implementation-plan`
  - `research-crosscheck`
  - `release-review`

## Public Boundary

Codex Flow 1.0.0 intentionally does not include:

- non-Codex model routing
- private adapters
- remote workflow marketplace
- generated JavaScript workflow execution
- broad production write-capable workflows beyond gated documentation refresh
- automatic GitHub posting
- automatic installation or execution of generated workflow suggestions
- deployment automation
- full Codex Desktop task-panel parity

## Verification Summary

Release readiness requires:

- `npm run check`
- `npm pack --dry-run`
- registry validation
- documented command smokes
- workflow library smokes
- source/dependency audit for routing or private-adapter leaks
- docs claim audit

## Known Limits

- Bundled workflows review tracked git diffs; untracked file contents are not included.
- Background mode uses detached child processes, not a daemon or queue.
- `run.log` may be empty for successful runs because durable progress is in `events.jsonl`.
- The shared reducer is stable for review-style workflows, but future non-review workflows may need a new reducer contract.
