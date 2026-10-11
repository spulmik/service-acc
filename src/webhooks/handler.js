
import {
  generatePassword,
  translit,
  projectMapping,
  getMailboxesnameYandex,
  getNextUuidYandex,
  getMailboxes,
  getNextUuid
} from "../functions.js";

export async function handleWebhook(request, env, ctx) {
  const startedAt = Date.now();
  const url = new URL(request.url);

  const finish = (body, status = 200) => {
    console.log("[WEBHOOK] Завершение обработки:", {
      status,
      durationMs: Date.now() - startedAt,
      timestamp: new Date().toISOString()
    });

    return new Response(body, {
      status,
      headers: {
        "Content-Type": "text/plain; charset=utf-8"
      }
    });
  };

  console.log("[WEBHOOK] Начало обработки:", {
    method: request.method,
    pathname: url.pathname,
    timestamp: new Date().toISOString()
  });

  try {
    // ==========================================
    // 1. ПОЛУЧЕНИЕ ПАРАМЕТРОВ
    // ==========================================

    const params = url.searchParams;

    const fio = params.get("fio") || "";
    const numberRaw = params.get("number") || "";
    const email = params.get("email") || "";
    const position = params.get("position") || "";
    const project = params.get("project") || "";
    const needsmailRaw = params.get("needsmail") || "";

    // Восстанавливаем +7, если знак "+" потерялся
    // при передаче номера через query-параметры.
    const numberClean = numberRaw.trim();

    const number = /^7\d{10}$/.test(numberClean)
      ? `+${numberClean}`
      : numberClean;

    // ==========================================
    // 2. НОРМАЛИЗАЦИЯ needsmail
    // ==========================================

    const needsmail = needsmailRaw
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .replace(/\s+/g, " ");

    console.log("[WEBHOOK] needsmail исходный:", needsmailRaw);
    console.log("[WEBHOOK] needsmail нормализованный:", needsmail);

    // ==========================================
    // 3. РАЗБИВКА ФИО
    // ==========================================

    const fioLower = fio.trim().toLowerCase();
    const parts = fioLower.split(/\s+/);

    const surname = parts[0] || "";
    const name = parts[1] || "";
    const patronymic = parts.slice(2).join(" ") || "";

    // ==========================================
    // 4. ПРОЕКТ И ТРАНСЛИТЕРАЦИЯ
    // ==========================================

    const projectId = projectMapping[project] || "";

    const surnameEng = translit(surname);
    const nameEng = translit(name);
    const patronymicEng = translit(patronymic);

    // ==========================================
    // 5. ОБЩИЕ ПЕРЕМЕННЫЕ
    // ==========================================

    let access = "";
    let username = "";
    let uuid = "";
    let domainname = "";
    let mailboxPassword = "";

    // ==========================================
    // 6. РЕГИСТРАЦИЯ ПОЧТЫ REG.RU
    // ==========================================

    if (needsmail === "рег почта") {
      domainname = "energy-team.club";
      access = "u";

      console.log("[ISPmanager] Получение списка ящиков");

      const mailboxesResult = await getMailboxes(
        env,
        domainname
      );

      uuid = getNextUuid(
        mailboxesResult,
        access,
        projectId
      );

      username = access + projectId + uuid;
      mailboxPassword = generatePassword(16);

      console.log("[ISPmanager] Создание почтового ящика:", {
        username,
        domainname
      });

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
            domainname,
            passwd: mailboxPassword,
            confirm: mailboxPassword,
            maxsize: "100",
            out: "json",
            lang: "ru"
          })
        }
      );

      let result;

      try {
        result = await response.json();
      } catch {
        result = null;
      }

      console.log("[ISPmanager] HTTP status:", response.status);

      if (!response.ok || result?.doc?.error) {
        console.error(
          "[ISPmanager] Ошибка создания:",
          JSON.stringify(result)
        );

        return finish(
          "Ошибка создания почтового ящика",
          500
        );
      }

      console.log("[ISPmanager] Почтовый ящик создан:", {
        username,
        domainname
      });
    }

    // ==========================================
    // 7. РЕГИСТРАЦИЯ ПОЧТЫ ЯНДЕКС 360
    // ==========================================

    if (needsmail === "яндекс почта") {
      domainname = "energy-team.ru";
      access = "u";

      console.log("[YANDEX] Получение списка пользователей");

      const yandexUsersResult = await getMailboxesnameYandex(
        env
      );

      uuid = getNextUuidYandex(
        yandexUsersResult,
        access,
        projectId
      );

      username = access + projectId + uuid;
      mailboxPassword = generatePassword(16);

      console.log("[YANDEX] Создание пользователя:", {
        username,
        domainname
      });

      const yandexResponse = await fetch(
        `https://api360.yandex.net/directory/v1/org/${env.YANDEX_ORG_ID}/users`,
        {
          method: "POST",
          headers: {
            "Authorization": `OAuth ${env.YANDEX_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            nickname: username,
            departmentId: 1,
            name: {
              first: name,
              last: surname,
              middle: patronymic
            },
            position,
            password: mailboxPassword,
            passwordChangeRequired: false,
            language: "ru",
            timezone: "Europe/Moscow"
          })
        }
      );

      let yandexCreatedUser;

      try {
        yandexCreatedUser = await yandexResponse.json();
      } catch {
        yandexCreatedUser = null;
      }

      console.log(
        "[YANDEX] HTTP status:",
        yandexResponse.status
      );

      if (!yandexResponse.ok) {
        console.error(
          "[YANDEX] Ошибка создания пользователя:",
          JSON.stringify(yandexCreatedUser)
        );

        return finish(
          "Ошибка создания пользователя Яндекс 360",
          500
        );
      }

      const createdEmail =
        yandexCreatedUser?.email ||
        `${username}@${domainname}`;

      console.log("[YANDEX] Пользователь создан:", {
        username,
        email: createdEmail
      });
    }

    // ==========================================
    // 8. ИТОГОВЫЕ ЛОГИ
    // ==========================================

    console.log("[HANDLER] Данные запроса:", {
      fio,
      number,
      email,
      position,
      project,
      needsmail
    });

    console.log("[HANDLER] Фамилия:", surname);
    console.log("[HANDLER] Имя:", name);
    console.log("[HANDLER] Отчество:", patronymic);

    console.log("[HANDLER] Логин:", username);
    console.log("[HANDLER] Домен:", domainname);

    console.log("[HANDLER] Фамилия ENG:", surnameEng);
    console.log("[HANDLER] Имя ENG:", nameEng);
    console.log("[HANDLER] Отчество ENG:", patronymicEng);

    if (
      needsmail !== "рег почта" &&
      needsmail !== "яндекс почта"
    ) {
      console.warn(
        "[HANDLER] Создание почты пропущено. Неизвестный needsmail:",
        needsmail
      );
    }

    return finish("OK", 200);

  } catch (error) {
    console.error("[WEBHOOK] Ошибка обработки:", {
      message: error instanceof Error
        ? error.message
        : String(error)
    });

    return finish(
      "Внутренняя ошибка обработки webhook",
      500
    );
  }
}
