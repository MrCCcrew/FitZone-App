#!/bin/bash
# FitZone - Send appointment reminders via Web Push (runs every 30 min via cron)
#
# Setup (on server, run: crontab -e) and add:
#   */30 * * * * /var/www/fitzone/scripts/send-reminders.sh >> /var/www/fitzone/logs/reminders.log 2>&1

APP_URL="https://fitzoneland.com"
CRON_SECRET="96f8f29d1c40f697079bbbf841b807adec5ab002d51708071c930f6b918089de"
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"

mkdir -p /var/www/fitzone/logs

echo "$LOG_PREFIX Sending appointment reminders..."

RESPONSE=$(curl -s -o /tmp/reminder_response.txt -w "%{http_code}" \
  "${APP_URL}/api/cron/send-reminders?secret=${CRON_SECRET}")

BODY=$(cat /tmp/reminder_response.txt)

if [ "$RESPONSE" = "200" ]; then
  echo "$LOG_PREFIX SUCCESS: $BODY"
else
  echo "$LOG_PREFIX FAILED (HTTP $RESPONSE): $BODY"
fi
