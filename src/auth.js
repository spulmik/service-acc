const COOKIE_NAME = "service_acc_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 часов

// Ограничение подбора пароля: счётчик неудачных попыток по IP (KV).
const LOGIN_MAX_FAILURES = 10;
const LOGIN_BLOCK_SECONDS = 15 * 60;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function jsonResponse(data, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });

  for (const [key, value] of Object.entries(extraHeaders)) {
    // Массив значений нужен, например, для нескольких Set-Cookie.
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
    } else {
      headers.set(key, value);
    }
  }

  return new Response(JSON.stringify(data), {
    status,
    headers,
  });
}

export { jsonResponse as jsonAuthResponse };

function getAuthConfig(env) {
  if (
    typeof env.AUTH_USERS_JSON !== "string" ||
    !env.AUTH_USERS_JSON.trim()
  ) {
    throw new Error("AUTH_USERS_JSON is not configured");
  }

  if (
    typeof env.AUTH_SESSION_SECRET !== "string" ||
    env.AUTH_SESSION_SECRET.length < 32
  ) {
    throw new Error("AUTH_SESSION_SECRET is not configured correctly");
  }

  const parsedUsers = JSON.parse(env.AUTH_USERS_JSON);

  if (
    !parsedUsers ||
    typeof parsedUsers !== "object" ||
    Array.isArray(parsedUsers)
  ) {
    throw new Error("AUTH_USERS_JSON must be a JSON object");
  }

  const users = Object.create(null);

  for (const [username, passwordHash] of Object.entries(parsedUsers)) {
    const normalizedUsername = username.trim().toLowerCase();

    if (
      !normalizedUsername ||
      typeof passwordHash !== "string" ||
      passwordHash.length === 0
    ) {
      throw new Error("Invalid user configuration");
    }

    // Проверяем, что это bcrypt хэш ($2a$, $2b$ или $2y$)
    if (!/^\$2[aby]\$\d{2}\$.{53}$/.test(passwordHash)) {
      throw new Error(
        `Invalid bcrypt hash for user "${normalizedUsername}". ` +
        `Use: echo -n "password" | npx bcrypt-cli`
      );
    }

    users[normalizedUsername] = passwordHash;
  }

  if (Object.keys(users).length === 0) {
    throw new Error("No users configured");
  }

  return {
    users,
    secret: env.AUTH_SESSION_SECRET,
  };
}

// Bcrypt verification для Cloudflare Workers
async function verifyBcrypt(password, hash) {
  // Импортируем bcrypt.js динамически (совместим с Workers)
  const bcrypt = await import("bcryptjs");

  return bcrypt.compare(password, hash);
}

function bytesToBase64Url(bytes) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const base64 = value
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);

  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function importHmacKey(secret, usages) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    usages,
  );
}

async function createSessionToken(username, secret) {
  const payload = {
    username,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };

  const encodedPayload = bytesToBase64Url(
    encoder.encode(JSON.stringify(payload)),
  );

  const key = await importHmacKey(secret, ["sign"]);

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(encodedPayload),
  );

  return `${encodedPayload}.${bytesToBase64Url(
    new Uint8Array(signature),
  )}`;
}

