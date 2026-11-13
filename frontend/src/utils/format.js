// Общие функции форматирования/представления для таблиц (аватары, статусы,
// относительное время, склонения). Чистые, без состояния — переиспользуются
// в разных компонентах (напр. вкладки ВПН: пользователи и приглашённые).

// Первая буква для аватара.
export function initial(str) {
  const s = String(str || '').trim()

  return s ? s[0].toUpperCase() : '?'
}

// Стабильный цвет аватара по строке (одинаковый для одного пользователя).
export function avatarColor(str) {
  let hash = 0

  for (let i = 0; i < String(str).length; i++) {
    hash = (hash * 31 + String(str).charCodeAt(i)) % 360
  }

  return `hsl(${hash}, 55%, 45%)`
}

// Цвет тега роли (owner/admin/прочие).
export function roleType(role) {
  if (role === 'owner') return 'danger'
  if (role === 'admin') return 'warning'
  return 'info'
}

// CSS-класс точки статуса.
export function statusClass(status) {
  if (status === 'active') return 'is-active'
  if (status === 'invited') return 'is-invited'
  if (status === 'blocked') return 'is-blocked'
  return 'is-default'
}

const STATUS_LABELS = {
  active: 'Активен',
  invited: 'Приглашён',
  blocked: 'Заблокирован',
  disabled: 'Отключён',
}

// Человекочитаемый статус.
export function statusLabel(status) {
  if (!status) return '—'

  return STATUS_LABELS[status] || status
}

// Русское склонение: 1 группа, 2 группы, 5 групп.
export function plural(n, one, few, many) {
  const mod10 = n % 10
  const mod100 = n % 100

  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few

  return many
}

// NetBird для «никогда не входил» отдаёт last_login = 0001-01-01T00:00:00Z.
// Такую (и любую невалидную/нулевую — до 1970) дату считаем пустой → «—».
export function isEmptyDate(value) {
  if (!value) return true

  const t = new Date(value).getTime()

  return Number.isNaN(t) || t <= 0
}

// Относительное время: «6 часов назад».
export function timeAgo(value) {
  if (isEmptyDate(value)) return '—'

  const date = new Date(value)

  const sec = Math.floor((Date.now() - date.getTime()) / 1000)

  if (sec < 60) return 'только что'

  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} ${plural(min, 'минуту', 'минуты', 'минут')} назад`

  const hours = Math.floor(min / 60)
  if (hours < 24) return `${hours} ${plural(hours, 'час', 'часа', 'часов')} назад`

  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} ${plural(days, 'день', 'дня', 'дней')} назад`

  const months = Math.floor(days / 30)
  if (months < 12) return `${months} ${plural(months, 'месяц', 'месяца', 'месяцев')} назад`

  const years = Math.floor(days / 365)
  return `${years} ${plural(years, 'год', 'года', 'лет')} назад`
}

// Полная дата для тултипа: «13 ноября 2026 г., 09:11».
export function fullDate(value) {
  if (isEmptyDate(value)) return '—'

  const date = new Date(value)

  return date.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Короткая дата: «13.11.2026, 09:11».
export function formatDate(value) {
  if (isEmptyDate(value)) return '—'

  const date = new Date(value)

  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
