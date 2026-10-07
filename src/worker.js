import {
  generatePassword,
  translit,
  projectMapping,
  getMailboxesnameYandex,
  getNextUuidYandex,
  getMailboxes,
  getNextUuid
} from "./functions.js";
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
    const needsmail = url.searchParams.get("needsmail");
  // }

    console.log("[HANDLER] ПОЛНЫЙ URL:", request.url);
    console.log("[HANDLER] Параметр для почты:", needsmail);



    // номер проекта после маппинга
    const projectId = projectMapping[project] || "";

    // Проводим транслит
    const surnameEng = translit(surname);
    const nameEng = translit(name);
    const patronymicEng = translit(patronymic);
    // Отправка запросов на почту:
    
    let access = '';
    let username = '';
    let uuid = '';
    let domainname = "";
    let mailboxPassword = "";

    if ((needsmail || "").trim().toLowerCase() === "рег почта") {
      domainname = "energy-team.club";
      access = "u";

      // Получаем существующие почтовые ящики
      const mailboxesResult = await getMailboxes(env, domainname);

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

      mailboxPassword = generatePassword(16);

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

    }
    
    if ((needsmail || "").trim().toLowerCase() === "яндекс почта") {

      domainname = "energy-team.ru";
      access = "u";

      const yandexUsersResult = await getMailboxesnameYandex(env);

      uuid = getNextUuidYandex(
        yandexUsersResult,
        access,
        projectId
      );
      username = access + projectId + uuid;
      mailboxPassword = generatePassword(16);

      console.log("[YANDEX] Username:", username);
      console.log("[YANDEX] Password:", mailboxPassword);

      // ------------------------------------------
      // Создание пользователя в Яндекс 360
      // ------------------------------------------
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
            position: position,
            password: mailboxPassword,
            passwordChangeRequired: false,
            language: "ru",
            timezone: "Europe/Moscow"
          })
        }
      );

      // ------------------------------------------
      // Читаем ответ Яндекс
      // ------------------------------------------
      const yandexCreatedUser = await yandexResponse.json();

      console.log(
        "[YANDEX] HTTP status:",
        yandexResponse.status
      );

      console.log(
        "[YANDEX] Ответ:",
        JSON.stringify(yandexCreatedUser)
      );
      if (!yandexResponse.ok) {

        console.log(
          "[YANDEX] Ошибка создания пользователя:",
          JSON.stringify(yandexCreatedUser)
        );

        return new Response(
          "Ошибка создания пользователя Яндекс 360",
          {
            status: 500
          }
        );
      }

      // ------------------------------------------
      // Получаем email,
      // который вернул Яндекс
      // ------------------------------------------
      const createdEmail =
        yandexCreatedUser?.email ||
        `${username}@${domainname}`;

      console.log("[YANDEX] Пользователь создан");
      console.log("[YANDEX] Логин:", username);
      console.log("[YANDEX] Почта:", createdEmail);
      console.log("[YANDEX] Пароль:", mailboxPassword);
    }


    // ==========================================
    // ЛОГИ
    // ==========================================

    console.log("[HANDLER] Получен запрос");
    console.log("[HANDLER] FIO:", fio);
    console.log("[HANDLER] Number:", number);
    console.log("[HANDLER] Email:", email);
    console.log("[HANDLER] Position:", position);
    console.log("[HANDLER] project:", project)

    console.log("[HANDLER] Фамилия:", surname);
    console.log("[HANDLER] Имя:", name);
    console.log("[HANDLER] Отчество:", patronymic);

    console.log("[HANDLER] Логин:", username);
    console.log("[HANDLER] Пароль:", mailboxPassword);

    console.log("[HANDLER] Фамилия ENG:", surnameEng);
    console.log("[HANDLER] Имя ENG:", nameEng);
    console.log("[HANDLER] Отчество ENG:", patronymicEng);
    return new Response("OK", {
      status: 200
    });
  }
};