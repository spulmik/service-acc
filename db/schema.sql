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
