import { getActivityDefinitions } from "./src/activities/index.js";

// Страница, которую Bitrix24 открывает в iframe при первоначальной установке.
// Она обязательно должна вызвать BX24.installFinish(), иначе установка
// не завершится (вместо неё будет пустое окно).
function installFinishPage() {
  const html = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Установка</title>
  <script src="//api.bitrix24.com/api/v1/"></script>
</head>
<body>
  <p>Завершение установки…</p>
  <script>
    BX24.init(function () {
      BX24.installFinish();
    });
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function bitrixCall(clientEndpoint, method, accessToken, params = {}) {
  const response = await fetch(
    new URL(method, clientEndpoint),
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

  return data.result;
}

async function registerActivities({
  clientEndpoint,
  accessToken,
  origin,
  authUserId,
}) {

const definitions = getActivityDefinitions(origin);

  // Получаем зарегистрированные Activity.
  const existing = await bitrixCall(
    clientEndpoint,
    "bizproc.activity.list",
    accessToken,
  );

  if (!Array.isArray(existing)) {
    throw new Error("Некорректный ответ bizproc.activity.list");
  }

  // Извлекаем коды активностей из массива объектов
  const existingCodes = new Set(
    existing.map(item => typeof item === 'string' ? item : item?.CODE).filter(Boolean)
  );

  console.log("[ACTIVITY] Существующие активности:", Array.from(existingCodes));

  for (const definition of definitions) {
    console.log("[ACTIVITY] Регистрация:", {
      CODE: definition.CODE,
      HANDLER: definition.HANDLER,
      exists: existingCodes.has(definition.CODE),
    });

    const fields = {
      ...definition,
      AUTH_USER_ID: authUserId,
    };

    if (existingCodes.has(definition.CODE)) {
      const { CODE, ...updateFields } = fields;

      await bitrixCall(
        clientEndpoint,
        "bizproc.activity.update",
        accessToken,
        {
          CODE,
          FIELDS: updateFields,
        },
      );

      console.log("[ACTIVITY] Обновлена:", CODE);
    } else {
      await bitrixCall(
        clientEndpoint,
        "bizproc.activity.add",
        accessToken,
        fields,
      );

      console.log("[ACTIVITY] Зарегистрирована:", definition.CODE);
      existingCodes.add(definition.CODE);
    }
  }
}

export async function handleInstallRequest(request) {
  console.log("[INSTALL] Начало установки", { method: request.method });

  // GET: страница завершения установки (на случай открытия без POST).
  if (request.method === "GET") {
    return installFinishPage();
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET, POST" },
    });
  }

  try {
    const contentType =
      request.headers.get("Content-Type") || "";

    const body = await request.text();

    // Пустой POST — это открытие iframe установки.
    if (!body) {
      console.log("[INSTALL] Открытие страницы установки (пустое тело)");
      return installFinishPage();
    }

    if (body.length > 65536) {
      return new Response("Invalid request body", {
        status: 400,
      });
    }

    let payload;

    if (contentType.includes("application/json")) {
      payload = JSON.parse(body);
    } else {
      payload = {};
      const auth = {};

      for (const [key, value] of new URLSearchParams(body)) {
        const match = key.match(/^auth\[([^\]]+)\]$/);

        if (match) {
          auth[match[1]] = value;
        } else {
          payload[key] = value;
        }
      }

      payload.auth = auth;
    }

    // Любой POST без события ONAPPINSTALL — это открытие iframe
    // первоначальной установки. Отдаём HTML с BX24.installFinish(),
    // а не текст "OK" (иначе в окне Bitrix24 будет чёрный экран).
    if (payload.event !== "ONAPPINSTALL") {
      console.log("[INSTALL] Открытие страницы установки (iframe)");

      return installFinishPage();
    }

    const auth = payload.auth || {};

    const {
      access_token: accessToken,
      application_token: applicationToken,
      client_endpoint: clientEndpoint,
      domain,
    } = auth;

    if (
      !accessToken ||
      !applicationToken ||
      !clientEndpoint ||
      !domain
    ) {
      console.warn("[INSTALL] Не хватает данных авторизации");

      return new Response("Missing authorization fields", {
        status: 400,
      });
    }

    // Проверяем, что запрос направляется на HTTPS
    // самого портала Bitrix24.
    const portal = new URL(`https://${domain}`);

    const endpoint = new URL(clientEndpoint);

    if (
      endpoint.protocol !== "https:" ||
      endpoint.hostname !== portal.hostname ||
      endpoint.username ||
      endpoint.password
    ) {
      return new Response("Invalid Bitrix24 endpoint", {
        status: 400,
      });
    }

    if (!endpoint.pathname.endsWith("/")) {
      endpoint.pathname += "/";
    }

    // Проверяем access_token через REST API Bitrix24.
    const response = await fetch(
      new URL("profile", endpoint),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          auth: accessToken,
        }),
        signal: AbortSignal.timeout(10000),
      },
    );

    const result = await response.json();

    if (
      !response.ok ||
      result?.error ||
      !Object.hasOwn(result, "result")
    ) {
      console.warn("[INSTALL] Проверка access_token не пройдена");

      return new Response("Invalid access token", {
        status: 403,
      });
    }

    console.log("[INSTALL] Установка проверена:", {
      domain,
      timestamp: new Date().toISOString(),
    });

    const profile = result.result;

    const authUserId = Number(
      profile.ID ?? profile.id,
    );

    if (!Number.isSafeInteger(authUserId) || authUserId <= 0) {
      throw new Error("Не удалось определить ID пользователя Bitrix24");
    }

    await registerActivities({
      clientEndpoint: endpoint.toString(),
      accessToken,
      origin: new URL(request.url).origin,
      authUserId,
    });

    return new Response("OK", {
      status: 200,
    });
  } catch (error) {
    console.error("[INSTALL] Ошибка:", {
      message: error instanceof Error
        ? error.message
        : String(error),
    });

    return new Response("Internal Server Error", {
      status: 500,
    });
  }
}
