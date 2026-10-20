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

export async function createUser(userData) {
  const response = await fetch("/api/yandex/users", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(userData),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error || `Ошибка создания пользователя: HTTP ${response.status}`
    );
  }

  return data;
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
