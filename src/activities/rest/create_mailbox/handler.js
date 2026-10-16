import {
  generatePassword,
  getMailboxesnameYandex,
  getNextUuidYandex,
  getMailboxes,
  getNextUuid,
} from "../../../functions.js";

const ACTIVITY_CODE = "create_employee_account";
const CACHE_TTL = 7 * 24 * 60 * 60;
const PROJECT_ID_PATTERN = /^\d{2}$/;

// --------------------------------------------------
// ОБЩИЕ ФУНКЦИИ
// --------------------------------------------------

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function toText(value) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function normalizeDomain(value) {
  const domain = toText(value)
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split(/[/?#]/)[0];

  return /^[a-z0-9.-]+$/.test(domain) ? domain : "";
}

async function parsePayload(request) {
  const raw = await request.text();

  if (!raw || raw.length > 65536) {
    throw new Error("Некорректный размер запроса");
  }

  if (
    request.headers.get("Content-Type")?.includes("application/json") ||
    raw.trim().startsWith("{")
  ) {
    return JSON.parse(raw);
  }

  const payload = {};

  for (const [key, value] of new URLSearchParams(raw)) {
    const match = key.match(/^(auth|properties)\[([^\]]+)\]$/);

    if (match) {
      payload[match[1]] ??= {};
      payload[match[1]][match[2]] = value;
    } else {
      payload[key] = value;
    }
  }

  return payload;
}

// --------------------------------------------------
// BITRIX24 REST
// --------------------------------------------------

function appendFormValue(form, key, value) {
  if (value == null) return;

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      appendFormValue(form, `${key}[${index}]`, item);
    });
    return;
  }

  if (typeof value === "object") {
    for (const [childKey, childValue] of Object.entries(value)) {
      appendFormValue(form, `${key}[${childKey}]`, childValue);
    }
    return;
  }

  form.append(key, String(value));
}

