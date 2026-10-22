// Шим для env.ASSETS.fetch(): отдаёт файлы из frontend/dist.
// Повторяет поведение Cloudflare Assets с not_found_handling:
// "single-page-application" — на неизвестный путь возвращает index.html.

import { readFile, stat } from "node:fs/promises";
import { join, resolve, extname, sep } from "node:path";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

export function createAssets(distDir) {
  const root = resolve(distDir);

  async function readIfFile(filePath) {
    try {
      const info = await stat(filePath);

      if (info.isFile()) {
        return await readFile(filePath);
      }
    } catch {
      // нет файла — ок
    }

    return null;
  }

  function serveIndex() {
    return readIfFile(join(root, "index.html")).then((body) =>
      body == null
        ? new Response("Not found", { status: 404 })
        : new Response(body, {
            status: 200,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          }),
    );
  }

  return {
    async fetch(request) {
      const url = new URL(request.url);
      const pathname = decodeURIComponent(url.pathname);

      // Защита от выхода за пределы dist (path traversal).
      const target = resolve(root, `.${pathname}`);

      if (target !== root && !target.startsWith(root + sep)) {
        return serveIndex();
      }

      const body = await readIfFile(target);

      // Неизвестный путь -> SPA-fallback на index.html.
      if (body == null) {
        return serveIndex();
      }

      const ext = extname(target).toLowerCase();
      const headers = {
        "Content-Type": MIME[ext] || "application/octet-stream",
      };

      // Хешированные ассеты Vite можно кешировать надолго, index.html — нет.
      if (ext && ext !== ".html") {
        headers["Cache-Control"] = "public, max-age=31536000, immutable";
      }

      return new Response(body, { status: 200, headers });
    },
  };
}
