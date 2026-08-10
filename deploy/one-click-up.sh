#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.commercial.yml"
EXAMPLE_ENV_FILE="${SCRIPT_DIR}/.env.commercial.example"
ENV_FILE="${WEDAI_ENV_FILE:-${SCRIPT_DIR}/.env.commercial}"

# Compose v2 already prefers BuildKit; exporting these also makes the cache-mount requirement explicit.
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

DEPLOY_MODE='image'
DEPLOY_PROFILE='full'
INFRA_PULL_PID=''
INFRA_PULL_STARTED_AT=0
TOTAL_STARTED_AT="${SECONDS}"

log() {
  printf '[Wedai] %s\n' "$*"
}

fail() {
  printf '[Wedai] ERROR: %s\n' "$*" >&2
  exit 1
}

run_timed() {
  local label="$1"
  local started status elapsed
  shift

  started="${SECONDS}"
  log "开始：${label}"
  if "$@"; then
    elapsed=$((SECONDS - started))
    log "完成：${label}（${elapsed}s）"
    return 0
  else
    status=$?
    elapsed=$((SECONDS - started))
    log "失败：${label}（${elapsed}s，退出码 ${status}）"
    return "${status}"
  fi
}

check_docker() {
  command -v docker >/dev/null 2>&1 || fail '未找到 docker，请先安装 Docker Engine 或 Docker Desktop。'
  docker compose version >/dev/null 2>&1 || fail '未找到 Docker Compose v2（docker compose）。'
  docker info >/dev/null 2>&1 || fail 'Docker daemon 不可用，请先启动 Docker。'
}

