// Доступ к таблице members. Upsert идёт по username (ON CONFLICT),
// поэтому повторный импорт/синхронизация обновляет записи, а не плодит дубли.
//
// Пароль хранится зашифрованным (AES-256-GCM) в столбце password_enc —
// см. vault.js. На входе принимаем открытый member.password, шифруем;
// на выходе (для авторизованных) расшифровываем обратно в member.password.
import { query } from "./db.js";
import { encrypt, decrypt } from "./vault.js";

// Открытые (нешифрованные) столбцы.
const PLAIN_COLUMNS = [
  "fio",
  "username",
  "email",
  "yandex",
  "reg",
  "vpn",
  "cloudcontact",
  "cloudcontact_msp",
  "cloudcontact_back",
];

// Все столбцы для INSERT: открытые + зашифрованный пароль.
const STORE_COLUMNS = [...PLAIN_COLUMNS, "password_enc"];

// Превращает строку из БД в объект для выдачи: убирает password_enc,
// а если нужно — кладёт расшифрованный пароль в поле password.
function toMember(row, { withPassword }) {
  const { password_enc, ...rest } = row;

  if (withPassword) {
    rest.password = decrypt(password_enc);
  }

  return rest;
}

// Список БЕЗ паролей (password_enc не отдаём наружу вообще).
export async function listMembers() {
  const { rows } = await query("SELECT * FROM members ORDER BY fio");

  return rows.map((row) => toMember(row, { withPassword: false }));
}

// Список С расшифрованными паролями — только для авторизованных (проверка
// доступа делается в worker.js по MEMBERS_ALLOWED_USERS).
export async function listMembersDecrypted() {
  const { rows } = await query("SELECT * FROM members ORDER BY fio");

  return rows.map((row) => toMember(row, { withPassword: true }));
}

export async function getMemberByUsername(username) {
  const { rows } = await query(
    "SELECT * FROM members WHERE username = $1",
    [username],
  );

  return rows[0] ? toMember(rows[0], { withPassword: true }) : null;
}

export async function upsertMember(member) {
  // Значения открытых столбцов.
  const values = PLAIN_COLUMNS.map((col) => {
    const value = member[col];

    return value === undefined || value === "" ? null : value;
  });

  // Пароль шифруем (пустой → null).
  values.push(encrypt(member.password));

  const placeholders = STORE_COLUMNS.map((_, i) => `$${i + 1}`).join(", ");
  const updates = STORE_COLUMNS
    .filter((col) => col !== "username")
    .map((col) =>
      // Пароль не затираем, если в этот раз его не передали (null).
      col === "password_enc"
        ? `password_enc = COALESCE(EXCLUDED.password_enc, members.password_enc)`
        : `${col} = EXCLUDED.${col}`,
    )
    .join(", ");

  const sql = `
    INSERT INTO members (${STORE_COLUMNS.join(", ")})
    VALUES (${placeholders})
    ON CONFLICT (username)
    DO UPDATE SET ${updates}, updated_at = now()
    RETURNING *`;

  const { rows } = await query(sql, values);

  return toMember(rows[0], { withPassword: true });
}
