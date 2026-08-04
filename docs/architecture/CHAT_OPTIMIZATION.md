# 网页聊天优化

面向 Wedai Web 对话页的体验与性能 backlog。实现时优先改 UI / 渲染层，**不改** agent-runtime / model-runtime 核心。

## 1. 性能（P0）

| 项 | 建议 | 相关区域 |
|----|------|----------|
| 长对话卡顿 | 消息列表虚拟滚动，只渲染可视区 | `src/features/Conversation` |
| 流式重绘过多 | Markdown 分块更新、合并 setState | 消息气泡 / Markdown |
| 切换会话白屏 | 会话级缓存 + skeleton | topic / session store |
| 首屏体积 | 插件、工具面板、次要面板懒加载 | route dynamic import |
| 附件 | 图片懒加载 + 固定占位，减少 CLS | Attachment / 消息附件 |

## 2. 交互（P1）

| 项 | 建议 |
|----|------|
| 输入区 | 固定底栏、自适应高度；Enter 发送 / Shift+Enter 换行可配置 |
| 滚动 | 生成中贴底；用户上滑后不强制跳回；提供「回到底部」 |
| 移动端 | 键盘避让、侧栏抽屉、触控热区 ≥ 44px |
| 停止 / 重试 | 流式可 Stop；失败可重试且与计费释放一致 |
| 模型切换 | 强化 `ModelSelect` / `ModelSwitchPanel`，显示平台 vs BYOK |

## 3. 商业化外显（P1）

- 显示当前余额 / 套餐（平台模式）
- 标明「平台模型 · 扣积分」或「自有 API · 不扣积分」
- 余额不足：发送前拦截，不发起模型请求，引导充值
- 可选：发送前预估消耗积分

规则细节见 [BYOK.md](../commercial/BYOK.md)。

## 4. 实时通道（勿误改）

- 普通 Chat：**HTTP 流** 为主
- Agent：**WebSocket**（`AgentStreamClient`）
- 详见 [REALTIME.md](./REALTIME.md)

## 5. 验收清单（聊天体验）

- [ ] 500+ 条消息滚动仍流畅（虚拟列表）
- [ ] 流式输出无明显整页闪烁
- [ ] 移动端输入不被系统键盘遮挡
- [ ] 平台模式余额不足无法发出请求
- [ ] BYOK 模式可正常流式且不扣积分
- [ ] Agent 任务可显示连接状态并支持中断
