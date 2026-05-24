#!/bin/bash
set -o pipefail
# FitZone - Auto Database Backup Script
# Runs daily via cron, keeps last 14 backups
# Credentials are read from /home/fitzone/.my.cnf (not from command line)

BACKUP_DIR="/var/www/fitzone/backups"
KEEP_DAYS=14
LOG_FILE="/var/www/fitzone/backups/backup.log"
MY_CNF="/home/fitzone/.my.cnf"
DB_NAME="fitzone_prod"

# تأكد إن ملف الـ credentials موجود
if [ ! -f "$MY_CNF" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $MY_CNF not found" >> "$LOG_FILE"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

FILENAME="fitzone-db-$(date -u +%Y-%m-%dT%H-%M-%SZ).sql.gz"
FILEPATH="$BACKUP_DIR/$FILENAME"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting backup..." >> "$LOG_FILE"

mysqldump \
  --defaults-file="$MY_CNF" \
  --single-transaction \
  --no-tablespaces \
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
