# Codex Flow

一个轻量的 Codex 原生工作流 runner，用来把一次代码审查拆成多个 Codex worker 并行做，再合成一份可追踪的报告。

它只依赖 OpenAI Codex SDK 和 CLI：不接第三方模型路由，不接私有 adapter，不把项目绑到某个个人环境。现在公开版先做一件事：`diff-review`，也就是让 `correctness`、`tests`、`safety` 三个视角同时审当前 git diff。

## 它解决什么

平时让 Codex 看大 diff，常见问题是：

- 提示词每次手写，审查标准不稳定。
- 中间结果留在聊天里，过几天找不到。
- 跑很久时不知道它卡在哪一步。
- worker 失败后不好复盘。

Codex Flow 把这些东西落到磁盘：状态、事件、每个 worker 的 JSON、日志和最终 Markdown 报告都能查。

## 安装

```bash
npm install
npm run build
npm link
```

确认 CLI 可用：

```bash
cwf --help
```

## 推荐用法

先检查 workflow 文件有没有问题，不启动 Codex worker：

```bash
cwf validate workflows/diff-review.yaml
```

小 diff 可以前台跑：

```bash
cwf run workflows/diff-review.yaml --target <repo>
```

大 diff 推荐后台跑：

```bash
cwf run workflows/diff-review.yaml --target <repo> --background
cwf status <run-id>
cwf watch <run-id>
cwf result <run-id>
```

需要停掉时：

```bash
cwf cancel <run-id>
```

## 跑起来后怎么看

`cwf status <run-id>` 会尽量用人话告诉你：

- 现在在做什么
- 哪些 phase 完成了
- 几个 worker 完成了
- 有没有 raw fallback
- 最终报告、日志、事件、worker JSON 放在哪里

想实时看进度，用：

```bash
cwf watch <run-id>
```

它会自动刷新同一份状态视图，直到 run 变成 `completed`、`failed` 或 `cancelled` 后退出。可以用 `--interval <ms>` 调整刷新间隔，或者用 `--once` 输出一次不清屏的快照。

示例：

```text
Run ID: run_...
Workflow: diff-review
Status: running
Now: reviewing diff with tests, safety
Target: /path/to/repo
Workers: 1/3 completed, 0 fallback
Active phase: review
Phases:
- collect: completed (1s)
- review: running (8s)
- reduce: pending
Workers:
- correctness: completed (6s), findings=1
- tests: running (7s)
- safety: running (7s)
Artifacts:
- State: ~/.codex-workflows/runs/run_.../state.json
- Events: ~/.codex-workflows/runs/run_.../events.jsonl
- Workers: ~/.codex-workflows/runs/run_.../workers/*.json
- Result: not ready yet
- Log: ~/.codex-workflows/runs/run_.../run.log
```

## 结果在哪里

每次运行都会写到：

```text
~/.codex-workflows/runs/<run-id>/
  workflow.json
  state.json
  events.jsonl
  run.log
  workers/
    correctness.json
    tests.json
    safety.json
  result.md
```

最终报告可以直接看：

```bash
cwf result <run-id>
```

## 它不是什么

Codex Flow 不是一个大而全的 agent 平台。当前公开版明确不做：

- 非 Codex 模型路由
- 私有 adapter
- 自动改代码
- Web UI
- 稳定的 Codex Desktop app-server thread handoff
- workflow marketplace
- Claude Dynamic Workflows 的完全复刻

它更像一个小而清楚的底座：让 Codex 的多 worker 审查变得可重复、可观察、可复盘。

## 验证

```bash
npm run check
npm pack --dry-run
```

当前已覆盖：

- fixture diff
- 真实大 diff smoke
- 前台和后台运行
- cancel
- Codex SDK worker 全失败 mock
- workflow validate
- 人能读懂的 status 输出

更多设计说明见：

- [PRD](docs/PRD.md)
- [Spec](docs/SPEC.md)
- [Skill plan](docs/SKILL_PLAN.md)
- [Claude comparison](docs/claude-vs-codex-workflows.md)
