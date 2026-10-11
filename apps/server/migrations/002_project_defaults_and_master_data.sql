CREATE TABLE sites (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id),
  business_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE units (
  id UUID PRIMARY KEY,
  business_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE tax_templates (
  id UUID PRIMARY KEY,
  business_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  country_id UUID REFERENCES countries(id),
  rate_basis_points INTEGER NOT NULL CHECK (rate_basis_points >= 0 AND rate_basis_points <= 100000),
  effective_at DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE exchange_rates (
  id UUID PRIMARY KEY,
  from_currency CHAR(3) NOT NULL CHECK (from_currency IN ('XOF', 'CNY', 'USD', 'EUR')),
  to_currency CHAR(3) NOT NULL CHECK (to_currency IN ('XOF', 'CNY', 'USD', 'EUR')),
  rate_decimal TEXT NOT NULL CHECK (rate_decimal ~ '^[0-9]+(\.[0-9]{1,8})?$'),
  effective_at DATE NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('public_daily', 'manual')),
  reason TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((source = 'manual' AND reason IS NOT NULL AND length(trim(reason)) > 0) OR source = 'public_daily')
);

CREATE TABLE project_print_defaults (
  project_id UUID PRIMARY KEY REFERENCES projects(id),
  department_title TEXT NOT NULL,
  company_address TEXT NOT NULL,
  company_contact TEXT NOT NULL,
  default_currency CHAR(3) NOT NULL CHECK (default_currency IN ('XOF', 'CNY', 'USD', 'EUR')),
  default_language_pair TEXT NOT NULL CHECK (default_language_pair IN ('zh_fr', 'zh_en')),
  default_tax_template_id UUID REFERENCES tax_templates(id),
  version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX sites_project_active_idx ON sites (project_id) WHERE deleted_at IS NULL;
CREATE INDEX tax_templates_country_active_idx ON tax_templates (country_id, effective_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX exchange_rates_pair_effective_idx ON exchange_rates (from_currency, to_currency, effective_at DESC);
