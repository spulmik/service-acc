// Обратимое шифрование для паролей в справочнике участников (вариант B).
// AES-256-GCM: в БД хранится шифртекст, при показе — расшифровывается.
// Ключ берётся из process.env.ENCRYPTION_KEY и НИКОГДА не хранится в БД.
//
// Формат ENCRYPTION_KEY: 32 байта, заданные как 64 hex-символа
//   (openssl rand -hex 32) либо base64. Другой длины — ошибка.
//
// Это НЕ хеширование: значение можно расшифровать обратно (так и задумано,
// чтобы показывать пароль в таблице). Для входа в приложение так нельзя —
// там bcrypt (см. auth.js).

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const IV_LENGTH = 12; // рекомендованный размер nonce для GCM
const TAG_LENGTH = 16; // длина тега аутентификации GCM
const PREFIX = "v1:"; // версия формата — на будущее

let cachedKey = null;

function getKey() {
  if (cachedKey) {
    return cachedKey;
  }

  const raw = process.env.ENCRYPTION_KEY;

  if (!raw || !raw.trim()) {
    throw new Error(
      "ENCRYPTION_KEY не задан в .env (нужен ключ 32 байта: openssl rand -hex 32)",
    );
  }

  const value = raw.trim();
  let key;

  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    key = Buffer.from(value, "hex");
  } else {
    key = Buffer.from(value, "base64");
  }

  if (key.length !== 32) {
    throw new Error(
      "ENCRYPTION_KEY должен быть 32 байта (64 hex-символа или base64 от 32 байт)",
    );
  }

  cachedKey = key;

  return key;
}

// Шифрует строку. Пустое/отсутствующее значение → null (в БД будет NULL).
export function encrypt(plain) {
  if (plain === undefined || plain === null || plain === "") {
    return null;
  }

  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(String(plain), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

// Расшифровывает. Пустое/битое значение → "" (чтобы не ронять выдачу списка).
export function decrypt(payload) {
  if (!payload) {
    return "";
  }

  try {
    const raw = payload.startsWith(PREFIX) ? payload.slice(PREFIX.length) : payload;
    const buffer = Buffer.from(raw, "base64");

    const iv = buffer.subarray(0, IV_LENGTH);
    const tag = buffer.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = buffer.subarray(IV_LENGTH + TAG_LENGTH);

    const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return "";
  }
}
