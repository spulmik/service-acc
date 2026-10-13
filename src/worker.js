
import { handleWebhook } from "./webhooks/handler.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";

    console.log("[ROUTER] Входящий запрос:", {
      method: request.method,
      pathname,
      timestamp: new Date().toISOString()
    });

    // Обработка вебхуков Битрикс24
    if (pathname === "/webhooks") {
      return handleWebhook(request, env, ctx);
    }

    // Неизвестные маршруты вебхуков
    if (pathname.startsWith("/webhooks/")) {
      return new Response("Webhook route not found", {
        status: 404,
        headers: {
          "Content-Type": "text/plain; charset=utf-8"
        }
      });
    }

    // Передача остальных запросов статическим файлам Vue
    return env.ASSETS.fetch(request);
  }
};
