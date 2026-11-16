// NetBird (VPN) — получение списка пользователей.
// Токен (VPN_TOKEN) живёт только на сервере, в браузер не попадает:
// фронт ходит на наш /api/vpn/users, а уже он — в NetBird.
//
// API: GET {VPN_API_BASE}/api/users, заголовок Authorization: Token <VPN_TOKEN>.
// Ответ NetBird — голый JSON-массив объектов пользователей.
// Док: https://docs.netbird.io/api/resources/users

const DEFAULT_BASE = "https://vpn.energy-team.ru";

function getBase(env) {
  // Можно переопределить адрес через .env (VPN_API_BASE), иначе дефолт.
  const raw = String(env.VPN_API_BASE || DEFAULT_BASE).trim();

  return raw.replace(/\/+$/, "");
}

function getToken(env) {
  // .trim() — чтобы случайные пробелы/перевод строки из .env не ломали заголовок.
  const token = String(env.VPN_TOKEN || "").trim();

  if (!token) {
    throw new Error("VPN_TOKEN не задан в окружении (.env)");
  }

  return token;
}

// В браузер отдаём только нужные интерфейсу поля. Пароль, idp_id, объект
// permissions и т.п. наружу не выносим.
function toPublicVpnUser(user) {
  const groups = Array.isArray(user?.auto_groups) ? user.auto_groups : [];

  return {
    id: user?.id || "",
    email: user?.email || "",
    name: user?.name || "",
    role: user?.role || "",
    status: user?.status || "",
    groups: groups.length,
    last_login: user?.last_login || "",
    is_service_user: Boolean(user?.is_service_user),
    is_blocked: Boolean(user?.is_blocked),
    issued: user?.issued || "",
  };
}

export async function getVpnUsers(env) {
  const token = getToken(env);
  const url = `${getBase(env)}/api/users`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Token ${token}`,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const error = new Error(
      `NetBird API вернул HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
    );

    error.status = response.status;
    throw error;
  }

  const data = await response.json().catch(() => null);
  const list = Array.isArray(data) ? data : data?.users || [];

  return list.map(toPublicVpnUser);
}

// Приглашение NetBird. invite_token — секрет (по нему можно принять инвайт),
// наружу его НЕ отдаём.
function toPublicVpnInvite(inv) {
  const groups = Array.isArray(inv?.auto_groups) ? inv.auto_groups : [];

  return {
    id: inv?.id || "",
    email: inv?.email || "",
    name: inv?.name || "",
    role: inv?.role || "",
    groups: groups.length,
    created_at: inv?.created_at || "",
    expires_at: inv?.expires_at || "",
    expired: Boolean(inv?.expired),
  };
}

// Список приглашений (pending invites). Доступно только при включённом
// embedded IdP в NetBird.
export async function getVpnInviteUsers(env) {
  const token = getToken(env);
  const url = `${getBase(env)}/api/users/invites`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Token ${token}`,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const error = new Error(
      `NetBird API вернул HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
    );

    error.status = response.status;
    throw error;
  }

  const data = await response.json().catch(() => null);
  const list = Array.isArray(data) ? data : data?.invites || [];

  return list.map(toPublicVpnInvite);
}

// Группа NetBird: наружу отдаём id, имя и число пиров.
function toPublicVpnGroup(group) {
  return {
    id: group?.id || "",
    name: group?.name || "",
    peers_count: Number(group?.peers_count) || 0,
  };
}

export async function getVpnGroups(env) {
  const token = getToken(env);
  const url = `${getBase(env)}/api/groups`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Token ${token}`,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const error = new Error(
      `NetBird API вернул HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
    );

    error.status = response.status;
    throw error;
  }

  const data = await response.json().catch(() => null);
  const list = Array.isArray(data) ? data : data?.groups || [];

  return list.map(toPublicVpnGroup);
}

