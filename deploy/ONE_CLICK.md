# Wedai Docker 一键部署

本方案从当前仓库启动 Wedai Web 应用、PostgreSQL、Redis、RustFS，并可选启动 SearXNG。真实配置只保存在已被 Git 忽略的 `deploy/.env.commercial`，不会写入镜像层。

## 1. 推荐路径与前置条件

生产服务器和低配机器默认推荐 `image` 模式：直接拉取 CI 预构建的 `ghcr.io/1004cq/wedai`，无需在服务器编译 LobeHub monorepo。

- Docker Engine 24+ 或 Docker Desktop；
- Docker Compose v2，命令为 `docker compose`；
- 镜像模式建议至少 2 核、4 GiB 内存和 15 GiB 可用磁盘；
- 源码冷构建建议至少 4 核、8 GiB 内存和 25 GiB 可用磁盘；
- 本地源码构建会显式启用 `DOCKER_BUILDKIT=1`，使用 pnpm、Next.js 和 Turbo 构建缓存。

> 首次冷构建仍然慢是正常现象。小内存生产服务器不要使用 `build` 模式；应在 GitHub Actions 或独立构建机生成镜像，再用 `image` 模式部署。

## 2. 最短启动流程

在仓库根目录执行：

```bash
./deploy/one-click-up.sh
```

首次执行会创建 `deploy/.env.commercial`、设置权限并退出。编辑其中所有 `CHANGE_ME_*`：

```bash
openssl rand -hex 32    # AUTH_SECRET / POSTGRES_PASSWORD
openssl rand -base64 32 # KEY_VAULTS_SECRET
openssl rand -hex 16    # RUSTFS_ACCESS_KEY
openssl rand -hex 32    # RUSTFS_SECRET_KEY
```

将输出分别填入对应变量，不要把真实值提交到 Git。确认部署方式后再次执行：

```bash
./deploy/one-click-up.sh
```

默认访问地址是 <http://localhost:3210>，对象存储 API 是 <http://localhost:9000>，RustFS 管理端仅绑定 `127.0.0.1:9001`。

## 3. 两种应用镜像模式

### 3.1 预构建镜像（生产推荐）

仓库的 `.github/workflows/publish-wedai-image.yml` 会在 `main`、`v*` tag 或手动触发时，使用原生 amd64/arm64 runner 分别构建、按 digest 推送，再合并多架构 manifest：

- `ghcr.io/1004cq/wedai:<完整-git-sha>`：不可变生产 / 回滚标签；
- `ghcr.io/1004cq/wedai:main`：便捷标签，指向最新 main；
- `ghcr.io/1004cq/wedai:<git-tag>`：发布 tag 触发时生成。

首次验证可使用：

```dotenv
WEDAI_DEPLOY_MODE=image
WEDAI_IMAGE=ghcr.io/1004cq/wedai:main
```

生产验证后，将 `WEDAI_IMAGE` 改成工作流生成的完整 git SHA 标签。若 GHCR package 尚未设为公开，服务器需先登录：

```bash
printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u 1004cq --password-stdin
```

`GHCR_TOKEN` 只在当前 shell / 安全密钥系统中提供，不写入 `.env.commercial`。image 拉取失败时脚本会直接停止并提示镜像不存在、未登录或架构不匹配；启动阶段还会使用 `--no-build --pull never`，不会静默回退到本地 build。

### 3.2 从当前源码构建

仅适合开发机或构建机：

```dotenv
WEDAI_DEPLOY_MODE=build
WEDAI_IMAGE=wedai:local
WEDAI_BUILD_CACHE_FROM=ghcr.io/1004cq/wedai:main
```

脚本执行 `docker compose build app`。Dockerfile 使用 BuildKit cache mount 保留：

- pnpm store 与 npm 下载缓存；
- `.next/cache`；
- `.turbo`。

Compose 的 `cache_from` 还会尝试复用 `WEDAI_BUILD_CACHE_FROM` 的已发布镜像层；远端缓存不可用时，本地 BuildKit 缓存仍可工作。手工构建时使用：

```bash
DOCKER_BUILDKIT=1 docker compose \
  --env-file deploy/.env.commercial \
  -f deploy/docker-compose.commercial.yml \
  build app
```

Linux 物理内存低于约 7 GiB 时脚本默认拒绝源码构建。只有明确理解 OOM 和长期 I/O 阻塞风险时，才设置：

```dotenv
WEDAI_ALLOW_LOW_MEMORY_BUILD=1
```

## 4. core /full 服务 profile

默认 `full` 保留完整功能：PostgreSQL、Redis、RustFS 和 SearXNG。

```dotenv
WEDAI_PROFILE=full
SEARXNG_URL=http://searxng:8080
```

开发、演示或网络较慢时可切换 `core`：

```dotenv
WEDAI_PROFILE=core
```

`core` 不拉取也不启动 SearXNG，至少少一个约 90 MB 压缩镜像；脚本会把应用容器的 `SEARXNG_URL` 置空。依赖联网搜索的功能在 core 下不可用。由 full 切换到 core 再执行脚本时，已有 SearXNG 容器会被停止并移除，数据卷不受影响。

## 5. 拉取并行与速度优化

build 模式默认在编译应用的同时拉取 PostgreSQL、Redis、RustFS、mc，以及 full 模式下的 SearXNG：

```dotenv
WEDAI_PARALLEL_INFRA_PULL=1
```

