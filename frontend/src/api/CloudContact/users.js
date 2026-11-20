// Единый API для CloudContact. Вкладки Osn / Msp / Back используют
// одинаковый код запросов — отличается только URL. Поэтому базовый адрес
// выбираем по типу (карта = аналог switch/case), а не дублируем три файла.
//
// Подставьте реальные эндпоинты вашего бэкенда (как у Reg/Yandex).
const ENDPOINTS = {
  osn: "/api/cloudcontact/osn",
  msp: "/api/cloudcontact/msp",
  back: "/api/cloudcontact/back",
};

function baseUrl(type) {
  const url = ENDPOINTS[type];

  if (!url) {
    throw new Error(`Неизвестный тип CloudContact: "${type}"`);
  }

  return url;
}

export async function getUsers(type, { refresh = false } = {}) {
  // refresh=true — просим бэкенд сбросить кэш и взять свежие данные.
  const url = refresh ? `${baseUrl(type)}?refresh=1` : baseUrl(type);

  const response = await fetch(url, {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error || `Ошибка получения пользователей: HTTP ${response.status}`,
    );
  }

  return data;
}

// Команды (teams) тенанта — для drag-and-drop номерного плана.
export async function getTeams(type) {
  const response = await fetch(`${baseUrl(type)}/teams`, {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error || `Ошибка получения команд: HTTP ${response.status}`,
    );
  }

  return data?.teams || [];
}

// Первый свободный внутренний номер (extension) для команды в сервисе.
// Диапазон берётся из группы команды в БД, занятые — из CloudContact.
export async function getFreeNumber(type, team) {
  const url = `${baseUrl(type)}/freenumber?team=${encodeURIComponent(team)}`;

  const response = await fetch(url, {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error || `Не удалось подобрать номер: HTTP ${response.status}`,
    );
  }

  return data; // { number, group, range: { first, last } }
}

export async function createUser(type, userData) {
  const response = await fetch(baseUrl(type), {
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
      data?.error || `Ошибка создания пользователя: HTTP ${response.status}`,
    );
  }

  return data;
}

// Блокировка / разблокировка: PUT /api/cloudcontact/{type}/{loginId}
// с телом { blocked }. blocked=true — заблокировать.
export async function blockUser(type, id, blocked) {
  const response = await fetch(
    `${baseUrl(type)}/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ blocked: Boolean(blocked) }),
    },
  );

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error || `Ошибка изменения статуса: HTTP ${response.status}`,
    );
  }

  return data;
}

export async function deleteUser(type, id) {
  const response = await fetch(
    `${baseUrl(type)}/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    },
  );

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error || `Ошибка удаления пользователя: HTTP ${response.status}`,
    );
  }

  return data;
}
