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
  "phone",
  "position",
  "vpngroups",
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
  // Собираем только реально переданные колонки: частичное обновление
  // (например, из вкладки одного сервиса) не должно затирать остальные.
  const columns = [];
  const values = [];

  for (const col of PLAIN_COLUMNS) {
    if (member[col] === undefined) {
      continue;
    }

    columns.push(col);
    values.push(member[col] === "" ? null : member[col]);
  }

  // Пароль — отдельно: поле входа password, колонка в БД password_enc.
  if (member.password !== undefined) {
    columns.push("password_enc");
    values.push(encrypt(member.password));
  }

  if (columns.length === 0) {
    throw new Error("Нет полей для сохранения в members");
  }

  const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");

  const updateColumns = columns.filter((col) => col !== "username");
  const updates = updateColumns
    .map((col) =>
      col === "password_enc"
        ? `password_enc = COALESCE(EXCLUDED.password_enc, members.password_enc)`
        : `${col} = EXCLUDED.${col}`,
    )
    .join(", ");

  const doUpdate = updates
    ? `DO UPDATE SET ${updates}, updated_at = now()`
    : `DO UPDATE SET updated_at = now()`;

  const sql = `
    INSERT INTO members (${columns.join(", ")})
    VALUES (${placeholders})
    ON CONFLICT (username)
    ${doUpdate}
    RETURNING *`;

  const { rows } = await query(sql, values);

  return toMember(rows[0], { withPassword: true });
}

// ==========================================
// Синхронизация аккаунтов сервисов
// ==========================================
// Каждый сервис пишет/чистит только свою колонку members. Имена колонок —
// из белого списка, чтобы внешнее имя не попало в SQL.

const SERVICE_COLUMNS = {
  yandex: "yandex",
  reg: "reg",
  vpn: "vpn",
  cloudcontact: "cloudcontact",
  cloudcontact_msp: "cloudcontact_msp",
  cloudcontact_back: "cloudcontact_back",
};

function serviceColumn(service) {
  const col = SERVICE_COLUMNS[service];

  if (!col) {
    throw new Error(`Неизвестный сервис для синхронизации: ${service}`);
  }

  return col;
}

// Точечно записать идентификатор в колонку сервиса. Если строки с таким
// username ещё нет — создаём минимальную (fio = username, иначе NOT NULL).
export async function setServiceAccount({
  service,
  username,
  value,
  fio,
  email,
}) {
  const col = serviceColumn(service);
  const uname = String(username || "").trim();

  if (!uname) {
    throw new Error("Не указан username для синхронизации в members");
  }

  const fullName = String(fio || "").trim() || uname;
  const emailValue = String(email || "").trim() || null;
  const serviceValue =
    value === undefined || value === null || value === ""
      ? null
      : String(value);

  const sql = `
    INSERT INTO members (username, ${col}, fio, email)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (username)
    DO UPDATE SET ${col} = EXCLUDED.${col}, updated_at = now()
    RETURNING *`;

  const { rows } = await query(sql, [
    uname,
    serviceValue,
    fullName,
    emailValue,
  ]);

  return toMember(rows[0], { withPassword: false });
}

// Очистить колонку сервиса у записей, где она равна identifier.
export async function clearServiceAccount({ service, identifier }) {
  const col = serviceColumn(service);
  const id = String(identifier || "").trim();

  if (!id) {
    throw new Error("Не указан идентификатор для очистки в members");
  }

  const sql = `
    UPDATE members
    SET ${col} = NULL, updated_at = now()
    WHERE ${col} = $1
    RETURNING *`;

  const { rows } = await query(sql, [id]);

  return rows.length;
}
