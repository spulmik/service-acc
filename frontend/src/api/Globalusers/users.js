// API реестра участников (members). Данные с расшифрованными паролями
// отдаёт только бэкенд и только пользователям из MEMBERS_ALLOWED_USERS.

export async function getMembers() {
  const response = await fetch("/api/members", {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error || `Ошибка получения участников: HTTP ${response.status}`,
    );
  }

  return data;
}

// Текущий пользователь: { username, canSeeMembers }.
export async function getMe() {
  const response = await fetch("/api/me", {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error || `HTTP ${response.status}`);
  }

  return data;
}
