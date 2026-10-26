#!/usr/bin/env bash
# Установка service-acc на чистой Ubuntu 24.04 (в VirtualBox).
# Запускать из КОРНЯ проекта:  bash deploy/vm-setup.sh
set -euo pipefail

echo "==> Node.js 20 + git"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
sudo apt-get install -y git

echo "==> Зависимости сервера"
npm install

echo "==> Сборка фронтенда (frontend/dist)"
npm run build

echo "==> .env"
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Создан .env из шаблона — ВПИШИТЕ секреты: nano .env"
fi

echo "==> Автозапуск через pm2"
if ! command -v pm2 >/dev/null 2>&1; then
  sudo npm i -g pm2
fi
pm2 start ecosystem.config.cjs || pm2 restart service-acc
pm2 save

echo
echo "Готово. Приложение слушает http://localhost:3000"
echo "Redis не нужен — хранилище файловое (.data/)."
echo "Дальше подключите Cloudflare Tunnel: см. deploy/cloudflared-setup.md"
