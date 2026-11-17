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
const DETAIL_CONCURRENCY = 16;
// Stale-while-revalidate для списка пользователей:
//   USERS_FRESH_TTL   — сколько секунд данные считаем «свежими». После этого
//                       запрос всё равно получает кэш МГНОВЕННО, а свежие
//                       данные подтягиваются в фоне (пользователь не ждёт).
//   USERS_CACHE_HARD_TTL — сколько держим запись в KV вообще, чтобы было что
//                       отдать как stale. Больше срока свежести.
const USERS_FRESH_TTL = 3600; // 1 час
const USERS_CACHE_HARD_TTL = 86400; // 1 сутки

// Защита от «стада»: один фоновый пересбор на тип за раз (в рамках процесса).
const inFlightRefresh = new Map();

function nowSec() {
  return Math.floor(Date.now() / 1000);
}
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

// Тяжёлый путь: /phone/user даёт краткий список, затем по каждому
// /user/:username берём детали (параллельно). Результат пишем в кэш в формате
// { data, fetchedAt } и возвращаем. Это и есть «пересбор».
async function fetchAndCacheUsers(env, type) {
  const tenant = getTenant(type);
  const store = getStore(env);
  const cacheKey = `cc:users:${type}`;

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

  const usernameOf = (item) =>
    item?.username || item?.loginId || item?.name || item?.user;

  // Детали — параллельно, с ограничением одновременных запросов. Для таблицы
  // оставляем только нужные поля: краткие (extension/loginId/ФИО) + из деталей
  // (team/disabled). Меньше данных в кэше и в браузере.
  const users = await mapWithConcurrency(
    items,
    DETAIL_CONCURRENCY,
    async (item) => {
      // Поля из краткого списка /phone/user.
      const base = {
        extension: item?.extension ?? "",
        loginId: item?.loginId ?? "",
        lastName: item?.lastName ?? "",
        firstName: item?.firstName ?? "",
        team: "",
        disabled: false,
      };

      const username = usernameOf(item);
      if (!username) {
        return base;
      }

      // Детали из /user/:username — берём только team и disabled.
      try {
        const detail = await ccGet(
          tenant.host,
          `/user/${encodeURIComponent(username)}`,
          token,
        );

        return {
          ...base,
          team: detail?.team ?? "",
          disabled: Boolean(detail?.disabled),
        };
      } catch {
        // Детали не достали — отдаём хотя бы краткую запись.
        return base;
      }
    },
  );

  const result = users.filter(Boolean);

  if (store) {
    await store
      .put(cacheKey, JSON.stringify({ data: result, fetchedAt: nowSec() }), {
        expirationTtl: USERS_CACHE_HARD_TTL,
      })
      .catch(() => {});
  }

  return result;
}

// Запустить фоновый пересбор (не дожидаясь). В Node процесс долгоживущий, так
// что промис доживёт и обновит кэш. Повторные вызовы по тому же типу схлопываем.
function triggerBackgroundRefresh(env, type) {
  if (inFlightRefresh.has(type)) {
    return;
  }

  const task = fetchAndCacheUsers(env, type)
    .catch((error) => {
      console.error("[CloudContact] Фоновое обновление кэша не удалось", {
        type,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    })
    .finally(() => {
      inFlightRefresh.delete(type);
    });

  inFlightRefresh.set(type, task);
}

// 2. Список пользователей (stale-while-revalidate):
//    — есть свежий кэш → отдаём сразу;
//    — кэш протух (старше USERS_FRESH_TTL), но есть → отдаём stale СРАЗУ и
//      обновляем в фоне;
//    — кэша нет или forceRefresh → собираем синхронно (единственный «долгий»
//      случай, обычно только самый первый заход).
export async function getCloudContactUsers(env, type, forceRefresh = false) {
  const store = getStore(env);
  const cacheKey = `cc:users:${type}`;

  if (store && !forceRefresh) {
    const cached = await store.get(cacheKey).catch(() => null);

    if (cached) {
      let parsed = null;
      try {
        parsed = JSON.parse(cached);
      } catch {
        // битый кэш — упадём в полный пересбор ниже
      }

      // Поддержка старого формата (чистый массив) и нового ({data, fetchedAt}).
      const data = Array.isArray(parsed) ? parsed : parsed?.data;
      const fetchedAt = Array.isArray(parsed) ? 0 : parsed?.fetchedAt || 0;

      if (Array.isArray(data)) {
        if (nowSec() - fetchedAt >= USERS_FRESH_TTL) {
          // Протухло — отдаём stale, свежее подтянется в фоне.
          triggerBackgroundRefresh(env, type);
        }

        return data;
      }
    }
  }

  // Нет кэша или принудительное обновление — тяжёлый путь синхронно.
  return fetchAndCacheUsers(env, type);
}

// Команды (teams) тенанта: GET /configapi/v2/team → список. Возвращаем имена.
// Нужны для drag-and-drop в номерном плане (3 миниокна Osn/Msp/Back).
export async function getCloudContactTeams(env, type) {
  const tenant = getTenant(type);

  let token = await getCloudContactToken(env, type);

  let list;
  try {
    list = await ccGet(tenant.host, "/team", token);
  } catch (error) {
    if (error.status === 401) {
      token = await getCloudContactToken(env, type, true);
      list = await ccGet(tenant.host, "/team", token);
    } else {
      throw error;
    }
  }

  const items = Array.isArray(list) ? list : list?.items || list?.teams || [];

  return items
    .map((t) => (typeof t === "string" ? t : t?.name))
    .filter(Boolean);
}

// Занятые внутренние номера (extension) тенанта. Лёгкий запрос — только
// краткий список /phone/user (без детальных /user/:username).
export async function getUsedExtensions(env, type) {
  const tenant = getTenant(type);

  let token = await getCloudContactToken(env, type);

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

  return items
    .map((u) => String(u?.extension ?? "").trim())
    .filter(Boolean);
}

// 3. Прогрев кэша: заранее собираем список по всем тенантам, чтобы даже самый
//    первый заход пользователя был мгновенным. Вызывается при старте сервера и
//    по расписанию (см. server.js). Ошибка по одному тенанту (например, не
//    настроен секрет) не роняет остальные. Тенанты идут последовательно, чтобы
//    не бить по BrightPattern тройной нагрузкой разом.
export async function warmCloudContactCache(env, types = Object.keys(TENANTS)) {
  const results = [];

  for (const type of types) {
    try {
      const users = await fetchAndCacheUsers(env, type);

      console.log("[CloudContact] Кэш прогрет", { type, count: users.length });
      results.push({ type, ok: true, count: users.length });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";

      console.error("[CloudContact] Прогрев кэша не удался", { type, message });
      results.push({ type, ok: false, error: message });
    }
  }

  return results;
}
