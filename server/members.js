// Доступ к таблице members. Upsert идёт по username (ON CONFLICT),
// поэтому повторный импорт/синхронизация обновляет записи, а не плодит дубли.
import { query } from "./db.js";

const COLUMNS = [
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

export async function listMembers() {
  const { rows } = await query("SELECT * FROM members ORDER BY fio");

  return rows;
}

export async function getMemberByUsername(username) {
  const { rows } = await query(
    "SELECT * FROM members WHERE username = $1",
    [username],
  );

  return rows[0] || null;
}

export async function upsertMember(member) {
  const values = COLUMNS.map((col) => {
    const value = member[col];

    return value === undefined || value === "" ? null : value;
  });

  const placeholders = COLUMNS.map((_, i) => `$${i + 1}`).join(", ");
  const updates = COLUMNS
    .filter((col) => col !== "username")
    .map((col) => `${col} = EXCLUDED.${col}`)
    .join(", ");

  const sql = `
    INSERT INTO members (${COLUMNS.join(", ")})
    VALUES (${placeholders})
    ON CONFLICT (username)
    DO UPDATE SET ${updates}, updated_at = now()
    RETURNING *`;

  const { rows } = await query(sql, values);

  return rows[0];
}
