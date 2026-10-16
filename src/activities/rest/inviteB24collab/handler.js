import {
  generatePassword,
  projectMapping,
  getMailboxesnameYandex,
  getNextUuidYandex,
  getMailboxes,
  getNextUuid,
} from "../../../functions.js";

const ACTIVITY_CODE = "energy_team_create_mailbox";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function safeEqual(left, right) {
  if (
    typeof left !== "string" ||
    typeof right !== "string"
  ) {
    return false;
  }

  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);

  let difference = a.length ^ b.length;

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    difference |=
      (i < a.length ? a[i] : 0) ^
      (i < b.length ? b[i] : 0);
  }

  return difference === 0;
}

function toText(value) {
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }

  return "";
}

function normalizeDomain(value) {
  try {
    const raw = toText(value);
    if (!raw) return "";

    const url = new URL(
      raw.includes("://") ? raw : `https://${raw}`,
    );

    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return "";
    }

    return url.hostname.toLowerCase();
  } catch {
    return "";
  }
}

function setNestedValue(target, key, value) {
  const parts = key.match(/[^.[\]]+/g);

  if (!parts?.length) return;

  let current = target;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];

    if (
      !current[part] ||
      typeof current[part] !== "object" ||
      Array.isArray(current[part])
    ) {
      current[part] = {};
    }

    current = current[part];
  }

  current[parts[parts.length - 1]] = value;
}

async function parseBody(request) {
  const raw = await request.text();
  const contentType =
    request.headers.get("Content-Type") || "";

  if (
    contentType.includes("application/json") ||
    raw.trim().startsWith("{")
  ) {
    return JSON.parse(raw);
  }

  const result = {};
  const params = new URLSearchParams(raw);

  for (const [key, value] of params.entries()) {
    setNestedValue(result, key, value);
  }

  return result;
}

// -----------------------------------------------------
// BITRIX24 REST
// -----------------------------------------------------

function appendFormValue(form, key, value) {
  if (value === undefined || value === null) return;

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      appendFormValue(form, `${key}[${index}]`, item);
    });

    return;
  }

  if (typeof value === "object") {
    for (const [childKey, childValue] of Object.entries(value)) {
      appendFormValue(
        form,
        `${key}[${childKey}]`,
        childValue,
      );
    }

    return;
  }

  form.append(key, String(value));
}

async function callBitrixRest(
  domain,
  method,
  params,
  accessToken,
) {
  const endpoint = new URL(
    `${method}.json`,
    `https://${domain}/rest/`,
  );

  const form = new URLSearchParams();
  form.set("auth", accessToken);

  for (const [key, value] of Object.entries(params || {})) {
    appendFormValue(form, key, value);
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: form,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || !data || data.error) {
    const error = new Error(
      data?.error_description ||
        `Bitrix24 HTTP ${response.status}`,
    );

    error.code = data?.error || `HTTP_${response.status}`;
    throw error;
  }

  return data.result;
}

// -----------------------------------------------------
// ПРОВЕРКА ДАННЫХ АВТОРИЗАЦИИ
// -----------------------------------------------------

async function refreshOAuthToken(env, refreshToken, scope) {
  if (
    !env.BITRIX_CLIENT_ID ||
    !env.BITRIX_CLIENT_SECRET ||
    !refreshToken
  ) {
    throw new Error(
      "Не настроено продление OAuth-токена Bitrix24",
    );
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: env.BITRIX_CLIENT_ID,
    client_secret: env.BITRIX_CLIENT_SECRET,
    refresh_token: refreshToken,
  });

  if (scope) {
    body.set("scope", scope);
  }

  const response = await fetch(
    "https://oauth.bitrix24.tech/oauth/token/",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
    },
  );

  const data = await response.json().catch(() => null);

  if (
    !response.ok ||
    !data ||
    data.error ||
    !data.access_token ||
    !data.refresh_token
  ) {
    throw new Error(
      "Bitrix24 не смог обновить OAuth-токен",
    );
  }

  return data;
}

