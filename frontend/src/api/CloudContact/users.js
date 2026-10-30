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
