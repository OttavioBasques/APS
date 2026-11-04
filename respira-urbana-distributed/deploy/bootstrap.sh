#!/usr/bin/env bash
# Prepara uma VPS Ubuntu/Debian nova: instala Docker e abre so SSH, HTTP e HTTPS no firewall.
# Rode como root (ou com sudo):  sudo bash deploy/bootstrap.sh
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then echo "Rode como root: sudo bash $0" >&2; exit 1; fi

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Instalando Docker"
  curl -fsSL https://get.docker.com | sh
else
  echo "==> Docker ja instalado: $(docker --version)"
fi

if command -v ufw >/dev/null 2>&1 || apt-get install -y ufw >/dev/null 2>&1; then
  echo "==> Configurando firewall (22, 80, 443)"
  ufw allow 22/tcp >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw allow 443/udp >/dev/null
  ufw --force enable
fi

echo
echo "Pronto. Proximos passos:"
echo "  1) cp deploy/.env.example deploy/.env  e preencha (DOMAIN, chaves)"
echo "  2) docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build"