async function getVerifiedAccessToken(
  auth,
  settings,
  env,
) {
  let accessToken = toText(auth?.access_token);
  let refreshToken =
    toText(auth?.refresh_token) ||
    toText(settings.refreshToken);

  if (!accessToken) {
    throw new Error(
      "В запросе действия отсутствует access_token",
    );
  }

  let currentUser;

  try {
    currentUser = await callBitrixRest(
      settings.domain,
      "user.current",
      {},
      accessToken,
    );
  } catch (error) {
    if (
      !["expired_token", "invalid_token"].includes(error.code)
    ) {
      throw error;
    }

    const refreshed = await refreshOAuthToken(
      env,
      refreshToken,
      settings.scope,
    );

    accessToken = refreshed.access_token;
    refreshToken = refreshed.refresh_token;

    settings.accessToken = accessToken;
    settings.refreshToken = refreshToken;
    settings.expiresAt =
      Date.now() +
      Math.max(60, Number(refreshed.expires_in) || 3600) * 1000;


    currentUser = await callBitrixRest(
      settings.domain,
      "user.current",
      {},
      accessToken,
    );
  }

  if (
    String(currentUser?.ID || "") !==
    String(settings.authUserId)
  ) {
    throw new Error(
      "Запрос выполнен не от пользователя, зарегистрировавшего действие",
    );
  }

  return accessToken;
}

// -----------------------------------------------------
// ИДЕМПОТЕНТНОСТЬ ПОВТОРНЫХ ВЫЗОВОВ
// -----------------------------------------------------

async function hashEventToken(eventToken) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(eventToken),
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function loadSavedResult(env, eventToken) {
  const key = `activity-result:${await hashEventToken(eventToken)}`;

  return {
    key,
    result: await env.BITRIX_APP_CONFIG.get(
      key,
      { type: "json" },
    ),
  };
}

// -----------------------------------------------------
// ПОЛЯ ДЕЙСТВИЯ
// -----------------------------------------------------

function normalizeNeedsmail(value) {
  const valueId = toText(value).trim().toLowerCase();

  if (
    valueId === "none" ||
    valueId === "ispmanager" ||
    valueId === "yandex"
  ) {
    return valueId;
  }

  return "unknown";
}

function parseEmployeeName(fio) {
  const parts = toText(fio)
    .split(/\s+/)
    .filter(Boolean);

  return {
    surname: parts[0] || "",
    name: parts[1] || "",
    patronymic: parts.slice(2).join(" "),
  };
}

function normalizePhone(value) {
  const number = toText(value);

  return /^7\d{10}$/.test(number)
    ? `+${number}`
    : number;
}

// -----------------------------------------------------
// СОЗДАНИЕ ЯЩИКА REG.RU
// -----------------------------------------------------

async function createRegMailbox(env, projectId) {
  const domainname = "energy-team.club";
  const access = "u";

  if (!env.USER_REG || !env.PASSWD_REG) {
    throw new Error(
      "Не настроены учётные данные ISPmanager",
    );
  }

  const mailboxes = await getMailboxes(env, domainname);

  const uuid = getNextUuid(
    mailboxes,
    access,
    projectId,
  );

  if (
    uuid === undefined ||
    uuid === null ||
    String(uuid) === ""
  ) {
    throw new Error(
      "Не удалось определить следующий идентификатор Reg.ru",
    );
  }

  const username = `${access}${projectId}${uuid}`;
  const mailboxPassword = generatePassword(16);

  console.log("[ISPmanager] Создание ящика:", {
    username,
    domainname,
  });

  const response = await fetch(
    "https://server101.hosting.reg.ru:1500/ispmgr",
    {
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
        passwd: mailboxPassword,
        confirm: mailboxPassword,
        maxsize: "100",
        out: "json",
        lang: "ru",
      }),
    },
  );

  const result = await response.json().catch(() => null);

  if (!response.ok || result?.doc?.error) {
    console.error("[ISPmanager] Ошибка создания:", {
      status: response.status,
    });

    throw new Error(
      "Не удалось создать почтовый ящик Reg.ru",
    );
  }

  console.log("[ISPmanager] Ящик создан:", {
    username,
    domainname,
  });

  return {
    mailboxLogin: username,
    mailboxEmail: `${username}@${domainname}`,
    mailboxPassword,
  };
}

// -----------------------------------------------------
// СОЗДАНИЕ ЯЩИКА ЯНДЕКС 360
// -----------------------------------------------------

async function createYandexMailbox(env, employee, projectId) {
  const domainname = "energy-team.ru";
  const access = "u";

  if (!env.YANDEX_TOKEN || !env.YANDEX_ORG_ID) {
    throw new Error(
      "Не настроены параметры Яндекс 360",
    );
  }

  const users = await getMailboxesnameYandex(env);

  const uuid = getNextUuidYandex(
    users,
    access,
    projectId,
  );

  if (
    uuid === undefined ||
    uuid === null ||
    String(uuid) === ""
  ) {
    throw new Error(
      "Не удалось определить следующий идентификатор Яндекс 360",
    );
  }

  const username = `${access}${projectId}${uuid}`;
  const mailboxPassword = generatePassword(16);

  console.log("[YANDEX] Создание пользователя:", {
    username,
    domainname,
  });

  const response = await fetch(
    `https://api360.yandex.net/directory/v1/org/${encodeURIComponent(
      env.YANDEX_ORG_ID,
    )}/users`,
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
        password: mailboxPassword,
        passwordChangeRequired: false,
        language: "ru",
        timezone: "Europe/Moscow",
      }),
    },
  );

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    console.error("[YANDEX] Ошибка создания:", {
      status: response.status,
      code: result?.code || result?.error || "UNKNOWN",
    });

    throw new Error(
      "Не удалось создать пользователя Яндекс 360",
    );
  }

  const mailboxEmail =
    result?.email || `${username}@${domainname}`;

  console.log("[YANDEX] Пользователь создан:", {
    username,
    mailboxEmail,
  });

  return {
    mailboxLogin: username,
    mailboxEmail,
    mailboxPassword,
  };
}

