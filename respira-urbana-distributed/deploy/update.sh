#!/usr/bin/env bash
# Atualiza o servidor: baixa o codigo novo e recria so o que mudou.  Uso: bash deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build --remove-orphans
docker image prune -f >/dev/null
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env ps
