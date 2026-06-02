# Contributing

Codex Flow is intentionally small. Please keep contributions Codex-native and workflow-focused.

## Ground Rules

- Do not add third-party model routing to the public runner.
- Do not add private adapters.
- Do not add a new workflow before `diff-review` behavior remains green.
- Keep workers read-only unless a workflow explicitly opts into writes.
- Persist run evidence for every meaningful action.

## Local Verification

```bash
npm run check
npm pack --dry-run
```

## Adding A Workflow

Future workflow specs should include:

- workflow id
- version
- required target type
- phase list
- worker definitions
- output schema
- reducer
- expected artifacts

MVP implementation currently supports only `diff-review`; adding another workflow requires extending the schema and tests.

## Test Expectations

Add tests for:

- schema validation
- run store behavior
- reducer behavior
- failure paths
- background/cancel behavior when relevant

