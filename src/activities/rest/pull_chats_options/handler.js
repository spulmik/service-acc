
const ACTIVITY_CODE = "pull_chats_options";
const PAGE_SIZE = 50;
const MAX_PAGES = 100;

/**
 * Читаем запрос от Bitrix24.
 * Поддерживаем JSON и application/x-www-form-urlencoded.
 */
async function parsePayload(request) {
  const body = await request.text();

  if (!body || body.length > 1024 * 1024) {
    throw new Error("Пустое тело запроса или превышен лимит размера");
  }

  const contentType =
    request.headers.get("Content-Type") || "";

  if (contentType.includes("application/json")) {
    return JSON.parse(body);
  }

  const payload = {
    auth: {},
    properties: {},
  };

  for (const [key, value] of new URLSearchParams(body)) {
    const authMatch = key.match(/^auth\[([^\]]+)\]$/);
    const propertyMatch = key.match(
      /^properties\[([^\]]+)\]$/,
    );

    if (authMatch) {
      payload.auth[authMatch[1]] = value;
    } else if (propertyMatch) {
      payload.properties[propertyMatch[1]] = value;
    } else {
      payload[key] = value;
    }
  }

  return payload;
}

/**
 * Проверяем домен портала.
 */
function getPortalDomain(auth) {
  const rawDomain = String(
    auth.domain ?? auth.DOMAIN ?? "",
  )
    .trim()
    .toLowerCase();

  const domain = rawDomain
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");

  if (
    !/^[a-z0-9.-]+$/.test(domain) ||
    !(
      domain.endsWith(".bitrix24.ru") ||
      domain.endsWith(".bitrix24.com")
    )
  ) {
    throw new Error("Недопустимый домен Bitrix24");
  }

  return domain;
}

/**
 * Универсальный вызов REST API Bitrix24.
 */
async function bitrixCall(
  domain,
  accessToken,
  method,
  params = {},
) {
  const endpoint = new URL(`https://${domain}/rest/`);

  const response = await fetch(
    new URL(method, endpoint),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        ...params,
        auth: accessToken,
      }),
      signal: AbortSignal.timeout(15000),
    },
  );

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      `${method}: Bitrix24 вернул некорректный JSON, HTTP ${response.status}`,
    );
  }

  if (!response.ok || data?.error) {
    throw new Error(
      `${method}: ${
        data?.error_description ||
        data?.error ||
        `HTTP ${response.status}`
      }`,
    );
  }

  if (!Object.hasOwn(data, "result")) {
    throw new Error(`${method}: отсутствует result`);
  }

  return data;
}

/**
 * Получаем все активные коллабы и связанные с ними чаты.
 */
async function getCollabs(domain, accessToken) {
  const collabs = [];
  let start = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    console.log("[PULL_CHATS_OPTIONS] Запрос коллабов:", {
      page: page + 1,
      start,
    });

    const response = await bitrixCall(
      domain,
      accessToken,
      "socialnetwork.api.workgroup.list",
      {
        filter: {
          ACTIVE: "Y",
          CLOSED: "N",
        },
        select: [
          "ID",
          "NAME",
          "TYPE",
        ],
        params: {
          shouldSelectDialogId: "Y",
        },
        start,
      },
    );

    const workgroups = response.result?.workgroups;

    if (!Array.isArray(workgroups)) {
      throw new Error(
        "Bitrix24 не вернул массив result.workgroups",
      );
    }

    for (const item of workgroups) {
      const type = String(
        item.type ?? item.TYPE ?? "",
      ).toLowerCase();

      // Оставляем только коллабы.
      if (type !== "collab") {
        continue;
      }

      const id = Number(item.id ?? item.ID);

      const name = String(
        item.name ?? item.NAME ?? "",
      ).trim();

      const dialogId = String(
        item.dialogId ?? item.DIALOG_ID ?? "",
      ).trim();

      if (!Number.isSafeInteger(id) || id <= 0 || !name) {
        continue;
      }

      collabs.push({
        id,
        code: `collab:${id}`,
        name,
        dialogId: dialogId || null,
        label: `${name} — Коллаб`,
      });
    }

    console.log("[PULL_CHATS_OPTIONS] Страница обработана:", {
      received: workgroups.length,
      collabsFound: collabs.length,
    });

    // Bitrix24 может вернуть номер следующей страницы.
    if (response.next !== undefined && response.next !== null) {
      const next = Number(response.next);

      if (!Number.isFinite(next) || next <= start) {
        throw new Error("Некорректный параметр пагинации next");
      }

      start = next;
      continue;
    }

    // Если следующей страницы нет, завершаем обход.
    if (workgroups.length < PAGE_SIZE) {
      break;
    }

    start += PAGE_SIZE;

    if (page === MAX_PAGES - 1) {
      throw new Error("Превышен лимит страниц при получении коллабов");
    }
  }

  // Убираем дубликаты по ID.
  const uniqueCollabs = [
    ...new Map(
      collabs.map((collab) => [collab.id, collab]),
    ).values(),
  ];

  uniqueCollabs.sort((a, b) =>
    a.name.localeCompare(b.name, "ru"),
  );

  return uniqueCollabs;
}