async function callBitrixRest(domain, method, params, accessToken) {
  const form = new URLSearchParams();
  form.set("auth", accessToken);

  for (const [key, value] of Object.entries(params || {})) {
    appendFormValue(form, key, value);
  }

  const response = await fetch(`https://${domain}/rest/${method}.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: form,
    signal: AbortSignal.timeout(15000),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || !data || data.error) {
    const code = data?.error || `HTTP_${response.status}`;

    console.error("[BITRIX REST]", {
      method,
      code,
      description: data?.error_description || "",
    });

    const error = new Error(
      data?.error_description || data?.error || `HTTP ${response.status}`,
    );

    error.code = code;
    throw error;
  }

  return data.result;
}

function getAccessToken(auth) {
  const token = toText(auth.access_token);

  if (!token) {
    throw new Error("В запросе отсутствует access_token");
  }

  return token;
}

async function sendActivityResult(
  domain,
  accessToken,
  eventToken,
  returnValues,
  logMessage,
) {
  const result = await callBitrixRest(
    domain,
    "bizproc.event.send",
    {
      EVENT_TOKEN: eventToken,
      RETURN_VALUES: returnValues,
      LOG_MESSAGE: logMessage,
    },
    accessToken,
  );

  if (result !== true) {
    throw new Error("Bitrix24 не подтвердил завершение активности");
  }
}

// --------------------------------------------------
// ЗАЩИТА ОТ ПОВТОРНОГО СОЗДАНИЯ
// --------------------------------------------------

async function getCacheKey(eventToken) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(eventToken),
  );

  const hash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return `activity-result:${hash}`;
}

// --------------------------------------------------
// СОЗДАНИЕ ПОЧТЫ
// --------------------------------------------------

function parseEmployeeName(fio) {
  const [surname = "", name = "", ...rest] = toText(fio)
    .split(/\s+/)
    .filter(Boolean);

  return {
    surname,
    name,
    patronymic: rest.join(" "),
  };
}

async function createRegMailbox(env, projectId) {
  const domainname = "energy-team.club";

  if (!env.USER_REG || !env.PASSWD_REG) {
    throw new Error("Не настроены учётные данные ISPmanager");
  }

  const mailboxes = await getMailboxes(env, domainname);
  const uuid = getNextUuid(mailboxes, "u", projectId);

  if (uuid == null || String(uuid) === "") {
    throw new Error("Не удалось определить следующий ID Reg.ru");
  }

  const username = `u${projectId}${uuid}`;
  const password = generatePassword(16);

  const response = await fetch("https://server101.hosting.reg.ru:1500/ispmgr", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      authinfo: `${env.USER_REG}:${env.PASSWD_REG}`,
      func: "email.edit",
      sok: "ok",
      name: username,
      domainname,
      passwd: password,
      confirm: password,
      maxsize: "100",
      out: "json",
      lang: "ru",
    }),
    signal: AbortSignal.timeout(20000),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || data?.doc?.error) {
    console.error("[ISPmanager] Ошибка создания", {
      status: response.status,
    });

    throw new Error("Не удалось создать почтовый ящик ISPmanager");
  }

  return {
    email: `${username}@${domainname}`,
    password,
  };
}

async function createYandexMailbox(env, employee, projectId) {
  const domainname = "energy-team.ru";

  if (!env.YANDEX_TOKEN || !env.YANDEX_ORG_ID) {
    throw new Error("Не настроены параметры Яндекс 360");
  }

  const users = await getMailboxesnameYandex(env);
  const uuid = getNextUuidYandex(users, "u", projectId);

  if (uuid == null || String(uuid) === "") {
    throw new Error("Не удалось определить следующий ID Яндекс 360");
  }

  const username = `u${projectId}${uuid}`;
  const password = generatePassword(16);

  const response = await fetch(
    `https://api360.yandex.net/directory/v1/org/${encodeURIComponent(env.YANDEX_ORG_ID)}/users`,
    {
      method: "POST",
      headers: {
        Authorization: `OAuth ${env.YANDEX_TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        nickname: username,
        departmentId: 1,
        name: {
          first: employee.name,
          last: employee.surname,
          middle: employee.patronymic,
        },
        position: employee.position,
        password,
        passwordChangeRequired: false,
        language: "ru",
        timezone: "Europe/Moscow",
      }),
      signal: AbortSignal.timeout(20000),
    },
  );

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    console.error("[YANDEX] Ошибка создания", {
      status: response.status,
      code: data?.code || data?.error || "UNKNOWN",
    });

    throw new Error("Не удалось создать пользователя Яндекс 360");
  }

  return {
    email: data?.email || `${username}@${domainname}`,
    password,
  };
}

// --------------------------------------------------
// ОСНОВНОЙ ОБРАБОТЧИК
// --------------------------------------------------

export async function handleCreateMailbox(request, env) {
  const startedAt = Date.now();

  const finish = (body, status = 200) => {
    console.log("[ACTIVITY] Завершение", {
      status,
      durationMs: Date.now() - startedAt,
    });

    return jsonResponse(body, status);
  };

  if (request.method !== "POST") {
    return finish({ error: "Method not allowed" }, 405);
  }

  if (!env.BITRIX_APP_CONFIG) {
    return finish({ error: "Не настроен KV binding BITRIX_APP_CONFIG" }, 500);
  }

  let payload;

  try {
    payload = await parsePayload(request);
  } catch (error) {
    console.error("[ACTIVITY] Ошибка чтения запроса:", error.message);
    return finish({ error: "Некорректное тело запроса" }, 400);
  }

  const eventToken = toText(payload.event_token);
  const properties = payload.properties;
  const auth = payload.auth;

  if (
    payload.code !== ACTIVITY_CODE ||
    !eventToken ||
    !properties ||
    typeof properties !== "object" ||
    !auth ||
    typeof auth !== "object"
  ) {
    return finish({ error: "Некорректные параметры активности" }, 400);
  }

  const domain = normalizeDomain(auth.domain);
  const allowedDomain = normalizeDomain(env.BITRIX_ALLOWED_DOMAIN);

  if (!domain || !allowedDomain || domain !== allowedDomain) {
    console.warn("[ACTIVITY] Запрос с запрещённого портала");
    return finish({ error: "Forbidden" }, 403);
  }

  let accessToken;

  try {
    accessToken = getAccessToken(auth);
  } catch (error) {
    console.error("[ACTIVITY] Ошибка авторизации:", error.message);
    return finish({ error: "Не удалось авторизоваться в Bitrix24" }, 403);
  }

  let cacheKey;
  let cached;

  try {
    cacheKey = await getCacheKey(eventToken);
    cached = await env.BITRIX_APP_CONFIG.get(cacheKey, { type: "json" });
  } catch (error) {
    console.error("[ACTIVITY] Ошибка чтения KV:", error.message);

    const message = "Не удалось проверить кеш выполнения активности";

    try {
      await sendActivityResult(
        domain,
        accessToken,
        eventToken,
        {
          createdEmail: "",
          createdPassword: "",
          status: "error",
          message,
        },
        message,
      );

      return finish({ result: true, status: "error", message });
    } catch (sendError) {
      console.error("[ACTIVITY] Ошибка завершения:", sendError.message);
      return finish({ error: "Ошибка KV и завершения активности" }, 502);
    }
  }

  if (cached?.success === "Y") {
    try {
      await sendActivityResult(
        domain,
        accessToken,
        eventToken,
        cached.returnValues,
        cached.logMessage,
      );

      return finish({ result: true, cached: true });
    } catch (error) {
      console.error("[ACTIVITY] Ошибка повторной отправки:", error.message);
      return finish({ error: "Не удалось вернуть результат" }, 502);
    }
  }

  const fio = toText(properties.fio);
  const position = toText(properties.position);
  const projectId = toText(properties.project);
  const needsmail = toText(properties.needsmail).toLowerCase();

  const employee = {
    ...parseEmployeeName(fio),
    position,
  };

  const returnValues = {
    createdEmail: "",
    createdPassword: "",
    status: "error",
    message: "",
  };

  let logMessage = "";
  let successfulExecution = false;

  try {
    if (!fio || !employee.surname || !employee.name) {
      throw new Error("Укажите фамилию и имя сотрудника");
    }

    if (!["none", "ispmanager", "yandex"].includes(needsmail)) {
      throw new Error("Неизвестный тип почты");
    }

    if (needsmail === "none") {
      logMessage = "Действие выполнено. Создание почты не запрошено.";
    } else {
      if (!PROJECT_ID_PATTERN.test(projectId)) {
        throw new Error("Не выбран корректный проект");
      }

      const mailbox = needsmail === "ispmanager"
        ? await createRegMailbox(env, projectId)
        : await createYandexMailbox(env, employee, projectId);

      returnValues.createdEmail = mailbox.email;
      returnValues.createdPassword = mailbox.password;
      logMessage = `Почтовый ящик создан: ${mailbox.email}`;
    }

    returnValues.status = "success";
    successfulExecution = true;
  } catch (error) {
    returnValues.message = (
      error instanceof Error ? error.message : "Неизвестная ошибка"
    ).slice(0, 500);

    logMessage = `Ошибка выполнения: ${returnValues.message}`;

    console.error("[ACTIVITY] Ошибка выполнения:", returnValues.message);
  }

  // Сохраняем успех до ответа Bitrix24, чтобы не создать ящик повторно.
  if (successfulExecution) {
    try {
      await env.BITRIX_APP_CONFIG.put(
        cacheKey,
        JSON.stringify({
          success: "Y",
          returnValues,
          logMessage,
        }),
        { expirationTtl: CACHE_TTL },
      );
    } catch (error) {
      console.error("[ACTIVITY] Ошибка записи KV:", error.message);
      return finish({ error: "Не удалось сохранить результат" }, 500);
    }
  }

  try {
    await sendActivityResult(
      domain,
      accessToken,
      eventToken,
      returnValues,
      logMessage,
    );
  } catch (error) {
    console.error("[ACTIVITY] Ошибка bizproc.event.send:", error.message);
    return finish({ error: "Не удалось завершить активность в Bitrix24" }, 502);
  }

  return finish({
    result: true,
    status: returnValues.status,
    createdEmail: returnValues.createdEmail,
  });
}