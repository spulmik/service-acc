// ==========================================
// Общие утилиты
// ==========================================
// Логика по сервисам вынесена в отдельные модули:
//   - Яндекс 360        → src/yandex.js
//   - Reg.ru (ISPmanager) → src/reg.js
//   - CloudContact      → src/cloudcontact.js
//   - VPN (NetBird)     → src/vpn.js
// Здесь остаются только переиспользуемые помощники.

// ==========================================
// Генерация пароля
// ==========================================
// Гарантируем хотя бы по одному символу каждого класса
// (заглавная, строчная, цифра, спецсимвол) — иначе при длине 16
// примерно в 12% случаев пароль остаётся без цифры или спецсимвола
// и может не пройти политику сервиса.
const PASSWORD_GROUPS = [
  "ABCDEFGHJKLMNPQRSTUVWXYZ",
  "abcdefghijkmnopqrstuvwxyz",
  "23456789",
  "!@#$%^&*",
];

// Равномерное случайное число 0..max-1 без смещения.
function randomInt(max) {
  const limit = Math.floor(0x100000000 / max) * max;
  const buffer = new Uint32Array(1);

  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= limit);

  return buffer[0] % max;
}

export function generatePassword(length = 16) {
  if (length < PASSWORD_GROUPS.length) {
    throw new Error("Слишком короткая длина пароля");
  }

  const allChars = PASSWORD_GROUPS.join("");

  const chars = PASSWORD_GROUPS.map(
    (group) => group[randomInt(group.length)],
  );

  while (chars.length < length) {
    chars.push(allChars[randomInt(allChars.length)]);
  }

  // Перемешивание (Fisher–Yates).
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}

// ==========================================
// Транслит
// ==========================================
export function translit(text) {
  const map = {
    "а": "a",
    "б": "b",
    "в": "v",
    "г": "g",
    "д": "d",
    "е": "e",
    "ё": "yo",
    "ж": "zh",
    "з": "z",
    "и": "i",
    "й": "y",
    "к": "k",
    "л": "l",
    "м": "m",
    "н": "n",
    "о": "o",
    "п": "p",
    "р": "r",
    "с": "s",
    "т": "t",
    "у": "u",
    "ф": "f",
    "х": "kh",
    "ц": "ts",
    "ч": "ch",
    "ш": "sh",
    "щ": "shch",
    "ъ": "",
    "ы": "y",
    "ь": "",
    "э": "e",
    "ю": "yu",
    "я": "ya"
  };

  return text
    .split("")
    .map(char => map[char] !== undefined ? map[char] : char)
    .join("");
}

// ==========================================
// Маппинг по проектам
// ==========================================
// ВНИМАНИЕ: в src/activities/createEmployeeAccount.js для «МОГ»
// указан код '10', а здесь "09". Нужно привести к одному значению.
export const projectMapping = {
  "Автоваз": "01",
  "Летуаль": "02",
  "КДЛ": "03",
  "АФБ ОН": "04",
  "АФБ ДН": "05",
  "100 Мед": "06",
  "Евроонко": "07",
  "ЦТМ": "08",
  "МОГ": "09",
};
