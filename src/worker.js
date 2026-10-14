import { handleWebhook } from "./webhooks/handler.js";

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

    // Авторизация: /auth/login, /auth/me, /auth/logout
    const authResponse = await handleAuthRoute(
      request,
      env,
      pathname,
    );

    if (authResponse) {
      return authResponse;
    }

    // Webhook Bitrix24 оставляем отдельным маршрутом.
    // Он нужен для внешних запросов и не должен требовать
    // сессионную cookie от пользователя фронтенда.
    if (pathname === "/webhooks") {
      return handleWebhook(request, env, ctx);
    }

    if (pathname.startsWith("/webhooks/")) {
      return new Response("Webhook route not found", {
        status: 404,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }

    // Любые API-маршруты защищаем сессионной проверкой.
    // Когда появятся API-обработчики, подключай их ниже
    // проверки сессии, до ответа "API endpoint not found".
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

    // Остальные маршруты обслуживает Vue SPA.
    return env.ASSETS.fetch(request);
  },
};