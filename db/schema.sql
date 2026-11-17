-- Справочник участников (аккаунты по системам).

CREATE TABLE IF NOT EXISTS members (
  id                 SERIAL PRIMARY KEY,
  fio                TEXT NOT NULL,          -- ФИО
  username           TEXT UNIQUE,
  email              TEXT,
  yandex             TEXT,                   -- Яндекс
  reg                TEXT,                   -- Рег
  vpn                TEXT,                   -- ВПН
  cloudcontact       TEXT,                   -- CloudContact
  cloudcontact_msp   TEXT,                   -- CloudContactMSP
  cloudcontact_back  TEXT,                   -- CloudContactBack
  phone              TEXT,                   -- Номер телефона
  position           TEXT,                   -- Должность
  vpngroups          TEXT,                   -- Группы NetBird (имена через запятую)
  password_enc       TEXT,                   -- пароль (AES-256-GCM, шифртекст)
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS members_email_idx ON members (email);

-- Если таблица уже создана без части столбцов — добавить недостающие:
ALTER TABLE members ADD COLUMN IF NOT EXISTS password_enc TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS position TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS vpngroups TEXT;

-- Каталог групп NetBird (наш «источник правды» по группам VPN).
-- Заполняется синхронизацией из NetBird (POST /api/vpn/groups/sync).
CREATE TABLE IF NOT EXISTS vpn_groups (
  id            TEXT PRIMARY KEY,       -- id группы в NetBird
  name          TEXT NOT NULL,          -- имя группы
  peers_count   INTEGER DEFAULT 0,      -- число пиров
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Номерной план телефонии. Каждая строка — команда (team) CloudContact с
-- набором флагов «в какой инстанс входит» и её группой. Диапазон номеров
-- хранится на уровне ГРУППЫ (см. phone_groups), не здесь.
CREATE TABLE IF NOT EXISTS phone_plan (
  id            SERIAL PRIMARY KEY,
  team          TEXT NOT NULL,            -- команда (team) из CloudContact
  group_name    TEXT,                    -- группа (визуальная), nullable
  cc_osn        BOOLEAN DEFAULT false,    -- CloudContact Osn
  cc_msp        BOOLEAN DEFAULT false,    -- CloudContact Msp
  cc_back       BOOLEAN DEFAULT false,    -- CloudContact Back
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Если таблица уже создана без group_name — добавить:
ALTER TABLE phone_plan ADD COLUMN IF NOT EXISTS group_name TEXT;

-- Диапазон переехал в phone_groups — убираем устаревшие колонки из phone_plan:
ALTER TABLE phone_plan DROP COLUMN IF EXISTS first_number;
ALTER TABLE phone_plan DROP COLUMN IF EXISTS last_number;

-- Группы номерного плана (для drag-and-drop). Хранятся отдельно, чтобы
-- пустые (только что созданные) группы тоже сохранялись между заходами.
-- Привязка команда→группа живёт в phone_plan.group_name (по имени группы).
-- Диапазон номеров фиксируется на уровне ГРУППЫ (first_number/last_number),
-- а не отдельной команды. Команды входят в группу через phone_plan.group_name.
CREATE TABLE IF NOT EXISTS phone_groups (
  id            SERIAL PRIMARY KEY,
  name          TEXT UNIQUE NOT NULL,
  first_number  INTEGER,
  last_number   INTEGER,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Если таблица уже создана без диапазона — добавить:
ALTER TABLE phone_groups ADD COLUMN IF NOT EXISTS first_number INTEGER;
ALTER TABLE phone_groups ADD COLUMN IF NOT EXISTS last_number INTEGER;

-- Роли CloudContact. У BrightPattern нет API-списка ролей, поэтому ведём свой
-- справочник. Флаги определяют, к какому сервису относится роль (osn/msp/back).
CREATE TABLE IF NOT EXISTS cloudcontact_roles (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  cc_osn      BOOLEAN DEFAULT false,
  cc_msp      BOOLEAN DEFAULT false,
  cc_back     BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Имя роли уникально (нужно для upsert и сид-файла).
CREATE UNIQUE INDEX IF NOT EXISTS cloudcontact_roles_name_idx
  ON cloudcontact_roles (name);
