#!/usr/bin/env bash
# MDTP restore from backups/<stamp>/ (db.dump + uploads.tar)
# Usage: bash scripts/restore.sh backups/20261116-120000 [compose-file]
set -euo pipefail
cd "$(dirname "$0")/.."
SRC="${1:?usage: restore.sh backups/<stamp> [compose-file]}"
COMPOSE_FILE="${2:-docker-compose.prod.yml}"

echo "[restore] WARNING: this overwrites the current database."
read -rp "Type RESTORE to continue: " confirm
[ "$confirm" = "RESTORE" ] || { echo "aborted"; exit 1; }

echo "[restore] applying db.dump..."
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_restore -U "${POSTGRES_USER:-mdtp}" -d "${POSTGRES_DB:-mdtp}" --clean --if-exists < "$SRC/db.dump"

echo "[restore] extracting uploads..."
docker compose -f "$COMPOSE_FILE" exec -T app \
  sh -c 'tar -C /app -xf - ' < "$SRC/uploads.tar"

echo "[restore] running migration deploy (no-op if same schema)..."
docker compose -f "$COMPOSE_FILE" exec -T app npx prisma migrate deploy

echo "[restore] done — verify /api/health and spot-check the dashboard."
