# 实时通信架构

## 1. 协议分工（不要混用）

| 场景 | 协议 | 包 / 路径 | 说明 |
|------|------|-----------|------|
| **Agent 执行流** | **WebSocket** | `packages/agent-gateway-client` | 步骤事件、工具结果回传、中断、断线回放 |
| 设备 Gateway | **WebSocket** | `packages/device-gateway-client` | 设备侧实时 |
| 文档协同 | **SSE** | `src/features/PageEditor/useResourceEvents.ts` | `text/event-stream` |
| 话题评论 | **SSE** | `src/features/Portal/TopicComments/useTopicCommentEvents.ts` | 评论事件推送 |
| **普通 Chat 流式输出** | **HTTP 流 / SSE** | Chat completion 路径 | token 级输出，非 WebSocket |

结论：

- 网页「打字机效果」主要靠 HTTP 流式渲染优化，**不必**整段改成 WebSocket。
- Agent 长任务、工具调用、刷新后续看进度 → 使用已有 WebSocket 客户端。

## 2. AgentStreamClient 能力摘要

位置：`packages/agent-gateway-client/src/client.ts`

| 能力 | 行为 |
|------|------|
| 鉴权 | 连接后发送 `auth`；`auth_failed` 断开；`auth_expired` 由上层换 token 后 `reconnect()` |
| 心跳 | 30s 一次；连续丢失 3 次强制重连 |
| 重连 | 指数退避 1s → 2s → … → 30s |
| 回放 | `lastEventId` + `resume` + `resume_complete`，避免漏事件与误判结束 |
| 双向 | 客户端可发 `interrupt`、`tool_result` |
| 会话结束 | 仅当本 `operationId` 的终端事件才断开，避免多路复用误关 |

## 3. 网页聊天相关建议

| 目标 | 做法 |
|------|------|
| 流式更顺 | 优化 HTTP 流消费与 Markdown 分块渲染 |
| Agent 体验 | UI 展示 `connecting / connected / reconnecting`；Stop 调 `sendInterrupt` |
| 余额 / 订单推送 | 优先「写库 + 查询」；可选 SSE 增强体验，不作为资金一致性依据 |
| 多端同步同一会话 | 高成本，建议商业化 Phase 2+ |

## 4. 安全与运维

- 生产仅使用 `wss://` / HTTPS
- WS 鉴权 token 短时有效，支持过期刷新
- 网关与反向代理需开启 WebSocket 升级（`Upgrade` / `Connection`）
- 监控：连接数、重连率、心跳超时、`auth_failed` 次数
