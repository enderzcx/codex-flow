# Codex Workflows

Codex Workflows 是一个 **Codex 原生、有边界的动态工作流 skill**。

它的核心不是 CLI、不是外部 Node runtime、也不是自己再造一个 agent 平台。

它也不是“多开几个 subagent 就完事”。核心是把复杂任务的编排从容易漂移的聊天上下文里抽出来，变成一个很小、可检查的 run plan：先定范围，再按需并行，重要结论交给 verifier 反证，最后回到当前会话收口。

核心只有一句话：

```text
Codex 主会话动态生成/读取 workflow.js harness，
然后用 Codex 原生 subagents 执行，
最后在当前会话中收口。
```

## 核心链路

```text
用户目标
  -> Codex 主会话写出或选择 workflow.js
  -> Codex 主会话生成有边界的 run plan
  -> Codex 主会话解释 workflow
  -> Codex spawn 原生 explorer / worker subagents
  -> subagents 继承当前 Codex sandbox / approval
  -> 重要 worker 可升级成左侧 Desktop thread
  -> Codex 等待 / 汇总 / 按需补派 / 验证
  -> 当前会话用人话收口
```

## 保留什么

- `skills/codex-workflows/SKILL.md`: 原生 Codex skill。
- `workflows/*.workflow.js`: workflow harness 模板。
- Codex 原生 subagents: 真正执行者。
- scope-first run plan: 非 trivial 任务先定范围、预算、验证和停止条件。
- 当前会话回流: 结果由主 Codex 汇总回来。
- 可选左侧线程: 只有长任务、写文件、需要后续单独追问的 worker 才进左侧。
- stop condition / gate / verification: 防止跑偏和早停。

## 删除了什么

旧的外部 runtime 主线已经砍掉：

- TypeScript CLI runner
- YAML workflow registry
- app-server 线程模拟主路径
- safePatch 作为默认体验
- 大量 v1.x 计划文档和 smoke 矩阵

这些不是完全没价值，但它们不再是核心。以后如果要回来，只能作为 native skill 稳定后的可选 adapter。

## 当前模板

- `workflows/classify-and-act.workflow.js`
- `workflows/adversarial-verify.workflow.js`
- `workflows/pipeline.workflow.js`
- `workflows/repo-audit.workflow.js`
- `workflows/safe-fix-loop.workflow.js`
- `workflows/tournament.workflow.js`
- `workflows/ui-copy-review.workflow.js`

这些 JS 不是给 Node 直接执行的。它们是给 Codex 读的 harness/spec：描述怎么拆任务、派哪些 subagent、哪些 worker 可写、怎么验证、何时停止。

## 左侧线程怎么用

默认不要每个 worker 都建左侧线程。大多数短 explorer 只需要把结果回到主会话，别污染侧边栏。

三种可见性：

- `visibility: "inline"`: 默认。worker 在后台跑，结果回主会话。
- `visibility: "desktop-thread"`: 明确进入左侧线程，适合长任务、写文件 worker、需要单独追问的 worker。
- `visibility: "auto"`: 由 Codex 按任务长度、风险、是否写文件、是否需要后续继续聊来决定。

不管 worker 是否进左侧，最终结果都必须回到发起 CWF 的当前会话。

## 它解决什么问题

CWF 不是为了“显得高级”才多 agent。它主要解决单个长上下文容易出现的三类失败：

- `agentic laziness`: 长任务只做了一部分就说完成。
- `self-preferential bias`: 同一个 agent 写答案，又自己给自己当裁判。
- `goal drift`: 多轮执行或压缩后，原始目标和限制慢慢丢失。

CWF 的结构性解法是：隔离 worker 上下文、让独立 verifier 审查、写清楚 stop condition，并由主会话最终收口。

## 有边界的动态工作流

CWF 会吸收 Claude Dynamic Workflows 里真正有价值的东西：动态生成编排、并行拆任务、反证验证、保存进度、最后统一汇总。但我们不追“几百个 agent”的炫技，也不搞隐藏 scheduler 或外部 runtime。

对 CWF 来说，`dynamic` 是 Codex 会根据当前任务生成或调整 run plan；`bounded` 是每次正式开跑前必须有范围、预算、隔离、verifier 和停止条件。

适合大规模 migration、repo audit、bug hunt、source-backed research、adversarial review、safe fix loop。不适合日常小改，因为那会浪费 token，也会让流程变重。

## 运行体验

CWF 跑复杂任务前应该先展示 harness preview：会用什么模式、分几个阶段、派哪些 worker、哪些进左侧线程、预算多少、怎么隔离不可信输入、什么时候停。

非 trivial 任务还应该展示 run plan：范围、阶段、worker、verifier/challenger、写入边界、不可信输入路径、预算和停止条件。

运行中只给紧凑状态：当前阶段、worker 完成/阻塞、耗时、预算压力。inline worker 不刷屏；只有值得继续看的 worker 才进左侧线程。

取消时要停止继续派工，并汇总已知结果。恢复时从上次阶段和已有 worker 输出继续；如果状态不完整，必须说明并从最小安全 checkpoint 重启。

生成本地 preview：

```bash
node scripts/cwf-run-preview.mjs workflows/repo-audit.workflow.js
```

生成并保存有边界的 run plan：

```bash
node scripts/cwf-run-plan.mjs workflows/repo-audit.workflow.js --objective "audit this repo" --run-id demo
```

记录 cancel / resume fixture 状态：

```bash
node scripts/cwf-run-state.mjs init --run-id demo --workflow workflows/repo-audit.workflow.js
```

run state 和 run plan 放在已忽略的 `.cwf/runs/RUN_ID/`，不会进入 npm package。

当前 MVP 证据汇总在 [docs/CWF_MVP_EVIDENCE.md](docs/CWF_MVP_EVIDENCE.md)，里面明确区分 real-smoke、fixture、dry-run、approval-gated 和 deferred。

## Budget 和隔离

每个可复用 workflow 都应该写清楚预算和停止规则。动态工作流很容易比普通单轮多消耗 5-10 倍 token，预算必须显式可见。

任何读取用户反馈、网页、issue、support ticket、X 内容等不可信输入的 workflow，都要用 quarantine：

- 读原始不可信内容的 agent 只能只读；
- 真正写文件或执行动作的 worker 只能拿到清洗后的摘要；
- 涉及 deploy、数据库、支付、权限、凭据、不可逆外部写入时必须先要明确批准。

## 保存成 Skill

跑得好的 workflow 应该保存成模板，并随 Codex skill 分发。保存后的 workflow 仍然是可调整的 harness/spec，不是逐字执行的脚本。

## 什么时候用

适合：

- repo audit / release review
- root-cause investigation
- adversarial verification
- safe fix loop
- UI / copy / design review
- migration / refactor plan
- claim checking
- tournament / sorting / 多方案评估

不适合：

- 单文件小改
- 普通 lint/test
- 一句话能做完的常规编码
- 为了看起来高级而硬开多 agent

## 检查

```bash
npm run check
```

这个检查只验证 native skill 和 workflow 模板，不再构建外部 runtime。
