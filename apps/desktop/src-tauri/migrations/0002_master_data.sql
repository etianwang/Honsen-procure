CREATE TABLE local_project_print_defaults (
  project_id TEXT PRIMARY KEY,
  department_title TEXT NOT NULL,
  company_address TEXT NOT NULL,
  company_contact TEXT NOT NULL,
  default_currency TEXT NOT NULL CHECK (default_currency IN ('XOF', 'CNY', 'USD', 'EUR')),
  default_language_pair TEXT NOT NULL CHECK (default_language_pair IN ('zh_fr', 'zh_en')),
  default_tax_template_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
