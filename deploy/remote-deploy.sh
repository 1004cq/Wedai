#!/usr/bin/env bash
# Remote deploy helper — used by .github/workflows/deploy-cq-je.yml and local sshpass runs.
set -Eeuo pipefail

DEPLOY_SSH_HOST="${DEPLOY_SSH_HOST:?DEPLOY_SSH_HOST required}"
DEPLOY_SSH_USER="${DEPLOY_SSH_USER:?DEPLOY_SSH_USER required}"
DEPLOY_SSH_PASSWORD="${DEPLOY_SSH_PASSWORD:?DEPLOY_SSH_PASSWORD required}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/Wedai/deploy}"

SSH="sshpass -e ssh -o StrictHostKeyChecking=no ${DEPLOY_SSH_USER}@${DEPLOY_SSH_HOST}"
export SSHPASS="${DEPLOY_SSH_PASSWORD}"

log() { printf '[deploy] %s\n' "$*"; }

log "Connecting to ${DEPLOY_SSH_USER}@${DEPLOY_SSH_HOST}..."

# Optional SMS env injection (only when secrets are provided).
SMS_BLOCK=""
if [[ -n "${SMS_PROVIDER:-}" ]]; then
  SMS_BLOCK=$(cat <<EOF
upsert_env() {
  local key="\$1" val="\$2"
  if grep -q "^\${key}=" .env.commercial 2>/dev/null; then
    sed -i "s|^\${key}=.*|\${key}=\${val}|" .env.commercial
  else
    echo "\${key}=\${val}" >> .env.commercial
  fi
}
upsert_env SMS_PROVIDER '${SMS_PROVIDER}'
EOF
)
  [[ -n "${ALIBABA_CLOUD_ACCESS_KEY_ID:-}" ]] && SMS_BLOCK+=$'\n'"upsert_env ALIBABA_CLOUD_ACCESS_KEY_ID '${ALIBABA_CLOUD_ACCESS_KEY_ID}'"
  [[ -n "${ALIBABA_CLOUD_ACCESS_KEY_SECRET:-}" ]] && SMS_BLOCK+=$'\n'"upsert_env ALIBABA_CLOUD_ACCESS_KEY_SECRET '${ALIBABA_CLOUD_ACCESS_KEY_SECRET}'"
  [[ -n "${ALIYUN_SMS_VERIFY_SIGN_NAME:-}" ]] && SMS_BLOCK+=$'\n'"upsert_env ALIYUN_SMS_VERIFY_SIGN_NAME '${ALIYUN_SMS_VERIFY_SIGN_NAME}'"
  [[ -n "${ALIYUN_SMS_VERIFY_TEMPLATE_CODE:-}" ]] && SMS_BLOCK+=$'\n'"upsert_env ALIYUN_SMS_VERIFY_TEMPLATE_CODE '${ALIYUN_SMS_VERIFY_TEMPLATE_CODE}'"
fi

${SSH} bash -s <<REMOTE
set -Eeuo pipefail
cd '${DEPLOY_DIR}'
${SMS_BLOCK}
docker compose --env-file .env.commercial -f docker-compose.commercial.yml pull app
docker compose --env-file .env.commercial -f docker-compose.commercial.yml up -d app
docker compose --env-file .env.commercial -f docker-compose.commercial.yml ps app
REMOTE

log "Deploy complete."
