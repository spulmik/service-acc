import { handleInstallRequest } from "../install.js";
// По исходке, старый вариант
// import { handleWebhook } from "./webhooks/handler.js";
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
      // Bitrix24 открывает серверное приложение с интерфейсом через POST.
      // Нужно вернуть HTML Vue SPA, а не передавать POST в Assets.
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
      // 1. Авторизация Vue-интерфейса
      const authResponse = await handleAuthRoute(
        request,
        env,
        pathname,
      );

      if (authResponse) {
        return authResponse;
      }

      // 2. Установка приложения Bitrix24.
      // Реализуем в корневом файле install.js следующим шагом.
      // Установка приложения Bitrix24.
      if (pathname === "/install") {
        return handleInstallRequest(request);
      }

      // Получение списка коллабов.
      if (
        pathname === "/activities/rest/pull_chats_options/handler.js"
      ) {
        return handlePullChatsOptions(request);
      }

      // Создание почты уз через вебхук
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

    // Остальные webhook-маршруты пока закрыты.
    if (
      pathname === "/webhooks" ||
      pathname.startsWith("/webhooks/")
    ) {
      return new Response("Webhook route not found", {
        status: 404,
      });
    }

      // 4. API интерфейса — только для авторизованных пользователей.
      if (pathname === "/api" || pathname.startsWith("/api/")) {
        const session = await getAuthenticatedSession(request, env);

        if (!session) {
          return jsonAuthResponse(
            { error: "Требуется авторизация" },
            401,
          );
        }

        return jsonAuthResponse(
          { error: "API endpoint not found" },
          404,
        );
      }

      // 5. Остальные запросы — Vue SPA и статические файлы.
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error("[ROUTER] Необработанная ошибка:", {
        pathname,
        message: error instanceof Error
          ? error.message
          : String(error),
        timestamp: new Date().toISOString(),
      });

      return new Response("Internal Server Error", {
        status: 500,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }
  },
};
