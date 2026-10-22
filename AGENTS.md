# service-acc (Timeweb / Node.js)

Этот проект перенесён с Cloudflare Workers на обычный Node.js-сервер для
хостинга Timeweb. **Wrangler и Cloudflare больше не используются.**

## Архитектура

- `server.js` — Node HTTP-адаптер. Строит Web `Request`, вызывает
  `worker.fetch(request, env, ctx)` и отдаёт `Response`. Сама логика
  осталась от Workers и не переписывалась.
- `src/worker.js` — роутинг (как было). Экспортирует `default { fetch }`.
- `src/auth.js`, `src/functions.js`, `src/activities/**`, `src/webhooks/**`,
  `install.js`, `CloudContact.js` — без изменений относительно Cloudflare.
- `server/kv-redis.js` — замена Cloudflare KV на Redis. В `env` подставляется
  как `BITRIX_APP_CONFIG`; интерфейс `get/put/delete` (+ `expirationTtl`).
- `server/assets.js` — раздача `frontend/dist` (замена `env.ASSETS`), SPA-fallback.
- `frontend/` — Vue 3 + Vite (не менялся). Сборка: `npm run build`.

## Команды

| Команда | Назначение |
|---------|------------|
| `npm install` | зависимости сервера |
| `npm run build` | сборка фронтенда в `frontend/dist` |
| `npm start` | запуск сервера (`node server.js`) |
| `pm2 start ecosystem.config.cjs` | запуск под pm2 |

## Конфигурация

- Секреты — через `.env` (читается `dotenv`) или окружение. См. `.env.example`.
- Redis — через `REDIS_URL`.
- Деплой, nginx, TLS и установка секретов — см. `README.timeweb.md`.

## Требования рантайма

- Node.js 18+ (глобальные `fetch`/`Request`/`Response`/`Headers`/`crypto.subtle`).
- Redis.
- nginx c TLS и пробросом `X-Forwarded-Proto` / `Host` (иначе ломаются
  CSRF-проверка `Origin === url.origin` и cookie `Secure; SameSite=None`).
