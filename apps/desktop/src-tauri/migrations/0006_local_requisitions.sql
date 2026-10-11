CREATE TABLE local_purchase_orders (
  id TEXT PRIMARY KEY,
  parent_order_id TEXT REFERENCES local_purchase_orders(id),
  display_no TEXT NOT NULL,
  country_id TEXT NOT NULL REFERENCES local_countries(id),
  project_id TEXT NOT NULL REFERENCES local_projects(id),
  site TEXT NOT NULL CHECK (length(trim(site)) > 0),
  department_id TEXT NOT NULL REFERENCES local_departments(id),
  team_id TEXT NOT NULL REFERENCES local_teams(id),
  applicant_id TEXT NOT NULL,
  supplier_id TEXT REFERENCES local_suppliers(id),
  currency TEXT NOT NULL CHECK (currency IN ('XOF', 'CNY', 'USD', 'EUR')),
  primary_currency TEXT NOT NULL CHECK (primary_currency IN ('XOF', 'CNY', 'USD', 'EUR')),
  language_pair TEXT NOT NULL CHECK (language_pair IN ('zh_fr', 'zh_en')),
  status TEXT NOT NULL CHECK (status IN ('draft', 'pending_confirmation')),
  urgency TEXT NOT NULL DEFAULT 'normal' CHECK (urgency IN ('low', 'normal', 'high')),
  urgency_reason TEXT,
  order_date TEXT NOT NULL,
  delivery_address TEXT NOT NULL CHECK (length(trim(delivery_address)) > 0),
  expected_delivery_date TEXT,
  notes TEXT,
  subtotal_minor INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_minor >= 0),
  line_discount_minor INTEGER NOT NULL DEFAULT 0 CHECK (line_discount_minor >= 0),
  order_discount_minor INTEGER NOT NULL DEFAULT 0 CHECK (order_discount_minor >= 0),
  freight_minor INTEGER NOT NULL DEFAULT 0 CHECK (freight_minor >= 0),
  tax_rate_basis_points INTEGER NOT NULL DEFAULT 0 CHECK (tax_rate_basis_points BETWEEN 0 AND 100000),
  tax_minor INTEGER NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
  total_minor INTEGER NOT NULL DEFAULT 0 CHECK (total_minor >= 0),
  version INTEGER NOT NULL CHECK (version >= 1),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE INDEX local_purchase_orders_project_status_idx
  ON local_purchase_orders (project_id, status, updated_at DESC);

CREATE TABLE local_purchase_order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES local_purchase_orders(id),
  material_id TEXT REFERENCES local_materials(id),
  material_snapshot_json TEXT NOT NULL,
  supplier_snapshot_json TEXT,
  quantity_decimal TEXT NOT NULL,
  unit TEXT NOT NULL CHECK (length(trim(unit)) > 0),
  unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor >= 0),
  line_discount_json TEXT NOT NULL DEFAULT '{"kind":"fixed_minor","minor":"0"}',
  line_freight_json TEXT NOT NULL DEFAULT '{"kind":"fixed_minor","minor":"0"}',
  freight_included INTEGER NOT NULL DEFAULT 0 CHECK (freight_included IN (0, 1)),
  line_total_minor INTEGER NOT NULL CHECK (line_total_minor >= 0),
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX local_purchase_order_item_sort_idx
  ON local_purchase_order_items (order_id, sort_order);

CREATE TABLE local_order_attachments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES local_purchase_orders(id),
  original_name TEXT NOT NULL CHECK (length(trim(original_name)) > 0),
  content_type TEXT NOT NULL,
  byte_length INTEGER NOT NULL CHECK (byte_length BETWEEN 0 AND 104857600),
  local_path TEXT NOT NULL,
  upload_state TEXT NOT NULL DEFAULT 'local_only' CHECK (upload_state IN ('local_only', 'pending_upload', 'uploaded')),
  object_key TEXT,
  checksum TEXT,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
