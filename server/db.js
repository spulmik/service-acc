// Пул соединений с PostgreSQL. Строка подключения — из DATABASE_URL в .env,
// например: postgres://energyteam:ПАРОЛЬ@localhost:5432/energyteam
import pg from "pg";

const { Pool } = pg;

let pool = null;

export function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error("DATABASE_URL не задан в .env");
    }

    pool = new Pool({ connectionString });
    pool.on("error", (err) => console.error("[pg]", err.message));
  }

  return pool;
}

export function query(text, params) {
  return getPool().query(text, params);
}
