# Codex 任务说明（给人看的摘要）

完整可复制提示词见仓库外对话，或直接使用下方「Codex 提示词」一节。

## 目标

1. 将官方 `lobehub/lobehub`（canary）源码完整导入本仓库 `1004cq/Wedai`
2. 保留并合并本仓库已有文档与 APISIX 配置
3. 搭好商业化二次开发骨架（billing / admin），不破坏官方核心

## 已存在文件（导入后勿丢）

- README.md（商业化规划）
- docs/IMPORT_LOBEHUB.md
- docs/apisix/PROGRESSIVE_SETUP.md
- docs/apisix/JWT_RS256.md
- apisix/config.yaml
- docker-compose.apisix.yml

## 2026-08-02 完成项

- 已导入官方 `canary` 完整工作树。
- 已保留本文件列出的 README、APISIX 文档和配置。
- 已新增 `packages/billing`、`src/features/billing`、`src/features/admin`、
  `src/features/user-center` 占位说明，以及 `packages/database/README_WEDAI.md`。
- 计费边界保持为 Model Runtime / tRPC 外围中间件，用户系统复用 Better Auth。
