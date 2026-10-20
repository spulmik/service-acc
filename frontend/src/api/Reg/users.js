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
