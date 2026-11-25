// Отправка писем через SMTP (nodemailer).
// Креды живут только на сервере (process.env), в браузер не попадают
// фронт ходит на наш /api/mail/send, а уже он — в SMTP.
//
// Рег.ру: mail.hosting.reg.ru
//   465 — SSL/TLS сразу   (MAIL_SECURE=1)
//   587 — STARTTLS        (MAIL_SECURE=0)


import nodemailer from "nodemailer";

let cachedTransport = null;

function parseBool(value, defaultValue = true) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const normalized = String(value).trim().toLowerCase();

  return !["0", "false", "no", "off"].includes(normalized);
}

function getConfig() {
  const host = String(process.env.MAIL_HOST || "").trim();
  const user = String(process.env.MAIL_USER || "").trim();
  const pass = String(process.env.MAIL_PASS || "").trim();

  if (!host || !user || !pass) {
    throw new Error(
      "SMTP не настроен: нужны MAIL_HOST, MAIL_USER и MAIL_PASS в .env",
    );
  }

  const port = Number(process.env.MAIL_PORT) || 465;
  // Для 465 шифрование включается сразу; для 587 — через STARTTLS.
  const secure = parseBool(process.env.MAIL_SECURE, port === 465);

  return {
    host,
    port,
    secure,
    user,
    pass,
    from:
      String(process.env.MAIL_FROM || "").trim() || user,
    allowedDomains: String(process.env.MAIL_ALLOWED_DOMAINS || "")
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
    requireTls: parseBool(process.env.MAIL_REQUIRE_TLS, true),
  };
}

export function isMailConfigured() {
  return Boolean(
    process.env.MAIL_HOST &&
      process.env.MAIL_USER &&
      process.env.MAIL_PASS,
  );
}

function getTransport() {
  if (cachedTransport) {
    return cachedTransport;
  }

  const config = getConfig();

  cachedTransport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    // Для 587: начать plain, затем обязательно поднять TLS.
    requireTLS: config.secure ? false : config.requireTls,
    tls: {
      // В проде проверять сертификат обязательно.
      rejectUnauthorized: config.requireTls,
    },
    pool: true,
    maxConnections: 3,
    maxMessages: 50,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });

  return cachedTransport;
}

// Проверка, что адрес — обычный email без хитростей.
const EMAIL_RE = /^[^\s@<>,;:"]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

function normalizeRecipients(to) {
  const list = Array.isArray(to)
    ? to
    : String(to || "")
        .split(/[,;]/)
        .map((s) => s.trim());

  const recipients = list
    .map((s) => String(s).trim())
    .filter(Boolean);

  if (recipients.length === 0) {
    throw new Error("Не указан получатель");
  }

  if (recipients.length > 20) {
    throw new Error("Слишком много получателей (максимум 20)");
  }

  for (const address of recipients) {
    if (!EMAIL_RE.test(address)) {
      throw new Error(`Некорректный адрес получателя: ${address}`);
    }
  }

  return recipients;
}

// Защита от открытого релея: отправляем только на «свои» домены.
function assertDomainAllowed(recipients, allowedDomains) {
  if (!allowedDomains.length) {
    return;
  }

  for (const address of recipients) {
    const domain = address.split("@")[1]?.toLowerCase();

    if (!allowedDomains.includes(domain)) {
      throw new Error(
        `Отправка на домен «${domain}» запрещена (MAIL_ALLOWED_DOMAINS)`,
      );
    }
  }
}

export async function sendMail({ to, subject, text, html, replyTo } = {}) {
  const config = getConfig();
  const recipients = normalizeRecipients(to);

  assertDomainAllowed(recipients, config.allowedDomains);

  const cleanSubject = String(subject || "").trim();

  if (!cleanSubject) {
    throw new Error("Не указана тема письма");
  }

  if (cleanSubject.length > 200) {
    throw new Error("Слишком длинная тема письма (максимум 200 символов)");
  }

  // Заголовки не должны содержать переводов строк (защита от инъекции).
  if (/[\r\n]/.test(cleanSubject)) {
    throw new Error("Недопустимые символы в теме письма");
  }

  const bodyText = String(text || "").trim();
  const bodyHtml = html ? String(html) : undefined;

  if (!bodyText && !bodyHtml) {
    throw new Error("Пустое тело письма");
  }

  const info = await getTransport().sendMail({
    from: config.from,
    to: recipients.join(", "),
    subject: cleanSubject,
    text: bodyText || undefined,
    html: bodyHtml,
    ...(replyTo ? { replyTo: String(replyTo) } : {}),
  });

  console.log("[MAIL] Отправлено:", {
    to: recipients.join(", "),
    subject: cleanSubject,
    messageId: info.messageId,
    accepted: info.accepted?.length ?? 0,
    rejected: info.rejected?.length ?? 0,
  });

  return {
    messageId: info.messageId,
    accepted: info.accepted || [],
    rejected: info.rejected || [],
  };
}

// Проверка соединения с SMTP (полезно после настройки .env).
export async function verifyMailConnection() {
  await getTransport().verify();

  return { ok: true, host: process.env.MAIL_HOST, port: process.env.MAIL_PORT };
}
