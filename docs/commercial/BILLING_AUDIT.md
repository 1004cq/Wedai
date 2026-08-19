# Wedai 模型调用计费路径审计

> 审计基准：`main`（commit `15eb1f3`，Phase 1+2 合入），2026-08-19。
> 审计范围：所有服务端会触发模型/生成成本的入口。

---

## 1. 入口路径 ↔ 计费函数对照表

### 1.1 文本 Chat（已接线 ✅）

| 入口路径 | 计费函数 | 状态 | 说明 |
|----------|----------|------|------|
| `src/app/(backend)/webapi/chat/[provider]/route.ts` | `chargeBeforeChat` + `chargeAfterChat` | ✅ 已接线 | SPA 客户端直接调用；BYOK（`modelRuntime.baseURL !== undefined`）跳过；平台模式预占 → 结算/释放 |

路由调用链：
```
浏览器 → POST /webapi/chat/{provider}
  → checkAuth (userId, serverDB)
  → chargeBeforeChat()    ← 预占 / InsufficientBalanceError → 402
  → modelRuntime.chat()   ← provider call
  → chargeAfterChat()     ← settle / release
```

失败/中断处理：
- `providerError` 抛出 → `chargeAfterChat({ success: false })` → `release` hold
- 客户端断开（`req.signal.aborted`）→ fire-and-forget settle（**见风险 §4.1**）

---

### 1.2 Agent / 多步 / Task（✅ 已接线，P3）

| 入口路径 | 计费函数 | 状态 | 说明 |
|----------|----------|------|------|
| `apps/server/src/modules/AgentRuntime/adapters/ServerLLMTransport.ts` | `withAgentBilling` | ✅ 已接线 | `stream()` 和 `runAttemptWithRuntime()` 均通过 `withAgentBilling` 包装；BYOK 跳过；platform hold → settle/release |
| `apps/server/src/modules/AgentRuntime/adapters/serverCallLlmAttempt.ts` | via `runAttemptWithRuntime` | ✅ 已接线 | 由 `runAttemptWithRuntime` 的 `withAgentBilling` 包装覆盖 |
| `apps/server/src/routers/lambda/aiAgent.ts`（`execAgent`） | via `ServerLLMTransport` | ✅ 间接覆盖 | 调用链最终到 `ServerLLMTransport`；计费在 transport 层挂钩，无需改 tRPC 路由 |
| `apps/server/src/services/aiAgent/index.ts` | via `ServerLLMTransport` | ✅ 间接覆盖 | 服务层调用 `AgentRuntimeService` → `ServerLLMTransport`（已包装） |
| `apps/server/src/services/agentRuntime/AgentRuntimeService.ts` | via `ServerLLMTransport` | ✅ 间接覆盖 | 多步执行协调器；每步触发 `ServerLLMTransport`（已包装） |

Agent 调用链：
```
aiAgent.execAgent (tRPC)
  → AgentRuntimeService.execute()
  → AgentRuntimeCoordinator
  → ServerLLMTransport.execute()
  → serverCallLlmAttempt.run()
  → modelRuntime.chat()  ← 无 charge 挂钩
```

**P3 已修复**：`withAgentBilling` 适配器覆盖 `stream()` 和 `runAttemptWithRuntime()`。BYOK 跳过，platform 模式 hold → settle / release。余额不足在 provider 调用前失败。

---

### 1.3 结构化提取（无用户直接费用，需评估）

