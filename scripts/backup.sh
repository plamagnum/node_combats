#!/usr/bin/env bash
# Дамп бази у файл: ./scripts/backup.sh [файл]  (за замовчуванням backup-ДАТА.gz)
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
OUT="${1:-backup-$(date +%Y%m%d-%H%M%S).gz}"
docker compose exec -T mongo mongodump -u "$MONGO_ROOT_USER" -p "$MONGO_ROOT_PASS" \
  --authenticationDatabase admin --db "${MONGO_DB:-combats}" --archive --gzip > "$OUT"
echo "Збережено: $OUT"
