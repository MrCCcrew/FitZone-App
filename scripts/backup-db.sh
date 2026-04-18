#!/bin/bash
# FitZone - Auto Database Backup Script
# Runs daily via cron, keeps last 14 backups

BACKUP_DIR="/var/www/fitzone/backups"
KEEP_DAYS=14
LOG_FILE="/var/www/fitzone/backups/backup.log"

# Read credentials from .env (never hardcode them here)
ENV_FILE="/var/www/fitzone/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: .env not found at $ENV_FILE" >> "$LOG_FILE"
  exit 1
fi

DATABASE_URL=$(grep '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d'=' -f2- | tr -d '"' | tr -d "'")
if [ -z "$DATABASE_URL" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: DATABASE_URL not set in .env" >> "$LOG_FILE"
  exit 1
fi

DB_USER=$(echo "$DATABASE_URL" | sed 's|.*://\([^:]*\):.*|\1|')
DB_PASS=$(echo "$DATABASE_URL" | sed 's|.*://[^:]*:\([^@]*\)@.*|\1|')
DB_HOST=$(echo "$DATABASE_URL" | sed 's|.*@\([^:/]*\)[:/].*|\1|')
DB_PORT=$(echo "$DATABASE_URL" | sed 's|.*@[^:]*:\([0-9]*\)/.*|\1|')
DB_NAME=$(echo "$DATABASE_URL" | sed 's|.*/\([^?]*\).*|\1|')

mkdir -p "$BACKUP_DIR"

FILENAME="fitzone-db-$(date -u +%Y-%m-%dT%H-%M-%SZ).sql.gz"
FILEPATH="$BACKUP_DIR/$FILENAME"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting backup..." >> "$LOG_FILE"

mysqldump \
  -h "$DB_HOST" \
  -P "$DB_PORT" \
  -u "$DB_USER" \
  -p"$DB_PASS" \
  --single-transaction \
  --routines \
  --triggers \
  "$DB_NAME" | gzip > "$FILEPATH"

if [ $? -eq 0 ]; then
  SIZE=$(du -sh "$FILEPATH" | cut -f1)
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] SUCCESS: $FILENAME ($SIZE)" >> "$LOG_FILE"
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] FAILED: backup did not complete" >> "$LOG_FILE"
  rm -f "$FILEPATH"
  exit 1
fi

# حذف النسخ الأقدم من 14 يوم
find "$BACKUP_DIR" -name "fitzone-db-*.sql.gz" -mtime +$KEEP_DAYS -delete
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Old backups cleaned (kept last ${KEEP_DAYS} days)" >> "$LOG_FILE"
