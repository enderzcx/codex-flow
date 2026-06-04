# Codex Flow

一个轻量的 Codex 原生工作流层，用来把一次工程审查拆成多个 Codex worker（工作者）并行做，再合成一份可追踪的 reduced JSON 和 Markdown 报告。

它只依赖 Codex 原生能力：不接第三方模型路由，不接私有 adapter，不再造一个单独的 agent 平台。公开版默认还是只读 workflow；v1.4 额外带一个很窄的 `doc-refresh`，只允许文档写入，并且必须先生成 preview、过 gate、显式 approve 后才进入 Codex `workspace-write` 执行。

Codex 负责线程、子 agent、权限和写文件边界；Codex Flow 负责 workflow spec、run store、events、gate、reducer 和 artifact manifest。

## 它解决什么

平时让 Codex 看大 diff，常见问题是：

- 提示词每次手写，审查标准不稳定。
- 中间结果留在聊天里，过几天找不到。
- 跑很久时不知道它卡在哪一步。
- worker 失败后不好复盘。

Codex Flow 把这些东西落到磁盘：状态、事件、每个 worker 的标准 envelope、reduced-result JSON、artifact manifest、日志和最终 Markdown 报告都能查。

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

查看可用 workflow：

```bash
cwf workflows list
cwf workflows show diff-review
cwf workflows show repo-audit
cwf workflows validate
```

## 推荐用法

先检查 workflow 文件有没有问题，不启动 Codex worker：

```bash
cwf validate workflows/diff-review.yaml
```

小 diff 可以前台跑：

```bash
cwf run diff-review --target <repo>
cwf run repo-audit --target <repo>
cwf run implementation-plan --target <repo>
cwf run research-crosscheck --target <repo>
cwf run release-review --target <repo>
cwf run doc-refresh --target <repo>
cwf run workflows/diff-review.yaml --target <repo>
```

大 diff 推荐后台跑：

```bash
cwf run workflows/diff-review.yaml --target <repo> --background
cwf status <run-id>
cwf watch <run-id>
cwf latest --target <repo>
cwf list --target <repo>
cwf show <run-id>
cwf approve <run-id> <gate-id>
cwf reject <run-id> <gate-id> --reason <text>
cwf resume <run-id>
cwf result <run-id>
```

workflow 可以用 id 或 path。Registry 只扫本地文件：

```text
./.codex-flow/workflows/
./workflows/
~/.codex-flow/workflows/
```

如果多个文件声明同一个 workflow id，CLI 会报 duplicate id，不会静默挑一个。

需要停掉时：

```bash
cwf cancel <run-id>
```

把已完成 run 带回 Codex：

```bash
cwf desktop check
cwf desktop result <run-id> --print
cwf desktop result <run-id>
cwf desktop result <run-id> --new-thread
cwf desktop result <run-id> --thread <thread-id>
cwf github-pr <run-id> --format comment
cwf github-pr <run-id> --format review
cwf github-pr <run-id> --post --repo <owner/repo> --pr <number>
cwf suggest-workflow --goal "Review docs changes" --target <repo>
cwf suggest-workflow --from-run <run-id>
```

## 跑起来后怎么看

`cwf status <run-id>` 会尽量用人话告诉你：

- 现在在做什么
- 哪些 phase 完成了
- 几个 worker 完成了
- 有没有 raw fallback
- 最终报告、reduced JSON、manifest、日志、事件、worker JSON 放在哪里

想实时看进度，用：

```bash
cwf watch <run-id>
```

它会自动刷新同一份状态视图，直到 run 变成 `completed`、`failed` 或 `cancelled` 后退出。可以用 `--interval <ms>` 调整刷新间隔，或者用 `--once` 输出一次不清屏的快照。

忘了 run id 时，用 discovery 命令找：

```bash
cwf list --limit 5
cwf list --status failed
cwf latest --target <repo>
cwf show <run-id>
```

