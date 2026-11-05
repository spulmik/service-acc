// Генерация пароля. Правило одно и то же для всех форм создания —
// живёт на бэке (src/functions.js, generatePassword), фронт только просит.

export async function generatePassword() {
  const response = await fetch("/api/password", {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error || `Не удалось сгенерировать пароль: HTTP ${response.status}`,
    );
  }

  return data?.password || "";
}