// Добавление пользователя в NetBird. Два режима:
//   mode "invite" → POST /api/users/invites — ПРИГЛАШЕНИЕ. Пользователь
//                   создаётся только после принятия инвайта (нужен embedded IdP).
//   mode "create" → POST /api/users — создаёт пользователя сразу.
// auto_groups — ID групп (не имена). role обязателен.
export async function addVpnUser(
  env,
  { email, name, role = "user", autoGroups = [], mode = "create", expiresIn } = {},
) {
  const token = getToken(env);
  const isInvite = mode === "invite";
  const url = `${getBase(env)}/api/users${isInvite ? "/invites" : ""}`;

  const body = {
    email: String(email || "").trim(),
    name: String(name || "").trim(),
    role: role || "user",
    auto_groups: Array.isArray(autoGroups) ? autoGroups : [],
  };

  if (isInvite) {
    if (expiresIn) {
      body.expires_in = Number(expiresIn);
    }
  } else {
    body.is_service_user = false;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Token ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const error = new Error(
      `NetBird ${isInvite ? "invite" : "create user"} HTTP ${response.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
    );

    error.status = response.status;
    throw error;
  }

  return response.json().catch(() => null);
}

// Перегенерация приглашения NetBird: продлевает срок и выдаёт новый
// invite_token (старая ссылка перестаёт работать).
// POST {base}/api/users/invites/{inviteId}/regenerate
// Док: https://docs.netbird.io/api/resources/users
export async function regenerateVpnInvite(env, inviteId) {
  const token = getToken(env);
  const id = String(inviteId || "").trim();

  if (!id) {
    throw new Error("Не указан ID приглашения");
  }

  const url = `${getBase(env)}/api/users/invites/${encodeURIComponent(id)}/regenerate`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Token ${token}`,
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const error = new Error(
      `NetBird regenerate invite HTTP ${response.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
    );

    error.status = response.status;
    throw error;
  }

  const data = await response.json().catch(() => null);

  // invite_token наружу не отдаём — только публичные поля.
  return data ? toPublicVpnInvite(data) : null;
}

// Удаление приглашения NetBird
// DELETE {base}/api/users/invites/{inviteId}
// Док: https://docs.netbird.io/api/resources/users#delete-a-user-invite
export async function deleteVpnInvite(env, inviteId) {
  const token = getToken(env);
  const id = String(inviteId || "").trim();

  if (!id) {
    throw new Error("Не указан ID приглашения");
  }

  const url = `${getBase(env)}/api/users/invites/${encodeURIComponent(id)}`;

  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      Accept: "application/json",
      Authorization: `Token ${token}`,
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const error = new Error(
      `NetBird delete invite HTTP ${response.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
    );

    error.status = response.status;
    throw error;
  }

  // DELETE обычно возвращает пустое тело — ничего не парсим.
  return { ok: true };
}

// Удаление пользователя NetBird.
// DELETE {base}/api/users/{userId}
// Док: https://docs.netbird.io/api/resources/users#delete-a-user
export async function deleteVpnUser(env, userId) {
  const token = getToken(env);
  const id = String(userId || "").trim();

  if (!id) {
    throw new Error("Не указан ID пользователя");
  }

  const url = `${getBase(env)}/api/users/${encodeURIComponent(id)}`;

  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      Accept: "application/json",
      Authorization: `Token ${token}`,
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const error = new Error(
      `NetBird delete user HTTP ${response.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
    );

    error.status = response.status;
    throw error;
  }

  // DELETE обычно возвращает пустое тело.
  return { ok: true };
}

// Блокировка / разблокировка пользователя NetBird.
// NetBird обновляет пользователя через PUT {base}/api/users/{userId}, причём
// role и auto_groups в теле ОБЯЗАТЕЛЬНЫ — поэтому сначала берём текущие данные
// пользователя из списка (отдельного GET одного пользователя у NetBird нет).
// Док: https://docs.netbird.io/api/resources/users#update-a-user
export async function setVpnUserBlocked(env, userId, blocked) {
  const token = getToken(env);
  const id = String(userId || "").trim();

  if (!id) {
    throw new Error("Не указан ID пользователя");
  }

  const base = getBase(env);
  const authHeaders = {
    Accept: "application/json",
    Authorization: `Token ${token}`,
  };

  // Текущие role и auto_groups пользователя (нужны для PUT).
  const listResp = await fetch(`${base}/api/users`, { headers: authHeaders });

  if (!listResp.ok) {
    const text = await listResp.text().catch(() => "");
    const error = new Error(
      `NetBird list users HTTP ${listResp.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
    );

    error.status = listResp.status;
    throw error;
  }

  const list = await listResp.json().catch(() => []);
  const current = (Array.isArray(list) ? list : []).find((u) => u?.id === id);

  if (!current) {
    throw new Error("Пользователь не найден в NetBird");
  }

  const response = await fetch(`${base}/api/users/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: {
      ...authHeaders,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      role: current.role || "user",
      auto_groups: Array.isArray(current.auto_groups) ? current.auto_groups : [],
      is_blocked: Boolean(blocked),
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const error = new Error(
      `NetBird ${blocked ? "block" : "unblock"} user HTTP ${response.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
    );

    error.status = response.status;
    throw error;
  }

  const data = await response.json().catch(() => null);

  return data ? toPublicVpnUser(data) : null;
}