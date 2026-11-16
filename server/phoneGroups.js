// Группы номерного плана (таблица phone_groups) для drag-and-drop.
// Сами команды привязываются к группе через phone_plan.group_name.
import { query } from "./db.js";

// Число или null.
function toIntOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

const SELECT_COLS = `id, name,
  first_number AS "firstNumber",
  last_number  AS "lastNumber"`;

export async function listPhoneGroups() {
  const { rows } = await query(
    `SELECT ${SELECT_COLS} FROM phone_groups ORDER BY name`,
  );

  return rows;
}

// Обновить диапазон номеров группы. Возвращает обновлённую группу или null.
export async function updatePhoneGroup(id, data = {}) {
  const { rows } = await query(
    `UPDATE phone_groups
       SET first_number = $2, last_number = $3
     WHERE id = $1
     RETURNING ${SELECT_COLS}`,
    [id, toIntOrNull(data.firstNumber), toIntOrNull(data.lastNumber)],
  );

  return rows[0] || null;
}

export async function createPhoneGroup(name) {
  const n = String(name || "").trim();

  if (!n) {
    throw new Error("Укажите имя группы");
  }

  const { rows } = await query(
    `INSERT INTO phone_groups (name) VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
     RETURNING ${SELECT_COLS}`,
    [n],
  );

  return rows[0];
}

// Удаление группы: сначала отвязываем команды (group_name = NULL), затем
// удаляем саму группу. Так строки phone_plan не теряются.
export async function deletePhoneGroup(id) {
  const g = await query("SELECT name FROM phone_groups WHERE id = $1", [id]);
  const name = g.rows[0]?.name;

  if (name) {
    await query(
      "UPDATE phone_plan SET group_name = NULL, updated_at = now() WHERE group_name = $1",
      [name],
    );
  }

  const { rowCount } = await query("DELETE FROM phone_groups WHERE id = $1", [
    id,
  ]);

  return rowCount > 0;
}
