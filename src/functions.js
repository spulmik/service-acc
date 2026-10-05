// генерация пароля:
export function generatePassword(length = 16) {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZ" +
    "abcdefghijkmnopqrstuvwxyz" +
    "23456789" +
    "!@#$%^&*";

  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);

  return Array.from(randomValues, value =>
    chars[value % chars.length]
  ).join("");
}



    // транслит
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

  // Маппинг по проектам
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



        
    // ==========================================
    // Получаем пользователей из Яндекс 360
    // ==========================================
export async function getMailboxesnameYandex(env) {

    const response = await fetch(
        `https://api360.yandex.net/directory/v1/org/${env.YANDEX_ORG_ID}/users?page=1&perPage=1000`,
        {
          method: "GET",
          headers: {
            "Authorization": `OAuth ${env.YANDEX_TOKEN}`,
            "Content-Type": "application/json"
          }
        }
      );

      if (!response.ok) {
        const errorText = await response.text();

        console.log("[YANDEX] HTTP ошибка:", response.status);
        console.log("[YANDEX] Ответ:", errorText);

        throw new Error(`Yandex API HTTP ${response.status}`);
      }

    const result = await response.json();

    console.log("[YANDEX] Всего пользователей:", result.total);
    console.log("[YANDEX] Получено:", result.users?.length || 0);

    return result;
}
 
    // ==========================================
    // Ищем нужный UUID в Яндекс 360
    // ==========================================
export function getNextUuidYandex(result, access, projectId) {
  const prefix = `${access}${projectId}`;
  const usedNumbers = new Set();
  const users = result?.users || [];
  for (const item of users) {
    // В Яндекс 360:
    // nickname = логин пользователя
    //
    // Например:
    // u01001
    // u01002
    // u02001
    const nickname = item?.nickname || "";
    console.log("[YANDEX UUID] Проверяем:", nickname);
    // Проверяем наш проект
    // Например:
    // u01
    if (!nickname.startsWith(prefix)) {
      continue;
    }
    // Убираем u01
    //
    // u01001 -> 001
    const uuidPart = nickname.slice(prefix.length);
    console.log("[YANDEX UUID] Наш проект:", nickname);
    console.log("[YANDEX UUID] UUID:", uuidPart);
    // Только 3 цифры:
    // 001
    // 002
    // 003
    if (/^\d{3}$/.test(uuidPart)) {
      usedNumbers.add(Number(uuidPart));
    }
  }
  // Ищем первый свободный номер
  for (let i = 1; i <= 999; i++) {
    if (!usedNumbers.has(i)) {
      return String(i).padStart(3, "0");
    }
  }
  console.log(
    "[YANDEX UUID] Занятые номера:",
    [...usedNumbers]
  );
  throw new Error(
    `Закончились UUID для проекта ${projectId}`
  );
}


        // Получаем почты по регу
export async function getMailboxes(env, domainname) {
  const response = await fetch(
    "https://server101.hosting.reg.ru:1500/ispmgr",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        authinfo: `${env.USER_REG}:${env.PASSWD_REG}`,
        func: "email",
        domainname: domainname,
        out: "json",
        lang: "ru"
      })
    }
  );
  if (!response.ok) {
    throw new Error(`ISPmanager HTTP ${response.status}`);
  }
  return await response.json();
}

// UUID по Рег.ру

export function getNextUuid(result, access, projectId) {
  const prefix = `${access}${projectId}`;
  const usedNumbers = new Set();
  const elements = result?.doc?.elem || [];
  for (const item of elements) {
    // ISPmanager возвращает:
    // name: { "$": "t01001@energy-team.club" }
    const emailName = item?.name?.$ || "";
    // Берём только логин до @
    const name = emailName.split("@")[0];
    // console.log("[UUID] Проверяем:", name);
    // Проверяем наш проект
    // например t01
    if (!name.startsWith(prefix)) {
      continue;
    }
    // Убираем t01
    // t01001 → 001
    const uuidPart = name.slice(prefix.length);
    console.log("[UUID] Наш проект:", name);
    console.log("[UUID] UUID:", uuidPart);
    // Берём только логины формата 001, 002, 003...
    if (/^\d{3}$/.test(uuidPart)) {
      usedNumbers.add(Number(uuidPart));
    }
  }

  // Ищем первую свободную позицию
  for (let i = 1; i <= 999; i++) {
    if (!usedNumbers.has(i)) {
      return String(i).padStart(3, "0");
    }
  }
  console.log("[UUID] Занятые номера:", [...usedNumbers]);
  throw new Error(
    `Закончились UUID для проекта ${projectId}`
  );
      
}