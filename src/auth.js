const COOKIE_NAME = "service_acc_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 часов

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function jsonResponse(data, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });

  for (const [key, value] of Object.entries(extraHeaders)) {
    headers.set(key, value);
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

  for (const [username, password] of Object.entries(parsedUsers)) {
    const normalizedUsername = username.trim().toLowerCase();

    if (
      !normalizedUsername ||
      typeof password !== "string" ||
      password.length === 0
    ) {
      throw new Error("Invalid user configuration");
    }

    users[normalizedUsername] = password;
  }

  if (Object.keys(users).length === 0) {
    throw new Error("No users configured");
  }

  return {
    users,
    secret: env.AUTH_SESSION_SECRET,
  };
}

async function passwordsMatch(suppliedPassword, savedPassword) {
  // Сравниваем SHA-256-дайджесты одинаковой длины,
  // а не строки паролей напрямую.
  const [suppliedDigest, savedDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(suppliedPassword)),
    crypto.subtle.digest("SHA-256", encoder.encode(savedPassword)),
  ]);

  const a = new Uint8Array(suppliedDigest);
  const b = new Uint8Array(savedDigest);

  let difference = 0;

  for (let i = 0; i < a.length; i++) {
    difference |= a[i] ^ b[i];
  }

  return difference === 0;
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

function getCookie(request, cookieName) {
  const cookies = request.headers.get("Cookie") || "";

  const escapedName = cookieName.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );

  const match = cookies.match(
    new RegExp(`(?:^|;\\s*)${escapedName}=([^;]*)`),
  );

  return match ? match[1] : null;
}

function makeSessionCookie(request, token) {
  const secure =
    new URL(request.url).protocol === "https:" ? "; Secure" : "";

  return [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ].join("; ") + secure;
}

function clearSessionCookie(request) {
  const secure =
    new URL(request.url).protocol === "https:" ? "; Secure" : "";

  return (
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0` +
    secure
  );
}

async function readSession(request, config) {
  const token = getCookie(request, COOKIE_NAME);

  if (!token) {
    return null;
  }

  return verifySessionToken(token, config);
}

export async function getAuthenticatedSession(request, env) {
  try {
    const config = getAuthConfig(env);

    return await readSession(request, config);
  } catch {
    return null;
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
      { "Set-Cookie": clearSessionCookie(request) },
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

      // Для неизвестного пользователя выполняется сравнение
      // с фиктивным значением, чтобы не различать ответы по времени.
      const savedPassword = userExists
        ? config.users[username]
        : "invalid-user-password";

      const passwordIsValid = await passwordsMatch(
        password,
        savedPassword,
      );

      if (!userExists || !password || !passwordIsValid) {
        return jsonResponse(
          { error: "Неверный логин или пароль" },
          401,
        );
      }

      const token = await createSessionToken(
        username,
        config.secret,
      );

      console.log("[AUTH] Успешный вход:", username);

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
    console.error(
      "[AUTH] Ошибка конфигурации:",
      error instanceof Error ? error.message : "Unknown error",
    );

    return jsonResponse(
      { error: "Авторизация не настроена на сервере" },
      500,
    );
  }
}