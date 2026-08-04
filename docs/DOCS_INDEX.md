# Wedai 文档索引

商业化与二次开发相关文档入口（不含上游 LobeHub 完整 docs 树）。

## 商业化

| 文档 | 说明 |
|------|------|
| [commercial/OVERVIEW.md](./commercial/OVERVIEW.md) | 商业能力总览、双模式、阶段状态 |
| [commercial/BYOK.md](./commercial/BYOK.md) | 用户自配 API 与计费分支 |
| [commercial/ADMIN_UI.md](./commercial/ADMIN_UI.md) | 管理后台功能、权限、配置约定 |

## 架构

| 文档 | 说明 |
|------|------|
| [architecture/REALTIME.md](./architecture/REALTIME.md) | WebSocket / SSE / HTTP 流分工 |
| [architecture/CHAT_OPTIMIZATION.md](./architecture/CHAT_OPTIMIZATION.md) | 网页聊天优化 backlog |

## 部署

| 文档 | 说明 |
|------|------|
| [deploy/ONE_CLICK.md](../deploy/ONE_CLICK.md) | Docker 一键部署 |
| [deploy/README.md](../deploy/README.md) | 部署目录说明 |

## 验收（QA）

| 文档 | 说明 |
|------|------|
| [qa/ACCEPTANCE_USER_BILLING.md](./qa/ACCEPTANCE_USER_BILLING.md) | 用户与付费完整验收 |
| [qa/ACCEPTANCE_30MIN.md](./qa/ACCEPTANCE_30MIN.md) | 30 分钟 P0 冒烟 |
| [qa/WEBHOOK_IDEMPOTENCY.md](./qa/WEBHOOK_IDEMPOTENCY.md) | 支付回调幂等 |
| [qa/TEST_CASES.csv](./qa/TEST_CASES.csv) | 用例表 |

## 工程与同步

| 文档 | 说明 |
|------|------|
| [IMPORT_LOBEHUB.md](./IMPORT_LOBEHUB.md) | 官方源码导入与同步 |
| [CODEX_TASK.md](./CODEX_TASK.md) | Codex 任务边界摘要 |
| 根目录 [README.md](../README.md) | 商业化规划 + 上游说明 |

## 维护约定

1. 商业能力变更时同步更新 `commercial/OVERVIEW.md` 状态表。
2. 新增验收项写入 `docs/qa/`，不要只改口头约定。
3. 密钥、PAT、真实 `.env` 禁止写入任何 Markdown。
