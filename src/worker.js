export default {
  async fetch(request, env, ctx) {

    // Получаем информацию из исходящего вебхука Битрикс24
    const url = new URL(request.url);

    const fio = url.searchParams.get("fio");
    const number = url.searchParams.get("number");
    // const passwd = url.searchParams.get("passwd");
    const email = url.searchParams.get("email");
    const position = url.searchParams.get("position");
    const project = url.searchParams.get("project");
// Разбивка фио {
    const fioLower = (fio || "").trim().toLowerCase();
    const parts = fioLower.split(/\s+/);
    const surname = parts[0] || "";
    const name = parts[1] || "";
    const patronymic = parts.slice(2).join(" ") || "";
    const needsmail = url.searchParams.get(needsmail);
  // }

    console.log("[HANDLER] ПОЛНЫЙ URL:", request.url);

    // генерация пароля:
    function generatePassword(length = 16) {
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

    // маппинг и транслит
    function translit(text) {

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
    const projectMapping = {
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

    // // маппинг по должностям
    // const yandexAccount = [ //Яндекс почты
    // "Руководитель группы",
    // "Специалист мониторинга анализа и планирования",
    // "Менеджер по обучению и контролю качества",
    // "Специалист по контролю качества",
    // "Специалист по обучению",
    // "Менеджер по корпоративному развитию",
    // "Менеджер по подбору персонала",
    // "Специалист по подбору персонала",
    // "Старший менеджер по подбору персонала",
    // "Старший специалист",
    // "Руководитель проектов",
    // "Администратор информационных систем",
    // "Специалист по кадровому делопроизводству",
    // "Ведущий специалист",
    // "Руководитель групп",
    // "Руководитель управления",
    // "Ведущий менеджер по подбору персонала",
    // "Офис-менеджер",
    // "Специалист кадрового делопроизводства",
    // "Специалист контроля качества"
    // ];

    // const regAccount = [ //Рег почты
    // "Специалист",
    // "Специалист 3 категории",
    // "Специалист 2 категории",
    // "Специалист 2 грейд",
    // "Специалист 3 грейд",
    // ];

    // номер проекта после маппинга
    const projectId = projectMapping[project] || "";

    // Проводим транслит
    const surnameEng = translit(surname);
    const nameEng = translit(name);
    const patronymicEng = translit(patronymic);

        // Получаем почты
    async function getMailboxes(domainname) {
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

    // Ищем нужный uuid
    function getNextUuid(result, access, projectId) {
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


    // Отправка запросов на почту:
    
    let access = '';
    let username = '';
    let uuid = '';
    let domainname = "";

    // if ((position || "").trim().toLowerCase() === "тест") {
    if (needsmail.trim().toLowerCase() === "рег почта"){
      domainname = "energy-team.club";
      access = "u";

      // Получаем существующие почтовые ящики
      const mailboxesResult = await getMailboxes(domainname);

      // Получаем первый свободный UUID
      uuid = getNextUuid(
        mailboxesResult,
        access,
        projectId
      );

      // Формируем логин
      username = access + projectId + uuid;
      
      console.log("[HANDLER] username", username);
      console.log("[HANDLER] Логин:", username);
      console.log("[HANDLER] Пароль сгенерирован");

      const mailboxPassword = generatePassword(16);

    const response = await fetch(
      "https://server101.hosting.reg.ru:1500/ispmgr",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          authinfo: `${env.USER_REG}:${env.PASSWD_REG}`,
          func: "email.edit",
          sok: "ok",
          name: username,
          domainname: domainname,
          passwd: mailboxPassword,
          confirm: mailboxPassword,
          maxsize: "100",
          out: "json",
          lang: "ru"
        })
        
      }
      
    );

    const result = await response.json();
    
    if (result?.doc?.error) {
    console.log("[ISPmanager] Ошибка создания:", result.doc.error);

      return new Response("Ошибка создания почтового ящика", {
        status: 500
      });
    }

console.log("[ISPmanager] Почтовый ящик создан");
  }
    


    // ==========================================
    // ЛОГИ
    // ==========================================

    console.log("[HANDLER] Получен запрос");
    console.log("[HANDLER] FIO:", fio);
    console.log("[HANDLER] Number:", number);
    console.log("[HANDLER] Email:", email);
    console.log("[HANDLER] Password: ");
    console.log("[HANDLER] Position:", position);
    console.log("[HANDLER] project:", project)

    console.log("[HANDLER] Фамилия:", surname);
    console.log("[HANDLER] Имя:", name);
    console.log("[HANDLER] Отчество:", patronymic);

    console.log("[HANDLER] Фамилия ENG:", surnameEng);
    console.log("[HANDLER] Имя ENG:", nameEng);
    console.log("[HANDLER] Отчество ENG:", patronymicEng);

    // ==========================================
    // СПИСОК ДОЛЖНОСТЕЙ
    // ==========================================


  


    return new Response("OK", {
      status: 200
    });
  }
};