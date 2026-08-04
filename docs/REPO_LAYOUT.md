# 仓库目录说明（Upstream vs Wedai）

本仓库 = **完整 LobeHub monorepo** + **Wedai 商业化叠加**。  
整理原则：**不挪动上游核心路径**，避免同步 `upstream/canary` 时冲突爆炸。

## 1. 一眼区分

| 标记 | 含义 |
|------|------|
| 【上游】 | 来自 lobehub/lobehub，尽量原样保留 |
| 【Wedai】 | 本仓库商业化新增或强定制 |
| 【混合】 | 上游目录内可有 Wedai 占位/扩展文件 |

## 2. 根目录

| 路径 | 归属 | 说明 |
|------|------|------|
| `README.md` | 【Wedai】 | 商业产品入口（简洁） |
| `README.zh-CN.md` | 【上游】 | 官方中文说明，保留备查 |
| `deploy/` | 【Wedai】 | 一键 Docker 商业栈 |
| `apisix/` | 【Wedai】 | 可选 API 网关 |
| `docker-compose.apisix.yml` | 【Wedai】 | APISIX Compose 入口 |
| `docker-compose/` | 【上游】 | 官方 compose 片段 |
| `apps/` `packages/` `src/` | 【上游】为主 | monorepo 主体 |
| `docs/` | 【混合】 | 见下一节 |
| `AGENTS.md` `DESIGN.md` 等 | 【上游】 | 官方工程/设计文档 |
| `.agents` `.codex` `.cursor`… | 【上游】 | 编辑器/Agent 配置，勿当业务代码 |

## 3. docs/

| 路径 | 归属 | 用途 |
|------|------|------|
| `DOCS_INDEX.md` | 【Wedai】 | **文档总入口** |
| `REPO_LAYOUT.md` | 【Wedai】 | 本文件 |
| `commercial/` | 【Wedai】 | 产品、BYOK、Admin |
| `architecture/` | 【Wedai】 | 实时协议、聊天优化 |
| `qa/` | 【Wedai】 | 验收与用例 |
| `CODEX_TASK.md` | 【Wedai】 | Codex 任务边界 |
| `IMPORT_LOBEHUB.md` | 【Wedai】 | 导入与同步官方 |
| `apisix/` | 【Wedai】 | 网关文档 |
| `usage/` `self-hosting/` `development/` `wiki/` `changelog/` `glossary*` | 【上游】 | 官方文档树 |

阅读顺序建议：`DOCS_INDEX` → `commercial/OVERVIEW` → `qa/ACCEPTANCE_*` → `deploy/ONE_CLICK`。

## 4. 商业代码落点（约定）

| 路径 | 说明 |
|------|------|
| `packages/billing/` | 计费引擎 package（新建） |
| `packages/database/` 扩展 schema | 订单/流水等，见 `README_WEDAI.md` |
| `src/features/admin/` | 管理后台 |
| `src/features/billing/` | 用户侧充值/流水 |
| `src/features/user-center/` | 用户中心 |
| `deploy/` | 生产一键部署，与官方 `docker-compose/` 分开 |

**不要**为了「整齐」把官方 `src/features/Conversation` 等大目录改名或搬迁。

## 5. 部署相关为何有两套

| 路径 | 给谁用 |
|------|--------|
| `deploy/one-click-*.sh` + `docker-compose.commercial.yml` | Wedai 商业一键（app+PG+Redis+RustFS+SearXNG） |
| `docker-compose/`、官方文档 self-hosting | 上游标准自托管 |
| `apisix/` + `docker-compose.apisix.yml` | 可选网关，与一键栈独立 |

日常商业部署只看 **`deploy/`** 即可。

## 6. 刻意不整理的部分

- 不合并/删除上游 `docs/usage` 等大文档树（同步成本高）。  
- 不重排 `packages/*`、`apps/*`。  
- 不把 `README.zh-CN.md` 改成 Wedai 文案（保留上游对照）。  

若只感觉「乱」，优先改 **README + docs 索引 + 本布局说明**，而不是动源码树。
