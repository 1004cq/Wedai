# Wedai 文档索引

> 从这里开始。商业化文档与上游官方文档已分区；目录归属见 [REPO_LAYOUT.md](./REPO_LAYOUT.md)。

## 先看这些

| 文档 | 说明 |
|------|------|
| [REPO_LAYOUT.md](./REPO_LAYOUT.md) | 仓库哪些是上游、哪些是 Wedai |
| [commercial/OVERVIEW.md](./commercial/OVERVIEW.md) | 商业能力总览与阶段状态 |
| [../deploy/ONE_CLICK.md](../deploy/ONE_CLICK.md) | Docker 一键部署 |
| [qa/ACCEPTANCE_30MIN.md](./qa/ACCEPTANCE_30MIN.md) | 30 分钟冒烟验收 |

## 商业化

| 文档 | 说明 |
|------|------|
| [commercial/OVERVIEW.md](./commercial/OVERVIEW.md) | 双模式、后台模块、实现状态 |
| [commercial/BYOK.md](./commercial/BYOK.md) | 用户自配 API 与计费分支 |
| [commercial/ADMIN_UI.md](./commercial/ADMIN_UI.md) | 管理后台路由、权限、配置约定 |

## 架构

| 文档 | 说明 |
|------|------|
| [architecture/REALTIME.md](./architecture/REALTIME.md) | WebSocket / SSE / HTTP 流分工 |
| [architecture/CHAT_OPTIMIZATION.md](./architecture/CHAT_OPTIMIZATION.md) | 网页聊天优化 backlog |

## 部署

| 文档 | 说明 |
|------|------|
| [../deploy/ONE_CLICK.md](../deploy/ONE_CLICK.md) | 商业一键部署（主入口） |
| [../deploy/README.md](../deploy/README.md) | deploy 目录说明 |
| [apisix/](./apisix/) | 可选 APISIX 网关文档 |

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
| [../README.md](../README.md) | Wedai 产品 README |
| [../README.zh-CN.md](../README.zh-CN.md) | 上游 LobeHub 中文说明（对照用） |

## 上游官方文档树（一般不改）

| 路径 | 说明 |
|------|------|
| `usage/` | 官方使用说明 |
| `self-hosting/` | 官方自托管与环境变量 |
| `development/` | 官方开发文档 |
| `wiki/` `changelog/` `glossary*` | 官方 wiki / 术语 |

## 维护约定

1. 商业能力变更 → 更新 `commercial/OVERVIEW.md` 状态表。  
2. 新验收项 → 只加在 `docs/qa/`。  
3. 密钥、PAT、真实 `.env` → 禁止写入任何 Markdown。  
4. 不随意搬迁 `apps/` `packages/` `src/` 上游路径。  
