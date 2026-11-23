// ==========================================
// Reg.ru (ISPmanager) — почтовые ящики
// ==========================================
// Вынесено из functions.js. Запросы идут с учёткой ISPmanager
// (env.USER_REG / env.PASSWD_REG), креды живут только на сервере.

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
// Удаление почты по Reg.ru (ISPmanager)
// ==========================================
export async function deleteRegUser(env, email) {
  if (!env.USER_REG || !env.PASSWD_REG) {
    throw new Error("Не настроены учётные данные ISPmanager");
  }

  const elid = String(email || "").trim().toLowerCase();

  if (!/^[a-z0-9._-]+@[a-z0-9.-]+$/.test(elid)) {
    throw new Error("Некорректный адрес почтового ящика");
  }

  // func=email.delete + elid=<полный email> удаляет ящик.
  const response = await fetch("https://server101.hosting.reg.ru:1500/ispmgr", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      authinfo: `${env.USER_REG}:${env.PASSWD_REG}`,
      func: "email.delete",
      elid,
      sok: "ok",
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

  if (data?.doc?.error) {
    const message = data.doc.error?.msg?.$ || "Не удалось удалить почтовый ящик";

    console.error("[ISPmanager] Ошибка удаления ящика:", message);

    throw new Error(message);
  }

  return { email: elid };
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
