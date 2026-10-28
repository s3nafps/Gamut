#!/bin/sh
# Nightly database backup. Runs forever inside the "backup" container.
set -eu
BACKUP_HOUR="${BACKUP_HOUR:-2}"
KEEP_DAYS="${KEEP_DAYS:-30}"
mkdir -p /backups

backup() {
  file="/backups/gamut-$(date +%Y-%m-%d_%H%M).dump"
  if pg_dump -Fc -f "$file.tmp"; then
    mv "$file.tmp" "$file"
    echo "$(date) backup ok: $file ($(du -h "$file" | cut -f1))"
  else
    rm -f "$file.tmp"
    echo "$(date) BACKUP FAILED" >&2
  fi
  find /backups -name 'gamut-*.dump' -mtime +"$KEEP_DAYS" -delete
}

# One backup at start, then once a day during BACKUP_HOUR (checked every 10 minutes).
backup
last_day=""
while true; do
  sleep 600
  hour=$(date +%H | sed 's/^0//')
  today=$(date +%Y-%m-%d)
  if [ "${hour:-0}" -eq "$BACKUP_HOUR" ] && [ "$today" != "$last_day" ]; then
    backup
    last_day="$today"
  fi
done
