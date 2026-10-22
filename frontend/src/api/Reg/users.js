export async function getMailboxes(domain = "energy-team.club") {
  const url = new URL("/api/reg/mailboxes", window.location.origin);
  url.searchParams.set("domain", domain);

  const response = await fetch(url, {
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
      `Ошибка получения почтовых ящиков: HTTP ${response.status}`
    );
  }

  return data;
}
export async function createUser(userData) {
  const response = await fetch("/api/reg/mailboxes",
    {
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
  return data
}

export async function deleteUser(email) {
  const response = await fetch(
    `/api/reg/mailboxes/${encodeURIComponent(email)}`,
    {
      method: "DELETE",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
      },
    }
  );

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error || `Ошибка удаления ящика: HTTP ${response.status}`
    );
  }

  return data;
}