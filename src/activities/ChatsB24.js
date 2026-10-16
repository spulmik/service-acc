
const ACTIVITY_CODE = "pull_chats_options";

const TYPE_LABELS = {
  group: "Группа",
  project: "Проект",
  scrum: "Scrum",
  collab: "Коллаб",
};

// Определение активности для регистрации в Bitrix24.
export function getChatsList(origin) {
  const baseUrl = origin.replace(/\/+$/, "");

  return {
    CODE: ACTIVITY_CODE,

    HANDLER: `${baseUrl}/activities/rest/pull_chats_options/handler.js`,

    USE_SUBSCRIPTION: "Y",

    NAME: {
      ru: "Получить список чатов",
    },

    DESCRIPTION: {
      ru: "Получает список доступных чатов и возвращает его в результатах активности.",
    },

    RETURN_PROPERTIES: {
      chat_options: {
        Name: {
          ru: "Список чатов",
        },
        Type: "string",
        Multiple: "Y",
        Default: null,
      },
    },
  };
}

// Читаем JSON или form-urlencoded от Bitrix24.
async function parseActivityRequest(request) {
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

// Вызов REST API Bitrix24.
async function bitrixCall(domain, method, accessToken, params = {}) {
  const hostname = String(domain || "")
    .trim()
    .toLowerCase();

  // Обработчик предназначен для порталов Bitrix24.
  if (
    !/^[a-z0-9.-]+$/.test(hostname) ||
    !(
      hostname.endsWith(".bitrix24.ru") ||
      hostname.endsWith(".bitrix24.com")
    )
  ) {
    throw new Error("Недопустимый домен Bitrix24");
  }

  const endpoint = new URL(`https://${hostname}/rest/`);

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

  const data = await response.json();

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

// Получаем все страницы со списком рабочих групп.
async function fetchChats(domain, accessToken) {
  const chats = [];
  let start = 0;

  for (let page = 0; page < 100; page++) {
    console.log("[PULL_CHATS_OPTIONS] Запрос списка:", {
      page: page + 1,
      start,
    });

    const response = await bitrixCall(
      domain,
      "socialnetwork.api.workgroup.list",
      accessToken,
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
        "Bitrix24 не вернул массив workgroups",
      );
    }

    for (const item of workgroups) {
      const id = Number(item.id ?? item.ID);

      const name = String(
        item.name ?? item.NAME ?? "",
      ).trim();

      const type = String(
        item.type ?? item.TYPE ?? "",
      ).toLowerCase();

      const dialogId = String(
        item.dialogId ?? item.DIALOG_ID ?? "",
      ).trim();

      // Возвращаем только объекты, у которых есть чат.
      if (
        !Number.isSafeInteger(id) ||
        id <= 0 ||
        !name ||
        !dialogId ||
        !TYPE_LABELS[type]
      ) {
        continue;
      }

      // Одна строка = один элемент результата активности.
      chats.push(
        `${type}:${id} | ${name} — ${TYPE_LABELS[type]} | ${dialogId}`,
      );
    }

    console.log("[PULL_CHATS_OPTIONS] Страница обработана:", {
      received: workgroups.length,
      chatsFound: chats.length,
    });

    if (workgroups.length === 0) {
      break;
    }

    if (response.next !== undefined && response.next !== null) {
      const next = Number(response.next);

      if (!Number.isFinite(next) || next <= start) {
        throw new Error("Некорректный параметр пагинации next");
      }

      start = next;
      continue;
    }

    if (workgroups.length < 50) {
      break;
    }

    start += 50;

    if (page === 99) {
      throw new Error("Превышен лимит страниц списка чатов");
    }
  }

  return chats;
}

// HTTP-обработчик, указанный в HANDLER.
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

  let payload;

  try {
    payload = await parseActivityRequest(request);

    if (payload.code !== ACTIVITY_CODE) {
      throw new Error(
        `Неожиданный код активности: ${payload.code || "отсутствует"}`,
      );
    }

    const auth = payload.auth || {};

    const {
      domain,
      access_token: accessToken,
    } = auth;

    const eventToken = payload.event_token;

    if (!domain || !accessToken || !eventToken) {
      throw new Error(
        "Отсутствует domain, access_token или event_token",
      );
    }

    console.log("[PULL_CHATS_OPTIONS] Контекст:", {
      domain,
      workflowId: payload.workflow_id || null,
    });

    let chatOptions = [];
    let operationError = null;

    try {
      chatOptions = await fetchChats(domain, accessToken);

      console.log("[PULL_CHATS_OPTIONS] Чаты получены:", {
        count: chatOptions.length,
      });
    } catch (error) {
      operationError =
        error instanceof Error
          ? error.message
          : String(error);

      console.error("[PULL_CHATS_OPTIONS] Ошибка получения чатов:", {
        message: operationError,
      });
    }

    // Завершаем ожидающую активность и передаём результат
    // обратно в бизнес-процесс.
    const sendResponse = await bitrixCall(
      domain,
      "bizproc.event.send",
      accessToken,
      {
        EVENT_TOKEN: eventToken,

        RETURN_VALUES: {
          chat_options: chatOptions,
        },

        LOG_MESSAGE: operationError
          ? `Не удалось получить список чатов: ${operationError}`
          : `Получен список чатов. Количество: ${chatOptions.length}`,
      },
    );

    console.log("[PULL_CHATS_OPTIONS] Результат отправлен:", {
      bitrixResult: sendResponse.result,
      count: chatOptions.length,
      status: operationError ? "warning" : "success",
      durationMs: Date.now() - startedAt,
    });

    return new Response(
      JSON.stringify({
        result: true,
        count: chatOptions.length,
        status: operationError ? "warning" : "success",
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
