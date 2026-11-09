CREATE TABLE local_sync_authorization_replay (
  account_id TEXT PRIMARY KEY REFERENCES local_accounts(id),
  authorization_version TEXT NOT NULL,
  replay_cursor TEXT NOT NULL DEFAULT '0',
  replay_until TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
);
