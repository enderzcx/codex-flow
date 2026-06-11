# Codex Workflows (CWF)

> 英文版：[README.en.md](README.en.md)
>
> 一句话：CWF 是 Codex 原生、有边界的动态工作流 skill。小任务直接做；复杂任务用它拆、跑、验、收口。

Codex Workflows 面向 OpenAI Codex 和 Codex Desktop。它把复杂任务从容易漂移的长对话里抽出来，变成一份可检查、有边界、可恢复的运行计划，也就是 `run plan`。

CWF 的边界很明确：不是独立 agent 平台，不提供托管式工作流服务，也不把 `workflow.js` 当成可以随便执行的 Node 脚本。Codex 主会话仍然是协调者；`workflow.js` 是给 Codex 读取的工作流说明；真正执行尽量复用 Codex 原生能力：原生子 agent、Codex SDK、Codex Desktop 左侧线程、`background+heartbeat`。

## 什么时候用

适合：

- 大 repo 审计、发布前风险检查
- 复杂 PR 审查、对抗性验证、证据核查
- 根因调查、bug hunt、迁移和重构规划
- 需要多个独立上下文并行看的任务
- 需要写入边界的安全修复循环
- 长任务不想占着主会话，但希望结果回来

不适合：

- typo、import、按钮样式这种小改
- 一个 Codex turn 能直接做完的普通任务
- 没有明确目标和验收条件的探索聊天
- 需要无边界自动派工的平台级托管任务

## 核心链路

```text
用户目标
  -> Codex 主会话选择或生成 workflow.js
  -> 生成有边界的 run plan: 范围、阶段、worker、预算、停止规则
  -> Codex 调度原生子 agent / SDK 后台 worker / desktop-thread
  -> verifier 或 challenger 检查关键结论
  -> 写文件必须走安全写入门禁
  -> 结果通过 coordinator_synthesis 或 heartbeat_synthesis 回到发起会话
```

`workflow.js` 是工作流说明，不是任意可执行脚本。CWF 不把未知 JS 直接当脚本执行。

## Worker 可见性

| 模式 | 含义 | 适合 |
|---|---|---|
| `inline` | worker 静默跑，结果回主会话 | 普通审计、检查、分析 |
| `desktop-thread` | 创建 Codex Desktop 左侧线程 | 长任务、写文件 worker、需要后续追问 |
| SDK 后台 worker | 通过 `@openai/codex-sdk` 安静执行 | 不需要左侧可见的后台任务 |
| `background+heartbeat` | 后台跑完后唤醒原会话 | 不想让主会话一直等的长任务 |

最终合成必须回到发起 CWF 的原会话。`heartbeat_synthesis` 只有在原会话真实出现 marker reply 后才算送达；创建 automation 本身不算完成。

## 安全边界

CWF 每次运行都应该先说明：

- 范围：哪些路径、问题、产物在范围内
- 排除项：哪些事明确不做
- 预算：token、worker、时间上限
- 停止规则：什么时候停，什么时候阻塞
- 隔离方式：外部或不可信内容如何隔离
- 验证者：谁负责挑战结论
- 写入范围：哪些写入需要审批

写文件不允许 worker 直接自由应用。`scripts/cwf-safe-write.mjs` 评估审批门控补丁流和 apply-check 证据：

```text
preview -> approve-write -> path policy -> git apply --check -> verification -> rollback evidence
```

SDK worker 或 `desktop-thread` worker 可以提出 patch，但真正应用必须回到主会话的安全写入门禁。

## 快速开始

安装到本机 Codex skill root：

```bash
mkdir -p ~/.codex/skills
ln -sfn "$(pwd)/skills/codex-workflows" ~/.codex/skills/codex-workflows
python3 skills/codex-workflows/scripts/check_skill_install.py --check-install
```

安装后，新开的 Codex 会话应该能看到 `$codex-workflows`。当前已运行的会话不会自动热刷新 skill 列表。

查看当前版本的 agent-readable skill registry：

```bash
node scripts/cwf-skills.mjs list --format markdown
node scripts/cwf-skills.mjs list codex-workflows --format markdown
node scripts/cwf-skills.mjs read codex-workflows/references/routing.md
node scripts/cwf-skills.mjs validate codex-workflows --format markdown
```

`cwf-skills.mjs` 只暴露 `SKILL.md`、`references/`、`templates/`、`evals/` 这类 SOP 内容；`scripts/`、assets、绝对路径和 `..` 逃逸会被拒绝。

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

初始化完整控制器证据：

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
node scripts/cwf-worker-sdk.mjs --mode real --run-id demo --worker correctness
```

记录 Desktop-thread worker 证据：

```bash
node scripts/cwf-worker-desktop-thread.mjs --run-id demo --worker visible-fixture
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
  --apply-check-command "git apply --check change.patch" \
  --apply-check-evidence "git apply --check passed" \
  --verification-status pass
