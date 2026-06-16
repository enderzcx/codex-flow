# Generated UI Surfaces

CWF normally returns a concise human summary, evidence paths, and verification status. Some runs are easier to understand when the result also has a renderable UI surface: a risk dashboard, review panel, comparison grid, release gate, or rich streaming report.

Generated UI surfaces are optional output artifacts. They do not replace the run plan, tests, verifier evidence, or checker-owned verified state.

## Two Surface Types

| Type | Use When | Boundary |
|---|---|---|
| `ui_spec` | The result needs reusable components, state, actions, form controls, drill-down, or a durable product UI. | Schema-first. The model may only use the declared catalog and actions. |
| `html_stream` | The result is a read-only report, one-shot summary, rich message, or streaming preview. | HTML-first. Output must be sanitized, non-mutating, and advisory only. |

`ui_spec` follows the json-render pattern: define a component/action catalog, ask the model for a structured spec, validate it, then render only known components.

`html_stream` follows the StreamHtml pattern: let the model stream semantic HTML, repair incomplete tags while streaming, sanitize before render, and keep the result read-only.

## When To Use

Use a generated UI surface when at least one is true:

- the CWF result contains many findings, phases, artifacts, or decisions;
- the user needs to compare candidates, risks, evidence, or next actions;
- the output should be consumed by a frontend, dashboard, or MCP app;
- a long-running workflow would be clearer with status cards and grouped evidence;
- a read-only report benefits from streamed tables, callouts, or visual hierarchy.

Do not use it when:

- a short markdown answer is enough;
- the result includes secrets, credentials, raw production logs, or unapproved confidential payloads;
- the UI would imply verified/pass/done state without checker-owned evidence;
- the surface needs side effects but no action catalog or approval gate exists;
- the surface would create more maintenance work than clarity.

## Required Contract

Add this block to the run plan when a CWF run will produce a renderable output:

```yaml
renderable_output:
  type: none | ui_spec | html_stream
  purpose:
  audience:
  artifact_path:
  data_sources:
  renderer:
  safety_boundary:
  actions_allowed:
  validation:
  visual_smoke:
  verified_state_impact: none_until_checker_accepts
```

### `ui_spec`

Use `ui_spec` for product-like or interactive UI. The run must declare:

- component catalog name and version;
- allowed actions and their approval boundary;
- spec schema or validator;
- state model and binding rules, if any;
- fallback behavior for unknown components;
- screenshot or browser smoke if the UI is user-facing;
- evidence references that back any status shown in the UI.

Never allow arbitrary HTML or JavaScript inside a `ui_spec`. If the surface needs an action, the action must be named in the catalog and routed through the coordinator's approval boundary.

### `html_stream`

Use `html_stream` for read-only rich reports. The run must declare:

- allowed tags and attributes;
- forbidden tags such as `script`, `iframe`, `object`, `embed`, and `form`;
- forbidden event attributes such as `onclick`, `onload`, and `onerror`;
- sanitizer or repair pipeline;
- whether reasoning/thinking text is shown separately;
- screenshot or text-only fallback for environments that cannot render HTML.

An `html_stream` surface cannot own verified state, execute actions, submit forms, or mutate repo state. It is presentation only.

## Output Contract Addition

When a renderable surface exists, the final CWF response should include:

- `renderable_output.type`;
- artifact path or URL;
- renderer assumptions;
- validation or visual-smoke evidence;
- a plain-language fallback summary;
- explicit statement that verified state still belongs to tests, verifier agents, human review, or external systems.

## Demo

Open [examples/generated-ui-surface-demo.html](../examples/generated-ui-surface-demo.html) to see the same CWF review result presented as:

- a schema-first `ui_spec` dashboard;
- a read-only `html_stream` report.

The demo is dependency-free and does not implement json-render or StreamHtml. It is a small local artifact for understanding the output contract before adding a real renderer to an application.
