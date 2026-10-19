export async function getUsers() {
  const response = await fetch("/api/yandex/users", {
    method: "GET",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error ||
      `Ошибка получения пользователей: HTTP ${response.status}`
    );
  }

  return data.users;
}

export async function deleteUser(userId) {
  const response = await fetch(
    `/api/yandex/users/${encodeURIComponent(userId)}`,
    {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
      },
    }
  )

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(
      data?.error || `Ошибка удаления пользователя: HTTP ${response.status}`
    )
  }

  return data
}
