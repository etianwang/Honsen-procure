CREATE TABLE local_materials (
  id TEXT PRIMARY KEY,
  sku TEXT UNIQUE,
  name_zh TEXT NOT NULL CHECK (length(trim(name_zh)) > 0),
  name_fr TEXT,
  aliases_json TEXT NOT NULL DEFAULT '[]',
  brand TEXT,
  model TEXT NOT NULL CHECK (length(trim(model)) > 0),
  specification TEXT NOT NULL CHECK (length(trim(specification)) > 0),
  unit TEXT NOT NULL CHECK (length(trim(unit)) > 0),
  notes TEXT,
  is_active INTEGER NOT NULL CHECK (is_active IN (0, 1)),
  version INTEGER NOT NULL CHECK (version >= 1),
  deleted_at INTEGER
);

CREATE INDEX local_materials_search_idx
  ON local_materials (is_active, name_zh, model, specification);

CREATE TABLE local_suppliers (
  id TEXT PRIMARY KEY,
  business_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  contact_name TEXT,
  address TEXT,
  city TEXT,
  country TEXT,
  phone TEXT,
  whatsapp TEXT,
  email TEXT,
  payment_terms TEXT,
  delivery_lead_time TEXT,
  is_preferred INTEGER NOT NULL DEFAULT 0 CHECK (is_preferred IN (0, 1)),
  is_blacklisted INTEGER NOT NULL DEFAULT 0 CHECK (is_blacklisted IN (0, 1)),
  is_active INTEGER NOT NULL CHECK (is_active IN (0, 1)),
  version INTEGER NOT NULL CHECK (version >= 1),
  deleted_at INTEGER
);

CREATE TABLE local_material_prices (
  id TEXT PRIMARY KEY,
  material_id TEXT NOT NULL REFERENCES local_materials(id),
  supplier_id TEXT NOT NULL REFERENCES local_suppliers(id),
  currency TEXT NOT NULL CHECK (currency IN ('XOF', 'CNY', 'USD', 'EUR')),
  unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor >= 0),
  unit TEXT NOT NULL CHECK (length(trim(unit)) > 0),
  effective_at TEXT NOT NULL,
  source_note TEXT,
  is_active INTEGER NOT NULL CHECK (is_active IN (0, 1)),
  version INTEGER NOT NULL CHECK (version >= 1),
  deleted_at INTEGER
);

CREATE UNIQUE INDEX local_active_material_supplier_price_idx
  ON local_material_prices (material_id, supplier_id, currency)
  WHERE is_active = 1 AND deleted_at IS NULL;

CREATE INDEX local_material_price_lookup_idx
  ON local_material_prices (material_id, is_active, effective_at DESC);

CREATE TABLE local_material_images (
  id TEXT PRIMARY KEY,
  material_id TEXT NOT NULL REFERENCES local_materials(id),
  source_path TEXT NOT NULL,
  square_crop_path TEXT NOT NULL,
  crop_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
