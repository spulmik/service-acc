// Письма с приглашением в VPN (NetBird).
//
// Ссылка приглашения собирается из invite_token, который NetBird отдаёт
// при создании/перегенерации инвайта. Токен — секрет: он даёт возможность
// принять приглашение, поэтому в браузер мы его не отдаём, а формируем ссылку и письмо здесь, на сервере.
//
// Приглашение принимается в веб-интерфейсе NetBird:
//   {домен}/#/login?invite_token=...
// Пока сделано хардкодом, в дальнейшем перенесу данное сообщение и allowed domains для сообщений в настройки приложения
const DEFAULT_BASE = "https://vpn.energy-team.ru";

// Инструкция по подключению (раздаётся сервером из files/ с
// Content-Disposition: attachment — скачивается по клику).
// Имя файла пока хардкодом, в дальнейшем — в настройки приложения.
const DOC_FILENAME = "docsusrconnect.pdf";

// Абсолютная ссылка на инструкцию: относительная в почтовом клиенте
// не откроется. База — PUBLIC_ORIGIN (публичный адрес приложения).
// Если не задан — ссылки нет, чтобы не слать битую кнопку.
export function buildDocUrl() {
  const base = String(process.env.PUBLIC_ORIGIN || "")
    .trim()
    .replace(/\/+$/, "");

  return base ? `${base}/files/${DOC_FILENAME}` : "";
}

// Ссылка для принятия приглашения.
export function buildInviteUrl(inviteToken) {
  const token = String(inviteToken || "").trim();

  if (!token) {
    return "";
  }

  return `${DEFAULT_BASE}/#/login?invite_token=${encodeURIComponent(token)}`;
}

// Экранирование значений, попадающих в HTML-письмо.
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatExpires(expiresAt) {
  const raw = String(expiresAt || "").trim();

  if (!raw) {
    return "";
  }

  const date = new Date(raw);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Письмо-приглашение в VPN.
//   kind: "invite"      — новое приглашение
//         "regenerated" — перегенерация (старая ссылка недействительна)
export function buildVpnInviteMail({
  kind = "invite",
  name,
  groups = [],
  expiresAt,
  inviteUrl,
}) {
  const isRegenerated = kind === "regenerated";
  const recipient = String(name || "").trim();
  const groupList = Array.isArray(groups) ? groups.filter(Boolean) : [];
  const expiresText = formatExpires(expiresAt);
  const docUrl = buildDocUrl();

  if (!docUrl) {
    console.warn(
      "[MAIL VPN] PUBLIC_ORIGIN не задан — кнопка инструкции в письмо не добавлена",
    );
  }

  const subject = isRegenerated
    ? "Новая ссылка-приглашение в VPN (старая недействительна)"
    : "Приглашение в VPN";

  const greeting = recipient ? `Здравствуйте, ${recipient}!` : "Здравствуйте!";

  const intro = isRegenerated
    ? "Ваша прежняя ссылка-приглашение в VPN больше не действует. Ниже — новая."
    : "Вас пригласили в корпоративный VPN.";

  const lines = [
    greeting,
    "",
    intro,
    "",
    `Ссылка для принятия приглашения:`,
    inviteUrl,
    "",
  ];

  if (docUrl) {
    lines.push(`Инструкция по подключению: ${docUrl}`, "");
  }

  if (groupList.length) {
    lines.push(`Группы доступа: ${groupList.join(", ")}`, "");
  }

  if (expiresText) {
    lines.push(`Ссылка действует до: ${expiresText}`, "");
  }

  lines.push(
    "Если вы не ожидали это письмо — просто проигнорируйте его.",
    "",
    "С уважением,",
    "Сервис управления учётными записями",
  );

  const text = lines.join("\n");

  const groupsHtml = groupList.length
    ? `<p style="margin:0 0 12px"><strong>Группы доступа:</strong> ${escapeHtml(
        groupList.join(", "),
      )}</p>`
    : "";

  const expiresHtml = expiresText
    ? `<p style="margin:0 0 12px"><strong>Ссылка действует до:</strong> ${escapeHtml(
        expiresText,
      )}</p>`
    : "";
  const docHtml = docUrl
    ? `<p style="margin:0 0 16px">
    <a href="${escapeHtml(docUrl)}"
       style="display:inline-block;padding:11px 22px;background:#1f6feb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">
      Инструкция по подключению
    </a>
  </p>`
    : "";

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1f2328;max-width:600px">
  <p style="margin:0 0 12px">${escapeHtml(greeting)}</p>
  <p style="margin:0 0 16px">${escapeHtml(intro)}</p>
  ${docHtml}
  <p style="margin:0 0 16px">
    <a href="${escapeHtml(inviteUrl)}"
       style="display:inline-block;padding:11px 22px;background:#1f6feb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">
      Принять приглашение
    </a>
  </p>
  <p style="margin:0 0 16px;font-size:13px;color:#57606a">
    Если кнопка не работает, скопируйте ссылку:<br>
    <a href="${escapeHtml(inviteUrl)}" style="color:#1f6feb;word-break:break-all">${escapeHtml(
      inviteUrl,
    )}</a>
  </p>
  ${groupsHtml}
  ${expiresHtml}
  <p style="margin:16px 0 0;font-size:13px;color:#57606a">
    Если вы не ожидали это письмо — просто проигнорируйте его.
  </p>
</div>`;

  return { subject, text, html };
}
