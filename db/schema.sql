-- Справочник участников (аккаунты по системам). Применить:
--   sudo -u postgres psql -d energyteam -f db/schema.sql
-- или внутри psql: \i db/schema.sql

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
  password_enc       TEXT,                   -- пароль (AES-256-GCM, шифртекст)
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS members_email_idx ON members (email);

-- Если таблица уже создана без части столбцов — добавить недостающие:
ALTER TABLE members ADD COLUMN IF NOT EXISTS password_enc TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS position TEXT;
