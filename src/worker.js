import { handleInstallRequest } from "../install.js";
import {
  getMailboxesnameYandex,
  createYandexUser,
  deleteYandexUser,
} from "./yandex.js";

import {
  getMailboxes,
  createRegUser,
  deleteRegUser,
  setRegUserBlocked,
} from "./reg.js";

import {
  getCloudContactUsers,
  getCloudContactTeams,
  getUsedExtensions,
  createCloudContactUser,
  deleteCloudContactUser,
  blockCloudContactUser,
} from "./cloudcontact.js";
import {
  listRoles as listCcRoles,
  listRoleNamesForService,
  createRole as createCcRole,
  updateRole as updateCcRole,
  deleteRole as deleteCcRole,
} from "../server/cloudContactRoles.js";

import {
  getVpnUsers,
  getVpnGroups,
  addVpnUser,
  getVpnInviteUsers,
  regenerateVpnInvite,
  deleteVpnInvite,
  deleteVpnUser,
  setVpnUserBlocked,
} from "./vpn.js";

import { generatePassword } from "./functions.js";

import {
  listMembersDecrypted,
  upsertMember,
  setServiceAccount,
  clearServiceAccount,
} from "../server/members.js";

import { listVpnGroups, syncVpnGroups } from "../server/groups.js";
import {
  listPhonePlan,
  assignTeamGroup,
  getRangeForTeam,
} from "../server/phonePlan.js";
import {
  listPhoneGroups,
  createPhoneGroup,
  updatePhoneGroup,
  deletePhoneGroup,
} from "../server/phoneGroups.js";

import { handleCreateMailbox } from "./activities/rest/create_mailbox/handler.js";
import {
  handlePullChatsOptions,
} from "./activities/rest/pull_chats_options/handler.js";

import {
  handleAuthRoute,
  getAuthenticatedSession,
  jsonAuthResponse,
} from "./auth.js";

// Маппинг типа CloudContact (osn/msp/back) → колонка members.
const CC_TYPE_TO_COLUMN = {
  osn: "cloudcontact",
  msp: "cloudcontact_msp",
  back: "cloudcontact_back",
};

function ccColumn(type) {
  const col = CC_TYPE_TO_COLUMN[type];

  if (!col) {
    throw new Error(`Неизвестный тип CloudContact: ${type}`);
  }

  return col;
}

