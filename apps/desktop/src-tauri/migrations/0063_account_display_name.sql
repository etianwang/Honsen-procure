-- Profile-only metadata. Existing login names, UUIDs and authorization remain unchanged.
ALTER TABLE local_accounts ADD COLUMN display_name TEXT;
