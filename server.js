// Node-адаптер для Timeweb: превращает входящий HTTP-запрос в Web Request,
// вызывает существующий worker.fetch(request, env, ctx) (код из Cloudflare
// остаётся без изменений) и отдаёт Web Response обратно в Node.
//
// Зависит от Node 18+ (глобальные fetch/Request/Response/Headers/crypto).

import "dotenv/config"; // подхватывает .env в process.env (должен быть первым)

import http from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import worker from "./src/worker.js";
import { createKvRedis } from "./server/kv-redis.js";
import { createKvFile } from "./server/kv-file.js";
import { createAssets } from "./server/assets.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 3000;
const ASSETS_DIR = process.env.ASSETS_DIR || join(__dirname, "frontend", "dist");
const DATA_DIR = process.env.DATA_DIR || join(__dirname, ".data");

// --- Хранилище вместо Cloudflare KV ---
// Если задан REDIS_URL — используем Redis (подходит для VPS).
// Иначе — файловое хранилище: работает на любом хостинге с Node, без Redis.
let appConfigKv;
let installsKv;

if (process.env.REDIS_URL) {
  const { default: Redis } = await import("ioredis");
  const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 5 });

  redis.on("error", (err) => console.error("[redis]", err.message));
  redis.on("connect", () => console.log("[redis] connected"));

  appConfigKv = createKvRedis(redis, "bitrix_app_config:");
  installsKv = createKvRedis(redis, "bitrix_installs:");

  console.log("[kv] Redis");
} else {
  appConfigKv = createKvFile(join(DATA_DIR, "bitrix_app_config.json"));
  installsKv = createKvFile(join(DATA_DIR, "bitrix_installs.json"));

  console.log(`[kv] файловое хранилище (${DATA_DIR})`);
}

// --- env: секреты из окружения + шимы вместо биндингов Cloudflare ---
const env = {
  ...process.env,
  BITRIX_APP_CONFIG: appConfigKv,
  BITRIX_INSTALLS: installsKv,
  ASSETS: createAssets(ASSETS_DIR),
};

// В Workers ctx управляет фоновыми задачами; здесь они не нужны.
const ctx = { waitUntil() {}, passThroughOnException() {} };

// Внешний origin берём из заголовков от nginx, иначе CSRF-проверка
// (Origin === url.origin) и Secure-cookie сломаются за реверс-прокси.
function buildBase(req) {
  const proto = String(req.headers["x-forwarded-proto"] || "http")
    .split(",")[0]
    .trim();
  const host =
    req.headers["x-forwarded-host"] || req.headers.host || `localhost:${PORT}`;

  return `${proto}://${host}`;
}

function readBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];

    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolveBody(Buffer.concat(chunks)));
    req.on("error", rejectBody);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = buildBase(req) + req.url;

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) {
        for (const item of value) headers.append(key, item);
      } else if (value != null) {
        headers.set(key, value);
      }
    }

    const method = req.method || "GET";
    const hasBody = method !== "GET" && method !== "HEAD";
    const body = hasBody ? await readBody(req) : undefined;

    const request = new Request(url, {
      method,
      headers,
      body: body && body.length ? body : undefined,
    });

    const response = await worker.fetch(request, env, ctx);

    res.statusCode = response.status;

    // Обычные заголовки (Set-Cookie обрабатываем отдельно, иначе
    // несколько cookie склеятся в один заголовок).
    for (const [key, value] of response.headers) {
      if (key.toLowerCase() === "set-cookie") continue;
      res.setHeader(key, value);
    }

    const setCookies =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : [];

    if (setCookies.length) {
      res.setHeader("Set-Cookie", setCookies);
    }

    if (method === "HEAD") {
      res.end();
      return;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    res.end(buffer);
  } catch (err) {
    console.error("[server] Необработанная ошибка:", err);

    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
    }

    res.end("Internal Server Error");
  }
});

server.listen(PORT, () => {
  console.log(`service-acc слушает :${PORT} (assets: ${ASSETS_DIR})`);
});