// Домен Яндекс 360 — для сбора полного email при синхронизации в members.
const YANDEX_DOMAIN = "energy-team.ru";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Кто видит вкладку «Все пользователи» и расшифрованные пароли.
// Список логинов в .env: MEMBERS_ALLOWED_USERS=admin,ivanov
function isMembersAllowed(env, username) {
  const allowed = String(env.MEMBERS_ALLOWED_USERS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  return allowed.includes(String(username || "").toLowerCase());
}

function normalizeHost(value) {
  const host = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split(/[/?#]/)[0];

  return /^[a-z0-9.-]+$/.test(host) ? host : "";
}

// Защита от CSRF. Cookie теперь SameSite=None (нужно для iframe),
// поэтому для изменяющих запросов проверяем, что они пришли
// с нашего же origin.
function isSameOriginRequest(request, url) {
  const origin = request.headers.get("Origin");

  if (origin) {
    return origin === url.origin;
  }

  return request.headers.get("Sec-Fetch-Site") === "same-origin";
}

// Разрешаем встраивать приложение в iframe только на портале Bitrix24
// (защита от clickjacking). Домен берётся из BITRIX_ALLOWED_DOMAIN.
function getFrameAncestors(env) {
  const domain = normalizeHost(env.BITRIX_ALLOWED_DOMAIN);

  if (domain) {
    return `'self' https://${domain}`;
  }

  return "'self' https://*.bitrix24.ru https://*.bitrix24.com";
}

function withSecurityHeaders(response, env) {
  // Заголовки ответа из ASSETS.fetch() неизменяемы, поэтому
  // создаём копию ответа.
  const secured = new Response(response.body, response);

  secured.headers.set("X-Content-Type-Options", "nosniff");
  secured.headers.set("Referrer-Policy", "same-origin");
  secured.headers.set(
    "Content-Security-Policy",
    `frame-ancestors ${getFrameAncestors(env)}`,
  );

  return secured;
}

// В браузер отдаём только те поля, которые нужны интерфейсу.
function toPublicYandexUser(user) {
  return {
    id: user?.id,
    nickname: user?.nickname || "",
    email: user?.email || "",
    name: {
      first: user?.name?.first || "",
      last: user?.name?.last || "",
      middle: user?.name?.middle || "",
    },
  };
}

async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  console.log("[ROUTER] Входящий запрос:", {
    method: request.method,
    pathname,
    timestamp: new Date().toISOString(),
  });

  try {
    // Bitrix24 открывает серверное приложение через POST.
    // Возвращаем HTML Vue SPA вместо передачи POST в Assets.
    if (
      pathname === "/" &&
      request.method === "POST" &&
      url.searchParams.has("DOMAIN") &&
      url.searchParams.has("APP_SID")
    ) {
      const domain = url.searchParams.get("DOMAIN");

      console.log("[BITRIX UI] Открытие интерфейса:", {
        domain,
        lang: url.searchParams.get("LANG"),
        timestamp: new Date().toISOString(),
      });

      const headers = new Headers(request.headers);
      headers.delete("content-length");
      headers.delete("content-type");
      headers.set("accept", "text/html");

      const assetRequest = new Request(url.toString(), {
        method: "GET",
        headers,
      });

      return env.ASSETS.fetch(assetRequest);
    }

    // CSRF-проверка для всех изменяющих запросов к /auth и /api.
    // Серверные вызовы Bitrix24 (/install, /activities/...) сюда не попадают.
    const isAuthOrApi =
      pathname === "/auth" ||
      pathname.startsWith("/auth/") ||
      pathname === "/api" ||
      pathname.startsWith("/api/");

    if (
      isAuthOrApi &&
      !SAFE_METHODS.has(request.method) &&
      !isSameOriginRequest(request, url)
    ) {
      console.warn("[CSRF] Запрос отклонён:", {
        method: request.method,
        pathname,
        origin: request.headers.get("Origin") || null,
      });

      return jsonAuthResponse({ error: "Forbidden" }, 403);
    }

    // 1. Маршруты авторизации.
    const authResponse = await handleAuthRoute(
      request,
      env,
      pathname,
    );

    if (authResponse) {
      return authResponse;
    }

    // 2. Установка приложения Bitrix24.
    if (pathname === "/install") {
      return handleInstallRequest(request);
    }

    // 3. Получение списка коллабов.
    if (
      pathname === "/activities/rest/pull_chats_options/handler.js"
    ) {
      return handlePullChatsOptions(request);
    }

    // 4. Создание почтового ящика через существующую активность.
    if (
      pathname === "/activities/rest/create_mailbox/handler.js"
    ) {
      console.log("[ROUTER] Маршрут создания почты:", {
        pathname,
        method: request.method,
        timestamp: new Date().toISOString(),
      });

      return handleCreateMailbox(request, env, ctx);
    }

    // 5. API интерфейса — сначала обязательная проверка сессии.
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      const session = await getAuthenticatedSession(request, env);

      if (!session) {
        return jsonAuthResponse(
          { error: "Требуется авторизация" },
          401,
        );
      }

      // 5.1. Удаление пользователя Яндекс 360.
      // Этот маршрут находится ВНУТРИ проверки авторизации.
      if (
        pathname.startsWith("/api/yandex/users/") &&
        request.method === "DELETE"
      ) {
        const userId = pathname.slice(
          "/api/yandex/users/".length,
        );

        try {
          const result = await deleteYandexUser(env, userId);

          const yandexEmail = String(
            url.searchParams.get("email") || "",
          )
            .trim()
            .toLowerCase();

          if (yandexEmail) {
            try {
              await clearServiceAccount({
                service: "yandex",
                identifier: yandexEmail,
              });
            } catch (syncError) {
              console.warn("[SYNC members] yandex clear:", {
                message:
                  syncError instanceof Error
                    ? syncError.message
                    : String(syncError),
              });
            }
          }

          console.log("[API YANDEX DELETE] Пользователь удалён:", {
            userId,
            username: session.username,
          });

          return jsonAuthResponse(result);
        } catch (error) {
          console.error("[API YANDEX DELETE] Ошибка:", {
            userId,
            message:
              error instanceof Error
                ? error.message
                : "Unknown error",
          });

          return jsonAuthResponse(
            { error: "Не удалось удалить пользователя Яндекс 360" },
            502,
          );
        }
      }

      // 5.2. Создание пользователя Яндекс 360.
      if (
        pathname === "/api/yandex/users" &&
        request.method === "POST"
      ) {
        try {
          const body = await request.json();

          const result = await createYandexUser(env, body);

          try {
            const nickname = String(body.nickname || "")
              .trim()
              .toLowerCase();
            const fio =
              [body.name?.last, body.name?.first, body.name?.middle]
                .map((part) => String(part || "").trim())
                .filter(Boolean)
                .join(" ") || nickname;

            await setServiceAccount({
              service: "yandex",
              username: nickname,
              value: `${nickname}@${YANDEX_DOMAIN}`,
              fio,
              email: `${nickname}@${YANDEX_DOMAIN}`,
            });

            // Пароль фиксируем в members (зашифрованно).
            if (body.password) {
              try {
                await upsertMember({
                  username: nickname,
                  fio,
                  password: body.password,
                });
              } catch (pwdSyncError) {
                console.warn("[SYNC members] yandex password:", {
                  message:
                    pwdSyncError instanceof Error
                      ? pwdSyncError.message
                      : String(pwdSyncError),
                });
              }
            }
          } catch (syncError) {
            console.warn("[SYNC members] yandex set:", {
              message:
                syncError instanceof Error
                  ? syncError.message
                  : String(syncError),
            });
          }

          console.log("[API YANDEX CREATE] Пользователь создан:", {
            nickname: body.nickname,
            username: session.username,
          });

          return jsonAuthResponse(result);
        } catch (error) {
          console.error("[API YANDEX CREATE] Ошибка:", {
            message:
              error instanceof Error
                ? error.message
                : "Unknown error",
          });

          return jsonAuthResponse(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Не удалось создать пользователя Яндекс 360",
            },
            400,
          );
        }
      }

      // 5.3. Получение пользователей Яндекс 360.
      if (
        pathname === "/api/yandex/users" &&
        request.method === "GET"
      ) {
        try {
          const result = await getMailboxesnameYandex(env);

          return jsonAuthResponse({
            users: result.users.map(toPublicYandexUser),
            total: result.total,
          });
        } catch (error) {
          console.error("[API YANDEX USERS] Ошибка:", {
            message:
              error instanceof Error
                ? error.message
                : "Unknown error",
          });

          return jsonAuthResponse(
            {
              error:
                "Не удалось получить список пользователей Яндекс 360",
            },
            502,
          );
        }
      }

      // 5.4. Получение почтовых ящиков Reg.ru (ISPmanager).
      if (
        pathname === "/api/reg/mailboxes" &&
        request.method === "GET"
      ) {
        try {
          const url = new URL(request.url);
          const domain = url.searchParams.get("domain") || "energy-team.club";

          const result = await getMailboxes(env, domain);

          console.log("[API REG MAILBOXES] Получено:", {
            domain,
            count: result?.doc?.elem?.length || 0,
            username: session.username,
          });

          // ISPmanager возвращает данные в формате:
          // { doc: { elem: [{ name: { $: "username@domain" },
          //                    active: { $: "on"|"off" } }, ...] } }
          // active="off" — ящик отключён (заблокирован). Без этого поля
          // фронт не знал статус и всегда показывал «Block».
          const mailboxes = Array.isArray(result?.doc?.elem)
            ? result.doc.elem.map((item) => {
                // Полный email из ISPmanager
                const fullEmail = item?.name?.$ || "";
                // Логин до @
                const username = fullEmail.split("@")[0];

                const activeRaw = item?.active;
                const disabledRaw = item?.disabled;

                const activeState = String(
                  activeRaw?.$ ?? activeRaw ?? "",
                ).toLowerCase();
                const disabledState = String(
                  disabledRaw?.$ ?? disabledRaw ?? "",
                ).toLowerCase();

                return {
                  username,
                  email: fullEmail,
                  // Поддержаны оба варианта поля: active="off" (ISPmanager 6)
                  // и disabled="on" (пятёрка).
                  is_blocked:
                    activeState === "off" || disabledState === "on",
                };
              })
            : [];

          return jsonAuthResponse({
            mailboxes,
            domain,
            total: mailboxes.length,
          });
        } catch (error) {
          console.error("[API REG MAILBOXES] Ошибка:", {
            message:
              error instanceof Error
                ? error.message
                : "Unknown error",
          });

          return jsonAuthResponse(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Не удалось получить список почтовых ящиков",
            },
            502,
          );
        }
      }

      // 5.5. Создание почтового ящика Reg.ru (ISPmanager).
      if (
        pathname === "/api/reg/mailboxes" &&
        request.method === "POST"
      ) {
        try {
          const body = await request.json();

          const result = await createRegUser(env, {
            nickname: body.nickname,
            password: body.password,
            domain: body.domain || "energy-team.club",
          });

          try {
            const regUsername = String(result.username || "")
              .trim()
              .toLowerCase();
            // ФИО берём из формы; если не передали — фолбэк на логин
            // (колонка fio в БД NOT NULL).
            const regFio = String(body.fio || "").trim() || regUsername;

            await setServiceAccount({
              service: "reg",
              username: regUsername,
              value: result.email,
              fio: regFio,
              email: result.email,
            });

            // Пароль фиксируем в members (зашифрованно).
            if (body.password) {
              try {
                await upsertMember({
                  username: regUsername,
                  fio: regFio,
                  password: body.password,
                });
              } catch (pwdSyncError) {
                console.warn("[SYNC members] reg password:", {
                  message:
                    pwdSyncError instanceof Error
                      ? pwdSyncError.message
                      : String(pwdSyncError),
                });
              }
            }
          } catch (syncError) {
            console.warn("[SYNC members] reg set:", {
              message:
                syncError instanceof Error
                  ? syncError.message
                  : String(syncError),
            });
          }

          console.log("[API REG CREATE] Ящик создан:", {
            email: result.email,
            username: session.username,
          });

          return jsonAuthResponse({ user: result });
        } catch (error) {
          console.error("[API REG CREATE] Ошибка:", {
            message:
              error instanceof Error
                ? error.message
                : "Unknown error",
          });

          return jsonAuthResponse(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Не удалось создать почтовый ящик",
            },
            400,
          );
        }
      }
      // 5.6.0. Блокировка / разблокировка почтового ящика Reg.ru (ISPmanager).
      // PUT /api/reg/mailboxes/{email} с телом { blocked }.
      if (
        pathname.startsWith("/api/reg/mailboxes/") &&
        request.method === "PUT"
      ) {
        const email = decodeURIComponent(
          pathname.slice("/api/reg/mailboxes/".length),
        );

        if (!email) {
          return jsonAuthResponse({ error: "Не указан email ящика" }, 400);
        }

        try {
          const body = await request.json().catch(() => ({}));
          const blocked =
            body.blocked === undefined ? true : Boolean(body.blocked);

          const result = await setRegUserBlocked(env, email, blocked);

          // Блокировка НЕ удаляет учётку: колонку reg в members не трогаем.
          console.log("[API REG PUT] Статус ящика изменён:", {
            email: result.email,
            blocked: result.blocked,
            username: session.username,
          });

          return jsonAuthResponse(result);
        } catch (error) {
          console.error("[API REG PUT] Ошибка:", {
            email,
            message:
              error instanceof Error
                ? error.message
                : "Unknown error",
          });

          return jsonAuthResponse(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Не удалось изменить статус почтового ящика",
            },
            400,
          );
        }
      }

      // 5.6. Удаление почтового ящика Reg.ru (ISPmanager).
      if (
        pathname.startsWith("/api/reg/mailboxes/") &&
        request.method === "DELETE"
      ) {
        const email = decodeURIComponent(
          pathname.slice("/api/reg/mailboxes/".length),
        );

        try {
          const result = await deleteRegUser(env, email);

          try {
            await clearServiceAccount({
              service: "reg",
              identifier: result.email || email,
            });
          } catch (syncError) {
            console.warn("[SYNC members] reg clear:", {
              message:
                syncError instanceof Error
                  ? syncError.message
                  : String(syncError),
            });
          }

          console.log("[API REG DELETE] Ящик удалён:", {
            email: result.email,
            username: session.username,
          });

          return jsonAuthResponse(result);
        } catch (error) {
          console.error("[API REG DELETE] Ошибка:", {
            email,
            message:
              error instanceof Error
                ? error.message
                : "Unknown error",
          });

          return jsonAuthResponse(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Не удалось удалить почтовый ящик",
            },
            400,
          );
        }
      }

      // 5.6b. CloudContact — первый свободный внутренний номер для команды.
      // team → группа → диапазон (phone_groups), минус занятые extension.
      // Должен стоять ПЕРЕД роутом пользователей.
      if (
        pathname.startsWith("/api/cloudcontact/") &&
        pathname.endsWith("/freenumber") &&
        request.method === "GET"
      ) {
        if (!isMembersAllowed(env, session.username)) {
          return jsonAuthResponse({ error: "Нет доступа" }, 403);
        }

        const type = pathname.slice("/api/cloudcontact/".length).split("/")[0];
        const team = url.searchParams.get("team") || "";

        try {
          const range = await getRangeForTeam(team);

          if (!range) {
            return jsonAuthResponse(
              { error: "Команда не привязана к группе — добавьте её в группу" },
              409,
            );
          }

          if (range.firstNumber == null || range.lastNumber == null) {
            return jsonAuthResponse(
              { error: `У группы «${range.group}» не задан диапазон номеров` },
              409,
            );
          }

          const used = new Set(
            (await getUsedExtensions(env, type)).map((e) => Number(e)),
          );

          let free = null;
          for (let n = range.firstNumber; n <= range.lastNumber; n++) {
            if (!used.has(n)) {
              free = n;
              break;
            }
          }

          if (free == null) {
            return jsonAuthResponse(
              {
                error: `Нет свободных номеров в диапазоне ${range.firstNumber}–${range.lastNumber}`,
              },
              409,
            );
          }

          return jsonAuthResponse({
            number: free,
            group: range.group,
            range: { first: range.firstNumber, last: range.lastNumber },
          });
        } catch (error) {
          console.error("[API CLOUDCONTACT FREENUMBER] Ошибка:", {
            type,
            team,
            message:
              error instanceof Error ? error.message : "Unknown error",
          });

          return jsonAuthResponse(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Не удалось подобрать свободный номер",
            },
            502,
          );
        }
      }

      // 5.6c. CloudContact — список команд (teams) тенанта. Должен стоять
      // ПЕРЕД роутом пользователей, иначе /{type}/teams перехватится им.
      if (
        pathname.startsWith("/api/cloudcontact/") &&
        pathname.endsWith("/teams") &&
        request.method === "GET"
      ) {
        if (!isMembersAllowed(env, session.username)) {
          return jsonAuthResponse({ error: "Нет доступа" }, 403);
        }

        const type = pathname.slice("/api/cloudcontact/".length).split("/")[0];

        try {
          const teams = await getCloudContactTeams(env, type);

          return jsonAuthResponse({ teams, total: teams.length, type });
        } catch (error) {
          console.error("[API CLOUDCONTACT TEAMS] Ошибка:", {
            type,
            message:
              error instanceof Error ? error.message : "Unknown error",
          });

          return jsonAuthResponse(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Не удалось получить команды CloudContact",
            },
            502,
          );
        }
      }

      // 5.6d. CloudContact — создание пользователя в тенанте.
      if (
        pathname.startsWith("/api/cloudcontact/") &&
        request.method === "POST"
      ) {
        if (!isMembersAllowed(env, session.username)) {
          return jsonAuthResponse({ error: "Нет доступа" }, 403);
        }

        const type = pathname.slice("/api/cloudcontact/".length).split("/")[0];

        try {
          const body = await request.json();
          const loginId = body.loginId || body.nickname;
          const user = await createCloudContactUser(env, type, {
            loginId,
            password: body.password,
            email: body.email,
            firstName: body.firstName,
            lastName: body.lastName,
            team: body.team,
            extension: body.extension || body.into_phone,
            roles: body.roles,
          });

          try {
            const ccUsername = String(loginId || "")
              .trim()
              .toLowerCase();
            // ФИО из формы (Фамилия + Имя); пусто → фолбэк на логин,
            // иначе NOT NULL constraint в members.
            const ccFio =
              [body.lastName, body.firstName]
                .map((part) => String(part || "").trim())
                .filter(Boolean)
                .join(" ") || ccUsername;

            await setServiceAccount({
              service: ccColumn(type),
              username: ccUsername,
              value: String(loginId || "").trim(),
              fio: ccFio,
              email: String(body.email || "").trim(),
            });

            // Пароль фиксируем в members (зашифрованно).
            if (body.password) {
              try {
                await upsertMember({
                  username: ccUsername,
                  fio: ccFio,
                  password: body.password,
                });
              } catch (pwdSyncError) {
                console.warn("[SYNC members] cloudcontact password:", {
                  message:
                    pwdSyncError instanceof Error
                      ? pwdSyncError.message
                      : String(pwdSyncError),
                });
              }
            }
          } catch (syncError) {
            console.warn("[SYNC members] cloudcontact set:", {
              message:
                syncError instanceof Error
                  ? syncError.message
                  : String(syncError),
            });
          }

          console.log("[API CLOUDCONTACT CREATE] Пользователь создан:", {
            type,
            loginId,
            by: session.username,
          });

          return jsonAuthResponse({ user });
        } catch (error) {
          console.error("[API CLOUDCONTACT CREATE] Ошибка:", {
            type,
            message:
              error instanceof Error ? error.message : "Unknown error",
          });

          return jsonAuthResponse(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Не удалось создать пользователя CloudContact",
            },
            502,
          );
        }
      }
      // 5.6e. CloudContact — удаление пользователя в тенанте.
      // DELETE /api/cloudcontact/{type}/{loginId}
      if (
        pathname.startsWith("/api/cloudcontact/") &&
        request.method === "DELETE"
      ) {
        if (!isMembersAllowed(env, session.username)) {
          return jsonAuthResponse({ error: "Нет доступа" }, 403);
        }

        const rest = pathname.slice("/api/cloudcontact/".length);
        const type = rest.split("/")[0];
        const loginId = decodeURIComponent(
          rest.split("/").slice(1).join("/"),
        );

        if (!loginId) {
          return jsonAuthResponse({ error: "Не указан логин" }, 400);
        }

        try {
          const result = await deleteCloudContactUser(env, type, loginId);

          try {
            await clearServiceAccount({
              service: ccColumn(type),
              identifier: loginId,
            });
          } catch (syncError) {
            console.warn("[SYNC members] cloudcontact clear:", {
              message:
                syncError instanceof Error
                  ? syncError.message
                  : String(syncError),
            });
          }

          console.log("[API CLOUDCONTACT DELETE] Пользователь удалён:", {
            type,
            loginId,
            by: session.username,
          });

          return jsonAuthResponse(result);
        } catch (error) {
          console.error("[API CLOUDCONTACT DELETE] Ошибка:", {
            type,
            loginId,
            message:
              error instanceof Error ? error.message : "Unknown error",
          });

          return jsonAuthResponse(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Не удалось удалить пользователя CloudContact",
            },
            502,
          );
        }
      }
      
      // 5.6f. CloudContact — блкоировка пользователя через update в тенанте.
      // PUT /api/cloudcontact/{type}/{loginId}
      if (
        pathname.startsWith("/api/cloudcontact/") &&
        request.method === "PUT"
      ) {
        if (!isMembersAllowed(env, session.username)) {
          return jsonAuthResponse({ error: "Нет доступа" }, 403);
        }

        const rest = pathname.slice("/api/cloudcontact/".length);
        const type = rest.split("/")[0];
        const loginId = decodeURIComponent(
          rest.split("/").slice(1).join("/"),
        );

        if (!loginId) {
          return jsonAuthResponse({ error: "Не указан логин" }, 400);
        }

        try {
          const body = await request.json().catch(() => ({}));
          const blocked = body.blocked === undefined ? true : Boolean(body.blocked);
          const result = await blockCloudContactUser(env, type, loginId, blocked);

          console.log("[API CLOUDCONTACT PUT] Статус пользователя изменён:", {
            type,
            loginId,
            blocked,
            by: session.username,
          });

          return jsonAuthResponse(result);
        } catch (error) {
          console.error("[API CLOUDCONTACT PUT] Ошибка:", {
            type,
            loginId,
            message:
              error instanceof Error ? error.message : "Unknown error",
          });

          return jsonAuthResponse(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Не удалось заблокировать пользователя CloudContact",
            },
            502,
          );
        }
      }
      

      // 5.7. CloudContact (BrightPattern) — список пользователей по типу.
      if (
        pathname.startsWith("/api/cloudcontact/") &&
        request.method === "GET"
      ) {
        const type = pathname
          .slice("/api/cloudcontact/".length)
          .split("/")[0];

        // ?refresh=1 — кнопка «Обновить список»: игнорируем кэш и тянем
        // свежие данные из BrightPattern (защита от рассинхронизации).
        const forceRefresh =
          url.searchParams.get("refresh") === "1" ||
          url.searchParams.get("refresh") === "true";

        try {
          const users = await getCloudContactUsers(env, type, forceRefresh);

          console.log("[API CLOUDCONTACT] Получено:", {
            type,
            count: users.length,
            username: session.username,
          });

          return jsonAuthResponse({ users, total: users.length, type });
        } catch (error) {
          console.error("[API CLOUDCONTACT] Ошибка:", {
            type,
            message:
              error instanceof Error ? error.message : "Unknown error",
          });

          return jsonAuthResponse(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Не удалось получить данные CloudContact",
            },
            502,
          );
        }
      }

      // 5.8. Текущий пользователь — для фронта (показывать ли вкладку).
      if (pathname === "/api/me" && request.method === "GET") {
        return jsonAuthResponse({
          username: session.username,
          canSeeMembers: isMembersAllowed(env, session.username),
        });
      }

      // 5.9. Реестр участников (с расшифрованными паролями).
      // Доступ только у логинов из MEMBERS_ALLOWED_USERS.
      if (pathname === "/api/members" && request.method === "GET") {
        if (!isMembersAllowed(env, session.username)) {
          return jsonAuthResponse(
            { error: "Нет доступа к реестру участников" },
            403,
          );
        }

        try {
          const members = await listMembersDecrypted();

          console.log("[API MEMBERS] Выдан список:", {
            count: members.length,
            username: session.username,
          });

          return jsonAuthResponse({ members, total: members.length });
        } catch (error) {
          console.error("[API MEMBERS] Ошибка:", {
            message:
              error instanceof Error ? error.message : "Unknown error",
          });

          return jsonAuthResponse(
            { error: "Не удалось получить реестр участников" },
            500,
          );
        }
      }

      // 5.9b. Добавление/обновление записи реестра (upsert по username).
      // Доступ только у логинов из MEMBERS_ALLOWED_USERS.
      if (pathname === "/api/members" && request.method === "POST") {
        if (!isMembersAllowed(env, session.username)) {
          return jsonAuthResponse(
            { error: "Нет доступа к реестру участников" },
            403,
          );
        }

        try {
          const body = await request.json();

          if (!body?.fio && !body?.username) {
            return jsonAuthResponse(
              { error: "Нужно указать как минимум ФИО или логин" },
              400,
            );
          }

          // Берём только известные поля (не доверяем лишним ключам из тела).
          const member = await upsertMember({
            fio: body.fio,
            username: body.username,
            email: body.email,
            yandex: body.yandex,
            reg: body.reg,
            vpn: body.vpn,
            cloudcontact: body.cloudcontact,
            cloudcontact_msp: body.cloudcontact_msp,
            cloudcontact_back: body.cloudcontact_back,
            phone: body.phone,
            position: body.position,
            vpngroups: body.vpngroups,
            password: body.password,
          });

          console.log("[API MEMBERS POST] Запись сохранена:", {
            username: member.username,
            by: session.username,
          });

          return jsonAuthResponse({ member });
        } catch (error) {
          console.error("[API MEMBERS POST] Ошибка:", {
            message:
              error instanceof Error ? error.message : "Unknown error",
          });

          return jsonAuthResponse(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Не удалось сохранить запись реестра",
            },
            500,
          );
        }
      }

      // 5.10. VPN (NetBird) — список пользователей.
      if (pathname === "/api/vpn/users" && request.method === "GET") {
        try {
          const users = await getVpnUsers(env);

          console.log("[API VPN USERS] Получено:", {
            count: users.length,
            username: session.username,
          });

          return jsonAuthResponse({ users, total: users.length });
        } catch (error) {
          console.error("[API VPN USERS] Ошибка:", {
            message:
              error instanceof Error ? error.message : "Unknown error",
          });

          return jsonAuthResponse(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Не удалось получить список пользователей VPN",
            },
            502,
          );
        }
      }

      // 5.10a. VPN (NetBird) — список приглашенных пользователей.
      if (pathname === "/api/vpn/inviteusers" && request.method === "GET") {
        try {
          const users = await getVpnInviteUsers(env);

          console.log("[API VPN USERS] Получено:", {
            count: users.length,
            username: session.username,
          });

          return jsonAuthResponse({ users, total: users.length });
        } catch (error) {
          console.error("[API VPN USERS] Ошибка:", {
            message:
              error instanceof Error ? error.message : "Unknown error",
          });

          return jsonAuthResponse(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Не удалось получить список пользователей VPN",
            },
            502,
          );
        }
      }

      // 5.10a2. VPN (NetBird) — перегенерация приглашения.
      if (
        pathname.startsWith("/api/vpn/inviteusers/") &&
        pathname.endsWith("/regenerate") &&
        request.method === "POST"
      ) {
        const inviteId = pathname.slice(
          "/api/vpn/inviteusers/".length,
          -"/regenerate".length,
        );

        try {
          const invite = await regenerateVpnInvite(env, inviteId);

          console.log("[API VPN INVITE REGENERATE] Приглашение обновлено:", {
            inviteId,
            username: session.username,
          });

          return jsonAuthResponse({ invite });
        } catch (error) {
          console.error("[API VPN INVITE REGENERATE] Ошибка:", {
            inviteId,
            message:
              error instanceof Error ? error.message : "Unknown error",
          });

          return jsonAuthResponse(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Не удалось перегенерировать приглашение VPN",
            },
            502,
          );
        }
      }

      // 5.10a3. VPN (NetBird) — удаление приглашения.
      if (
        pathname.startsWith("/api/vpn/inviteusers/") &&
        pathname.endsWith("/delete") &&
        request.method === "POST"
      ) {
        const inviteId = pathname.slice(
          "/api/vpn/inviteusers/".length,
          -"/delete".length,
        );

        try {
          const invite = await deleteVpnInvite(env, inviteId);

          console.log("[API VPN INVITE DELETE] Приглашение удалено:", {
            inviteId,
            username: session.username,
          });

          return jsonAuthResponse({ invite });
        } catch (error) {
          console.error("[API VPN INVITE DELETE] Ошибка:", {
            inviteId,
            message:
              error instanceof Error ? error.message : "Unknown error",
          });

          return jsonAuthResponse(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Не удалось удалить приглашение VPN",
            },
            502,
          );
        }
      }

      // 5.10b. VPN (NetBird) — создать/пригласить пользователя.
      if (pathname === "/api/vpn/users" && request.method === "POST") {
        try {
          const body = await request.json();

          const user = await addVpnUser(env, {
            email: body.email,
            name: body.name,
            role: body.role,
            autoGroups: body.auto_groups || body.autoGroups,
            mode: body.mode,
            expiresIn: body.expires_in,
          });

          try {
            const vpnEmail = String(body.email || "").trim().toLowerCase();
            const vpnUsername = vpnEmail.split("@")[0];
            // Пустое имя → фолбэк на логин (fio в БД NOT NULL).
            const vpnFio = String(body.name || "").trim() || vpnUsername;

            if (vpnUsername) {
              await setServiceAccount({
                service: "vpn",
                username: vpnUsername,
                value: vpnEmail,
                fio: vpnFio,
                email: vpnEmail,
              });

              // Пароль фиксируем в members (зашифрованно).
              if (body.password) {
                try {
                  await upsertMember({
                    username: vpnUsername,
                    fio: vpnFio,
                    password: body.password,
                  });
                } catch (pwdSyncError) {
                  console.warn("[SYNC members] vpn password:", {
                    message:
                      pwdSyncError instanceof Error
                        ? pwdSyncError.message
                        : String(pwdSyncError),
                  });
                }
              }
            }
          } catch (syncError) {
            console.warn("[SYNC members] vpn set:", {
              message:
                syncError instanceof Error
                  ? syncError.message
                  : String(syncError),
            });
          }

          console.log("[API VPN CREATE] Пользователь приглашён:", {
            email: body.email,
            groups: (body.auto_groups || []).length,
            username: session.username,
          });

          return jsonAuthResponse({ user });
        } catch (error) {
          console.error("[API VPN CREATE] Ошибка:", {
            message:
              error instanceof Error ? error.message : "Unknown error",
          });

          return jsonAuthResponse(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Не удалось создать пользователя VPN",
            },
            502,
          );
        }
      }

      // 5.10b2. VPN (NetBird) — удаление пользователя.
      if (
        pathname.startsWith("/api/vpn/users/") &&
        pathname.endsWith("/deleteusr") &&
        request.method === "POST"
      ) {
        const userId = pathname.slice(
          "/api/vpn/users/".length,
          -"/deleteusr".length,
        );

        try {
          const result = await deleteVpnUser(env, userId);

          const vpnEmail = String(url.searchParams.get("email") || "")
            .trim()
            .toLowerCase();

          if (vpnEmail) {
            try {
              await clearServiceAccount({
                service: "vpn",
                identifier: vpnEmail,
              });
            } catch (syncError) {
              console.warn("[SYNC members] vpn clear:", {
                message:
                  syncError instanceof Error
                    ? syncError.message
                    : String(syncError),
              });
            }
          }

          console.log("[API VPN DELETE] Пользователь удалён:", {
            userId,
            username: session.username,
          });

          return jsonAuthResponse(result);
        } catch (error) {
          console.error("[API VPN DELETE] Ошибка:", {
            userId,
            message:
              error instanceof Error ? error.message : "Unknown error",
          });

          return jsonAuthResponse(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Не удалось удалить пользователя VPN",
            },
            502,
          );
        }
      }

      // 5.10b3. VPN (NetBird) — блокировка / разблокировка пользователя.
      if (
        pathname.startsWith("/api/vpn/users/") &&
        pathname.endsWith("/block") &&
        request.method === "POST"
      ) {
        const userId = pathname.slice(
          "/api/vpn/users/".length,
          -"/block".length,
        );

        try {
          const body = await request.json().catch(() => ({}));
          const user = await setVpnUserBlocked(env, userId, Boolean(body.blocked));

          console.log("[API VPN BLOCK] Статус пользователя изменён:", {
            userId,
            blocked: Boolean(body.blocked),
            username: session.username,
          });

          return jsonAuthResponse({ user });
        } catch (error) {
          console.error("[API VPN BLOCK] Ошибка:", {
            userId,
            message:
              error instanceof Error ? error.message : "Unknown error",
          });

          return jsonAuthResponse(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Не удалось изменить статус пользователя VPN",
            },
            502,
          );
        }
      }

      
      // 5.10c. VPN (NetBird) — список групп.
      if (pathname === "/api/vpn/groups" && request.method === "GET") {
        try {
          const groups = await getVpnGroups(env);

          console.log("[API VPN GROUPS] Получено:", {
            count: groups.length,
            username: session.username,
          });

          return jsonAuthResponse({ groups, total: groups.length });
        } catch (error) {
          console.error("[API VPN GROUPS] Ошибка:", {
            message:
              error instanceof Error ? error.message : "Unknown error",
          });

          return jsonAuthResponse(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Не удалось получить список групп VPN",
            },
            502,
          );
        }
      }

      // 5.10d. Группы VPN из нашей БД (каталог vpn_groups).
      if (pathname === "/api/vpn/groups/db" && request.method === "GET") {
        if (!isMembersAllowed(env, session.username)) {
          return jsonAuthResponse({ error: "Нет доступа" }, 403);
        }

        try {
          const groups = await listVpnGroups();

          return jsonAuthResponse({ groups, total: groups.length });
        } catch (error) {
          console.error("[API VPN GROUPS DB] Ошибка:", {
            message:
              error instanceof Error ? error.message : "Unknown error",
          });

          return jsonAuthResponse(
            { error: "Не удалось получить группы из БД" },
            500,
          );
        }
      }

      // 5.10e. Синхронизация групп NetBird → наша БД (каталог vpn_groups).
      if (pathname === "/api/vpn/groups/sync" && request.method === "POST") {
        if (!isMembersAllowed(env, session.username)) {
          return jsonAuthResponse({ error: "Нет доступа" }, 403);
        }

        try {
          const fromNetbird = await getVpnGroups(env);
          const groups = await syncVpnGroups(fromNetbird);

          console.log("[API VPN GROUPS SYNC] Записано в БД:", {
            count: groups.length,
            username: session.username,
          });

          return jsonAuthResponse({ groups, total: groups.length });
        } catch (error) {
          console.error("[API VPN GROUPS SYNC] Ошибка:", {
            message:
              error instanceof Error ? error.message : "Unknown error",
          });

          return jsonAuthResponse(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Не удалось синхронизировать группы",
            },
            502,
          );
        }
      }

      // 5.10f. Номерной план телефонии — список строк.
      if (pathname === "/api/phoneplan" && request.method === "GET") {
        if (!isMembersAllowed(env, session.username)) {
          return jsonAuthResponse({ error: "Нет доступа" }, 403);
        }

        try {
          const rows = await listPhonePlan();

          return jsonAuthResponse({ rows, total: rows.length });
        } catch (error) {
          console.error("[API PHONEPLAN] Ошибка:", {
            message:
              error instanceof Error ? error.message : "Unknown error",
          });

          return jsonAuthResponse(
            { error: "Не удалось получить номерной план" },
            500,
          );
        }
      }

      // 5.10g. Номерной план — привязать команду к группе (drag-and-drop).
      if (pathname === "/api/phoneplan/assign" && request.method === "POST") {
        if (!isMembersAllowed(env, session.username)) {
          return jsonAuthResponse({ error: "Нет доступа" }, 403);
        }

        try {
          const body = await request.json();
          const row = await assignTeamGroup(body);

          return jsonAuthResponse({ row });
        } catch (error) {
          console.error("[API PHONEPLAN ASSIGN] Ошибка:", {
            message:
              error instanceof Error ? error.message : "Unknown error",
          });

          return jsonAuthResponse(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Не удалось привязать команду к группе",
            },
            400,
          );
        }
      }

      // 5.10i. Группы номерного плана — список / создание.
      if (pathname === "/api/phonegroups" && request.method === "GET") {
        if (!isMembersAllowed(env, session.username)) {
          return jsonAuthResponse({ error: "Нет доступа" }, 403);
        }

        try {
          const groups = await listPhoneGroups();

          return jsonAuthResponse({ groups, total: groups.length });
        } catch (error) {
          console.error("[API PHONEGROUPS] Ошибка:", {
            message:
              error instanceof Error ? error.message : "Unknown error",
          });

          return jsonAuthResponse(
            { error: "Не удалось получить группы" },
            500,
          );
        }
      }

      if (pathname === "/api/phonegroups" && request.method === "POST") {
        if (!isMembersAllowed(env, session.username)) {
          return jsonAuthResponse({ error: "Нет доступа" }, 403);
        }

        try {
          const body = await request.json();
          const group = await createPhoneGroup(body?.name);

          return jsonAuthResponse({ group });
        } catch (error) {
          console.error("[API PHONEGROUPS CREATE] Ошибка:", {
            message:
              error instanceof Error ? error.message : "Unknown error",
          });

          return jsonAuthResponse(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Не удалось создать группу",
            },
            400,
          );
        }
      }

      // 5.10j. Группы — обновление диапазона / удаление по id.
      if (pathname.startsWith("/api/phonegroups/")) {
        if (!isMembersAllowed(env, session.username)) {
          return jsonAuthResponse({ error: "Нет доступа" }, 403);
        }

        const id = Number(pathname.slice("/api/phonegroups/".length));

        if (!Number.isInteger(id) || id <= 0) {
          return jsonAuthResponse({ error: "Некорректный id" }, 400);
        }

        if (request.method === "PUT") {
          try {
            const body = await request.json();
            const group = await updatePhoneGroup(id, body);

            if (!group) {
              return jsonAuthResponse({ error: "Группа не найдена" }, 404);
            }

            return jsonAuthResponse({ group });
          } catch (error) {
            console.error("[API PHONEGROUPS UPDATE] Ошибка:", {
              id,
              message:
                error instanceof Error ? error.message : "Unknown error",
            });

            return jsonAuthResponse(
              { error: "Не удалось обновить группу" },
              400,
            );
          }
        }

        if (request.method === "DELETE") {
          try {
            const ok = await deletePhoneGroup(id);

            if (!ok) {
              return jsonAuthResponse({ error: "Группа не найдена" }, 404);
            }

            return jsonAuthResponse({ ok: true });
          } catch (error) {
            console.error("[API PHONEGROUPS DELETE] Ошибка:", {
              id,
              message:
                error instanceof Error ? error.message : "Unknown error",
            });

            return jsonAuthResponse(
              { error: "Не удалось удалить группу" },
              500,
            );
          }
        }
      }

      // 5.10k. Справочник ролей CloudContact — список / создание.
      // ?service=osn|msp|back → только имена ролей сервиса (для формы добавления).
      // без параметра → полный список с флагами (для модалки управления).
      if (pathname === "/api/cloudcontact-roles" && request.method === "GET") {
        if (!isMembersAllowed(env, session.username)) {
          return jsonAuthResponse({ error: "Нет доступа" }, 403);
        }

        const service = url.searchParams.get("service");

        try {
          if (service) {
            const roles = await listRoleNamesForService(service);
            return jsonAuthResponse({ roles, total: roles.length, service });
          }

          const roles = await listCcRoles();
          return jsonAuthResponse({ roles, total: roles.length });
        } catch (error) {
          console.error("[API CC ROLES] Ошибка:", {
            message:
              error instanceof Error ? error.message : "Unknown error",
          });

          return jsonAuthResponse({ error: "Не удалось получить роли" }, 500);
        }
      }

      if (pathname === "/api/cloudcontact-roles" && request.method === "POST") {
        if (!isMembersAllowed(env, session.username)) {
          return jsonAuthResponse({ error: "Нет доступа" }, 403);
        }

        try {
          const body = await request.json();
          const role = await createCcRole(body);

          return jsonAuthResponse({ role });
        } catch (error) {
          console.error("[API CC ROLES CREATE] Ошибка:", {
            message:
              error instanceof Error ? error.message : "Unknown error",
          });

          return jsonAuthResponse(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Не удалось создать роль",
            },
            400,
          );
        }
      }

      // 5.10l. Справочник ролей — обновление / удаление по id.
      if (pathname.startsWith("/api/cloudcontact-roles/")) {
        if (!isMembersAllowed(env, session.username)) {
          return jsonAuthResponse({ error: "Нет доступа" }, 403);
        }

        const id = Number(pathname.slice("/api/cloudcontact-roles/".length));

        if (!Number.isInteger(id) || id <= 0) {
          return jsonAuthResponse({ error: "Некорректный id" }, 400);
        }

        if (request.method === "PUT") {
          try {
            const body = await request.json();
            const role = await updateCcRole(id, body);

            if (!role) {
              return jsonAuthResponse({ error: "Роль не найдена" }, 404);
            }

            return jsonAuthResponse({ role });
          } catch (error) {
            console.error("[API CC ROLES UPDATE] Ошибка:", {
              id,
              message:
                error instanceof Error ? error.message : "Unknown error",
            });

            return jsonAuthResponse(
              {
                error:
                  error instanceof Error
                    ? error.message
                    : "Не удалось обновить роль",
              },
              400,
            );
          }
        }

        if (request.method === "DELETE") {
          try {
            const ok = await deleteCcRole(id);

            if (!ok) {
              return jsonAuthResponse({ error: "Роль не найдена" }, 404);
            }

            return jsonAuthResponse({ ok: true });
          } catch (error) {
            console.error("[API CC ROLES DELETE] Ошибка:", {
              id,
              message:
                error instanceof Error ? error.message : "Unknown error",
            });

            return jsonAuthResponse({ error: "Не удалось удалить роль" }, 500);
          }
        }
      }

      // 5.11. Генерация пароля по политике.
      // Единый источник правила — generatePassword() в src/functions.js,
      // чтобы фронтовые кнопки «сгенерировать» не расходились с бэком.
      if (pathname === "/api/password" && request.method === "GET") {
        return jsonAuthResponse({ password: generatePassword(16) });
      }

      // Неизвестные API-маршруты.
      return jsonAuthResponse(
        { error: "API endpoint not found" },
        404,
      );
    }

    // 6. Остальные запросы — Vue SPA и статические файлы.
    return env.ASSETS.fetch(request);
  } catch (error) {
    console.error("[ROUTER] Необработанная ошибка:", {
      pathname,
      message:
        error instanceof Error
          ? error.message
          : String(error),
      timestamp: new Date().toISOString(),
    });

    return new Response("Internal Server Error", {
      status: 500,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
}

export default {
  async fetch(request, env, ctx) {
    const response = await handleRequest(request, env, ctx);

    return withSecurityHeaders(response, env);
  },
};
