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