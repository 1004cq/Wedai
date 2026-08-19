# 流式/多步/中断计费场景矩阵

> 审计基准：`cursor/admin-trpc-wiring-9824`，2026-08-19。

## 1. 文本对话（`webapi/chat/[provider]`）

| 场景 | hold | settle/release | usage_record | 说明 |
|------|------|----------------|--------------|------|
| 正常完成（流式） | ✅ `chargeBeforeChat` | ✅ `chargeAfterChat(success=true)`，使用 `onUsage` 回调的真实 token 数 | ✅ 写入 | P2-2 修复：改为 `modelRuntime.chat({callback:{onUsage}})` 捕获真实 usage |
| 正常完成（非流式） | ✅ | ✅ | ✅ | 同上，`onUsage` 同样有效 |
| Provider 抛出异常 | ✅ | ✅ `success=false` → release，净扣费 0 | ❌ 不写 | 已正确处理 |
| 客户端 AbortError（断开） | ✅ | ✅ `catch(providerError)` 捕获 AbortError → release | ❌ 不写 | Next.js 传递 `req.signal` 给 modelRuntime |
| 进程崩溃（settle 未完成） | ✅ hold 留在 DB | ❌ hold 滞留 | ❌ | **已知风险**，由 P0-3 StaleHoldReaper（30min超时）清理 |
| BYOK 用户 | ❌ 不 hold | ❌ 不 settle | ❌ 不写 | `resolveChargeMode` 返回 byok，`billingContext.charged=false` |
| 余额不足 | hold 失败抛出 | ❌ provider 不被调用 | ❌ | InsufficientBalanceError → 402 → PlanLimitCard UI |
| 重复 requestId（重试） | ✅ 幂等 hold key | ✅ 幂等 settle/release key | ✅ 唯一索引防双写 | `billing:hold:{bac}:{requestId}` 唯一性保证 |

## 2. Agent 多步（`aiAgent.execAgent`→`ServerLLMTransport`）

| 场景 | 计费 | 状态 |
|------|------|------|
| 每步 LLM 调用 | ❌ 无任何 hold/settle | **已知缺口**（P2-2 记录，Phase 3 修复）|
| Tool 调用触发的 LLM | ❌ 无计费 | **已知缺口** |
| Agent 失败/中断 | ❌ 无 hold 可 release | 因无 hold，不会锁死余额 |
| BYOK agent | ❌ 无计费（正确） | — |

## 3. 图片生成（P2-1 已接线）

| 场景 | 计费 | 说明 |
|------|------|------|
| 正常生成 | ✅ per-image hold → settle | 走 `model_prices.request_credits_flat` |
| 生成失败/取消 | ✅ release | `chargeAfterGenerate(isError=true)` |
| 无价格配置（0） | ❌ 免费（兼容原行为） | 安全默认 |

## 4. 视频生成（P2-1 已接线）

| 场景 | 计费 | 说明 |
|------|------|------|
| 正常生成 | ✅ hold → settle | 走 `model_prices.request_credits_flat` |
| 失败/超时 | ✅ release | |
| 无价格配置（0） | ❌ 免费 | |

## 5. 其它通道（P2-3 缺口）

| 通道 | 入口 | 计费状态 |
|------|------|----------|
| ASR（语音转文字） | `apps/server/src/routers/lambda/asr.ts` | ❌ 无计费，平台自担 |
| Embeddings（知识库） | `apps/server/src/routers/async/ragEval.ts`、`file.ts` | ❌ 无计费，平台自担 |
| generateObject（结构化提取） | `apps/server/src/routers/lambda/aiChat.ts` | ❌ 无计费，内部调用 |
| Memory 提取 | `apps/server/src/services/memory/**` | ❌ 无计费，内部调用 |
| AgentSignal 意图分析 | `apps/server/src/services/agentSignal/policies/**` | ❌ 无计费，内部调用 |

## 6. P2-2 本次修复内容

**`src/app/(backend)/webapi/chat/[provider]/route.ts`**

- 新增 `modelRuntime.chat(data, { callback: { onUsage } })` 捕获流结束时的真实 token 数
- `rawUsage` 优先级：`capturedUsage（onUsage）> x-usage-total-tokens header > 预估值`
- 结算时使用真实 `inputTextTokens / outputTextTokens / totalTokens`，而非最大估算值

**影响**：用户实际被扣的积分从「最大可能 token 数」变为「实际消耗 token 数」，过充问题修复。

## 7. 已知风险汇总（待后续 Phase 修复）

| 风险 | 严重程度 | 路径 | 修复阶段 |
|------|----------|------|---------|
| Agent 每步 LLM 无计费 | 🔴 高（平台承担所有 agent 成本） | `ServerLLMTransport` | Phase 3 |
| settle fire-and-forget（进程崩溃滞留 hold） | 🟢 低（StaleHoldReaper 兜底） | `webapi/chat` | P0-3 已覆盖 |
| 流式 onUsage 未触发（provider 不报告） | 🟡 中（回退到 header/估算，可能多/少扣） | `webapi/chat` | 需 per-provider 测试 |
| ASR/embedding 无计费 | 🟢 低（内部成本，非用户可用表面） | `asr.ts`、`file.ts` | Phase 3 |
