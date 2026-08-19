# 付费通道审计（P2-3）

> 审计基准：`cursor/admin-trpc-wiring-9824`，2026-08-19。

## 1. 所有会产生 API 成本的服务端通道

### 1.1 已计费 ✅

| 通道 | 入口路径 | 计费方式 |
|------|----------|----------|
| 文本对话（流式/非流式） | `src/app/(backend)/webapi/chat/[provider]/route.ts` | hold → onUsage settle / release |
| 图片生成 | `apps/server/src/routers/lambda/image/index.ts` + `async/image.ts` | per-image requestCreditsFlat hold/settle/release |
| 视频生成 | `apps/server/src/routers/lambda/video/index.ts` + `async/video.ts` | per-generation requestCreditsFlat hold/settle/release |

### 1.2 内部调用（平台自担）⚠️

| 通道 | 入口路径 | 说明 |
|------|----------|------|
| 语音转文字（ASR） | `apps/server/src/routers/lambda/asr.ts` | 系统功能，不向用户收费 |
| 文档 embedding | `apps/server/src/routers/async/file.ts` | 知识库处理，平台成本 |
| RAG 评测 | `apps/server/src/routers/async/ragEval.ts` | 开发功能，平台成本 |
| 结构化提取（generateObject） | `apps/server/src/routers/lambda/aiChat.ts` | 话题标题等内部生成 |
| 记忆提取 | `apps/server/src/services/memory/userMemory/**` | 用户记忆，不单独计费 |
| AgentSignal 意图分析 | `apps/server/src/services/agentSignal/policies/**` | 后台分析，平台成本 |

### 1.3 未计费（已知缺口）❌

| 通道 | 入口路径 | 缺口描述 | 修复阶段 |
|------|----------|----------|---------|
| Agent 多步 LLM | `apps/server/src/modules/AgentRuntime/adapters/ServerLLMTransport.ts` | 每步调 `modelRuntime.chat()` 无任何 hold/settle；平台承担所有 agent LLM 成本 | Phase 3 |
| Tool 调用触发的 LLM | 同上 | tool 在 agent 执行内，同路径 | Phase 3 |

---

## 2. BYOK 计费开关

功能开关通过环境变量控制，默认兼容现网行为：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `BYOK_ALLOWED` | `true` | 允许用户自带 Key，绕过平台积分 |
| `BYOK_GATEWAY_FEE_ENABLED` | `false` | 对 BYOK 请求收取小额平台网关费 |

**行为矩阵**：

| BYOK_ALLOWED | BYOK_GATEWAY_FEE_ENABLED | 用户有 provider key | chargeMode |
|:---:|:---:|:---:|:---:|
| true | false | 是 | `byok`（不扣费） |
| true | true | 是 | `gateway_fee`（扣小额） |
| true | — | 否 | `platform`（正常扣费） |
| false | — | 是/否 | `platform`（强制扣费） |

`gateway_fee` 模式目前走 `platform` 路径（`requiresPlatformCharge` 返回 true），实际扣费量与 `platform` 相同。Phase 3 可以在 `chargeBeforeChat` 中为 `gateway_fee` 设置更低的折扣费率。

### 2.1 配置示例

```bash
# 允许 BYOK，不收网关费（默认，兼容现网）
# 不需要设置任何变量

# 全部强制平台计费（企业模式）
BYOK_ALLOWED=false

# 允许 BYOK 但收小额网关费
BYOK_GATEWAY_FEE_ENABLED=true
```

---

## 3. 每日免费额度（可选，Phase 3）

设计建议（未实现）：

- 在 `ledger_entries` 新增 `kind='daily_free'` 类型（每日凌晨 cron 写入）
- `chargeBeforeChat` 优先消耗 `daily_free` 余额，不足再走 `available`
- 免费额度不可提现、不累计、每日刷新（通过 ledger 可审计）
- 与 hold/settle/release 路径完全兼容，只是消耗来源不同
