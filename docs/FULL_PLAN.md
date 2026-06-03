---
half_life: 30d
archive_at: 2026-07-03
---

# Codex Flow Full Plan

## Plain Summary

Codex Flow 的完整体目标不是复制 Claude Dynamic Workflows 的外壳，而是把它最有价值的效果搬到 Codex 世界里：

- 用户说一个复杂任务。
- 系统自动选一个合适 workflow。
- 主 Codex 负责判断和收口。
- 多个 Codex worker 分阶段、并行或串行执行。
- 中间状态不塞进聊天，而是落到可追踪的 run store。
- 最后 reducer 把证据、风险、结论和下一步合成一份人能读的结果。

简单说：Claude Dynamic Workflows 像是 Claude Code 内置的“任务流水线”。Codex Flow 要做的是 Codex 原生、公开、可审计的“任务流水线底座”。

## Target Effect

完整体用户体验应该是：

```bash
cwf run review --target .
cwf run plan --goal "migrate auth module to the new token contract" --target .
cwf run research --question "compare these two approaches" --target .
cwf status <run-id>
cwf result <run-id>
```

或者在 Codex skill 里自然触发：

```text
Use codex-flow to review this branch with correctness, tests, and safety perspectives.
```

用户不需要关心几个 worker、几个 phase、结果保存在哪。默认路径应该是：

1. 先 validate。
2. 后台启动。
3. 用 status 看当前在干嘛。
4. 用 result 拿最终结论。
5. 必要时从 artifacts 追证据。

## What We Match From Claude Dynamic Workflows

Codex Flow 应该对标这些“效果”：

- One command starts a complex multi-step task.
- Workflow state lives outside the chat.
- Workers receive smaller focused contexts.
- Parallel work is first-class.
- The supervisor can inspect progress.
- Intermediate outputs are persisted.
- A reducer produces a final answer.
- Runs can be cancelled, resumed, inspected, and reused.

## What Will Stay Different

这些不强求和 Claude 一样：

- Claude 有内置 `/workflows` 面板；Codex Flow 先用 CLI + artifacts，之后再接 Codex Desktop。
- Claude 可以由 Claude 生成 workflow script；Codex Flow 先用受约束 YAML/JSON spec，再考虑安全脚本。
- Claude 的 runtime 在 Claude Code 内部；Codex Flow runtime 是公开 Node/TS CLI。
- Claude 可以自然挂在 Claude Code prompt 里；Codex Flow 先通过 skill 触发，再做更自动的 trigger。

完整体的原则是：效果接近，组成不同，安全边界更明确。

## Core Architecture

```text
User / Codex skill
  -> Workflow Resolver
  -> Workflow Validator
  -> Run Store
  -> Phase Engine
      -> Command Phase
      -> Codex Worker Phase
      -> Reducer Phase
      -> Optional Handoff Phase
  -> Status / Watch / Result
```

### 1. Workflow Resolver

把用户意图映射到 workflow。

Examples:

- `review this branch` -> `diff-review`
- `audit this repo` -> `repo-audit`
- `make an implementation plan` -> `implementation-plan`
- `compare approaches` -> `research-crosscheck`

MVP 后先做显式命令，不急着做自然语言自动触发。

### 2. Workflow Validator

启动前检查：

- spec schema 合法
- phase 顺序合法
- worker id 不重复
- reducer 存在
- sandbox / approval / timeout 合法
- target repo 存在
- workflow 是否需要 dirty diff、clean repo、或外部网络

用户价值：先发现配置错，不浪费模型时间。

### 3. Run Store

每个 run 都有独立目录：

```text
~/.codex-workflows/runs/<run-id>/
  workflow.json
  state.json
  events.jsonl
  inputs/
  workers/
  artifacts/
  result.md
  run.log
```

完整体需要补：

- resumable state
- run index
- artifact manifest
- worker usage / cost metadata when available
- parent / child run relationship

### 4. Phase Engine

支持更多 phase 类型：

- `command`: 本地只读收集上下文
- `codex-parallel`: 多 Codex worker 并行
- `codex-sequential`: 后一个 worker 依赖前一个输出
- `reducer`: 合并结果
- `gate`: 根据结果决定继续、停止、等待人工确认
- `handoff`: 生成 Codex prompt、GitHub comment、PR note、或后续任务

### 5. Worker Model

公开版只用 Codex worker。

每个 worker 必须声明：

- id
- role / perspective
- input context
- output schema
- sandbox
- timeout
- whether writes are allowed

默认仍然 read-only。写文件 workflow 必须显式 opt-in。

### 6. Reducer Model

Reducer 不是简单拼接。它要负责：

- 合并重复发现
- 保留最强证据
- 标记分歧
- 降级低信心结论
- 输出 next actions
- 输出 verification gaps
- 保留 worker provenance

用户价值：多个 worker 的结果变成一份能行动的结论。

## Planned Workflow Families

