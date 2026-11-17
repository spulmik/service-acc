// Справочник ролей CloudContact (таблица cloudcontact_roles).
// BrightPattern не отдаёт список ролей через API, поэтому ведём свой.
// Флаги cc_osn/cc_msp/cc_back — к каким сервисам относится роль.
import { query } from "./db.js";

const SELECT_COLS = `
  id,
  name,
  cc_osn  AS "osn",
  cc_msp  AS "msp",
  cc_back AS "back"
`;

const TENANT_FLAG = { osn: "cc_osn", msp: "cc_msp", back: "cc_back" };

// Все роли (для модалки управления).
export async function listRoles() {
  const { rows } = await query(
    `SELECT ${SELECT_COLS} FROM cloudcontact_roles ORDER BY name`,
  );

  return rows;
}

// Имена ролей конкретного сервиса (для формы добавления).
export async function listRoleNamesForService(type) {
  const col = TENANT_FLAG[type];

  if (!col) {
    return [];
  }

  const { rows } = await query(
    `SELECT name FROM cloudcontact_roles WHERE ${col} = true ORDER BY name`,
  );

  return rows.map((r) => r.name);
}

export async function createRole(data = {}) {
  const name = String(data.name || "").trim();

  if (!name) {
    throw new Error("Укажите название роли");
  }

  const { rows } = await query(
    `INSERT INTO cloudcontact_roles (name, cc_osn, cc_msp, cc_back)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (name) DO UPDATE
       SET cc_osn = EXCLUDED.cc_osn,
           cc_msp = EXCLUDED.cc_msp,
           cc_back = EXCLUDED.cc_back,
           updated_at = now()
     RETURNING ${SELECT_COLS}`,
    [name, Boolean(data.osn), Boolean(data.msp), Boolean(data.back)],
  );

  return rows[0];
}

export async function updateRole(id, data = {}) {
  const name = String(data.name || "").trim();

  if (!name) {
    throw new Error("Укажите название роли");
  }

  const { rows } = await query(
    `UPDATE cloudcontact_roles
       SET name = $2, cc_osn = $3, cc_msp = $4, cc_back = $5, updated_at = now()
     WHERE id = $1
     RETURNING ${SELECT_COLS}`,
    [id, name, Boolean(data.osn), Boolean(data.msp), Boolean(data.back)],
  );

  return rows[0] || null;
}

export async function deleteRole(id) {
  const { rowCount } = await query(
    "DELETE FROM cloudcontact_roles WHERE id = $1",
    [id],
  );

  return rowCount > 0;
}
