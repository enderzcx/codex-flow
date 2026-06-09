# Codex Workflows (CWF)

> English quick read: CWF is a native bounded dynamic workflow skill for Codex. It turns complex work into a scoped run plan, uses Codex-native workers, verifies results, and returns the synthesis to the originating conversation.
>
> 中文为默认入口。一句话：CWF 是 Codex 的任务调度器，小活别用，大活用它拆、跑、验、回报。

Codex Workflows 是面向 OpenAI Codex / Codex Desktop 的 **bounded dynamic workflow** skill。

它不是“多开几个 agent”，也不是再造一个平台。CWF is **not a standalone agent platform** and not a standalone Node runtime. 它做的是把复杂任务从容易漂移的长对话里抽出来，变成一份可检查、有边界、可恢复的 **run plan**。

CWF 现在的核心形态是：Codex 主会话做 coordinator，`workflow.js` 作为可读的 harness/spec，真正执行尽量复用 Codex 原生能力：native subagents、Codex SDK、Codex Desktop `desktop-thread`，以及 `background+heartbeat` 回到原会话。

## 什么时候用

适合：

- 大 repo 审计、发布前风险检查
- 复杂 PR review、对抗性验证、证据核查
- 根因调查、bug hunt、迁移 / 重构规划
- 需要多个独立上下文并行看的任务
- 需要安全写入边界的 safe fix loop
- 长任务不想占着主会话，但希望结果回来

不适合：

- typo、import、按钮样式这种小改
- 一个 Codex turn 能直接做完的普通任务
- 没有明确目标和验收条件的探索聊天
- 需要无边界自动 swarm 的平台级托管任务

## 核心链路

```text
用户目标
  -> Codex 主会话选择或生成 workflow.js harness
  -> 生成 bounded run plan: scope, phases, workers, budget, stop rules
  -> Codex 调度 native subagents / SDK background workers / desktop-thread
  -> verifier 或 challenger 检查关键结论
  -> 写文件必须走 safe write gate
  -> 结果通过 coordinator_synthesis 或 heartbeat_synthesis 回到发起会话
```

`workflow.js` 是 harness/spec，不是 unrestricted Node script。CWF 不把未知 JS 直接当脚本执行。

## Worker 可见性

| 模式 | 含义 | 适合 |
|---|---|---|
| `inline` | worker 静默跑，结果回主会话 | 普通审计、检查、分析 |
| `desktop-thread` | 创建 Codex Desktop 左侧可见线程 | 长任务、写文件 worker、需要后续追问 |
| `SDK background workers` | 通过 `@openai/codex-sdk` 安静执行 | 不需要左侧可见的后台 worker |
| `background+heartbeat` | 后台跑完后唤醒原会话 | 不想让主会话一直等的长任务 |

最终合成必须回到发起 CWF 的原会话。`heartbeat_synthesis` 只有在原会话真实出现 marker reply 后才算送达；创建 automation 本身不算完成。

## 安全边界

CWF 每次运行都应该先说明：

- Scope: 哪些路径、问题、产物在范围内
- Exclusions: 哪些事明确不做
- Budget: token / worker / 时间上限
- Stop rule: 什么时候停，什么时候阻塞
- Quarantine: 外部或不可信内容如何隔离
- Verifier: 谁负责挑战结论
- Write scope: 哪些写入需要审批

写文件不允许 worker 直接自由 apply。`scripts/cwf-safe-write.mjs` 用的是审批门控补丁流：

```text
preview -> approve-write -> path policy -> git apply --check -> verification -> rollback evidence
```

SDK worker 或 `desktop-thread` worker 可以提出 patch，但真正 apply 必须回到 coordinator 的 safe write gate。

## 快速开始

安装到本机 Codex skill root：

```bash
mkdir -p ~/.codex/skills
ln -sfn "$(pwd)/skills/codex-workflows" ~/.codex/skills/codex-workflows
python3 skills/codex-workflows/scripts/check_skill_install.py --check-install
```

安装后，新开的 Codex 会话应该能看到 `$codex-workflows`。当前已运行的会话不会自动热刷新 skill 列表。

生成预览：

```bash
node scripts/cwf-run-preview.mjs workflows/repo-audit.workflow.js
```

生成并保存 run plan：

```bash
node scripts/cwf-run-plan.mjs workflows/repo-audit.workflow.js \
  --objective "audit this repo" \
  --run-id demo
```

初始化完整 controller artifacts：

```bash
node scripts/cwf-start.mjs workflows/repo-audit.workflow.js \
  --objective "audit this repo" \
  --run-id demo
```

查看状态：

```bash
node scripts/cwf-run-state.mjs status --run-id demo
```

记录 SDK worker 证据：

```bash
node scripts/cwf-worker-sdk.mjs --mode real --run-id demo
```

记录 Desktop-thread worker 证据：

```bash
node scripts/cwf-worker-desktop-thread.mjs --run-id demo
```

评估一个已审批 patch：

