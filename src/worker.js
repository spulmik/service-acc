import { handleInstallRequest } from "../install.js";
import {
  getMailboxesnameYandex,
  createYandexUser,
  deleteYandexUser,
  getMailboxes,
  createRegUser,
  deleteRegUser,
} from "./functions.js";

import { getCloudContactUsers } from "./cloudcontact.js";

import { handleCreateMailbox } from "./activities/rest/create_mailbox/handler.js";
import {
  handlePullChatsOptions,
} from "./activities/rest/pull_chats_options/handler.js";

import {
  handleAuthRoute,
  getAuthenticatedSession,
  jsonAuthResponse,
} from "./auth.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function normalizeHost(value) {
  const host = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split(/[/?#]/)[0];

  return /^[a-z0-9.-]+$/.test(host) ? host : "";
}

// Защита от CSRF. Cookie теперь SameSite=None (нужно для iframe),
// поэтому для изменяющих запросов проверяем, что они пришли
// с нашего же origin.
function isSameOriginRequest(request, url) {
  const origin = request.headers.get("Origin");

  if (origin) {
    return origin === url.origin;
  }

  return request.headers.get("Sec-Fetch-Site") === "same-origin";
}

// Разрешаем встраивать приложение в iframe только на портале Bitrix24
// (защита от clickjacking). Домен берётся из BITRIX_ALLOWED_DOMAIN.
function getFrameAncestors(env) {
  const domain = normalizeHost(env.BITRIX_ALLOWED_DOMAIN);

  if (domain) {
    return `'self' https://${domain}`;
  }

  return "'self' https://*.bitrix24.ru https://*.bitrix24.com";
}

function withSecurityHeaders(response, env) {
  // Заголовки ответа из ASSETS.fetch() неизменяемы, поэтому
  // создаём копию ответа.
  const secured = new Response(response.body, response);

  secured.headers.set("X-Content-Type-Options", "nosniff");
  secured.headers.set("Referrer-Policy", "same-origin");
  secured.headers.set(
    "Content-Security-Policy",
    `frame-ancestors ${getFrameAncestors(env)}`,
  );

  return secured;
}

// В браузер отдаём только те поля, которые нужны интерфейсу.
function toPublicYandexUser(user) {
  return {
    id: user?.id,
    nickname: user?.nickname || "",
    email: user?.email || "",
    name: {
      first: user?.name?.first || "",
      last: user?.name?.last || "",
      middle: user?.name?.middle || "",
    },
  };
}

async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  console.log("[ROUTER] Входящий запрос:", {
    method: request.method,
    pathname,
    timestamp: new Date().toISOString(),
  });

  try {
    // Bitrix24 открывает серверное приложение через POST.
    // Возвращаем HTML Vue SPA вместо передачи POST в Assets.
    if (
      pathname === "/" &&
      request.method === "POST" &&
      url.searchParams.has("DOMAIN") &&
      url.searchParams.has("APP_SID")
    ) {
      const domain = url.searchParams.get("DOMAIN");

      console.log("[BITRIX UI] Открытие интерфейса:", {
        domain,
        lang: url.searchParams.get("LANG"),
        timestamp: new Date().toISOString(),
      });

      const headers = new Headers(request.headers);
      headers.delete("content-length");
      headers.delete("content-type");
      headers.set("accept", "text/html");

      const assetRequest = new Request(url.toString(), {
        method: "GET",
        headers,
      });

      return env.ASSETS.fetch(assetRequest);
    }

    // CSRF-проверка для всех изменяющих запросов к /auth и /api.
    // Серверные вызовы Bitrix24 (/install, /activities/...) сюда не попадают.
    const isAuthOrApi =
      pathname === "/auth" ||
      pathname.startsWith("/auth/") ||
      pathname === "/api" ||
      pathname.startsWith("/api/");

    if (
      isAuthOrApi &&
      !SAFE_METHODS.has(request.method) &&
      !isSameOriginRequest(request, url)
    ) {
      console.warn("[CSRF] Запрос отклонён:", {
        method: request.method,
        pathname,
        origin: request.headers.get("Origin") || null,
      });

      return jsonAuthResponse({ error: "Forbidden" }, 403);
    }

    // 1. Маршруты авторизации.
    const authResponse = await handleAuthRoute(
      request,
      env,
      pathname,
    );

    if (authResponse) {
      return authResponse;
    }

    // 2. Установка приложения Bitrix24.
    if (pathname === "/install") {
      return handleInstallRequest(request);
    }

    // 3. Получение списка коллабов.
    if (
      pathname === "/activities/rest/pull_chats_options/handler.js"
    ) {
      return handlePullChatsOptions(request);
    }

    // 4. Создание почтового ящика через существующую активность.
    if (
      pathname === "/activities/rest/create_mailbox/handler.js"
    ) {
      console.log("[ROUTER] Маршрут создания почты:", {
        pathname,
        method: request.method,
        timestamp: new Date().toISOString(),
      });

      return handleCreateMailbox(request, env, ctx);
    }

    // 5. API интерфейса — сначала обязательная проверка сессии.
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      const session = await getAuthenticatedSession(request, env);

      if (!session) {
        return jsonAuthResponse(
          { error: "Требуется авторизация" },
          401,
        );
      }

      // 5.1. Удаление пользователя Яндекс 360.
      // Этот маршрут находится ВНУТРИ проверки авторизации.
      if (
        pathname.startsWith("/api/yandex/users/") &&
        request.method === "DELETE"
      ) {
        const userId = pathname.slice(
          "/api/yandex/users/".length,
        );

        try {
          const result = await deleteYandexUser(env, userId);

          console.log("[API YANDEX DELETE] Пользователь удалён:", {
            userId,
            username: session.username,
          });

          return jsonAuthResponse(result);
        } catch (error) {
          console.error("[API YANDEX DELETE] Ошибка:", {
            userId,
            message:
              error instanceof Error
                ? error.message
                : "Unknown error",
          });

          return jsonAuthResponse(
            { error: "Не удалось удалить пользователя Яндекс 360" },
            502,
          );
        }
      }

      // 5.2. Создание пользователя Яндекс 360.
      if (
        pathname === "/api/yandex/users" &&
        request.method === "POST"
      ) {
        try {
          const body = await request.json();

          const result = await createYandexUser(env, body);

          console.log("[API YANDEX CREATE] Пользователь создан:", {
            nickname: body.nickname,
            username: session.username,
          });

          return jsonAuthResponse(result);
        } catch (error) {
          console.error("[API YANDEX CREATE] Ошибка:", {
            message:
              error instanceof Error
                ? error.message
                : "Unknown error",
          });

          return jsonAuthResponse(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Не удалось создать пользователя Яндекс 360",
            },
            400,
          );
        }
      }

      // 5.3. Получение пользователей Яндекс 360.
      if (
        pathname === "/api/yandex/users" &&
        request.method === "GET"
      ) {
        try {
          const result = await getMailboxesnameYandex(env);

          return jsonAuthResponse({
            users: result.users.map(toPublicYandexUser),
            total: result.total,
          });
        } catch (error) {
          console.error("[API YANDEX USERS] Ошибка:", {
            message:
              error instanceof Error
                ? error.message
                : "Unknown error",
          });

          return jsonAuthResponse(
            {
              error:
                "Не удалось получить список пользователей Яндекс 360",
            },
            502,
          );
        }
      }

      // 5.4. Получение почтовых ящиков Reg.ru (ISPmanager).
      if (
        pathname === "/api/reg/mailboxes" &&
        request.method === "GET"
      ) {
        try {
          const url = new URL(request.url);
          const domain = url.searchParams.get("domain") || "energy-team.club";

          const result = await getMailboxes(env, domain);

          console.log("[API REG MAILBOXES] Получено:", {
            domain,
            count: result?.doc?.elem?.length || 0,
            username: session.username,
          });

          // ISPmanager возвращает данные в формате:
          // { doc: { elem: [{ name: { $: "username@domain" } }, ...] } }
          const mailboxes = Array.isArray(result?.doc?.elem)
            ? result.doc.elem.map((item) => {
                // Полный email из ISPmanager
                const fullEmail = item?.name?.$ || "";
                // Логин до @
                const username = fullEmail.split("@")[0];

                return {
                  username,
                  email: fullEmail,
                };
              })
            : [];

          return jsonAuthResponse({
            mailboxes,
            domain,
            total: mailboxes.length,
          });
        } catch (error) {
          console.error("[API REG MAILBOXES] Ошибка:", {
            message:
              error instanceof Error
                ? error.message
                : "Unknown error",
          });

          return jsonAuthResponse(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Не удалось получить список почтовых ящиков",
            },
            502,
          );
        }
      }

      // 5.5. Создание почтового ящика Reg.ru (ISPmanager).
      if (
        pathname === "/api/reg/mailboxes" &&
        request.method === "POST"
      ) {
        try {
          const body = await request.json();

          const result = await createRegUser(env, {
            nickname: body.nickname,
            password: body.password,
            domain: body.domain || "energy-team.club",
          });

          console.log("[API REG CREATE] Ящик создан:", {
            email: result.email,
            username: session.username,
          });

          return jsonAuthResponse({ user: result });
        } catch (error) {
          console.error("[API REG CREATE] Ошибка:", {
            message:
              error instanceof Error
                ? error.message
                : "Unknown error",
          });

          return jsonAuthResponse(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Не удалось создать почтовый ящик",
            },
            400,
          );
        }
      }

      // 5.6. Удаление почтового ящика Reg.ru (ISPmanager).
      if (
        pathname.startsWith("/api/reg/mailboxes/") &&
        request.method === "DELETE"
      ) {
        const email = decodeURIComponent(
          pathname.slice("/api/reg/mailboxes/".length),
        );

        try {
          const result = await deleteRegUser(env, email);

          console.log("[API REG DELETE] Ящик удалён:", {
            email: result.email,
            username: session.username,
          });

          return jsonAuthResponse(result);
        } catch (error) {
          console.error("[API REG DELETE] Ошибка:", {
            email,
            message:
              error instanceof Error
                ? error.message
                : "Unknown error",
          });

          return jsonAuthResponse(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Не удалось удалить почтовый ящик",
            },
            400,
          );
        }
      }

      // 5.7. CloudContact (BrightPattern) — список пользователей по типу.
      if (
        pathname.startsWith("/api/cloudcontact/") &&
        request.method === "GET"
      ) {
        const type = pathname
          .slice("/api/cloudcontact/".length)
          .split("/")[0];

        // ?refresh=1 — кнопка «Обновить список»: игнорируем кэш и тянем
        // свежие данные из BrightPattern (защита от рассинхронизации).
        const forceRefresh =
          url.searchParams.get("refresh") === "1" ||
          url.searchParams.get("refresh") === "true";

        try {
          const users = await getCloudContactUsers(env, type, forceRefresh);

          console.log("[API CLOUDCONTACT] Получено:", {
            type,
            count: users.length,
            username: session.username,
          });

          return jsonAuthResponse({ users, total: users.length, type });
        } catch (error) {
          console.error("[API CLOUDCONTACT] Ошибка:", {
            type,
            message:
              error instanceof Error ? error.message : "Unknown error",
          });

          return jsonAuthResponse(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Не удалось получить данные CloudContact",
            },
            502,
          );
        }
      }

      // Неизвестные API-маршруты.
      return jsonAuthResponse(
        { error: "API endpoint not found" },
        404,
      );
    }

    // 6. Остальные запросы — Vue SPA и статические файлы.
    return env.ASSETS.fetch(request);
  } catch (error) {
    console.error("[ROUTER] Необработанная ошибка:", {
      pathname,
      message:
        error instanceof Error
          ? error.message
          : String(error),
      timestamp: new Date().toISOString(),
    });

    return new Response("Internal Server Error", {
      status: 500,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
}

export default {
  async fetch(request, env, ctx) {
    const response = await handleRequest(request, env, ctx);

    return withSecurityHeaders(response, env);
  },
};
