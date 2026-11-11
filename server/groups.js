// Каталог групп NetBird в нашей БД (таблица vpn_groups).
// Наполняется синхронизацией из NetBird; потом members ссылается на имена.
import { query } from "./db.js";

// Список сохранённых групп.
export async function listVpnGroups() {
  const { rows } = await query(
    "SELECT id, name, peers_count, updated_at FROM vpn_groups ORDER BY name",
  );

  return rows;
}

// Запись групп из NetBird в БД (upsert по id). Возвращает актуальный список.
// groups: [{ id, name, peers_count }]
export async function syncVpnGroups(groups) {
  const list = Array.isArray(groups) ? groups : [];

  for (const g of list) {
    if (!g?.id) {
      continue;
    }

    await query(
      `INSERT INTO vpn_groups (id, name, peers_count, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name,
             peers_count = EXCLUDED.peers_count,
             updated_at = now()`,
      [g.id, g.name || "", Number(g.peers_count) || 0],
    );
  }

  return listVpnGroups();
}
