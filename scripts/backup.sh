#!/usr/bin/env bash
# MDTP backup: database dump + uploads tarball → backups/<stamp>/
# Usage: bash scripts/backup.sh [compose-file]
set -euo pipefail
cd "$(dirname "$0")/.."
COMPOSE_FILE="${1:-docker-compose.prod.yml}"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="backups/$STAMP"
mkdir -p "$DEST"

echo "[backup] dumping database..."
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-mdtp}" -Fc "${POSTGRES_DB:-mdtp}" > "$DEST/db.dump"

echo "[backup] archiving uploads..."
if docker compose -f "$COMPOSE_FILE" ps -q app >/dev/null 2>&1 && [ -n "$(docker compose -f "$COMPOSE_FILE" ps -q app)" ]; then
  docker compose -f "$COMPOSE_FILE" exec -T app \
    tar -C /app -cf - uploads > "$DEST/uploads.tar"
elif [ -d uploads ]; then
  tar -cf "$DEST/uploads.tar" uploads
else
  echo "[backup] no uploads dir — creating empty tar"
  tar -cf "$DEST/uploads.tar" -T /dev/null
fi

echo "[backup] writing manifest..."
cat > "$DEST/MANIFEST.txt" <<EOF
created=$STAMP
db=pg_dump -Fc
uploads=tar
retention=keep at least 2 latest; verify restore before deleting any
EOF

echo "[backup] done → $DEST"
