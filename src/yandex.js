// ==========================================
// Яндекс 360 — пользователи (directory API)
// ==========================================
// Вынесено из functions.js. Запросы идут с OAuth-токеном (env.YANDEX_TOKEN),
// токен и org_id живут только на сервере.

// ==========================================
// Получаем пользователей из Яндекс 360
// ==========================================
const YANDEX_PER_PAGE = 1000;
const YANDEX_MAX_PAGES = 50;

export async function getMailboxesnameYandex(env) {
  if (!env.YANDEX_TOKEN || !env.YANDEX_ORG_ID) {
    throw new Error("Не настроены параметры Яндекс 360");
  }

  const users = [];

  // Идём по всем страницам: раньше читалась только первая,
  // и при >1000 пользователей список для подбора UUID был неполным.
  for (let page = 1; page <= YANDEX_MAX_PAGES; page++) {
    const url = new URL(
      `https://api360.yandex.net/directory/v1/org/${encodeURIComponent(env.YANDEX_ORG_ID)}/users`
    );

    url.searchParams.set("page", String(page));
    url.searchParams.set("perPage", String(YANDEX_PER_PAGE));

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `OAuth ${env.YANDEX_TOKEN}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(20000),
    });

    const result = await response.json().catch(() => null);

    if (!response.ok) {
      console.error("[YANDEX] Ошибка получения пользователей:", {
        status: response.status,
        code: result?.code || result?.error || "UNKNOWN",
      });

      throw new Error(
        `Не удалось получить пользователей Яндекс 360: HTTP ${response.status}`
      );
    }

    if (!result || !Array.isArray(result.users)) {
      console.error("[YANDEX] Неожиданный формат ответа API");

      throw new Error("Некорректный ответ от Яндекс 360");
    }

    users.push(...result.users);

    const pages = Number(result.pages);

    if (
      result.users.length < YANDEX_PER_PAGE ||
      (Number.isFinite(pages) && page >= pages)
    ) {
      console.log("[YANDEX] Получено пользователей:", users.length);

      return {
        users,
        total: Number(result.total) || users.length,
      };
    }
  }

  throw new Error("Слишком много пользователей Яндекс 360 (лимит страниц)");
}

// ==========================================
// Ищем нужный UUID в Яндекс 360
// ==========================================
export function getNextUuidYandex(result, access, projectId) {
  const prefix = `${access}${projectId}`;
  const usedNumbers = new Set();
  const users = result?.users || [];

  for (const item of users) {
    // В Яндекс 360 nickname = логин пользователя.
    // Например: u01001, u01002, u02001
    const nickname = String(item?.nickname || "");

    // Берём только логины нашего проекта (например, u01...).
    if (!nickname.startsWith(prefix)) {
      continue;
    }

    // u01001 -> 001
    const uuidPart = nickname.slice(prefix.length);

    // Только ровно 3 цифры: 001, 002, 003...
    if (/^\d{3}$/.test(uuidPart)) {
      usedNumbers.add(Number(uuidPart));
    }
  }

  // Ищем первый свободный номер.
  for (let i = 1; i <= 999; i++) {
    if (!usedNumbers.has(i)) {
      return String(i).padStart(3, "0");
    }
  }

  throw new Error(
    `Закончились UUID для проекта ${projectId}`
  );
}

// ==========================================
// Создание пользователя в Яндекс 360
// ==========================================
/**
 * Создание пользователя в Яндекс 360
 * @param {object} env - Environment variables
 * @param {object} userData - Данные нового пользователя
 * @param {string} userData.nickname - Никнейм (логин без домена)
 * @param {string} userData.password - Пароль
 * @param {object} userData.name - ФИО
 * @param {string} userData.name.first - Имя
 * @param {string} userData.name.last - Фамилия
 * @param {string} [userData.name.middle] - Отчество
 * @param {string} [userData.departmentId] - ID отдела
 * @param {string} [userData.position] - Должность
 * @returns {Promise<object>} Созданный пользователь
 */
export async function createYandexUser(env, userData) {
  if (!env.YANDEX_TOKEN || !env.YANDEX_ORG_ID) {
    throw new Error("Не настроены параметры Яндекс 360");
  }

  // Валидация обязательных полей
  if (!userData.nickname || !/^[a-z0-9._-]{3,30}$/.test(userData.nickname)) {
    throw new Error(
      "Никнейм должен содержать 3-30 символов (латиница, цифры, точка, дефис, подчёркивание)"
    );
  }

  if (!userData.password || userData.password.length < 8) {
    throw new Error("Пароль должен содержать минимум 8 символов");
  }

  if (!userData.name?.first || !userData.name?.last) {
    throw new Error("Укажите имя и фамилию");
  }

  const yandexUrl =
    `https://api360.yandex.net/directory/v1/org/` +
    `${encodeURIComponent(env.YANDEX_ORG_ID)}/users`;

  const requestBody = {
    nickname: userData.nickname,
    password: userData.password,
    name: {
      first: userData.name.first,
      last: userData.name.last,
      ...(userData.name.middle && { middle: userData.name.middle }),
    },
    ...(userData.departmentId && { departmentId: Number(userData.departmentId) }),
    ...(userData.position && { position: userData.position }),
  };

  const response = await fetch(yandexUrl, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${env.YANDEX_TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);

    // Обработка типичных ошибок
    if (response.status === 409 || data?.code === "conflict") {
      throw new Error(`Пользователь с никнеймом «${userData.nickname}» уже существует`);
    }

    throw new Error(
      `Не удалось создать пользователя: HTTP ${response.status}, ` +
      `код: ${data?.code || data?.error || "UNKNOWN"}`
    );
  }

  const result = await response.json();

  return {
    success: true,
    user: result,
  };
}

// ==========================================
// Удаление пользователя из Яндекс 360
// ==========================================
export async function deleteYandexUser(env, userId) {
  if (!env.YANDEX_TOKEN || !env.YANDEX_ORG_ID) {
    throw new Error("Не настроены параметры Яндекс 360");
  }

  // Принимаем только числовой ID
  if (!/^\d+$/.test(String(userId))) {
    throw new Error("Некорректный ID пользователя");
  }

  const yandexUrl =
    `https://api360.yandex.net/directory/v1/org/` +
    `${encodeURIComponent(env.YANDEX_ORG_ID)}/users/` +
    `${encodeURIComponent(userId)}`;

  const response = await fetch(yandexUrl, {
    method: "DELETE",
    headers: {
      Authorization: `OAuth ${env.YANDEX_TOKEN}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);

    throw new Error(
      `Не удалось удалить пользователя: HTTP ${response.status}, ` +
      `код: ${data?.code || data?.error || "UNKNOWN"}`
    );
  }

  return {
    success: true,
    userId,
  };
}
