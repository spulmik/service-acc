// Справочник ролей CloudContact (таблица cloudcontact_roles).
// Роли ведём в своей БД — у BrightPattern нет API-списка ролей.
// Управление (CRUD) — модалка «Роли CloudContact» в настройках.
// Чтение по сервису — форма добавления пользователя.

// Полный список ролей с флагами (для модалки управления).
export async function getAllRoles() {
  const response = await fetch("/api/cloudcontact-roles", {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error || `Ошибка получения ролей: HTTP ${response.status}`,
    );
  }

  return data?.roles || [];
}

// Имена ролей конкретного сервиса (osn|msp|back) — для формы добавления.
export async function getRolesForService(type) {
  const response = await fetch(
    `/api/cloudcontact-roles?service=${encodeURIComponent(type)}`,
    {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    },
  );

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error || `Ошибка получения ролей: HTTP ${response.status}`,
    );
  }

  return data?.roles || [];
}

export async function createRole(role) {
  const response = await fetch("/api/cloudcontact-roles", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(role),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error || `Ошибка создания роли: HTTP ${response.status}`,
    );
  }

  return data?.role;
}

export async function updateRole(id, role) {
  const response = await fetch(`/api/cloudcontact-roles/${encodeURIComponent(id)}`, {
    method: "PUT",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(role),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error || `Ошибка обновления роли: HTTP ${response.status}`,
    );
  }

  return data?.role;
}

export async function deleteRole(id) {
  const response = await fetch(`/api/cloudcontact-roles/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error || `Ошибка удаления роли: HTTP ${response.status}`,
    );
  }

  return data;
}