// -----------------------------------------------------
// ВОЗВРАТ РЕЗУЛЬТАТА В БИЗНЕС-ПРОЦЕСС
// -----------------------------------------------------

async function sendActivityResult(
  settings,
  accessToken,
  eventToken,
  returnValues,
  logMessage,
) {
  const result = await callBitrixRest(
    settings.domain,
    "bizproc.event.send",
    {
      EVENT_TOKEN: eventToken,
      RETURN_VALUES: returnValues,
      LOG_MESSAGE: logMessage,
    },
    accessToken,
  );

  if (result !== true) {
    throw new Error(
      "Bitrix24 не подтвердил завершение действия",
    );
  }

  console.log("[ACTIVITY] Бизнес-процесс получил результат");
}

// -----------------------------------------------------
// ОСНОВНОЙ ОБРАБОТЧИК ДЕЙСТВИЯ
// -----------------------------------------------------

export async function handleWebhook(
  request,
  env,
  ctx,
  parsedPayload = null,
) {
  const startedAt = Date.now();
  const url = new URL(request.url);

  const finish = (body, status = 200) => {
    console.log("[ACTIVITY] Завершение:", {
      status,
      durationMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    });

    return jsonResponse(body, status);
  };

  console.log("[ACTIVITY] Начало обработки:", {
    method: request.method,
    pathname: url.pathname,
    timestamp: new Date().toISOString(),
  });

    if (
    url.pathname.replace(/\/+$/, "") !==
    "/activities/rest/create_mailbox/handler.js"
    ) {
    return finish({ error: "Not found" }, 404);
    }

  if (request.method !== "POST") {
    return finish(
      { error: "Method not allowed" },
      405,
    );
  }

  let payload = parsedPayload;

  if (!payload) {
    try {
      payload = await parseBody(request);
    } catch {
      return finish(
        { error: "Некорректное тело запроса" },
        400,
      );
    }
  }

  const eventToken = toText(payload?.event_token);
  const code = toText(payload?.code);
  const properties = payload?.properties;
  const auth = payload?.auth;

  if (!eventToken || code !== ACTIVITY_CODE) {
    return finish(
      { error: "Некорректный запрос действия" },
      400,
    );
  }

  if (
    !properties ||
    typeof properties !== "object" ||
    Array.isArray(properties) ||
    !auth ||
    typeof auth !== "object"
  ) {
    return finish(
      { error: "Нет properties или auth" },
      400,
    );
  }

  let settings;


  const expectedDomain = normalizeDomain(
    env.BITRIX_ALLOWED_DOMAIN,
  );

  const incomingDomain = normalizeDomain(auth.domain);

  if (
    !incomingDomain ||
    incomingDomain !== settings.domain ||
    incomingDomain !== expectedDomain
  ) {
    console.warn("[ACTIVITY] Запрос с запрещённого портала");

    return finish({ error: "Forbidden" }, 403);
  }

  if (
    auth.member_id &&
    !safeEqual(
      String(auth.member_id),
      String(settings.memberId),
    )
  ) {
    return finish({ error: "Forbidden" }, 403);
  }

  let accessToken;

  try {
    // Проверяем, что OAuth-токен действителен и принадлежит
    // пользователю, от имени которого было зарегистрировано действие.
    accessToken = await getVerifiedAccessToken(
      auth,
      settings,
      env,
    );
  } catch (error) {
    console.error("[ACTIVITY] Ошибка авторизации Bitrix24:", {
      code: error?.code || "AUTH_ERROR",
      message:
        error instanceof Error
          ? error.message
          : "Unknown error",
    });

    return finish(
      { error: "Не удалось подтвердить авторизацию Bitrix24" },
      403,
    );
  }

  // Если Bitrix24 повторно доставил тот же event_token,
  // повторно почту не создаём.
  let cached;

  try {
    cached = await loadSavedResult(
      env,
      eventToken,
    );
  } catch (error) {
    console.error(
      "[ACTIVITY] Ошибка чтения кеша:",
      error instanceof Error ? error.message : "Unknown error",
    );

    return finish(
      { error: "Не удалось проверить повторный вызов" },
      500,
    );
  }

  if (cached.result?.success === "Y") {
    console.log("[ACTIVITY] Повторный вызов — используется результат кеша");

    try {
      await sendActivityResult(
        settings,
        accessToken,
        eventToken,
        cached.result.returnValues,
        cached.result.logMessage,
      );

      return finish({ result: true, cached: true });
    } catch (error) {
      console.error(
        "[ACTIVITY] Не удалось повторно отправить результат:",
        error instanceof Error ? error.message : "Unknown error",
      );

      return finish(
        { error: "Не удалось вернуть результат в Bitrix24" },
        502,
      );
    }
  }

  const fio = toText(properties.fio);
  const number = normalizePhone(properties.number);
  const email = toText(properties.email);
  const position = toText(properties.position);
  const project = toText(properties.project);
  const needsmail = normalizeNeedsmail(properties.needsmail);

  const employee = {
    fio,
    number,
    email,
    position,
    ...parseEmployeeName(fio),
  };

  const projectId = toText(projectMapping[project]);

  const returnValues = {
    success: "N",
    errorMessage: "",
    mailboxLogin: "",
    mailboxEmail: "",
    mailboxPassword: "",
  };

  let logMessage = "";
  let successfulExecution = false;

  try {
    if (!fio || !employee.surname || !employee.name) {
      throw new Error(
        "Укажите фамилию и имя сотрудника",
      );
    }

    if (needsmail === "unknown") {
      throw new Error(
        "Неизвестный тип почты",
      );
    }

    if (needsmail !== "none") {
      if (!projectId) {
        throw new Error(
          "Не найден projectMapping для выбранного проекта",
        );
      }

        const mailbox =
        needsmail === "ispmanager"
            ? await createRegMailbox(env, projectId)
            : await createYandexMailbox(env, employee, projectId);

      returnValues.mailboxLogin = mailbox.mailboxLogin;
      returnValues.mailboxEmail = mailbox.mailboxEmail;
      returnValues.mailboxPassword = mailbox.mailboxPassword;
    }

    returnValues.success = "Y";
    returnValues.errorMessage = "";

    logMessage =
      needsmail === "none"
        ? "Действие выполнено. Создание почты не запрошено."
        : `Почтовый ящик создан: ${returnValues.mailboxEmail}`;

    successfulExecution = true;

    console.log("[ACTIVITY] Действие успешно выполнено:", {
      needsmail,
      mailboxCreated: Boolean(returnValues.mailboxEmail),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Неизвестная ошибка обработки";

    returnValues.success = "N";
    returnValues.errorMessage = message.slice(0, 500);

    logMessage =
      `Ошибка выполнения действия: ${returnValues.errorMessage}`;

    console.error("[ACTIVITY] Ошибка выполнения:", {
      message: returnValues.errorMessage,
    });
  }

  // Успешный результат сохраняем до event.send.
  // Если отправка результата временно не удастся, повторный вызов
  // с тем же event_token не создаст повторный ящик.
  if (successfulExecution) {
    try {
      await env.BITRIX_APP_CONFIG.put(
        cached.key,
        JSON.stringify({
          success: returnValues.success,
          returnValues,
          logMessage,
        }),
        {
          expirationTtl: 7 * 24 * 60 * 60,
        },
      );
    } catch (error) {
      console.error(
        "[ACTIVITY] Не удалось сохранить результат для повтора:",
        error instanceof Error ? error.message : "Unknown error",
      );

      // Не выполняем повторную отправку в бизнес-процесс без
      // сохранённого результата: так будет меньше риска дублирования.
      return finish(
        { error: "Не удалось сохранить результат действия" },
        500,
      );
    }
  }

  try {
    await sendActivityResult(
      settings,
      accessToken,
      eventToken,
      returnValues,
      logMessage,
    );
  } catch (error) {
    console.error("[ACTIVITY] Ошибка bizproc.event.send:", {
      code: error?.code || "UNKNOWN",
      message:
        error instanceof Error
          ? error.message
          : "Unknown error",
    });

    return finish(
      { error: "Не удалось завершить действие в Bitrix24" },
      502,
    );
  }

  // Сам пароль не выводим в HTTP-ответ и журналы.
  // В выходные параметры бизнес-процесса он передаётся намеренно.
  return finish({
    result: true,
    success: returnValues.success,
    mailboxLogin: returnValues.mailboxLogin,
    mailboxEmail: returnValues.mailboxEmail,
  });
}