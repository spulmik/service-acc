
import {
  generatePassword,
  translit,
  projectMapping,
  getMailboxesnameYandex,
  getNextUuidYandex,
  getMailboxes,
  getNextUuid
} from "../functions.js";
  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Создание учётной записи</title>
  </head>;
  
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Frame-Options": "ALLOWALL",
      "Content-Security-Policy": "frame-ancestors *"
    }
  });
}
