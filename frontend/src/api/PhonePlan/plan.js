// API номерного плана телефонии. Фронт ходит на наш бэкенд (/api/phoneplan),
// он уже пишет/читает таблицу phone_plan в БД.

export async function getPlan() {
  const response = await fetch("/api/phoneplan", {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error || `Ошибка получения номерного плана: HTTP ${response.status}`,
    );
  }

  return data;
}

// Привязать команду к группе (drag-and-drop). group=null — отвязать.
// tenant (osn|msp|back) — откуда перетащили, поднимает флаг.
export async function assignTeam({ team, group, tenant }) {
  const response = await fetch("/api/phoneplan/assign", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ team, group, tenant }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error || `Ошибка привязки команды: HTTP ${response.status}`,
    );
  }

  return data?.row;
}

// --- Группы номерного плана ---

export async function getGroups() {
  const response = await fetch("/api/phonegroups", {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error || `Ошибка получения групп: HTTP ${response.status}`,
    );
  }

  return data?.groups || [];
}

export async function createGroup(name) {
  const response = await fetch("/api/phonegroups", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error || `Ошибка создания группы: HTTP ${response.status}`,
    );
  }

  return data?.group;
}

// Обновить диапазон номеров группы.
export async function updateGroup(id, { firstNumber, lastNumber }) {
  const response = await fetch(`/api/phonegroups/${encodeURIComponent(id)}`, {
    method: "PUT",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ firstNumber, lastNumber }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error || `Ошибка обновления группы: HTTP ${response.status}`,
    );
  }

  return data?.group;
}

export async function deleteGroup(id) {
  const response = await fetch(`/api/phonegroups/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error || `Ошибка удаления группы: HTTP ${response.status}`,
    );
  }

  return data;
}
