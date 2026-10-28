#!/bin/sh
# Restore a backup into the running database. ERASES the current data.
# Usage (in the deploy folder):  sh backup/restore.sh backups/gamut-2026-10-28_0200.dump
set -eu
FILE="${1:?Give the backup file, e.g. backups/gamut-2026-10-28_0200.dump}"
echo "This replaces ALL current data with $FILE. Type YES to continue:"
read -r answer
[ "$answer" = "YES" ] || { echo "Cancelled."; exit 1; }
docker compose stop app
docker compose exec -T db pg_restore -U gamut -d gamut --clean --if-exists < "$FILE"
docker compose start app
echo "Restore done."
