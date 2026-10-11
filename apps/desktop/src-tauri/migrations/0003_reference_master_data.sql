CREATE TABLE local_countries (
  id TEXT PRIMARY KEY,
  business_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  time_zone TEXT NOT NULL,
  is_active INTEGER NOT NULL CHECK (is_active IN (0, 1)),
  version INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE local_projects (
  id TEXT PRIMARY KEY,
  country_id TEXT NOT NULL REFERENCES local_countries(id),
  business_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  site TEXT NOT NULL,
  department_name TEXT NOT NULL,
  default_currency TEXT NOT NULL CHECK (default_currency IN ('XOF', 'CNY', 'USD', 'EUR')),
  default_language_pair TEXT NOT NULL CHECK (default_language_pair IN ('zh_fr', 'zh_en')),
  is_active INTEGER NOT NULL CHECK (is_active IN (0, 1)),
  version INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE local_sites (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES local_projects(id),
  business_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL CHECK (is_active IN (0, 1)),
  version INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE local_departments (
  id TEXT PRIMARY KEY,
  business_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL CHECK (is_active IN (0, 1)),
  version INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE local_teams (
  id TEXT PRIMARY KEY,
  department_id TEXT NOT NULL REFERENCES local_departments(id),
  business_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL CHECK (is_active IN (0, 1)),
  version INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE local_units (
  id TEXT PRIMARY KEY,
  business_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL CHECK (is_active IN (0, 1)),
  version INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE local_tax_templates (
  id TEXT PRIMARY KEY,
  business_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  country_id TEXT,
  rate_basis_points INTEGER NOT NULL CHECK (rate_basis_points BETWEEN 0 AND 100000),
  effective_at TEXT NOT NULL,
  is_active INTEGER NOT NULL CHECK (is_active IN (0, 1)),
  version INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE local_exchange_rates (
  id TEXT PRIMARY KEY,
  from_currency TEXT NOT NULL CHECK (from_currency IN ('XOF', 'CNY', 'USD', 'EUR')),
  to_currency TEXT NOT NULL CHECK (to_currency IN ('XOF', 'CNY', 'USD', 'EUR')),
  rate_decimal TEXT NOT NULL,
  effective_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('public_daily', 'manual')),
  reason TEXT,
  version INTEGER NOT NULL,
  CHECK ((source = 'manual' AND reason IS NOT NULL AND length(trim(reason)) > 0) OR source = 'public_daily')
);
