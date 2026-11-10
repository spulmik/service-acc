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