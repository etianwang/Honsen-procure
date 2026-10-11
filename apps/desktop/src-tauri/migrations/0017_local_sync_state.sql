CREATE TABLE local_sync_state (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  installation_id TEXT NOT NULL UNIQUE,
  last_pull_cursor TEXT NOT NULL DEFAULT '0' CHECK (last_pull_cursor GLOB '[0-9]*'),
  last_success_at INTEGER,
  last_authenticated_user_id TEXT
);

INSERT INTO local_sync_state (singleton, installation_id)
VALUES (1, lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))));
