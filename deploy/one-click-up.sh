#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.commercial.yml"
EXAMPLE_ENV_FILE="${SCRIPT_DIR}/.env.commercial.example"
ENV_FILE="${WEDAI_ENV_FILE:-${SCRIPT_DIR}/.env.commercial}"

log() {
  printf '[Wedai] %s\n' "$*"
}

fail() {
  printf '[Wedai] ERROR: %s\n' "$*" >&2
  exit 1
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
  local app_url s3_endpoint db_name mode image

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

  mode="$(read_env_value WEDAI_DEPLOY_MODE)"
  mode="${mode:-build}"
  [[ "${mode}" == 'build' || "${mode}" == 'image' ]] || fail 'WEDAI_DEPLOY_MODE 只能是 build 或 image。'

  image="$(require_value WEDAI_IMAGE)"
  if [[ "${mode}" == 'image' && "${image}" == 'wedai:local' ]]; then
    fail 'image 模式必须把 WEDAI_IMAGE 改为可拉取的预构建镜像。'
  fi
}

check_local_build_capacity() {
  local mode allow minimum memory_mb

  mode="$(read_env_value WEDAI_DEPLOY_MODE)"
  mode="${mode:-build}"
  [[ "${mode}" == 'build' ]] || return 0

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
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

main() {
  local mode app_url

  check_docker

  if [[ ! -f "${ENV_FILE}" ]]; then
    cp -- "${EXAMPLE_ENV_FILE}" "${ENV_FILE}"
    chmod 600 "${ENV_FILE}" 2>/dev/null || true
    log "已创建 ${ENV_FILE}"
    log '请填写所有 CHANGE_ME_* 必填项，然后重新执行本脚本。'
    exit 2
  fi

  validate_environment
  check_local_build_capacity

  log '校验 Docker Compose 配置...'
  compose config --quiet

  mode="$(read_env_value WEDAI_DEPLOY_MODE)"
  mode="${mode:-build}"
  if [[ "${mode}" == 'build' ]]; then
    log '从当前 Wedai 源码构建应用镜像...'
    compose build app
  else
    log "拉取预构建应用镜像：$(read_env_value WEDAI_IMAGE)"
    compose pull app
  fi

  log '启动 Wedai、PostgreSQL、Redis、RustFS 和 SearXNG...'
  compose up -d --remove-orphans
  compose ps

  app_url="$(read_env_value APP_URL)"
  log "访问地址：${app_url}"
  printf '[Wedai] 查看应用日志：docker compose --env-file %q -f %q logs -f app\n' "${ENV_FILE}" "${COMPOSE_FILE}"
  printf '[Wedai] 停止服务：%q\n' "${SCRIPT_DIR}/one-click-down.sh"
}

main "$@"
