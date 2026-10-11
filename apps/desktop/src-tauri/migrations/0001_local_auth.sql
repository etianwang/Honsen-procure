CREATE TABLE local_accounts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  roles_json TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  requires_password_change INTEGER NOT NULL CHECK (requires_password_change IN (0, 1)),
  cached_verified_at INTEGER NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER
);

CREATE TABLE local_session (
  user_id TEXT PRIMARY KEY REFERENCES local_accounts(id),
  started_at INTEGER NOT NULL,
  last_active_at INTEGER NOT NULL
);