### v0.x Stable Base

- `diff-review`: 多视角代码审查

### v1 Candidate Workflows

- `repo-audit`: 扫项目结构、测试、CI、文档、风险
- `implementation-plan`: 把需求拆成可执行方案和验收条件
- `migration-plan`: 评估迁移风险、步骤、回滚
- `research-crosscheck`: 多 worker 查证同一问题，合并证据
- `release-review`: 发布前检查测试、风险、回滚、文档

### Later

- `fix-with-review`: 允许 Codex 修改文件，然后自动跑 review
- `desktop-handoff`: 把结果交给新的 Codex Desktop thread
- `github-pr-review`: 对 PR diff 产出 GitHub review 格式

## Milestones

### v0.2: Usable Public MVP

Status: done.

Includes:

- `validate`
- better `help`
- readable `status`
- foreground/background/result/cancel
- Chinese README
- docs/spec/acceptance aligned
- real foreground/background/cancel smoke

### v0.3: Watch And Run Index

Goal: 用户不需要反复手动查。

Deliverables:

- `cwf watch <run-id>`
- `cwf list`
- `cwf show <run-id>`
- run index under `~/.codex-workflows/index.json`
- status output includes last event summary

Acceptance:

- long background run can be watched until completion
- user can list recent runs and open the latest result
- no daemon required

### v0.4: Workflow Registry

Goal: 不只能跑一个 hardcoded workflow。

Deliverables:

- project workflows folder
- global workflows folder
- `cwf workflows list`
- `cwf workflows validate`
- schema supports workflow metadata and input fields

Acceptance:

- `diff-review` moves through the registry path
- invalid workflow fails with field-level errors
- docs show how to add a read-only workflow

### v0.5: Safer Gates And Resume

Goal: 长任务可恢复、危险步骤可停住等人确认。

Deliverables:

- `gate` phase
- `resume <run-id>`
- `approve <run-id> <gate-id>`
- failed/cancelled run can explain what is resumable

Acceptance:

- a workflow can stop before write-capable phase
- user can resume from a completed gate
- cancelled read-only run does not corrupt state

### v0.6: More Workflow Families

Goal: 开始接近动态工作流的真实价值。

Deliverables:

- `repo-audit`
- `implementation-plan`
- `research-crosscheck`
- reducer templates per workflow family
- shared worker output contracts

Acceptance:

- each workflow has fixture tests
- each workflow has at least one real smoke
- docs state when to use and when not to use each workflow

### v1.0: Codex-Native Dynamic Workflows

Goal: 对外可以说这是 Codex 的 workflow layer。

Deliverables:

- stable CLI
- stable workflow schema
- registry
- watch/list/result/cancel/resume
- read-only workflow library
- clear skill integration
- documented Desktop handoff plan or guarded implementation

Acceptance:

- a new user can install, validate, run, inspect, and reuse workflows from docs alone
- no private adapter required
- no non-Codex model routing
- workflow failures are inspectable
- docs do not claim features that are not implemented

## Product Rules

### Do

- Keep public core Codex-native.
- Make state inspectable.
- Prefer read-only first.
- Treat reducer quality as product quality.
- Make errors human-readable.
- Make every workflow answer: what happened, what evidence, what next.

### Do Not

- Do not add private model routing to the public core.
- Do not make arbitrary generated scripts the first workflow format.
- Do not claim Claude feature parity before Desktop integration exists.
- Do not hide failures behind vague AI summaries.
- Do not let worker output overwrite user files unless explicitly allowed.

## Full Acceptance Matrix

- [ ] A user can discover workflows.
  - Evidence: `cwf workflows list`

- [ ] A user can validate a workflow without spending model time.
  - Evidence: `cwf validate <workflow>`

- [ ] A user can run long workflows in the background.
  - Evidence: `cwf run <workflow> --background`

- [ ] A user can watch progress without reading JSON.
  - Evidence: `cwf watch <run-id>`

- [ ] A user can inspect raw evidence when needed.
  - Evidence: run folder includes `state.json`, `events.jsonl`, worker outputs, result, logs, artifact manifest

- [ ] A user can cancel and understand what happened.
  - Evidence: status shows cancelled phases/workers and no misleading result

- [ ] A reducer produces one actionable final answer.
  - Evidence: final result contains verdict, findings, evidence, verification gaps, next actions, worker provenance

- [ ] The system can support more than one workflow safely.
  - Evidence: registry tests plus at least two workflows passing fixture smoke

- [ ] Public core remains Codex-native.
  - Evidence: dependency and source audit shows no third-party model routers or private adapters

## Next Best Slice

The next useful implementation slice is v0.3:

1. Add `cwf watch <run-id>`.
2. Add `cwf list`.
3. Add a run index.
4. Keep `diff-review` as the only workflow.

Why this first: it improves real user experience without expanding model behavior or workflow complexity. It makes background mode feel like a real workflow product instead of a hidden process.
