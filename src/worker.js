
import { handleWebhook } from "./webhooks/handler.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Нормализуем путь: /webhooks и /webhooks/ считаются одинаковыми
    const pathname = url.pathname.replace(/\/+$/, "") || "/";

    console.log("[ROUTER] Входящий запрос:", {
      method: request.method,
      pathname,
      timestamp: new Date().toISOString()
    });

    // Маршрут вебхука Битрикс24
    if (pathname === "/webhooks") {
      return handleWebhook(request, env, ctx);
    }
    if (pathname === "/iframe") {
      return handleWebhook(request, env, ctx);
    }

    // Если маршрут не найден
    return new Response("Not found", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8"
      }
    });
  }
};