```bash
node scripts/cwf-safe-write.mjs \
  --patch change.patch \
  --allowed docs \
  --forbidden .env \
  --approval approve-write \
  --prior-gate previewed \
  --apply-check passed \
  --verification-status pass
```

验证仓库：

```bash
npm run check
```

## 内置 workflow 模板

- `workflows/repo-audit.workflow.js`: 仓库审计和发布风险检查
- `workflows/adversarial-verify.workflow.js`: 对抗性验证和反证
- `workflows/safe-fix-loop.workflow.js`: 有审批门的修复循环
- `workflows/classify-and-act.workflow.js`: 先分类，再选择动作
- `workflows/pipeline.workflow.js`: 阶段式处理
- `workflows/tournament.workflow.js`: 多候选对比和裁决
- `workflows/ui-copy-review.workflow.js`: UI / copy / 信息层级 review

这些文件不是给 Node 直接执行的脚本，而是 Codex 解释和调度的 spec。

## 运行产物

`.cwf/runs/RUN_ID/` 存放本地运行状态、run plan、worker packets、worker results、return envelope 和 final summary。它是本地证据边界，不进入 npm package。

默认回流是 `coordinator_synthesis`。长任务可以用 `background+heartbeat`，但只有真实 marker 回到原会话后才标记 `heartbeat_synthesis`。Platform automatic callback 仍是 deferred，不会被 README 说成已经完成。

## 和 Claude Dynamic Workflows 的关系

CWF 受 Claude Dynamic Workflows 启发，但不声称完整复刻。

Claude 更像平台内置的动态编排 runtime，可以在对话外运行 orchestration scripts 并协调大量 subagents。CWF 更轻：Codex 主会话仍是主脑，`workflow.js` 是 harness/spec，worker 只在值得时拆出去，重要结果要被 verifier 挑战，最后回到发起会话。

更完整的对比见 [docs/CWF_CLAUDE_COMPARISON.md](docs/CWF_CLAUDE_COMPARISON.md)。

## 当前状态

已具备：

- Codex skill: `skills/codex-workflows/SKILL.md`
- Sunny-style library skill package: `references/routing.md`、`templates/run-plan.md`、`evals/trigger_cases.json`、`scripts/check_skill_install.py`
- 有边界 run plan helper: `scripts/cwf-run-plan.mjs`
- controller artifact 初始化: `scripts/cwf-start.mjs`
- SDK worker evidence helper: `scripts/cwf-worker-sdk.mjs`
- Desktop-thread evidence helper: `scripts/cwf-worker-desktop-thread.mjs`
- heartbeat return evidence helper: `scripts/cwf-return-heartbeat.mjs`
- safe write gate helper: `scripts/cwf-safe-write.mjs`
- 7 个内置 workflow 模板

需要诚实保留的边界：

- 这不是 hosted workflow service。
- 不声称 SDK automatic callback。
- 不声称 platform automatic callback。
- Desktop-thread 只给值得继续看的 worker 用，不是每个 worker 都进左侧。
- 写文件仍走 approval-gated patch flow，不因为“动态”就变成无限权限。

## Skill 包结构

CWF 按 Sunny-style `library` skill 规范整理：

| 文件 | 作用 |
|---|---|
| `skills/codex-workflows/SKILL.md` | Codex 运行 CWF 时读取的主指令 |
| `skills/codex-workflows/references/routing.md` | 和 `goal-writer`、`delivery-planner`、`project-status-audit`、`codex-thread-orchestrator` 的路由边界 |
| `skills/codex-workflows/templates/run-plan.md` | 可落盘的 bounded run plan 模板 |
| `skills/codex-workflows/evals/trigger_cases.json` | 应触发 / 不应触发 / 近邻技能的路由样例 |
| `skills/codex-workflows/scripts/check_skill_install.py` | skill 包结构与本机安装检查 |

这部分的目标是让 CWF 在本机和公开仓库里都能稳定路由：该跑 workflow 时触发，不该触发时让更窄的 skill 接手。

## 文档入口

- [docs/CORE.md](docs/CORE.md): 核心原则
- [docs/RUN_EXPERIENCE.md](docs/RUN_EXPERIENCE.md): 运行体验
- [docs/WORKFLOW_JS.md](docs/WORKFLOW_JS.md): `workflow.js` contract
- [docs/CWF_ASYNC_RUNTIME.md](docs/CWF_ASYNC_RUNTIME.md): foreground / background / heartbeat 契约
- [docs/CWF_FULL_NATIVE_RUNTIME_PLAN.md](docs/CWF_FULL_NATIVE_RUNTIME_PLAN.md): 吃满 Codex 原生能力的完整计划
- [docs/CWF_MVP_EVIDENCE.md](docs/CWF_MVP_EVIDENCE.md): MVP 证据
- [docs/CWF_RELEASE_READINESS.md](docs/CWF_RELEASE_READINESS.md): release readiness 证据

## Check

```bash
npm run check
python3 skills/codex-workflows/scripts/check_skill_install.py --check-install
```

这个检查验证 skill、模板、helper 和证据文档的核心契约。它不构建外部 runtime，也不发布 npm package。
