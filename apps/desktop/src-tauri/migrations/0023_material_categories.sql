CREATE TABLE local_material_categories (
  id TEXT PRIMARY KEY,
  business_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  is_active INTEGER NOT NULL CHECK (is_active IN (0, 1)),
  version INTEGER NOT NULL CHECK (version >= 1),
  deleted_at INTEGER
);

ALTER TABLE local_materials ADD COLUMN category_id TEXT
  REFERENCES local_material_categories(id);

ALTER TABLE local_suppliers ADD COLUMN country_id TEXT
  REFERENCES local_countries(id);