| 入口路径 | 计费函数 | 状态 | 说明 |
|----------|----------|------|------|
| `apps/server/src/routers/lambda/aiChat.ts` → `generateObject` 过程 | — | ⚠️ 无计费（内部调用） | 用于服务端结构化提取（话题标题生成等），非直接用户请求；费用计入平台运营成本 |
| `apps/server/src/services/aiGeneration/index.ts` | — | ⚠️ 无计费（内部） | `AiGenerationService.generateObject()`；被 `aiChat.generateObject`、`systemAgent`、`taskLifecycle`、agentSignal 策略等调用 |
| `apps/server/src/routers/lambda/asr.ts` | — | ⚠️ 无计费 | 语音转文字；计入平台成本，无用户积分扣除 |
| `apps/server/src/services/agentSignal/policies/analyzeIntent/*.ts` | — | ⚠️ 无计费（内部） | 意图分析背景 LLM 调用 |
| `apps/server/src/services/memory/userMemory/persona/service.ts` | — | ⚠️ 无计费（内部） | 记忆提取 |
| `apps/server/src/routers/async/ragEval.ts` | — | ⚠️ 无计费 | RAG 评测异步任务 |
| `apps/server/src/routers/async/file.ts` | — | ⚠️ 无计费 | 文档处理 embedding |

> **评估**：以上为「平台内部消耗」，当前合理地不向用户收费。一旦用量规模增大，应决策是否对 agent/generateObject 路径按积分计费。

---

### 1.4 图片 / 视频生成（P2-1 已实现 ✅）

| 入口路径 | 计费函数 | 状态 | 说明 |
|----------|----------|------|------|
| `apps/server/src/routers/lambda/image/index.ts` | `chargeBeforeGenerate` + `chargeAfterGenerate` | ✅ 已接线 | 读 `model_prices.request_credits_flat`；0 = 免费；>0 = per-image hold/settle/release |
| `apps/server/src/routers/async/image.ts` | `chargeAfterGenerate` | ✅ 已接线 | `isError=true` → release；成功 → settle |
| `apps/server/src/routers/lambda/video/index.ts` | `chargeBeforeGenerate` + `chargeAfterGenerate` | ✅ 已接线 | 同上，per-generation flat |
| `apps/server/src/routers/async/video.ts` | `chargeAfterGenerate` | ✅ 已接线 | |

实现位置：
- `packages/business-server/src/image-generation/chargeBeforeGenerate.ts` — per-image hold，fail-closed（billing 异常用显式开关控制是否放行）
- `packages/business-server/src/image-generation/chargeAfterGenerate.ts` — settle / release
- `packages/business-server/src/video-generation/chargeBeforeGenerate.ts` — per-generation hold
- `packages/business-server/src/video-generation/chargeAfterGenerate.ts` — settle / release

**注意**：`request_credits_flat = 0` 表示免费模型（如开源模型）。付费模型需 Admin 通过 `admin.pricing.upsert` 配置非零费率，或运行 `pnpm db:seed:dev`（包含示例价格）。

---

### 1.5 模型列表（无模型调用费用）

| 入口路径 | 状态 | 说明 |
|----------|------|------|
| `src/app/(backend)/webapi/models/[provider]/route.ts` | ✅ 无需计费 | 只调用 provider model list API，不产生 token 消耗 |
| `src/app/(backend)/webapi/models/[provider]/pull/route.ts` | ✅ 无需计费 | 同上 |

---

## 2. 明显遗漏的修复

### 2.1 `webapi/chat` 客户端断开时的 settle（低优先级）

**问题**：`chargeAfterChat` 在 success 分支用 `void`（fire-and-forget）。若 Node.js 进程在 settle 写完之前退出，持有的 hold 不会被释放，直到人工对账。

**当前代码**（`route.ts` 第 80 行）：
```typescript
void chargeAfterChat({ ..., success: true, ... });
```

**影响**：低概率（settle 通常毫秒级完成），但 hold 不释放会显示为「冻结积分」。

**建议**：无需在本任务修复（对账任务 Phase 2 会处理），在缺口列表中记录即可。

### 2.2 Agent 路径（主要缺口，Phase 2 修复）

**问题**：`ServerLLMTransport` 直接调 `modelRuntime.chat()`，完全绕过 `chargeBeforeChat/chargeAfterChat`。所有 Agent 模式 LLM 调用均免费。

**修复位置**：`apps/server/src/modules/AgentRuntime/adapters/ServerLLMTransport.ts`

