// Шим, повторяющий интерфейс Cloudflare KV поверх Redis.
// Код приложения вызывает env.BITRIX_APP_CONFIG.get/put/delete как раньше —
// менять worker.js, auth.js и активности не нужно.
//
// Поддержано ровно то, что использует проект:
//   get(key)                      -> string | null
//   get(key, { type: "json" })    -> any | null
//   put(key, value)               -> void
//   put(key, value, { expirationTtl })  -> void  (TTL в секундах)
//   delete(key)                   -> void

export function createKvRedis(redis, prefix = "") {
  const withPrefix = (key) => `${prefix}${key}`;

  return {
    async get(key, options) {
      const raw = await redis.get(withPrefix(key));

      if (raw == null) {
        return null;
      }

      // options может быть строкой ("json"/"text") или объектом { type }.
      const type = typeof options === "string" ? options : options?.type;

      if (type === "json") {
        try {
          return JSON.parse(raw);
        } catch {
          return null;
        }
      }

      return raw;
    },

    async put(key, value, options) {
      const val = typeof value === "string" ? value : String(value);
      const ttl = Number(options?.expirationTtl);

      if (Number.isFinite(ttl) && ttl > 0) {
        await redis.set(withPrefix(key), val, "EX", Math.max(1, Math.floor(ttl)));
      } else {
        await redis.set(withPrefix(key), val);
      }
    },

    async delete(key) {
      await redis.del(withPrefix(key));
    },
  };
}