`cwf list` / `latest` / `show` 背后会用 `~/.codex-workflows/index.json`。这个 index 只是可重建缓存；如果缺失、过期或损坏，CLI 会从 `~/.codex-workflows/runs/*/state.json` 自动重建。

worker 执行现在走 adapter 层，但仍然只使用 Codex。默认是 `codex-sdk-headless`。workflow 可以用 `runtime.preferred_worker_adapter` 指定 `codex-app-thread`、`codex-subagent` 或 `codex-review-detached`，并用 `runtime.fallback_worker_adapter: codex-sdk-headless` 声明 fallback。宿主没有暴露 native thread/subagent 执行能力时，native adapter 会明确失败；只有配置了 fallback 才会退回 SDK。reducer 不关心 adapter，worker provenance 会保留 runtime metadata。下一阶段计划做 `codex-app-thread`：每个 worker 一个 Desktop 左侧可见线程，但如果 workflow 是从当前 Codex 会话发起，最终总结仍然应该回到这个发起会话。

带 gate 的 workflow 会在风险步骤前暂停。`cwf status` / `cwf show` 会直接说明卡在哪个 gate，并给出 approve / reject 命令。`cwf approve <run-id> <gate-id>` 记录批准，`cwf resume <run-id>` 只继续还没完成的后续 phase；`cwf reject <run-id> <gate-id> --reason <text>` 会干净地停止 run。内置 `doc-refresh` 走这条路径：approval 前只写 run artifact（`write-plan.md`、`dry-run-preview.md`、`rollback.md`），approval 后才用 Codex SDK `workspace-write` 线程做文档写入。

`cwf desktop result` 用来把已完成的文件系统 run 带回 Codex。如果 CWF 是由当前 Codex 会话里的 skill 发起，主路径应该是 skill 读取 run 结果，然后直接在这个发起会话里回复。`--print` 会打印一段适合这条路径的简洁 handoff prompt；不依赖 app-server 时也会写 `artifacts/handoff-prompt.md`。`--new-thread` 和 `--thread <thread-id>` 需要支持 app-server 的 Codex CLI、运行中的 app-server daemon，以及已开启 remote control：

```bash
codex app-server daemon start
codex app-server daemon enable-remote-control
```

如果本机有多个 Codex CLI，用 `CWF_CODEX_PATH=/path/to/codex` 指向支持 app-server 的那个。app-server 可用时，`--new-thread` 会显式创建一个单独的 coordinator/result thread，`--thread <thread-id>` 会发到明确指定的 thread。Codex Flow 会优先用 `thread/read` 确认新线程，失败时再用 `thread/list` 兜底，但不会从 `thread/list` 猜“当前线程”。

`cwf github-pr <run-id>` 会把本地 run 转成适合 PR 的 artifact。默认只写 `artifacts/github-pr-comment.md` 和 `artifacts/github-pr-review.json`，不会发到 GitHub。只有显式加 `--post --repo <owner/repo> --pr <number>` 时才会调用本机 `gh` CLI。

`cwf suggest-workflow` 只生成受约束的 YAML workflow spec，并立刻 validate。默认保存到 `~/.codex-workflows/suggestions/`，不会自动安装进 registry，也不会自动运行；`--output` 不会覆盖已有文件。要使用时必须显式 `cwf run <suggestion-path> --target <repo>`，或手动移动到 workflow 搜索路径。

示例：

```text
Run ID: run_...
Workflow: diff-review
Status: running
Now: reviewing diff with tests, safety
Target: /path/to/repo
Failure policy: worker failures are tolerated when at least one Codex worker succeeds; all-worker failure, target diff changes, and unhandled errors fail the run.
Workers: 1/3 completed, 0 fallback
Active phase: review
Phases:
- collect: completed (1s)
- review: running (8s)
- reduce: pending
Workers:
- correctness: completed (6s), findings=1, artifacts=0
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
~/.codex-workflows/index.json
~/.codex-workflows/runs/<run-id>/
  workflow.json
  state.json
  events.jsonl
  context.json
  run.log
  workers/
    correctness.json
    tests.json
    safety.json
  artifacts/
    write-plan.md
    dry-run-preview.md
    diff-summary.md
    rollback.md
    verification.md
    github-pr-comment.md
    github-pr-review.json
    reduced-result.json
    manifest.json
  result.md
```

