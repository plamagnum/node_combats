#!/usr/bin/env bash
# Відновлення бази з дампу: ./scripts/restore.sh файл.gz  (УВАГА: поточні дані перезаписуються)
set -euo pipefail
[ $# -eq 1 ] || { echo "Використання: $0 файл.gz"; exit 1; }
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
read -r -p "Поточну базу буде перезаписано. Продовжити? [y/N] " ans
[ "$ans" = "y" ] || exit 1
docker compose exec -T mongo mongorestore -u "$MONGO_ROOT_USER" -p "$MONGO_ROOT_PASS" \
  --authenticationDatabase admin --nsInclude "${MONGO_DB:-combats}.*" --drop --archive --gzip < "$1"
echo "Відновлено з $1"