慢磁盘、受限带宽或 CPU / 内存紧张时改为 `0`，避免并行任务争抢资源。脚本会分别输出 “校验 /pull 或 build /up” 的耗时和部署总耗时。

| 场景                       | 推荐配置                 | 定性预期                                                    |
| -------------------------- | ------------------------ | ----------------------------------------------------------- |
| 生产或低配服务器           | `image` + 完整 SHA       | 主要耗时是下载镜像，通常数分钟内进入启动阶段                |
| 开发机首次冷构建           | `build` + ≥8 GiB         | pnpm 下载和 Next.js 全量构建仍会较慢                        |
| 仅修改业务源码后的二次构建 | `build` + BuildKit cache | 依赖下载层应命中，Next/Turbo 可复用转换缓存，明显快于冷构建 |
| 快速开发环境               | `core`                   | 少拉取、少启动一个 SearXNG 服务                             |

常见慢因：首次没有缓存、Docker Desktop 分配内存不足、跨境镜像网络慢、磁盘空间不足、QEMU 跨架构构建，以及频繁修改 `package.json`/workspace 包导致依赖层失效。中国大陆构建机可保留 `USE_CN_MIRROR=true`。

## 6. 固定依赖镜像与升级

`.env.commercial.example` 当前固定以下版本，不使用 `latest`：

```dotenv
WEDAI_POSTGRES_IMAGE=paradedb/paradedb:0.24.3-pg17
WEDAI_REDIS_IMAGE=redis:7.4.10-alpine3.21
WEDAI_RUSTFS_IMAGE=rustfs/rustfs:1.0.0-beta.10
WEDAI_RUSTFS_MC_IMAGE=minio/mc:RELEASE.2025-08-13T08-35-41Z
WEDAI_SEARXNG_IMAGE=searxng/searxng:2026.7.28-c01178d03
```

升级时一次只改一个变量：先备份 PostgreSQL/RustFS 数据，在测试环境执行 `one-click-up.sh`，检查 `compose ps`、应用日志、上传下载和数据库迁移，再提交版本变更。生产回滚时恢复旧 tag 并重新执行脚本。对更严格的供应链环境，可进一步把固定 tag 替换为经验证的多架构 manifest digest。

## 7. 域名和反向代理

生产环境至少修改：

```dotenv
WEDAI_BIND_ADDRESS=127.0.0.1
APP_URL=https://chat.example.com
AUTH_TRUSTED_ORIGINS=https://chat.example.com
S3_ENDPOINT=https://files.example.com
```

将 `chat.example.com` 反向代理到 `127.0.0.1:3210`，将 `files.example.com` 反向代理到 `127.0.0.1:9000`。`S3_ENDPOINT` 必须能被用户浏览器访问，否则文件上传会失败。生产环境应启用 HTTPS，不要把 PostgreSQL、Redis 或 `9001` 管理端暴露到公网。

## 8. 常用命令

```bash
# 查看状态
make -C deploy ps

# 查看应用日志
make -C deploy logs

# 校验展开后的 Compose（输出可能包含环境变量，不要公开粘贴）
make -C deploy config

# 停止并保留数据
./deploy/one-click-down.sh

# 永久删除服务和数据卷
./deploy/one-click-down.sh --volumes
```

## 9. 更新、回滚与安全边界

- image 模式升级 / 回滚只需修改 `WEDAI_IMAGE` 为对应完整 SHA，再执行 `one-click-up.sh`；
- 不要使用 `latest` 或长期依赖可变 `main` 标签承担生产回滚；
- 升级前至少备份 PostgreSQL 与 RustFS；`one-click-down.sh` 默认保留数据卷；
- `deploy/.env.commercial` 权限应保持为 `600`，严禁提交真实密钥；
- `.dockerignore` 排除 `.env*` 和部署密钥文件，Dockerfile 只包含固定的非生产构建占位变量；
- 正式商业化前确认 LobeHub Community License 要求，联系 `hello@lobehub.com`；
- 若启用 APISIX，必须修改 `apisix/config.yaml` 中的示例 Admin Key；
- 一键部署不会把尚未接入后端的计费、订单或支付 UI 自动变成生产能力。

## 10. 常见失败

### 脚本提示密钥仍是占位值

编辑 `deploy/.env.commercial`，替换全部 `CHANGE_ME_*` 后重试。

### image 模式拉取失败

确认完整镜像标签已经由 GitHub Actions 推送、GHCR package 可见性正确、私有镜像已登录，并确认镜像包含服务器的 `linux/amd64` 或 `linux/arm64` 架构。脚本不会自动读取或保存 GitHub PAT。

### build 模式仍然很慢

确认终端显示 `DOCKER_BUILDKIT=1`；不要执行 `docker builder prune`；避免无意义修改依赖清单。首次冷构建没有可复用缓存，慢是预期。低内存服务器应切换到 image 模式。

### PostgreSQL 或 RustFS 不健康

```bash
docker compose --env-file deploy/.env.commercial \
  -f deploy/docker-compose.commercial.yml ps
docker compose --env-file deploy/.env.commercial \
  -f deploy/docker-compose.commercial.yml logs postgresql rustfs rustfs-init
```

### 端口被占用

修改 `LOBE_PORT`、`RUSTFS_PORT`、`RUSTFS_ADMIN_PORT`，并同步调整 `APP_URL`、`S3_ENDPOINT` 和反向代理配置。