```

验证仓库：

```bash
npm run check
```

## 内置 workflow 模板

- `workflows/repo-audit.workflow.js`: 仓库审计和发布风险检查
- `workflows/code-review.workflow.js`: 代码、PR、diff 审查
- `workflows/adversarial-verify.workflow.js`: 对抗性验证和反证
- `workflows/safe-fix-loop.workflow.js`: 有审批门的修复循环
- `workflows/classify-and-act.workflow.js`: 先分类，再选择动作
- `workflows/pipeline.workflow.js`: 阶段式处理
- `workflows/tournament.workflow.js`: 多候选对比和裁决
- `workflows/ui-copy-review.workflow.js`: UI、文案、信息层级审查

这些文件不是给 Node 直接执行的脚本，而是 Codex 解释和调度的工作流说明。

## 运行产物

`.cwf/runs/RUN_ID/` 存放本地运行状态、run plan、worker 输入、worker 输出、回流信封和最终摘要。它是本地证据边界，不进入 npm package。

默认回流是 `coordinator_synthesis`。长任务可以用 `background+heartbeat`，但只有真实 marker 回到原会话后才标记 `heartbeat_synthesis`。平台自动回调仍是 deferred，不会被 README 说成已经完成。

## 和 Claude Dynamic Workflows 的关系

CWF 受 Claude Dynamic Workflows 启发，但不声称完整复刻。

Claude 更像平台内置的动态编排运行时，可以在对话外运行编排脚本并协调大量子 agent。CWF 更轻：Codex 主会话仍是主脑，`workflow.js` 是工作流说明，worker 只在值得时拆出去，重要结果要被验证者挑战，最后回到发起会话。

更完整的对比见 [docs/CWF_CLAUDE_COMPARISON.md](docs/CWF_CLAUDE_COMPARISON.md)。

## 当前状态

已具备：

- Codex skill: `skills/codex-workflows/SKILL.md`
- Sunny-style `library` skill 包：`references/routing.md`、`templates/run-plan.md`、`evals/trigger_cases.json`、`scripts/check_skill_install.py`
- agent-readable skill registry helper: `scripts/cwf-skills.mjs`
- 有边界运行计划 helper: `scripts/cwf-run-plan.mjs`
- 控制器证据初始化 helper: `scripts/cwf-start.mjs`
- SDK worker 证据 helper: `scripts/cwf-worker-sdk.mjs`
- Desktop-thread 证据 helper: `scripts/cwf-worker-desktop-thread.mjs`
- heartbeat 回流证据 helper: `scripts/cwf-return-heartbeat.mjs`
- 安全写入门禁 helper: `scripts/cwf-safe-write.mjs`
- 8 个内置 workflow 模板

需要诚实保留的边界：

- 这不是托管式工作流服务。
- 不声称 SDK 自动回调。
- 不声称平台自动回调。
- Desktop-thread 只给值得继续看的 worker 用，不是每个 worker 都进左侧。
- 写文件仍走审批门控补丁流，不因为“动态”就变成无限权限。

## Skill 包结构

CWF 按 Sunny-style `library` skill 规范整理：

| 文件 | 作用 |
|---|---|
| `skills/codex-workflows/SKILL.md` | Codex 运行 CWF 时读取的主指令 |
| `skills/codex-workflows/references/routing.md` | 和 `goal-writer`、`delivery-planner`、`project-status-audit`、`codex-thread-orchestrator` 的路由边界 |
| `skills/codex-workflows/templates/run-plan.md` | 可落盘的有边界运行计划模板 |
| `skills/codex-workflows/evals/trigger_cases.json` | 应触发 / 不应触发 / 近邻技能的路由样例 |
| `skills/codex-workflows/scripts/check_skill_install.py` | skill 包结构与本机安装检查 |
| `scripts/cwf-skills.mjs` | 仓库级 `skills list/read/validate` 入口，读取当前版本的 agent SOP |

这部分的目标是让 CWF 在本机和公开仓库里都能稳定路由：该跑 workflow 时触发，不该触发时让更窄的 skill 接手。

## 文档入口

- [README.en.md](README.en.md): 英文 README
- [README.zh-CN.md](README.zh-CN.md): 中文镜像
- [docs/CORE.md](docs/CORE.md): 核心原则
- [docs/RUN_EXPERIENCE.md](docs/RUN_EXPERIENCE.md): 运行体验
- [docs/WORKFLOW_JS.md](docs/WORKFLOW_JS.md): `workflow.js` contract
- [docs/CWF_ASYNC_RUNTIME.md](docs/CWF_ASYNC_RUNTIME.md): foreground / background / heartbeat 契约

仓库内还有 roadmap、goal、evidence 文档供维护者使用；npm package 只打包上面的公开核心文档，避免把本机路径、线程 id、内部验收记录带到公开包里。

## Check

```bash
npm run check
python3 skills/codex-workflows/scripts/check_skill_install.py --check-install
```
