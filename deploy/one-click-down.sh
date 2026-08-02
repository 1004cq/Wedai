#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.commercial.yml"
EXAMPLE_ENV_FILE="${SCRIPT_DIR}/.env.commercial.example"
ENV_FILE="${WEDAI_ENV_FILE:-${SCRIPT_DIR}/.env.commercial}"
REMOVE_VOLUMES=0
ASSUME_YES=0

usage() {
  cat <<'EOF'
Usage: deploy/one-click-down.sh [--volumes] [--yes]

  --volumes  同时删除 PostgreSQL、Redis、RustFS 数据卷（不可恢复）
  --yes      与 --volumes 一起使用时跳过确认
EOF
}

fail() {
  printf '[Wedai] ERROR: %s\n' "$*" >&2
  exit 1
}

while (($# > 0)); do
  case "$1" in
    --volumes) REMOVE_VOLUMES=1 ;;
    --yes) ASSUME_YES=1 ;;
    -h|--help) usage; exit 0 ;;
    *) fail "未知参数：$1" ;;
  esac
  shift
done

command -v docker >/dev/null 2>&1 || fail '未找到 docker。'
docker compose version >/dev/null 2>&1 || fail '未找到 Docker Compose v2。'
docker info >/dev/null 2>&1 || fail 'Docker daemon 不可用。'

if [[ ! -f "${ENV_FILE}" ]]; then
  printf '[Wedai] 未找到 %s，使用示例文件解析 Compose。\n' "${ENV_FILE}"
  ENV_FILE="${EXAMPLE_ENV_FILE}"
fi

compose() {
  docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

if ((REMOVE_VOLUMES == 1)); then
  if ((ASSUME_YES == 0)); then
    [[ -t 0 ]] || fail '非交互环境删除数据卷时必须同时传入 --yes。'
    printf '[Wedai] 将永久删除数据库、Redis 和对象存储数据。继续？[y/N] '
    read -r answer
    [[ "${answer}" == 'y' || "${answer}" == 'Y' ]] || exit 0
  fi
  compose down --remove-orphans --volumes
  printf '[Wedai] 服务和数据卷已删除。\n'
else
  compose down --remove-orphans
  printf '[Wedai] 服务已停止，数据卷已保留。\n'
fi
