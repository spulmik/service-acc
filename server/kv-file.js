// Файловый KV — замена Redis для хостингов без него (виртуальный хостинг).
// Хранит пары ключ/значение в JSON-файле с поддержкой TTL (expirationTtl).
// Интерфейс тот же, что у kv-redis.js: get / put / delete.
//
// Рассчитан на один процесс Node (fork) и небольшой объём данных
// (сессии Bitrix, кеш идемпотентности) — именно так работает это приложение.

import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export function createKvFile(filePath) {
  let store = {}; // key -> { v: string, exp: number | null }
  let loaded = false;
  let chain = Promise.resolve();

  async function load() {
    if (loaded) return;

    try {
      store = JSON.parse(await readFile(filePath, "utf8")) || {};
    } catch {
      store = {};
    }

    loaded = true;
  }

  async function persist() {
    await mkdir(dirname(filePath), { recursive: true });

    // Атомарная запись: сначала во временный файл, затем переименование.
    const tmp = `${filePath}.tmp`;
    await writeFile(tmp, JSON.stringify(store));
    await rename(tmp, filePath);
  }

  function queuePersist() {
    chain = chain.then(persist, persist);
    return chain;
  }

  function isAlive(entry) {
    return entry && (entry.exp == null || entry.exp > Date.now());
  }

  return {
    async get(key, options) {
      await load();

      const entry = store[key];

      if (!isAlive(entry)) {
        if (entry) {
          delete store[key];
          queuePersist();
        }

        return null;
      }

      const type = typeof options === "string" ? options : options?.type;

      if (type === "json") {
        try {
          return JSON.parse(entry.v);
        } catch {
          return null;
        }
      }

      return entry.v;
    },

    async put(key, value, options) {
      await load();

      const ttl = Number(options?.expirationTtl);
      const exp =
        Number.isFinite(ttl) && ttl > 0 ? Date.now() + ttl * 1000 : null;

      store[key] = {
        v: typeof value === "string" ? value : String(value),
        exp,
      };

      await queuePersist();
    },

    async delete(key) {
      await load();

      if (key in store) {
        delete store[key];
        await queuePersist();
      }
    },
  };
}