/**
 * HTTP-обработчик активности pull_chats_options.
 */
export async function handlePullChatsOptions(request) {
  const startedAt = Date.now();

  console.log("[PULL_CHATS_OPTIONS] Начало обработки:", {
    timestamp: new Date().toISOString(),
    method: request.method,
  });

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: {
        Allow: "POST",
      },
    });
  }

  try {
    const payload = await parsePayload(request);

    if (
      payload.code &&
      payload.code !== ACTIVITY_CODE
    ) {
      throw new Error(
        `Неожиданный код активности: ${payload.code}`,
      );
    }

    const auth = payload.auth || {};

    const domain = getPortalDomain(auth);

    const accessToken =
      auth.access_token ??
      auth.ACCESS_TOKEN;

    const eventToken =
      payload.event_token ??
      payload.EVENT_TOKEN;

    if (!accessToken || !eventToken) {
      throw new Error(
        "В запросе отсутствует access_token или event_token",
      );
    }

    console.log("[PULL_CHATS_OPTIONS] Получен контекст:", {
      domain,
      workflowId: payload.workflow_id ?? null,
    });

    let collabs = [];
    let listError = null;

    try {
      collabs = await getCollabs(domain, accessToken);

      console.log("[PULL_CHATS_OPTIONS] Коллабы получены:", {
        count: collabs.length,
      });
    } catch (error) {
      listError =
        error instanceof Error
          ? error.message
          : String(error);

      console.error("[PULL_CHATS_OPTIONS] Ошибка получения коллабов:", {
        message: listError,
      });
    }

    /*
     * RETURN_PROPERTIES.chat_options должен быть
     * объявлен в регистрации активности как Type: "string",
     * Multiple: "Y".
     *
     * Для каждого элемента возвращаем строку:
     * collab:12 | Название коллаба | chat123
     */
    const chatOptions = collabs.map((collab) => {
    return `${collab.code} | ${collab.name} | ${collab.dialogId ?? ""}`;
    });

    const logMessage = listError
      ? `Не удалось получить коллабы: ${listError}`
      : `Получено коллабов: ${collabs.length}`;


    await bitrixCall(
      domain,
      accessToken,
      "bizproc.event.send",
      {
        EVENT_TOKEN: eventToken,
        RETURN_VALUES: {
          chat_options: chatOptions,
        },
        LOG_MESSAGE: `Получено коллабов: ${chatOptions.length}`,
      },
    );

    console.log("[PULL_CHATS_OPTIONS] Результат передан:", {
      count: chatOptions.length,
      status: listError ? "warning" : "success",
      result: sendResponse.result,
      durationMs: Date.now() - startedAt,
    });

    return new Response(
      JSON.stringify({
        result: true,
        count: chatOptions.length,
        status: listError ? "warning" : "success",
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
      },
    );
  } catch (error) {
    console.error("[PULL_CHATS_OPTIONS] Ошибка обработчика:", {
      message:
        error instanceof Error
          ? error.message
          : String(error),
      durationMs: Date.now() - startedAt,
    });

    return new Response("Internal Server Error", {
      status: 500,
    });
  }
}
