# Wedai Docker 一键部署

本方案从当前仓库启动完整的 Web 应用、PostgreSQL、Redis、RustFS 和 SearXNG。真实配置保存在 `deploy/.env.commercial`，该文件已被 Git 忽略。

## 1. 前置条件

- Docker Engine 24+ 或 Docker Desktop；
- Docker Compose v2，命令为 `docker compose`；
- 源码构建建议至少 4 核、8 GiB 内存、25 GiB 可用磁盘；
- 低配生产机应使用预构建镜像的 `image` 模式，不要在服务器上编译 LobeHub 单仓源码。

> 当前仓库尚未发布公开的 Wedai 镜像。默认 `build` 模式能从当前源码构建 CQ/Wedai 定制版，但需要满足上述资源要求。若配置 `image` 模式，必须先准备一个包含当前仓库代码的可拉取镜像。

## 2. 最短启动流程

在仓库根目录执行：

```bash
./deploy/one-click-up.sh
```

首次执行会创建 `deploy/.env.commercial` 并退出。编辑其中所有 `CHANGE_ME_*`：

```bash
openssl rand -hex 32       # AUTH_SECRET / POSTGRES_PASSWORD
openssl rand -base64 32    # KEY_VAULTS_SECRET
openssl rand -hex 16       # RUSTFS_ACCESS_KEY
openssl rand -hex 32       # RUSTFS_SECRET_KEY
```

将命令输出分别填入对应变量，不要把真实值提交到 Git。然后再次执行：

```bash
./deploy/one-click-up.sh
```

默认访问地址是 <http://localhost:3210>，对象存储 API 是 <http://localhost:9000>，RustFS 管理端仅绑定 `127.0.0.1:9001`。

## 3. 两种应用镜像模式

### 从当前源码构建

适合开发机或构建机，确保 CQ Logo、Wedai 文案与商业骨架全部包含在镜像中：

```dotenv
WEDAI_DEPLOY_MODE=build
WEDAI_IMAGE=wedai:local
```

脚本会先执行 `docker compose build app`，再执行 `docker compose up -d`。Linux 物理内存低于 7 GiB 时脚本默认拒绝构建，防止系统进入长期 I/O 阻塞。仅在明确理解风险时才可设置：

```dotenv
WEDAI_ALLOW_LOW_MEMORY_BUILD=1
```

### 拉取预构建镜像

生产部署推荐使用不可变版本标签：

```dotenv
WEDAI_DEPLOY_MODE=image
WEDAI_IMAGE=ghcr.io/1004cq/wedai:<commit-sha>
```

镜像必须实际存在且服务器有拉取权限。私有 GHCR 镜像先使用 GitHub PAT 执行 `docker login ghcr.io`，不要把 PAT 写入 `.env.commercial`。

## 4. 域名和反向代理

生产环境至少修改：

```dotenv
WEDAI_BIND_ADDRESS=127.0.0.1
APP_URL=https://chat.example.com
AUTH_TRUSTED_ORIGINS=https://chat.example.com
S3_ENDPOINT=https://files.example.com
```

将 `chat.example.com` 反向代理到 `127.0.0.1:3210`，将 `files.example.com` 反向代理到 `127.0.0.1:9000`。`S3_ENDPOINT` 必须能被用户浏览器访问，否则文件上传会失败。生产环境应配置 HTTPS，不要把 PostgreSQL、Redis 或 `9001` 管理端暴露到公网。

## 5. 常用命令

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

## 6. 更新与回滚

镜像模式下，把 `WEDAI_IMAGE` 改为新的不可变标签并重新执行 `one-click-up.sh`。回滚时改回旧标签再次执行即可。不要使用同一个 `latest` 标签承担生产回滚。

升级前至少备份 PostgreSQL 与 RustFS 数据。`one-click-down.sh` 默认保留数据卷；只有显式传入 `--volumes` 并确认后才会删除数据。

## 7. 安全与商业化边界

- `deploy/.env.commercial` 权限应保持为 `600`，严禁提交真实密钥；
- 正式商业化前确认 LobeHub Community License 要求，联系 `hello@lobehub.com`；
- 若启用 APISIX，必须修改 `apisix/config.yaml` 中的示例 Admin Key；
- 当前 `packages/billing`、后台和用户中心仍是商业化骨架；一键部署不会把尚未实现的 Stripe、订单或扣费能力变成可用功能；
- Stripe Webhook 路由和幂等表完成后，再按照 `docs/qa/` 验收文档开放支付。

## 8. 常见失败

### 脚本提示密钥仍是占位值

编辑 `deploy/.env.commercial`，替换全部 `CHANGE_ME_*` 后重试。

### `image` 模式拉取失败

确认镜像标签真实存在、CPU 架构匹配，并完成对应镜像仓库登录。脚本不会自动读取或保存 GitHub PAT。

### PostgreSQL 或 RustFS 不健康

```bash
docker compose --env-file deploy/.env.commercial \
  -f deploy/docker-compose.commercial.yml ps
docker compose --env-file deploy/.env.commercial \
  -f deploy/docker-compose.commercial.yml logs postgresql rustfs rustfs-init
```

### 端口被占用

修改 `LOBE_PORT`、`RUSTFS_PORT`、`RUSTFS_ADMIN_PORT`，并同步调整 `APP_URL`、`S3_ENDPOINT` 和反向代理配置。
