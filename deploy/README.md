# Wedai 部署目录

本目录是 Wedai 商业化版本的自托管入口，保留并复用官方 LobeHub 的 Dockerfile、RustFS bucket 策略和 SearXNG 配置，不修改 Agent Runtime / Model Runtime 核心。

## 文件说明

| 文件                            | 用途                                                   |
| ------------------------------- | ------------------------------------------------------ |
| `docker-compose.commercial.yml` | Wedai 应用、固定版本基础设施、`core/full` profile 编排 |
| `.env.commercial.example`       | 可提交的环境变量模板，不包含真实密钥                   |
| `one-click-up.sh`               | 环境检查、分段计时、缓存构建或拉取镜像、启动服务       |
| `one-click-down.sh`             | 停止服务；默认保留数据卷                               |
| `ONE_CLICK.md`                  | 从零部署、生产配置、更新与排障说明                     |
| `Makefile`                      | `make up/down/logs/ps/config` 快捷入口                 |

## 与官方 Compose 的关系

- `docker-compose/deploy/docker-compose.yml` 是随上游同步保留的官方配置。
- `deploy/docker-compose.commercial.yml` 是 Wedai 的正式部署入口，使用独立 Compose 项目名并关闭 PostgreSQL、Redis 的公网端口。
- 两套 Compose 不应同时启动。Wedai 环境统一使用本目录脚本，避免容器、端口和数据卷冲突。
- APISIX 是可选的渐进式网关层，继续由 `docker-compose.apisix.yml` 管理，不包含在基础一键部署中。

完整步骤见 [ONE\_CLICK.md](./ONE_CLICK.md)。

生产部署优先使用 GHCR 预构建镜像；源码 build 留给具备至少 8 GiB 内存的开发机 / 构建机。镜像发布工作流位于 [`.github/workflows/publish-wedai-image.yml`](../.github/workflows/publish-wedai-image.yml)。