每个 worker JSON 都有同一套 envelope：status、confidence、summary、findings、verification、artifacts、retry_count、raw_fallback、时间、prompt、raw output，以及可选 error/usage。`artifacts/reduced-result.json` 保存 reducer 的稳定结果：verdict、summary、findings、verification_gaps、next_actions、worker_provenance 和 artifact 列表。`artifacts/manifest.json` 是这次 run 的证据清单，方便之后复盘。

如果只有部分 worker 失败，Codex Flow 会按默认 failure policy 继续 reduce，但最终结果会把失败 worker 和降级证据写清楚。结构化输出坏掉时，raw fallback 也会出现在 status/result 里。

每个内置 workflow 的使用边界见 [Workflow catalog](docs/workflow-catalog.md)。

最终报告可以直接看：

```bash
cwf result <run-id>
```

失败时，`cwf status` 和 `cwf show` 会直接给出 failure summary：失败 phase、失败 worker、默认 failure policy，以及下一步该看 Codex SDK 连接、事件日志还是 worker JSON。

## 它不是什么

Codex Flow 不是一个大而全的 agent 平台。当前公开版明确不做：

- 非 Codex 模型路由
- 私有 adapter
- 自动改代码
- Web UI
- 自动猜当前 Codex thread
- worker agent thread 集成
- remote workflow marketplace
- 非文档类生产写文件 workflow
- 自动发 GitHub 评论
- Claude Dynamic Workflows 的完全复刻

它更像一个小而清楚的底座：让 Codex 的多 worker 审查变得可重复、可观察、可复盘。

## 验证

```bash
npm run check
npm pack --dry-run
bash scripts/smoke-cli.sh
```

CI 会在 push 到 `main` 和 pull request 时跑同一组非 live smoke。它会检查本地 workflow registry、验证 `diff-review` 和 gated write fixture，并确认带写能力但没有 gate 的 workflow 会失败；默认不会在 CI 里启动 live Codex worker。

v1.0 已覆盖：

- fixture diff
- 真实大 diff smoke
- 前台和后台运行
- cancel
- Codex SDK worker 全失败 mock
- 部分 worker 失败时 degraded 输出
- malformed worker 输出 raw fallback 可见
- artifact manifest / reduced-result envelope 生成
- run discovery / latest / show / index rebuild
- gate pause / approve resume / reject / write-without-gate validation
- doc-refresh gated preview / approve resume / reject / rollback / verification artifact coverage
- GitHub PR comment / review artifact generation 和 mocked `gh` post success/failure
- workflow suggestion generation / invalid diagnostics / registry 不自动安装 / mocked worker explicit-path run
- workflow registry list / show / validate / duplicate-id detection / id-or-path run
- workflow validate
- 人能读懂的 status 输出
- 内置 example workflow 的 registry validate 和 catalog docs
- documented command surface 和 install/build/link flow

发版前按 [Release checklist](docs/RELEASE_CHECKLIST.md) 逐项核对。

更多设计说明见：

- [Release notes](RELEASE_NOTES.md)
- [Release checklist](docs/RELEASE_CHECKLIST.md)
- [PRD](docs/PRD.md)
- [Spec](docs/SPEC.md)
- [Full plan](docs/FULL_PLAN.md)
- [Phase contracts](docs/PHASE_CONTRACTS.md)
- [Post-v1 plan](docs/POST_V1_PLAN.md)
- [Skill plan](docs/SKILL_PLAN.md)
- [Workflow catalog](docs/workflow-catalog.md)
- [Claude comparison](docs/claude-vs-codex-workflows.md)
