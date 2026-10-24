-- The installation-wide Pull cursor cannot identify which account owned prior pages.
-- Preserve it as historical evidence; each account safely replays from zero.
CREATE TABLE local_sync_account_pull_state (
  account_id TEXT PRIMARY KEY REFERENCES local_accounts(id),
  last_pull_cursor TEXT NOT NULL DEFAULT '0' CHECK (last_pull_cursor GLOB '[0-9]*'),
  last_success_at INTEGER
);
