
import { handleInstallRequest } from "../install.js";
import { getMailboxesnameYandex } from "./functions.js";

import { handleCreateMailbox } from "./activities/rest/create_mailbox/handler.js";
import {
  handlePullChatsOptions,
} from "./activities/rest/pull_chats_options/handler.js";

import {
  handleAuthRoute,
  getAuthenticatedSession,
  jsonAuthResponse,
} from "./auth.js";

export default {
  async fetch(request, env, ctx) {
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

          // Принимаем только числовой ID.
          if (!/^\d+$/.test(userId)) {
            return jsonAuthResponse(
              { error: "Некорректный ID пользователя" },
              400,
            );
          }

          if (!env.YANDEX_TOKEN || !env.YANDEX_ORG_ID) {
            return jsonAuthResponse(
              { error: "Не настроены параметры Яндекс 360" },
              500,
            );
          }

          try {
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

              console.error("[API YANDEX DELETE] Ошибка:", {
                status: response.status,
                userId,
                code: data?.code || data?.error || "UNKNOWN",
              });

              return jsonAuthResponse(
                {
                  error: "Не удалось удалить пользователя Яндекс 360",
                },
                502,
              );
            }

            console.log("[API YANDEX DELETE] Пользователь удалён:", {
              userId,
              username: session.username,
            });

            return jsonAuthResponse({
              success: true,
              userId,
            });
          } catch (error) {
            console.error("[API YANDEX DELETE] Ошибка запроса:", {
              userId,
              message:
                error instanceof Error
                  ? error.message
                  : "Unknown error",
            });

            return jsonAuthResponse(
              { error: "Ошибка соединения с Яндекс 360" },
              502,
            );
          }
        }

        // 5.2. Получение пользователей Яндекс 360.
        if (
          pathname === "/api/yandex/users" &&
          request.method === "GET"
        ) {
          try {
            const result = await getMailboxesnameYandex(env);

            return jsonAuthResponse({
              users: result.users,
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
  },
};
