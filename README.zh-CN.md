# Codex Workflows (CWF)

> 英文版：[README.en.md](README.en.md)
>
> Codex 原生、有边界的 workflow skill 和模板库：提供可复用的 workflow 模板和本地 helper，把复杂任务拆成 scoped、verifiable 的 `run plan`，并让结果回到原始 Codex 会话。

Codex Workflows 面向 OpenAI Codex 和 Codex Desktop。它不是独立 agent 平台，不是托管式工作流服务，也不是任意 Node runtime。原始 Codex 会话仍是 coordinator；`workflow.js` 是 Codex 可读取和改写的 harness/spec；执行时优先复用 Codex 原生能力：native subagents、Codex SDK、Codex Desktop `desktop-thread` 和 `background+heartbeat`。

## 快速开始

安装到本机 Codex skill root：

```bash
mkdir -p ~/.codex/skills
ln -sfn "$(pwd)/skills/codex-workflows" ~/.codex/skills/codex-workflows
python3 skills/codex-workflows/scripts/check_skill_install.py --check-install
```

安装后，新开的 Codex 会话应该能看到 `$codex-workflows`。当前已运行的会话不会自动热刷新 skill 列表。

验证仓库：

```bash
npm run check
```

## 什么时候用

适合：

- 大 repo 审计、发布前风险检查
- 复杂 PR / diff 审查、对抗性验证、证据核查
- root-cause investigation、bug hunt、迁移和重构规划
- 需要多个独立上下文并行看的任务
- 需要审批门控的 safe fix loop
- 长任务不想占着主会话，但希望结果回来

不适合：

- typo、import、按钮样式这种小改
- 一个 Codex turn 能直接做完的普通任务
- 没有明确目标和验收条件的探索聊天
- 需要无边界自动派工的平台级任务

## 你能得到什么

| 类别 | 内容 |
|---|---|
| workflow 模板 | 8 个内置模板：repo audit、code review、adversarial verify、safe fix loop 等 |
| run helpers | `cwf-run-preview.mjs`、`cwf-run-plan.mjs`、`cwf-start.mjs`、`cwf-run-state.mjs` |
| worker evidence helpers | `cwf-worker-sdk.mjs`、`cwf-worker-desktop-thread.mjs`、`cwf-native-subagent.mjs` |
| safety helpers | `cwf-safe-write.mjs`、`cwf-return-envelope.mjs`、`cwf-return-heartbeat.mjs` |
| generated UI surfaces | optional `ui_spec` or `html_stream` artifacts for dashboards, review panels, and rich read-only reports |
| skill package | library-style Codex skill package: `SKILL.md`、`references/`、`templates/run-plan.md`、`evals/trigger_cases.json`、`scripts/check_skill_install.py` |
| skill registry helper | `cwf-skills.mjs` 用于 list/read/validate 当前版本的 skill SOP |

查看当前版本的 skill registry：

```bash
node scripts/cwf-skills.mjs list --format markdown
node scripts/cwf-skills.mjs list codex-workflows --format markdown
node scripts/cwf-skills.mjs read codex-workflows/references/routing.md
node scripts/cwf-skills.mjs validate codex-workflows --format markdown
```

`cwf-skills.mjs` 只暴露 `SKILL.md`、`references/`、`templates/`、`evals/` 这类 SOP 内容；`scripts/`、assets、绝对路径和 `..` 逃逸会被拒绝。

## 核心概念

**Run plan**：每次运行前生成的范围、阶段、worker、预算和停止规则。生成预览与 run plan：

```bash
node scripts/cwf-run-preview.mjs workflows/repo-audit.workflow.js
node scripts/cwf-run-plan.mjs workflows/repo-audit.workflow.js \
  --objective "audit this repo" \
  --run-id demo
```

**Run artifacts**：`.cwf/runs/RUN_ID/` 存放本地运行状态、run plan、worker 输入、worker 输出、return envelope 和最终摘要。初始化完整运行证据：

```bash
node scripts/cwf-start.mjs workflows/repo-audit.workflow.js \
  --objective "audit this repo" \
  --run-id demo
node scripts/cwf-run-state.mjs status --run-id demo
```

**Worker 可见性**：

| 模式 | 含义 | 适合 |
|---|---|---|
| `inline` | worker 静默跑，结果回主会话 | 普通审计、检查、分析 |
| `desktop-thread` | 创建 Codex Desktop 左侧线程 | 长任务、写文件 worker、需要后续追问 |
| SDK 后台 worker | 通过 `@openai/codex-sdk` 安静执行 | 不需要左侧可见的后台任务 |
| `background+heartbeat` | 后台跑完后唤醒原会话 | 不想让主会话一直等的长任务 |

