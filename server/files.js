// Раздача папки files/ (инструкции к письмам и т.п.). В отличие от
// assets.js — без SPA-fallback: нет файла → 404. Content-Disposition:
// attachment заставляет браузер скачать файл по клику из письма
// (атрибут download почтовые клиенты игнорируют).

import { readFile, stat } from "node:fs/promises";
import { join, resolve, extname, sep, basename } from "node:path";

const MIME = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".txt": "text/plain; charset=utf-8",
};

export function createFiles(filesDir) {
  const root = resolve(filesDir);

  return {
    async fetch(request) {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method Not Allowed", {
          status: 405,
          headers: { Allow: "GET, HEAD" },
        });
      }

      const url = new URL(request.url);
      const pathname = decodeURIComponent(url.pathname);

      // Защита от выхода за пределы files/ (path traversal).
      const target = resolve(root, `.${pathname.slice("/files".length)}`);

      if (!target.startsWith(root + sep)) {
        return new Response("Not found", { status: 404 });
      }

      let body = null;

      try {
        const info = await stat(target);

        if (info.isFile()) {
          body = await readFile(target);
        }
      } catch {
        // нет файла — ок
      }

      if (body == null) {
        return new Response("Not found", { status: 404 });
      }

      const ext = extname(target).toLowerCase();
      // Имя для скачивания — только basename, без кавычек/обратных слэшей.
      const filename = basename(target).replace(/["\\]/g, "");

      return new Response(request.method === "HEAD" ? null : body, {
        status: 200,
        headers: {
          "Content-Type": MIME[ext] || "application/octet-stream",
          "Content-Disposition": `attachment; filename="${filename}"`,
          // Файл могут заменить — не кешируем надолго.
          "Cache-Control": "public, max-age=3600",
        },
      });
    },
  };
}