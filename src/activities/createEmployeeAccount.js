// Создание УЗ
export function getCreateEmployeeAccountDefinition(origin) {
  const baseUrl = origin.replace(/\/+$/, "");

  return {
    // Уникальный код действия в рамках приложения.
    CODE: "create_employee_account",
    // Публичный HTTPS URL обработчика этой Activity.
    HANDLER: `${baseUrl}/webhooks/activity/create-employee-account`,

    // Activity ожидает завершения обработки и ответа.
    USE_SUBSCRIPTION: "Y",

    // Название в конструкторе бизнес-процессов.
    NAME: {
      ru: "Создать учётную запись сотрудника",
    },

    DESCRIPTION: {
      ru: "Создаёт почтовую учётную запись сотрудника через выбранный сервис.",
    },

    // Входные параметры, которые заполняются
    // в настройках действия внутри бизнес-процесса.
    PROPERTIES: {
      fio: {
        Name: {
          ru: "ФИО сотрудника",
        },
        Description: {
          ru: "Фамилия, имя и отчество",
        },
        Type: "string",
        Required: "Y",
        Multiple: "N",
        Default: "",
      },

      number: {
        Name: {
          ru: "Номер телефона",
        },
        Type: "string",
        Required: "N",
        Multiple: "N",
        Default: "",
      },

    //   email: {
    //     Name: {
    //       ru: "Дополнительный email",
    //       en: "Additional email",
    //     },
    //     Description: {
    //       ru: "Существующий email сотрудника, если указан.",
    //       en: "Employee's existing email, if provided.",
    //     },
    //     Type: "string",
    //     Required: "N",
    //     Multiple: "N",
    //     Default: "",
    //   },

      position: {
        Name: {
          ru: "Должность",
          en: "Position",
        },
        Type: "string",
        Required: "N",
        Multiple: "N",
        Default: "",
      },

      project: {
        Name: {
          ru: "Проект"
        },
        Type: "select",
        Required: "Y",
        Multiple: "N",
        Default: "",
      },

      needsmail: {
        Name: {
          ru: "Тип почты"
        },
        Description: {
          ru: "Выбери сервис, в котором нужно создать почту."
        },
        Type: "select",
        Required: "Y",
        Multiple: "N",
        Default: "none",
        Options: {
          none: "Не создавать почту",
          ispmanager: "ISPmanager — energy-team.club",
          yandex: "Яндекс 360 — energy-team.ru",
        },
      },
        chatB24: {
            Name: {
                ru: "В какой чат в битрикс его пригласить?"
            },
            Description: {
                ru: "В какой чат в битрикс24 его приглашать?"
            },
            Type: "string",
            Required: "N",
            Multiple: "N",
            Default: "",
        },
    },

    // Результаты, которые бизнес-процесс сможет использовать
    // после выполнения Activity.
    RETURN_PROPERTIES: {
      createdEmail: {
        Name: {
          ru: "Созданный email",
          en: "Created email",
        },
        Type: "string",
        Multiple: "N",
        Default: null,
      },

      createdPassword: {
        Name: {
          ru: "Пароль созданной почты",
          en: "Created mailbox password",
        },
        Type: "string",
        Multiple: "N",
        Default: null,
      },

      status: {
        Name: {
          ru: "Статус выполнения",
          en: "Execution status",
        },
        Type: "string",
        Multiple: "N",
        Default: null,
      },

      message: {
        Name: {
          ru: "Результат выполнения",
          en: "Execution message",
        },
        Type: "text",
        Multiple: "N",
        Default: null,
      },
    },
  };
}