read_env_value() {
  local key="$1"
  local line value

  line="$(grep -E "^[[:space:]]*${key}=" "${ENV_FILE}" | tail -n 1 || true)"
  value="${line#*=}"
  value="${value%$'\r'}"

  if ((${#value} >= 2)) && [[ "${value:0:1}" == '"' && "${value: -1}" == '"' ]]; then
    value="${value:1:${#value}-2}"
  elif ((${#value} >= 2)) && [[ "${value:0:1}" == "'" && "${value: -1}" == "'" ]]; then
    value="${value:1:${#value}-2}"
  fi

  printf '%s' "${value}"
}

require_value() {
  local key="$1"
  local value

  value="$(read_env_value "${key}")"
  [[ -n "${value}" ]] || fail "${key} 不能为空。"

  case "${value}" in
    CHANGE_ME*|YOUR_*|REPLACE_ME*) fail "${key} 仍是示例占位值，请编辑 ${ENV_FILE}。" ;;
  esac

  printf '%s' "${value}"
}

require_min_length() {
  local key="$1"
  local minimum="$2"
  local value

  value="$(require_value "${key}")"
  ((${#value} >= minimum)) || fail "${key} 长度至少需要 ${minimum} 个字符。"
}

require_port() {
  local key="$1"
  local value port_number

  value="$(require_value "${key}")"
  [[ "${value}" =~ ^[0-9]+$ ]] || fail "${key} 必须是端口数字。"
  port_number=$((10#${value}))
  ((port_number >= 1 && port_number <= 65535)) || fail "${key} 必须介于 1 和 65535 之间。"
}

validate_environment() {
  local app_url s3_endpoint db_name image parallel_pull searxng_url

  require_min_length AUTH_SECRET 32
  require_min_length KEY_VAULTS_SECRET 32
  require_min_length POSTGRES_PASSWORD 16
  require_min_length RUSTFS_ACCESS_KEY 3
  require_min_length RUSTFS_SECRET_KEY 16

  require_port LOBE_PORT
  require_port RUSTFS_PORT
  require_port RUSTFS_ADMIN_PORT

  app_url="$(require_value APP_URL)"
  s3_endpoint="$(require_value S3_ENDPOINT)"
  [[ "${app_url}" =~ ^https?:// ]] || fail 'APP_URL 必须以 http:// 或 https:// 开头。'
  [[ "${s3_endpoint}" =~ ^https?:// ]] || fail 'S3_ENDPOINT 必须以 http:// 或 https:// 开头。'

  db_name="$(require_value LOBE_DB_NAME)"
  [[ "${db_name}" =~ ^[A-Za-z_][A-Za-z0-9_-]*$ ]] || fail 'LOBE_DB_NAME 只能包含字母、数字、下划线和连字符。'

  [[ "$(require_value POSTGRES_PASSWORD)" =~ ^[A-Za-z0-9._~-]+$ ]] ||
    fail 'POSTGRES_PASSWORD 会写入 DATABASE_URL，只能使用 URL 安全字符；推荐使用 openssl rand -hex 32。'

  DEPLOY_MODE="$(read_env_value WEDAI_DEPLOY_MODE)"
  DEPLOY_MODE="${DEPLOY_MODE:-image}"
  [[ "${DEPLOY_MODE}" == 'build' || "${DEPLOY_MODE}" == 'image' ]] || fail 'WEDAI_DEPLOY_MODE 只能是 build 或 image。'

  DEPLOY_PROFILE="$(read_env_value WEDAI_PROFILE)"
  DEPLOY_PROFILE="${DEPLOY_PROFILE:-full}"
  [[ "${DEPLOY_PROFILE}" == 'core' || "${DEPLOY_PROFILE}" == 'full' ]] || fail 'WEDAI_PROFILE 只能是 core 或 full。'

  parallel_pull="$(read_env_value WEDAI_PARALLEL_INFRA_PULL)"
  parallel_pull="${parallel_pull:-1}"
  [[ "${parallel_pull}" == '0' || "${parallel_pull}" == '1' ]] || fail 'WEDAI_PARALLEL_INFRA_PULL 只能是 0 或 1。'

  image="$(require_value WEDAI_IMAGE)"
  if [[ "${DEPLOY_MODE}" == 'image' && "${image}" == 'wedai:local' ]]; then
    fail 'image 模式必须把 WEDAI_IMAGE 改为可拉取的预构建镜像。'
  fi

  if [[ "${DEPLOY_PROFILE}" == 'full' ]]; then
    searxng_url="$(require_value SEARXNG_URL)"
    [[ "${searxng_url}" =~ ^https?:// ]] || fail 'full 模式下 SEARXNG_URL 必须以 http:// 或 https:// 开头。'
  fi
}

check_local_build_capacity() {
  local allow minimum memory_mb

  [[ "${DEPLOY_MODE}" == 'build' ]] || return 0

  allow="$(read_env_value WEDAI_ALLOW_LOW_MEMORY_BUILD)"
  [[ "${allow:-0}" == '1' ]] && return 0

  minimum="$(read_env_value WEDAI_LOCAL_BUILD_MIN_MEMORY_MB)"
  minimum="${minimum:-7168}"

  if [[ -r /proc/meminfo ]]; then
    memory_mb="$(awk '/^MemTotal:/ { printf "%d", $2 / 1024 }' /proc/meminfo)"
    if [[ -n "${memory_mb}" ]] && ((memory_mb < minimum)); then
      fail "本机内存约 ${memory_mb} MiB，低于源码构建安全线 ${minimum} MiB。请改用 image 模式，或明确设置 WEDAI_ALLOW_LOW_MEMORY_BUILD=1 自担风险。"
    fi
  fi
}

compose() {
  if [[ "${DEPLOY_PROFILE}" == 'full' ]]; then
    docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" --profile full "$@"
  else
    SEARXNG_URL='' docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
  fi
}

compose_full() {
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" --profile full "$@"
}

pull_infrastructure() {
  local services=(postgresql redis rustfs rustfs-init)
  if [[ "${DEPLOY_PROFILE}" == 'full' ]]; then
    services+=(searxng)
  fi
  compose pull "${services[@]}"
}

start_parallel_infrastructure_pull() {
  INFRA_PULL_STARTED_AT="${SECONDS}"
  log "开始：并行拉取 ${DEPLOY_PROFILE} profile 基础设施镜像"
  pull_infrastructure &
  INFRA_PULL_PID=$!
}

wait_for_infrastructure_pull() {
  local elapsed
  [[ -n "${INFRA_PULL_PID}" ]] || return 0

  if wait "${INFRA_PULL_PID}"; then
    elapsed=$((SECONDS - INFRA_PULL_STARTED_AT))
    log "完成：并行拉取基础设施镜像（${elapsed}s）"
    INFRA_PULL_PID=''
  else
    elapsed=$((SECONDS - INFRA_PULL_STARTED_AT))
    INFRA_PULL_PID=''
    fail "基础设施镜像拉取失败（${elapsed}s）。请检查镜像标签、Docker Hub 网络和磁盘空间。"
  fi
}

prepare_application_image() {
  local image parallel_pull

  if [[ "${DEPLOY_MODE}" == 'image' ]]; then
    image="$(read_env_value WEDAI_IMAGE)"
    if ! run_timed "拉取预构建应用镜像 ${image}" compose pull app; then
      fail "无法拉取 ${image}。请依次检查：镜像/标签是否存在；私有 GHCR 是否已执行 docker login ghcr.io；主机 CPU 架构是否受镜像支持。脚本不会自动回退到耗时的本地 build。"
    fi
    run_timed "拉取 ${DEPLOY_PROFILE} profile 基础设施镜像" pull_infrastructure ||
      fail '基础设施镜像拉取失败，请检查固定版本标签、网络和磁盘空间。'
    return 0
  fi

  parallel_pull="$(read_env_value WEDAI_PARALLEL_INFRA_PULL)"
  parallel_pull="${parallel_pull:-1}"
  if [[ "${parallel_pull}" == '1' ]]; then
    start_parallel_infrastructure_pull
  fi

  run_timed '从当前 Wedai 源码构建应用镜像（启用 BuildKit 缓存）' compose build app ||
    fail '应用镜像构建失败。首次冷构建较慢是预期；请检查内存、磁盘、网络和上方构建日志。'

  if [[ "${parallel_pull}" == '1' ]]; then
    wait_for_infrastructure_pull
  else
    run_timed "拉取 ${DEPLOY_PROFILE} profile 基础设施镜像" pull_infrastructure ||
      fail '基础设施镜像拉取失败，请检查固定版本标签、网络和磁盘空间。'
  fi
}

main() {
  local app_url total_elapsed image
  local -a up_args=(up -d --remove-orphans)

  check_docker

  if [[ ! -f "${ENV_FILE}" ]]; then
    cp -- "${EXAMPLE_ENV_FILE}" "${ENV_FILE}"
    chmod 600 "${ENV_FILE}" 2>/dev/null || true
    log "已创建 ${ENV_FILE}"
    log '请填写所有 CHANGE_ME_* 必填项，然后重新执行本脚本。'
    exit 2
  fi

  run_timed '校验环境变量' validate_environment || exit $?
  check_local_build_capacity

  log "部署模式：${DEPLOY_MODE}；服务 profile：${DEPLOY_PROFILE}；DOCKER_BUILDKIT=${DOCKER_BUILDKIT}"
  if [[ "${DEPLOY_MODE}" == 'image' ]]; then
    image="$(read_env_value WEDAI_IMAGE)"
    if [[ "${image}" == *':main' ]]; then
      log '提示：main 标签适合首次部署；生产验证后请改为完整 git SHA 标签，便于确定性回滚。'
    fi
  fi

  run_timed '校验 Docker Compose 配置' compose config --quiet || fail 'Docker Compose 配置无效。'
  prepare_application_image

  if [[ "${DEPLOY_PROFILE}" == 'core' ]]; then
    # Switching from full to core should actually remove the optional SearXNG container.
    compose_full rm -sf searxng >/dev/null 2>&1 || true
  fi

  if [[ "${DEPLOY_MODE}" == 'image' ]]; then
    # Enforce a pure-image production path even if the Compose service also defines a build fallback.
    up_args+=(--no-build --pull never)
  fi

  run_timed "启动 Wedai ${DEPLOY_PROFILE} profile" compose "${up_args[@]}" ||
    fail '容器启动失败，请运行文末日志命令检查 app 与依赖服务。'
  compose ps

  app_url="$(read_env_value APP_URL)"
  total_elapsed=$((SECONDS - TOTAL_STARTED_AT))
  log "部署总耗时：${total_elapsed}s"
  log "访问地址：${app_url}"
  printf '[Wedai] 查看应用日志：docker compose --env-file %q -f %q logs -f app\n' "${ENV_FILE}" "${COMPOSE_FILE}"
  printf '[Wedai] 停止服务：%q\n' "${SCRIPT_DIR}/one-click-down.sh"
}

main "$@"
