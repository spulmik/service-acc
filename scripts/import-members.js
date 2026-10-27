// Импорт участников из CSV в таблицу members.
// Запуск:  node scripts/import-members.js путь/к/файлу.csv
//
// Поддерживает разделители , и ; (как в русском Excel), кавычки и BOM.
// Заголовки сопоставляются с колонками таблицы (регистр и пробелы не важны).

import { readFile } from "node:fs/promises";
import { upsertMember } from "../server/members.js";
import { getPool } from "../server/db.js";

const HEADER_MAP = {
  "фио": "fio",
  "username": "username",
  "логин": "username",
  "email": "email",
  "почта": "email",
  "яндекс": "yandex",
  "yandex": "yandex",
  "рег": "reg",
  "reg": "reg",
  "впн": "vpn",
  "vpn": "vpn",
  "cloudcontact": "cloudcontact",
  "cloudcontactmsp": "cloudcontact_msp",
  "cloudcontactback": "cloudcontact_back",
};

function detectDelimiter(line) {
  const commas = (line.match(/,/g) || []).length;
  const semicolons = (line.match(/;/g) || []).length;

  return semicolons > commas ? ";" : ",";
}

function parseLine(line, delim) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }

  cells.push(current);

  return cells;
}

function parseCsv(text) {
  const clean = text.replace(/^﻿/, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    return [];
  }

  const delim = detectDelimiter(lines[0]);
  const header = parseLine(lines[0], delim).map((h) =>
    h.trim().toLowerCase().replace(/\s+/g, ""),
  );

  return lines.slice(1).map((line) => {
    const cells = parseLine(line, delim);
    const row = {};

    header.forEach((name, i) => {
      const col = HEADER_MAP[name];

      if (col) {
        row[col] = (cells[i] ?? "").trim();
      }
    });

    return row;
  });
}

async function main() {
  const file = process.argv[2];

  if (!file) {
    console.error("Использование: node scripts/import-members.js <файл.csv>");
    process.exit(1);
  }

  const text = await readFile(file, "utf8");
  const members = parseCsv(text);

  let imported = 0;
  let skipped = 0;

  for (const member of members) {
    if (!member.fio && !member.username) {
      skipped++;
      continue;
    }

    await upsertMember(member);
    imported++;
  }

  console.log(`Импортировано/обновлено: ${imported}, пропущено пустых: ${skipped}`);

  await getPool().end();
}

main().catch((err) => {
  console.error("Ошибка импорта:", err.message);
  process.exit(1);
});
