#!/bin/bash
# Daily MariaDB backup for sql_undip_foodtruck.
# Reads credentials from ~/undip-foodtruck/.env so we don't store passwords here.
# Writes gzipped dumps to /www/backup/database/, retains 14 days.
#
# Cron entry (in ubuntu user's crontab):
#   0 3 * * * /home/ubuntu/undip-foodtruck/scripts/backup-mysql.sh

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$PROJECT_DIR/.env"
BACKUP_DIR="/www/backup/database"
RETENTION_DAYS=14
LOG_FILE="$PROJECT_DIR/python/logs/backup.log"

mkdir -p "$BACKUP_DIR"
mkdir -p "$(dirname "$LOG_FILE")"

log() {
  echo "[$(date -Iseconds)] $*" >> "$LOG_FILE"
}

if [ ! -f "$ENV_FILE" ]; then
  log "ERROR: $ENV_FILE not found"
  exit 1
fi

DB_USER=$(grep -E '^MYSQL_USER=' "$ENV_FILE" | cut -d= -f2)
DB_PASS=$(grep -E '^MYSQL_PASSWORD=' "$ENV_FILE" | cut -d= -f2)
DB_NAME=$(grep -E '^MYSQL_DATABASE=' "$ENV_FILE" | cut -d= -f2)

if [ -z "$DB_USER" ] || [ -z "$DB_NAME" ]; then
  log "ERROR: MYSQL_USER or MYSQL_DATABASE missing in $ENV_FILE"
  exit 1
fi

DATE=$(date +%Y-%m-%d_%H%M%S)
OUTPUT="$BACKUP_DIR/${DB_NAME}_${DATE}.sql.gz"

log "starting dump → $OUTPUT"

if /www/server/mysql/bin/mysqldump \
    --single-transaction \
    --routines \
    --triggers \
    --no-tablespaces \
    -u"$DB_USER" \
    -p"$DB_PASS" \
    "$DB_NAME" \
  | gzip > "$OUTPUT"; then
  SIZE=$(du -h "$OUTPUT" | cut -f1)
  log "ok ($SIZE)"
else
  rc=$?
  log "ERROR: mysqldump failed (rc=$rc)"
  rm -f "$OUTPUT"
  exit $rc
fi

# Pure shell loop — avoids `find` entirely so we don't trip over BT-Panel's
# nested per-engine dirs (mysql/, mongodb/, pgsql/, redis/) which it keeps
# at mode 600. Glob expansion only sees direct children.
DELETED=0
NOW_EPOCH=$(date +%s)
CUTOFF_EPOCH=$(( NOW_EPOCH - RETENTION_DAYS * 86400 ))
shopt -s nullglob
for f in "$BACKUP_DIR/${DB_NAME}_"*.sql.gz; do
  [ -f "$f" ] || continue
  MTIME=$(stat -c %Y "$f" 2>/dev/null || echo "$NOW_EPOCH")
  if [ "$MTIME" -lt "$CUTOFF_EPOCH" ]; then
    rm -f "$f" && DELETED=$((DELETED + 1))
  fi
done
shopt -u nullglob
if [ "$DELETED" -gt 0 ]; then
  log "purged $DELETED old backup(s) older than $RETENTION_DAYS days"
fi

REMAINING=$(ls -1 "$BACKUP_DIR"/${DB_NAME}_*.sql.gz 2>/dev/null | wc -l)
log "done — $REMAINING backup(s) retained in $BACKUP_DIR"
