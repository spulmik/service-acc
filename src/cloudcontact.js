// CloudContact (BrightPattern BPCC). Вкладки osn/msp/back отличаются только
// тенантом и секретом — client_id общий. Логика запросов одна.
//
// Нужные переменные окружения:
//   CLOUD_CONTACT_CLIENT_ID            — общий логин (client_id)
//   CLOUD_CONTACT_CLIENT_SECRET        — секрет для osn
//   CLOUD_CONTACT_MSP_CLIENT_SECRET    — секрет для msp
//   CLOUD_CONTACT_BACK_CLIENT_SECRET   — секрет для back

const TENANTS = {
  osn: {
    host: "energyteam.hostedcc.ru",
    secretEnv: "CLOUD_CONTACT_CLIENT_SECRET",
  },
  msp: {
    host: "energyteam_msp.hostedcc.ru",
    secretEnv: "CLOUD_CONTACT_MSP_CLIENT_SECRET",
  },
  back: {
    host: "energyteam_back.hostedcc.ru",
    secretEnv: "CLOUD_CONTACT_BACK_CLIENT_SECRET",
  },
};

// Сколько деталей тянуть одновременно (/user/:username). Больше — быстрее,
// но не перегружаем BrightPattern. 8 — разумный компромисс.
const DETAIL_CONCURRENCY = 8;
// Кэш готового списка пользователей (секунды). Повторный заход — мгновенный.
const USERS_CACHE_TTL = 300;
// Запас, на сколько раньше срока считать токен «протухшим».
const TOKEN_EXPIRY_BUFFER = 60;
// Если сервер не вернул expires_in — считаем токен живым столько секунд.
const TOKEN_TTL_FALLBACK = 3000;

function getTenant(type) {
  const tenant = TENANTS[type];

  if (!tenant) {
    throw new Error(`Неизвестный тип CloudContact: "${type}"`);
  }

  return tenant;
}

// KV для кэша (тот же binding, что и для остального приложения). Может
// отсутствовать — тогда просто работаем без кэша.
function getStore(env) {
  return env.BITRIX_APP_CONFIG || null;
}

// 1. Токен OAuth2 (client_credentials). URL/секрет зависят от вкладки.
//    Кэшируем в KV до истечения срока, чтобы не ходить за ним каждый раз.
export async function getCloudContactToken(env, type, forceRefresh = false) {
  const tenant = getTenant(type);
  const store = getStore(env);
  const cacheKey = `cc:token:${type}`;

  if (store && !forceRefresh) {
    const cached = await store.get(cacheKey).catch(() => null);
    if (cached) {
      return cached;
    }
  }

  const clientId = env.CLOUD_CONTACT_CLIENT_ID;
  const clientSecret = env[tenant.secretEnv];

  if (!clientId || !clientSecret) {
    throw new Error("Не настроены учётные данные CloudContact");
  }

  const response = await fetch(
    `https://${tenant.host}/configapi/v2/oauth/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: tenant.host,
        grant_type: "client_credentials",
      }),
      signal: AbortSignal.timeout(20000),
    },
  );

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.access_token) {
    console.error("[CloudContact] Ошибка токена", {
      type,
      status: response.status,
      error: data?.error || data?.error_description || "",
    });

    throw new Error("Не удалось получить токен CloudContact");
  }

  if (store) {
    const ttl = Math.max(
      TOKEN_EXPIRY_BUFFER,
      Number(data.expires_in || TOKEN_TTL_FALLBACK) - TOKEN_EXPIRY_BUFFER,
    );

    await store
      .put(cacheKey, data.access_token, { expirationTtl: ttl })
      .catch(() => {});
  }

  return data.access_token;
}

async function ccGet(host, path, token) {
  const response = await fetch(`https://${host}/configapi/v2${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(20000),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(`CloudContact HTTP ${response.status} (${path})`);
    error.status = response.status;
    throw error;
  }

  return data;
}

// Выполняет fn для каждого элемента, но не более `limit` одновременно.
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current], current);
    }
  }

  const size = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: size }, () => worker()));

  return results;
}

// 2. Список пользователей: /phone/user даёт краткую информацию,
//    затем по каждому /user/:username берём полную (параллельно).
//    Результат кэшируем на USERS_CACHE_TTL секунд.
export async function getCloudContactUsers(env, type) {
  const tenant = getTenant(type);
  const store = getStore(env);
  const cacheKey = `cc:users:${type}`;

  if (store) {
    const cached = await store.get(cacheKey).catch(() => null);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // битый кэш — просто перезапросим
      }
    }
  }

  let token = await getCloudContactToken(env, type);

  // Краткий список. Если токен успел протухнуть — обновляем и повторяем раз.
  let list;
  try {
    list = await ccGet(tenant.host, "/phone/user", token);
  } catch (error) {
    if (error.status === 401) {
      token = await getCloudContactToken(env, type, true);
      list = await ccGet(tenant.host, "/phone/user", token);
    } else {
      throw error;
    }
  }

  const items = Array.isArray(list) ? list : list?.items || list?.users || [];

  // Имена пользователей из краткого списка.
  const names = items
    .map((item) => item?.username || item?.loginId || item?.name || item?.user)
    .filter(Boolean);

  // Детали — параллельно, с ограничением одновременных запросов.
  const users = await mapWithConcurrency(
    names,
    DETAIL_CONCURRENCY,
    async (username) => {
      try {
        return await ccGet(
          tenant.host,
          `/user/${encodeURIComponent(username)}`,
          token,
        );
      } catch {
        // Не получили детали — вернём хотя бы краткую запись.
        return items.find(
          (item) =>
            (item?.username || item?.loginId || item?.name || item?.user) ===
            username,
        );
      }
    },
  );

  const result = users.filter(Boolean);

  if (store) {
    await store
      .put(cacheKey, JSON.stringify(result), {
        expirationTtl: USERS_CACHE_TTL,
      })
      .catch(() => {});
  }

  return result;
}
