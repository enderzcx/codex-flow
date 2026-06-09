---
half_life: 30d
archive_at: 2026-07-08
---

# CWF vs Claude Dynamic Workflows

这份对比写的是当前 CWF 设计目标，不是声称已经完整复刻 Claude Dynamic Workflows。

| 维度 | Claude Dynamic Workflows | CWF |
|---|---|---|
| 产品层级 | Claude Code 官方 research preview，CLI / Desktop / VS Code / API 等路径可用。 | GitHub repo + Codex skill + 可选 Codex SDK / Desktop thread / heartbeat adapter，靠当前 Codex host 暴露的原生能力。 |
| 核心原理 | Claude 动态写 orchestration scripts，并在对话外协调运行。 | Codex 主会话选择或生成 `workflow.js` harness，生成 bounded run plan，再调度 native Codex subagents。 |
| JS 的角色 | 更像真正的 orchestration script，由平台 runtime 执行。 | `workflow.js` 是 data/spec harness；CWF 不把它当 unrestricted Node 脚本执行。 |
| 动态性 | Claude 会按 prompt 动态计划、拆分、fan-out、验证、继续迭代。 | CWF 会动态生成或调整 run plan，但必须 bounded：scope、budget、quarantine、stop rule、verifier 先写清楚。 |
| 规模 | 官方强调 tens to hundreds parallel subagents，适合超大 migration / audit。 | 默认少量高质量 worker；需要更多 worker 时由 run plan 说明原因，避免默认 agent swarm。 |
| 主会话是否等待 | 平台级 workflow 可在对话外跑，最后给 coordinated answer。 | 短任务 `foreground` 等；长任务 `background` 跑；需要回到原会话时用 `background+heartbeat` 请求唤醒原会话，真实 marker 回帖后才算送达。 |
| 结果返回 | 平台内置，最后回一个 coordinated answer。 | 已支持 coordinator synthesis；异步场景可以调度 heartbeat，但只有真实 marker 回到发起会话后才算 heartbeat synthesis；不声称 SDK 自动 callback。 |
| 左侧线程 | Claude 是平台自己的 workflow / agent UX。 | CWF 只有选中的 `desktop-thread` worker 进 Codex Desktop 左侧；SDK background worker 默认安静运行，不保证左侧可见。 |
| 写文件 | Claude 可做大规模 end-to-end migration。 | CWF 写入更保守：approval-gated patch / safe write；Desktop-thread worker 主要诊断、计划、提 patch，不默认直接写。 |
| 恢复 / 长跑 | 官方说 progress saved，可做小时级/天级任务恢复。 | CWF 用 `.cwf/runs/RUN_ID/` 记录 state / run plan / final / return envelope；本地可恢复，不是 hosted runtime。 |
| 权限 / 管理 | Enterprise 可用 managed settings / role 控制开关。 | 继承 Codex sandbox / approval policy；没有企业 admin 层。 |
| 成本控制 | 官方明确提醒 token 会明显高于普通 session。 | CWF 强制 budget / stop rule；token accounting 目前标记为 estimated 或 host-provided。 |
| 安全边界 | 平台负责大部分 runtime 和权限边界，但仍需防 prompt injection / secret leakage。 | CWF 明确 quarantine raw input；不可信输入 reader 只读；写入、deploy、数据库、凭据、不可逆动作必须 gate。 |
| 最终目标 | Claude 官方平台级动态 workflow。 | Codex 原生 bounded dynamic workflow：把 Codex 现有 subagent、thread、SDK、heartbeat 能力吃满，但不重复造完整平台。 |

## 人话版

Claude Dynamic Workflows 更像“平台里长出一个会写脚本、会派很多 agent、会自己收口的总调度”。

CWF 的目标不是照抄平台，而是在 Codex 里做一个更轻、更可控的版本：Codex 还是主脑，`workflow.js` 是计划模板，worker 只在值得时拆出去，长任务可以后台跑，重要 worker 可以进左侧线程，最后结果回到发起的这条 Codex 会话。

能做到的体验：

- 小任务直接前台跑完；
- 长任务后台跑，不让主会话一直卡着；
- 跑完后可调度 heartbeat 回原会话总结，但必须观测到真实 marker 才算送达；
- 少数重要 worker 出现在左侧线程，方便单独看、继续问、检查证据；
- 写文件仍走安全 gate，不因为“动态”就变成无限权限。
