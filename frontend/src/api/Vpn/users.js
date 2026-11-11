// API VPN (NetBird). В браузер токен не отдаём — фронт ходит на наш бэкенд
// (/api/vpn/users), а он уже запрашивает NetBird с Authorization: Token.

export async function getUsers() {
  const response = await fetch("/api/vpn/users", {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error || `Ошибка получения пользователей VPN: HTTP ${response.status}`,
    );
  }

  return data;
}

export async function getGroups() {
  const response = await fetch("/api/vpn/groups", {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error || `Ошибка получения групп VPN: HTTP ${response.status}`,
    );
  }

  return data;
}

// Создать/пригласить пользователя в NetBird. autoGroups — массив ID групп.
// mode: "invite" (приглашение, /api/users/invites) | "create" (сразу, /api/users)
export async function addUser({
  email,
  name,
  role = "user",
  autoGroups = [],
  mode = "create",
}) {
  const response = await fetch("/api/vpn/users", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      name,
      role,
      auto_groups: autoGroups,
      mode,
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error || `Ошибка создания пользователя VPN: HTTP ${response.status}`,
    );
  }

  return data;
}

// Группы из нашей БД (каталог).
export async function getStoredGroups() {
  const response = await fetch("/api/vpn/groups/db", {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error || `Ошибка получения групп из БД: HTTP ${response.status}`,
    );
  }

  return data;
}

// Записать группы NetBird в нашу БД (синхронизация каталога).
export async function syncGroups() {
  const response = await fetch("/api/vpn/groups/sync", {
    method: "POST",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error || `Ошибка синхронизации групп: HTTP ${response.status}`,
    );
  }

  return data;
}