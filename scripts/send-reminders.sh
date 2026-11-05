#!/bin/bash
set -euo pipefail

# FitZone - Send appointment reminders via Web Push
# Runs every 30 minutes from Linux cron.

APP_DIR="/var/www/fitzone"
APP_URL="https://fitzoneland.com"
ENV_FILE="${APP_DIR}/.env"
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"

if [ ! -r "$ENV_FILE" ]; then
  echo "$LOG_PREFIX ERROR: FitZone environment file is not readable"
  exit 1
fi

set -a
. "$ENV_FILE"
set +a

if [ -z "${CRON_SECRET:-}" ]; then
  echo "$LOG_PREFIX ERROR: CRON_SECRET is not configured"
  exit 1
fi

mkdir -p "${APP_DIR}/logs"

echo "$LOG_PREFIX Sending appointment reminders..."

RESPONSE="$(
  curl -sS \
    -o /tmp/fitzone_reminder_response.txt \
    -w "%{http_code}" \
    "${APP_URL}/api/cron/send-reminders?secret=${CRON_SECRET}"
)"

BODY="$(cat /tmp/fitzone_reminder_response.txt 2>/dev/null || true)"

if [ "$RESPONSE" = "200" ]; then
  echo "$LOG_PREFIX SUCCESS: $BODY"
else
  echo "$LOG_PREFIX FAILED (HTTP $RESPONSE): $BODY"
  exit 1
fi