记录 worker 证据：

```bash
node scripts/cwf-worker-sdk.mjs --mode real --run-id demo --worker correctness
node scripts/cwf-worker-desktop-thread.mjs --run-id demo --worker visible-fixture
```

**Result synthesis**：最终合成必须回到发起 CWF 的原会话。`heartbeat_synthesis` 只有在原会话真实出现 marker reply 后才算送达；创建 automation 本身不算完成。

**Workflow files**：`workflow.js` 是工作流 harness/spec，不是直接执行的脚本。CWF 不把未知 JavaScript 当任意代码运行。

**Generated UI surfaces**：CWF 可以额外产出 `renderable_output`，把复杂结果展示成面板、表格或流式报告。交互式/产品化界面用 schema-first 的 `ui_spec`，只允许声明过的组件和 action；一次性只读报告用 `html_stream`，必须 sanitize 且不能拥有 verified state。示例见 [examples/generated-ui-surface-demo.html](examples/generated-ui-surface-demo.html)，契约见 [docs/GENERATED_UI_SURFACES.md](docs/GENERATED_UI_SURFACES.md)。

## 安全契约

CWF 每次运行都应该声明：

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

SDK worker 或 `desktop-thread` worker 可以提出 patch，但真正应用必须回到主会话的安全写入门禁。

外部顾问或审查工具只能作为 `external_review_receipts[]` 进入 run plan / return envelope。它们可以提出风险、blocker 和 `goal_delta` 建议，但不能作为 CWF worker、不能写文件、不能替代测试或 checker-owned verified state。详见 [docs/EXTERNAL_REVIEW_RECEIPTS.md](docs/EXTERNAL_REVIEW_RECEIPTS.md)。

## 内置 workflow 模板

| 模板 | 用途 |
|---|---|
| `workflows/repo-audit.workflow.js` | 仓库审计和发布风险检查 |
| `workflows/code-review.workflow.js` | 代码、PR、diff 审查 |
| `workflows/adversarial-verify.workflow.js` | 对抗性验证和反证 |
| `workflows/safe-fix-loop.workflow.js` | 有审批门的修复循环 |
| `workflows/classify-and-act.workflow.js` | 先分类，再选择动作 |
| `workflows/pipeline.workflow.js` | 阶段式处理 |
| `workflows/tournament.workflow.js` | 多候选对比和裁决 |
| `workflows/ui-copy-review.workflow.js` | UI、文案、信息层级审查 |

这些文件是 Codex 解释和调度的工作流说明，不是给 Node 直接执行的脚本。

## 与 Claude Dynamic Workflows 的关系

CWF 受 Claude Dynamic Workflows 启发，但不声称完整复刻。Claude 更像平台内置的动态编排运行时，可以在对话外运行编排脚本并协调大量子 agent。CWF 更轻：Codex 主会话仍是 coordinator，`workflow.js` 是 harness/spec，worker 只在值得时拆出去，重要结果要被 verifier 挑战，最后回到发起会话。

更完整的对比见 [docs/CWF_CLAUDE_COMPARISON.md](docs/CWF_CLAUDE_COMPARISON.md)。

## 当前边界

- 不是托管式工作流服务。
- 不是独立 agent 平台。
- 不声称 SDK 自动回调或平台自动回调已经可用。
- Desktop-thread 只给值得继续看的 worker，用不到每个 worker。
- 写文件仍走审批门控补丁流。
- 外部审查收据只是 advisory evidence，不能替代测试或 checker-owned verified state。

## 文档入口

- [README.en.md](README.en.md): 英文 README
- [README.zh-CN.md](README.zh-CN.md): 中文镜像
- [docs/CORE.md](docs/CORE.md): 核心原则
- [docs/RUN_EXPERIENCE.md](docs/RUN_EXPERIENCE.md): 运行体验
- [docs/WORKFLOW_JS.md](docs/WORKFLOW_JS.md): `workflow.js` contract
- [docs/CWF_ASYNC_RUNTIME.md](docs/CWF_ASYNC_RUNTIME.md): foreground / background / heartbeat 契约
- [docs/EXTERNAL_REVIEW_RECEIPTS.md](docs/EXTERNAL_REVIEW_RECEIPTS.md): external review receipt contract
- [docs/GENERATED_UI_SURFACES.md](docs/GENERATED_UI_SURFACES.md): generated UI surface contract
- [examples/generated-ui-surface-demo.html](examples/generated-ui-surface-demo.html): dependency-free demo

## Check

```bash
npm run check
python3 skills/codex-workflows/scripts/check_skill_install.py --check-install
```
