#!/usr/bin/env bash
# Restore a trusted Horizon Journal backup into an isolated, empty Compose project.
# Usage: bash scripts/restore.sh backups/20261116-120000 [compose-file]
set -euo pipefail
cd "$(dirname "$0")/.."
SRC="${1:?usage: restore.sh backups/<stamp> [compose-file]}"
COMPOSE_FILE="${2:-docker-compose.prod.yml}"
compose=(docker compose -f "$COMPOSE_FILE")

if [[ ! -r "$SRC/db.dump" || ! -r "$SRC/uploads.tar" ]]; then
  echo "[restore] db.dump and uploads.tar must both be readable." >&2
  exit 1
fi
running_app=$("${compose[@]}" ps --status running -q app)
if [[ -n "$running_app" ]]; then
  echo "[restore] Stop the target app before restoring." >&2
  exit 1
fi

empty_db=$("${compose[@]}" exec -T postgres sh -ec '
  exec psql -XAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$1"
' sh "SELECT NOT EXISTS (
  SELECT 1 FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
)")
if [[ "$empty_db" != "t" ]]; then
  echo "[restore] The target database must be empty. Use a fresh Compose project." >&2
  exit 1
fi

run_app() {
  "${compose[@]}" run --rm --no-deps -T --entrypoint sh app -ec "$1"
}

if ! run_app 'contents=$(ls -A /app/uploads); test -z "$contents"'; then
  echo "[restore] The target uploads volume must be empty." >&2
  exit 1
fi

read -rp "Type RESTORE to import into this empty target: " confirm
[[ "$confirm" == "RESTORE" ]] || { echo "[restore] Aborted."; exit 1; }

echo "[restore] Applying db.dump..."
"${compose[@]}" exec -T postgres sh -ec '
  exec pg_restore --single-transaction --exit-on-error --no-owner --no-privileges \
    -U "$POSTGRES_USER" -d "$POSTGRES_DB"
' < "$SRC/db.dump"

echo "[restore] Extracting uploads..."
run_app 'tar --strip-components=1 -C /app/uploads -xf -' < "$SRC/uploads.tar"

echo "[restore] Applying migrations from the selected app image..."
run_app 'exec node node_modules/prisma/build/index.js migrate deploy'

echo "[restore] Staging complete. Validate data and notification settings before routing traffic."