正确的接入点是在 `ServerLLMTransport.execute()` 或其调用 `createServerCallLlmAttempt()` 之前，传入 `userId`、`requestId`、`db` 并调用 `chargeBeforeChat`。难点：
- Agent 每一步都是独立的 requestId（需要从 `operationId + stepIndex` 派生）
- 流式中断时需要 release（当前 `serverCallLlmAttempt` 有 retry 逻辑，需配合）
- BYOK 判断需要读取 `keyVaults`（`ServerLLMTransport` 已有 `initModelRuntimeFromDB` 上下文）

**工作量**：中等，需修改 `ServerLLMTransport`、`RuntimeExecutorContext`（传入 `db`/`billing`），以及 agent 路由层传递 `billingContext`。

---

## 3. 生图/视频未接的缺口列表（Phase 2）

| 缺口 | 文件 | 需要实现的内容 |
|------|------|---------------|
| 图片生成预占 | `packages/business-server/src/image-generation/chargeBeforeGenerate.ts` | 读取 image model 积分单价，按 `imageNum` 预占；返回 `prechargeItems` |
| 图片生成结算 | `packages/business-server/src/image-generation/chargeAfterGenerate.ts` | 成功 → settle；失败/取消 → release |
| 视频生成预占 | `packages/business-server/src/video-generation/chargeBeforeGenerate.ts` | 读取 video model 积分单价，按时长/分辨率预占 |
| 视频生成结算 | `packages/business-server/src/video-generation/chargeAfterGenerate.ts` | 成功 → settle；失败/取消 → release |

插槽的接线代码已完整（`image/index.ts`、`async/image.ts`、`video/index.ts`、`async/video.ts` 均调用 `chargeBefore/AfterGenerate`），只需实现函数体。

---

## 4. 风险：哪些路径仍可能白嫖或漏释放 hold

| 风险 | 路径 | 严重程度 | 说明 |
|------|------|----------|------|
| **Agent 模式白嫖** | `aiAgent.execAgent` 及所有 task/group 场景 | 🔴 高 | 平台模式无预占，LLM 成本由平台承担但不扣用户积分 |
| **图片/视频白嫖** | `image/video` 所有路由 | 🟡 中 | `chargeBeforeGenerate` 返回无效结果，生成不扣费 |
| **success settle fire-and-forget 漏释放** | `webapi/chat` success 分支 | 🟢 低 | `void chargeAfterChat(...)` 若进程异常退出，hold 留在钱包冻结余额中，需对账清理 |
| **多步 agent 无 BYOK 检查** | `ServerLLMTransport` | 🔴 高（逻辑） | BYOK 用户也没有预占，但因为平台用户没有这个入口的积分扣减，当前是「平台承担 BYOK 用户成本」的 bug，而非「BYOK 用户被误扣」 |
| **ASR / generateObject 平台成本** | `asr.ts`、`aiGeneration` | 🟢 低（当前） | 内部调用，费用由平台承担；随用量增大会成为成本问题 |

---

## 5. 已正确处理的情况（确认 ✅）

- **webapi/chat BYOK**：`modelRuntime.baseURL !== undefined` 为 `true` → `chargeBeforeChat` 返回 `{ charged: false }` → 不预占、不结算
- **webapi/chat 余额不足**：`billingService.hold()` 抛 `PRECONDITION_FAILED` → `chargeBeforeChat` 重抛 `InsufficientBalanceError` → route 返回 402 → **provider 收不到请求**
- **webapi/chat provider 异常**：`providerError` catch → `chargeAfterChat({ success: false })` → `release` hold，净扣费 0
- **相同 requestId 重试**：`chargeBeforeChat` 使用 `buildIdempotencyKey('hold', billingAccountId, requestId)`，`WalletModel.hold()` 检查幂等键 → 不重复预占
- **concurrent hold 防超扣**：`WalletModel.hold()` 使用 `FOR UPDATE` 行锁 + version 乐观锁
