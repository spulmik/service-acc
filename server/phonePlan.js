// Номерной план: привязка команд (team) CloudContact к группам.
// Диапазон номеров хранится на уровне ГРУППЫ (см. server/phoneGroups.js),
// здесь — только команда, её флаги тенантов и группа.
import { query } from "./db.js";

// Единая проекция столбцов → удобные для фронта имена (camelCase).
const SELECT_COLS = `
  id,
  team,
  group_name AS "group",
  cc_osn     AS "osn",
  cc_msp     AS "msp",
  cc_back    AS "back"
`;

// Диапазон номеров группы, к которой принадлежит команда.
// team → phone_plan.group_name → phone_groups.first_number/last_number.
export async function getRangeForTeam(team) {
  const t = String(team || "").trim();

  if (!t) {
    return null;
  }

  const { rows } = await query(
    `SELECT g.name AS "group",
            g.first_number AS "firstNumber",
            g.last_number  AS "lastNumber"
       FROM phone_plan p
       JOIN phone_groups g ON g.name = p.group_name
      WHERE p.team = $1
      LIMIT 1`,
    [t],
  );

  return rows[0] || null;
}

// Список строк (команд) номерного плана.
export async function listPhonePlan() {
  const { rows } = await query(
    `SELECT ${SELECT_COLS} FROM phone_plan ORDER BY group_name NULLS LAST, team`,
  );

  return rows;
}

// Привязать команду к группе (drag-and-drop). Upsert по team: если строки нет —
// создаём; если есть — меняем group_name. tenant (osn|msp|back) — откуда
// перетащили команду, поднимаем соответствующий флаг. group=null — отвязать.
const TENANT_FLAG = { osn: "cc_osn", msp: "cc_msp", back: "cc_back" };

export async function assignTeamGroup({ team, group, tenant } = {}) {
  const t = String(team || "").trim();

  if (!t) {
    throw new Error("Укажите команду (team)");
  }

  const groupName = group ? String(group).trim() : null;
  const flagCol = TENANT_FLAG[tenant] || null; // имя из белого списка — безопасно

  const existing = await query(
    "SELECT id FROM phone_plan WHERE team = $1 LIMIT 1",
    [t],
  );

  if (existing.rows[0]) {
    const setFlag = flagCol ? `, ${flagCol} = true` : "";

    const { rows } = await query(
      `UPDATE phone_plan SET group_name = $2${setFlag}, updated_at = now()
       WHERE id = $1
       RETURNING ${SELECT_COLS}`,
      [existing.rows[0].id, groupName],
    );

    return rows[0];
  }

  const { rows } = await query(
    `INSERT INTO phone_plan (team, group_name, cc_osn, cc_msp, cc_back)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${SELECT_COLS}`,
    [t, groupName, tenant === "osn", tenant === "msp", tenant === "back"],
  );

  return rows[0];
}
