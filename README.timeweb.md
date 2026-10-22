# Развёртывание на Timeweb

Проект портирован с Cloudflare Workers на обычный Node.js-сервер.
Вся бизнес-логика (`src/worker.js`, `src/auth.js`, активности) осталась
без изменений — её оборачивает адаптер [`server.js`](server.js):

- `server.js` — HTTP-сервер, превращает запрос в Web `Request`, вызывает
  `worker.fetch(request, env, ctx)` и отдаёт `Response`.
- `server/kv-redis.js` — замена Cloudflare KV на Redis (интерфейс `get/put/delete` + TTL).
- `server/assets.js` — раздача `frontend/dist` с SPA-fallback (замена `env.ASSETS`).

## Что нужно на сервере

- **Node.js 18+** (глобальные `fetch`/`Request`/`Response`/`crypto`).
- **Redis** — managed у Timeweb или локально (`REDIS_URL`).
- **nginx + TLS** (Let's Encrypt). HTTPS обязателен: приложение работает в
  iframe Bitrix24 и ставит cookie `Secure; SameSite=None; Partitioned`.
- Домен, указывающий на сервер.

## Установка

```bash
# 1. Зависимости сервера
npm install

# 2. Сборка фронтенда (кладёт результат в frontend/dist)
npm run build

# 3. Запуск (разово, для проверки)
npm start
# или через pm2:
pm2 start ecosystem.config.cjs
pm2 save
```

nginx — см. [`deploy/nginx.conf.example`](deploy/nginx.conf.example).
Важно пробросить `X-Forwarded-Proto` и `Host`, иначе сломаются CSRF-проверка
и Secure-cookie.

## Как задавать секреты на Timeweb

Секреты **не** коммитятся (`.env` в `.gitignore`). Варианты:

### Вариант A — файл `.env` (рекомендуется, его читает dotenv)

На сервере в корне проекта создайте `.env` из примера и впишите значения:

```bash
cp .env.example .env
nano .env
chmod 600 .env        # закрыть от чужих глаз
```

`.env` подхватывается автоматически при `npm start` / pm2 (через `dotenv`).

### Вариант B — переменные окружения панели Timeweb

Если разворачиваете через «Приложения» Timeweb Cloud, задайте переменные
в разделе окружения приложения (ключ = значение). Файл `.env` тогда не нужен.

### Вариант C — systemd

```ini
# /etc/systemd/system/service-acc.service
[Service]
EnvironmentFile=/var/www/service-acc/.env
ExecStart=/usr/bin/node /var/www/service-acc/server.js
```

### Список переменных

Все ключи перечислены в [`.env.example`](.env.example):
доступы Reg.ru (`USER_REG`, `PASSWD_REG`), Яндекс 360 (`YANDEX_TOKEN`,
`YANDEX_ORG_ID`), Bitrix24, Cloud Contact, `AUTH_SESSION_SECRET`,
`AUTH_USERS_JSON`, а также `REDIS_URL` и `PORT`.

> KV-namespace из Cloudflare больше не нужны — вместо них Redis.
> `BITRIX_INSTALLS` в коде не используется (был лишним биндингом).
