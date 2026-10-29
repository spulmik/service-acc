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

function getTenant(type) {
  const tenant = TENANTS[type];

  if (!tenant) {
    throw new Error(`Неизвестный тип CloudContact: "${type}"`);
  }

  return tenant;
}

// 1. Токен OAuth2 (client_credentials). URL/секрет зависят от вкладки.
export async function getCloudContactToken(env, type) {
  const tenant = getTenant(type);
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
    throw new Error(`CloudContact HTTP ${response.status} (${path})`);
  }

  return data;
}

// 2. Список пользователей: /phone/user даёт краткую информацию,
//    затем по каждому /user/:username берём полную.
export async function getCloudContactUsers(env, type) {
  const tenant = getTenant(type);
  const token = await getCloudContactToken(env, type);

  const list = await ccGet(tenant.host, "/phone/user", token);
  const items = Array.isArray(list)
    ? list
    : list?.items || list?.users || [];

  const users = [];

  for (const item of items) {
    // В кратком списке имя может называться по-разному — пробуем варианты.
    const username =
      item?.username || item?.loginId || item?.name || item?.user;

    if (!username) {
      continue;
    }

    try {
      const full = await ccGet(
        tenant.host,
        `/user/${encodeURIComponent(username)}`,
        token,
      );

      users.push(full);
    } catch {
      // Не получили детали — кладём хотя бы краткую запись.
      users.push(item);
    }
  }

  return users;
}