async function verifySessionToken(token, config) {
  try {
    if (typeof token !== "string") {
      return null;
    }

    const parts = token.split(".");

    if (parts.length !== 2) {
      return null;
    }

    const [encodedPayload, encodedSignature] = parts;

    const signature = base64UrlToBytes(encodedSignature);
    const key = await importHmacKey(config.secret, ["verify"]);

    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      encoder.encode(encodedPayload),
    );

    if (!isValid) {
      return null;
    }

    const payload = JSON.parse(
      decoder.decode(base64UrlToBytes(encodedPayload)),
    );

    if (
      typeof payload.username !== "string" ||
      typeof payload.exp !== "number" ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    if (
      !Object.prototype.hasOwnProperty.call(
        config.users,
        payload.username,
      )
    ) {
      return null;
    }

    return {
      username: payload.username,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

// Возвращает ВСЕ значения cookie с таким именем.
// Если в браузере остались старая (не partitioned) и новая cookie
// с одним именем, проверяем обе.
function getCookieValues(request, cookieName) {
  const header = request.headers.get("Cookie") || "";
  const values = [];

  for (const part of header.split(";")) {
    const index = part.indexOf("=");

    if (index === -1) {
      continue;
    }

    if (part.slice(0, index).trim() === cookieName) {
      values.push(part.slice(index + 1).trim());
    }
  }

  return values;
}

function isHttps(request) {
  return new URL(request.url).protocol === "https:";
}

// Приложение открывается в iframe Bitrix24, то есть в КРОСС-САЙТОВОМ
// контексте. Cookie с SameSite=Strict/Lax в таком контексте не
// сохраняются и не отправляются, поэтому нужен SameSite=None; Secure.
// Атрибут Partitioned (CHIPS) привязывает cookie к сайту верхнего уровня
// (портал Bitrix24): так она работает даже при блокировке сторонних
// cookie и недоступна другим сайтам.
function cookieSuffix(request) {
  return isHttps(request)
    ? "; Secure; SameSite=None; Partitioned"
    : "; SameSite=Lax"; // локальная разработка по http://localhost
}

function makeSessionCookie(request, token) {
  return (
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; ` +
    `Max-Age=${SESSION_TTL_SECONDS}` +
    cookieSuffix(request)
  );
}

function clearSessionCookies(request) {
  const cookies = [
    `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0` +
      cookieSuffix(request),
  ];

  // Прежняя версия ставила cookie с SameSite=Strict без Partitioned.
  // Это другая cookie, её нужно удалять отдельно.
  cookies.push(
    `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0` +
      (isHttps(request)
        ? "; Secure; SameSite=Strict"
        : "; SameSite=Strict"),
  );

  return cookies;
}

async function readSession(request, config) {
  for (const token of getCookieValues(request, COOKIE_NAME)) {
    const session = await verifySessionToken(token, config);

    if (session) {
      return session;
    }
  }

  return null;
}

export async function getAuthenticatedSession(request, env) {
  try {
    const config = getAuthConfig(env);

    return await readSession(request, config);
  } catch (error) {
    // Не логируем детали конфигурации (могут содержать секреты)
    console.error("[AUTH] Session verification failed");

    return null;
  }
}

// -----------------------------------------------------
// ОГРАНИЧЕНИЕ ПОДБОРА ПАРОЛЯ
// -----------------------------------------------------
// KV работает с задержкой синхронизации, поэтому это защита
// «по возможности». Основную защиту добавьте правилом
// Rate limiting в Cloudflare WAF:
//
// Dashboard → Security → WAF → Rate Limiting Rules
// Rule: POST /auth/login
// Rate: 5 requests per minute per IP
// Action: Challenge (Managed Challenge)
//
// Это обязательная мера для production.

function loginFailureKey(request) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";

  return `login-fail:${ip}`;
}

async function isLoginBlocked(env, request) {
  if (!env.BITRIX_APP_CONFIG) {
    return false;
  }

  try {
    const value = await env.BITRIX_APP_CONFIG.get(
      loginFailureKey(request),
    );

    return Number(value || 0) >= LOGIN_MAX_FAILURES;
  } catch {
    return false;
  }
}

async function registerLoginFailure(env, request) {
  if (!env.BITRIX_APP_CONFIG) {
    return;
  }

  try {
    const key = loginFailureKey(request);
    const count = Number((await env.BITRIX_APP_CONFIG.get(key)) || 0) + 1;

    await env.BITRIX_APP_CONFIG.put(key, String(count), {
      expirationTtl: LOGIN_BLOCK_SECONDS,
    });

    // Логируем только IP и счётчик (без чувствительных данных)
    console.warn("[AUTH] Login failure registered:", {
      ip: request.headers.get("CF-Connecting-IP") || "unknown",
      attempts: count,
    });
  } catch (error) {
    console.error("[AUTH] Failed to register login failure");
  }
}

async function clearLoginFailures(env, request) {
  if (!env.BITRIX_APP_CONFIG) {
    return;
  }

  try {
    await env.BITRIX_APP_CONFIG.delete(loginFailureKey(request));
  } catch {
    // Игнорируем.
  }
}

export async function handleAuthRoute(request, env, pathname) {
  if (pathname !== "/auth" && !pathname.startsWith("/auth/")) {
    return null;
  }

  // Выход доступен даже если конфигурация авторизации
  // была изменена или удалена.
  if (pathname === "/auth/logout") {
    if (request.method !== "POST") {
      return jsonResponse(
        { error: "Method not allowed" },
        405,
        { Allow: "POST" },
      );
    }

    return jsonResponse(
      { authenticated: false },
      200,
      { "Set-Cookie": clearSessionCookies(request) },
    );
  }

  if (pathname === "/auth/login" && request.method !== "POST") {
    return jsonResponse(
      { error: "Method not allowed" },
      405,
      { Allow: "POST" },
    );
  }

  if (pathname === "/auth/me" && request.method !== "GET") {
    return jsonResponse(
      { error: "Method not allowed" },
      405,
      { Allow: "GET" },
    );
  }

  try {
    const config = getAuthConfig(env);

    if (pathname === "/auth/login") {
      if (await isLoginBlocked(env, request)) {
        console.warn("[AUTH] Login blocked: too many attempts");

        return jsonResponse(
          {
            error:
              "Слишком много неудачных попыток входа. Повторите позже.",
          },
          429,
          { "Retry-After": String(LOGIN_BLOCK_SECONDS) },
        );
      }

      let body;

      try {
        body = await request.json();
      } catch {
        return jsonResponse(
          { error: "Некорректный JSON" },
          400,
        );
      }

      const username =
        typeof body?.username === "string"
          ? body.username.trim().toLowerCase()
          : "";

      const password =
        typeof body?.password === "string"
          ? body.password
          : "";

      const userExists = Object.prototype.hasOwnProperty.call(
        config.users,
        username,
      );

      // Для неизвестного пользователя выполняется проверка
      // с фиктивным хэшем, чтобы не различать ответы по времени.
      const savedHash = userExists
        ? config.users[username]
        : "$2a$10$XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";

      const passwordIsValid = password && userExists
        ? await verifyBcrypt(password, savedHash)
        : false;

      if (!passwordIsValid) {
        await registerLoginFailure(env, request);

        // Не раскрываем, что именно неверно (логин или пароль)
        return jsonResponse(
          { error: "Неверный логин или пароль" },
          401,
        );
      }

      await clearLoginFailures(env, request);

      const token = await createSessionToken(
        username,
        config.secret,
      );

      // Логируем только username (без пароля/хэша/токена)
      console.log("[AUTH] Successful login:", username);

      return jsonResponse(
        {
          authenticated: true,
          username,
        },
        200,
        {
          "Set-Cookie": makeSessionCookie(request, token),
        },
      );
    }

    if (pathname === "/auth/me") {
      const session = await readSession(request, config);

      if (!session) {
        return jsonResponse(
          { authenticated: false },
          401,
        );
      }

      return jsonResponse({
        authenticated: true,
        username: session.username,
      });
    }

    return jsonResponse(
      { error: "Маршрут авторизации не найден" },
      404,
    );
  } catch (error) {
    // Не раскрываем детали ошибки конфигурации
    console.error("[AUTH] Configuration error");

    return jsonResponse(
      { error: "Авторизация не настроена на сервере" },
      500,
    );
  }
}
