// ==========================================
// Генерация пароля
// ==========================================
// Гарантируем хотя бы по одному символу каждого класса
// (заглавная, строчная, цифра, спецсимвол) — иначе при длине 16
// примерно в 12% случаев пароль остаётся без цифры или спецсимвола
// и может не пройти политику сервиса.
const PASSWORD_GROUPS = [
  "ABCDEFGHJKLMNPQRSTUVWXYZ",
  "abcdefghijkmnopqrstuvwxyz",
  "23456789",
  "!@#$%^&*",
];

// Равномерное случайное число 0..max-1 без смещения.
function randomInt(max) {
  const limit = Math.floor(0x100000000 / max) * max;
  const buffer = new Uint32Array(1);

  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= limit);

  return buffer[0] % max;
}

export function generatePassword(length = 16) {
  if (length < PASSWORD_GROUPS.length) {
    throw new Error("Слишком короткая длина пароля");
  }

  const allChars = PASSWORD_GROUPS.join("");

  const chars = PASSWORD_GROUPS.map(
    (group) => group[randomInt(group.length)],
  );

  while (chars.length < length) {
    chars.push(allChars[randomInt(allChars.length)]);
  }

  // Перемешивание (Fisher–Yates).
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}

// ==========================================
// Транслит
// ==========================================
export function translit(text) {
  const map = {
    "а": "a",
    "б": "b",
    "в": "v",
    "г": "g",
    "д": "d",
    "е": "e",
    "ё": "yo",
    "ж": "zh",
    "з": "z",
    "и": "i",
    "й": "y",
    "к": "k",
    "л": "l",
    "м": "m",
    "н": "n",
    "о": "o",
    "п": "p",
    "р": "r",
    "с": "s",
    "т": "t",
    "у": "u",
    "ф": "f",
    "х": "kh",
    "ц": "ts",
    "ч": "ch",
    "ш": "sh",
    "щ": "shch",
    "ъ": "",
    "ы": "y",
    "ь": "",
    "э": "e",
    "ю": "yu",
    "я": "ya"
  };

  return text
    .split("")
    .map(char => map[char] !== undefined ? map[char] : char)
    .join("");
}

// ==========================================
// Маппинг по проектам
// ==========================================
// ВНИМАНИЕ: в src/activities/createEmployeeAccount.js для «МОГ»
// указан код '10', а здесь "09". Нужно привести к одному значению.
export const projectMapping = {
  "Автоваз": "01",
  "Летуаль": "02",
  "КДЛ": "03",
  "АФБ ОН": "04",
  "АФБ ДН": "05",
  "100 Мед": "06",
  "Евроонко": "07",
  "ЦТМ": "08",
  "МОГ": "09",
};

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
// Получаем почты по Reg.ru (ISPmanager)
// ==========================================
export async function getMailboxes(env, domainname) {
  const response = await fetch(
    "https://server101.hosting.reg.ru:1500/ispmgr",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        authinfo: `${env.USER_REG}:${env.PASSWD_REG}`,
        func: "email",
        out: "json",
        lang: "ru"
      }),
      signal: AbortSignal.timeout(20000),
    }
  );

  if (!response.ok) {
    throw new Error(`ISPmanager HTTP ${response.status}`);
  }

  const data = await response.json().catch(() => null);

  if (!data) {
    throw new Error("ISPmanager вернул некорректный ответ");
  }

  // ISPmanager возвращает ошибки с HTTP 200 в поле doc.error.
  // Без этой проверки при ошибке доступа список был бы пустым,
  // и getNextUuid вернул бы "001" для любого проекта.
  if (data?.doc?.error) {
    console.error("[ISPmanager] Ошибка получения списка ящиков");

    throw new Error("ISPmanager не вернул список почтовых ящиков");
  }

  // Приводим elem к массиву: при единственном элементе ISPmanager
  // может вернуть объект, а при пустом списке — вообще не вернуть поле.
  const rawElem = data?.doc?.elem;
  let elements = Array.isArray(rawElem)
    ? rawElem
    : rawElem
      ? [rawElem]
      : [];

  // Параметр domainname в func=email не фильтрует список, поэтому
  // запрос отправляем так же, как в Postman, а домен фильтруем здесь.
  if (domainname) {
    const suffix = `@${domainname}`.toLowerCase();

    elements = elements.filter((item) =>
      String(item?.name?.$ || "").toLowerCase().endsWith(suffix)
    );
  }

  data.doc.elem = elements;

  return data;
}

// ==========================================
// Создание почты по Reg.ru (ISPmanager)
// ==========================================
export async function createRegUser(env, { nickname, password, domain = "energy-team.club" }) {
  if (!env.USER_REG || !env.PASSWD_REG) {
    throw new Error("Не настроены учётные данные ISPmanager");
  }

  const name = String(nickname || "").trim().toLowerCase();

  if (!/^[a-z0-9._-]{3,30}$/.test(name)) {
    throw new Error("Некорректный никнейм: 3-30 символов, латиница/цифры/._-");
  }

  if (!password || String(password).length < 8) {
    throw new Error("Пароль должен быть не короче 8 символов");
  }

  // Запрос как в примере curl: func=email.edit + sok=ok создают ящик.
  const response = await fetch("https://server101.hosting.reg.ru:1500/ispmgr", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      authinfo: `${env.USER_REG}:${env.PASSWD_REG}`,
      func: "email.edit",
      sok: "ok",
      name,
      domainname: domain,
      passwd: password,
      confirm: password,
      maxsize: "100",
      out: "json",
      lang: "ru",
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    throw new Error(`ISPmanager HTTP ${response.status}`);
  }

  const data = await response.json().catch(() => null);

  if (!data) {
    throw new Error("ISPmanager вернул некорректный ответ");
  }

  // ISPmanager отдаёт ошибки с HTTP 200 в doc.error.
  if (data?.doc?.error) {
    const message = data.doc.error?.msg?.$ || "Не удалось создать почтовый ящик";

    console.error("[ISPmanager] Ошибка создания ящика:", message);

    throw new Error(message);
  }

  return {
    username: name,
    email: `${name}@${domain}`,
  };
}

// ==========================================
// UUID по Рег.ру
// ==========================================
export function getNextUuid(result, access, projectId) {
  const prefix = `${access}${projectId}`;
  const usedNumbers = new Set();
  const elements = result?.doc?.elem || [];

  for (const item of elements) {
    // ISPmanager возвращает:
    // name: { "$": "u01001@energy-team.club" }
    const emailName = item?.name?.$ || "";

    // Берём только логин до @
    const name = emailName.split("@")[0];

    if (!name.startsWith(prefix)) {
      continue;
    }

    // u01001 -> 001
    const uuidPart = name.slice(prefix.length);

    // Берём только логины формата 001, 002, 003...
    if (/^\d{3}$/.test(uuidPart)) {
      usedNumbers.add(Number(uuidPart));
    }
  }

  // Ищем первую свободную позицию.
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
// Удаление пользователя из Яндекс 360
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

export async function deleteRegUser(env, email) {
    if (!env.USER_REG || !env.PASSWD_REG) {
    throw new Error("Не настроены параметры ISPmanager");
  }
}

// Cloud Contact
