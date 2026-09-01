export default {
  async fetch(request, env, ctx) {

    // Получаем информацию из исходящего вебхука Битрикс24
    const url = new URL(request.url);

    const fio = url.searchParams.get("fio");
    const number = url.searchParams.get("number");
    const passwd = url.searchParams.get("passwd");
    const email = url.searchParams.get("email");
    const position = url.searchParams.get("position");

    
    console.log("[HANDLER] ПОЛНЫЙ URL:", request.url);


    // ==========================================
    // ФИО В НИЖНИЙ РЕГИСТР
    // ==========================================

    const fioLower = (fio || "").trim().toLowerCase();

    console.log("[HANDLER] ФИО в нижнем регистре:", fioLower);


    // ==========================================
    // РАЗБИВАЕМ ФИО
    // ==========================================

    const parts = fioLower.split(/\s+/);

    const surname = parts[0] || "";
    const name = parts[1] || "";
    const patronymic = parts.slice(2).join(" ") || "";


    // ==========================================
    // ТРАНСЛИТЕРАЦИЯ
    // ==========================================

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


    // ==========================================
    // ТРАНСЛИТЕРИРУЕМ
    // ==========================================

    const surnameEng = translit(surname);
    const nameEng = translit(name);
    const patronymicEng = translit(patronymic);


    // ==========================================
    // ЛОГИ
    // ==========================================

    console.log("[HANDLER] Получен запрос");

    console.log("[HANDLER] FIO:", fio);
    console.log("[HANDLER] Number:", number);
    console.log("[HANDLER] Email:", email);
    console.log("[HANDLER] Password: получен");
    console.log("[HANDLER] Position:", position);

    console.log("[HANDLER] Фамилия:", surname);
    console.log("[HANDLER] Имя:", name);
    console.log("[HANDLER] Отчество:", patronymic);

    console.log("[HANDLER] Фамилия ENG:", surnameEng);
    console.log("[HANDLER] Имя ENG:", nameEng);
    console.log("[HANDLER] Отчество ENG:", patronymicEng);


    // ==========================================
    // СПИСОК ДОЛЖНОСТЕЙ
    // ==========================================

    // Руководитель группы
    // Специалист мониторинга анализа и планирования
    // Менеджер по обучению и контролю качества
    // Специалист по контролю качества
    // Специалист по обучению
    // Менеджер по корпоративному развитию
    // Менеджер по подбору персонала
    // Специалист по подбору персонала
    // Старший менеджер по подбору персонала
    // Специалист
    // Специалист 3 категории
    // Старший специалист
    // Руководитель проектов
    // Специалист 2 категории
    // Администратор информационных систем
    // Специалист по кадровому делопроизводству
    // Ведущий специалист
    // Руководитель групп
    // Руководитель управления
    // Ведущий менеджер по подбору персонала
    // Специалист 3 грейд
    // Специалист 2 грейд
    // Офис-менеджер
    // Специалист кадрового делопроизводства
    // Специалист контроля качества
    // тест


    return new Response("OK", {
      status: 200
    });
  }
};