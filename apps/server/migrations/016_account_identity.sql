-- Preserve every legacy username byte and historical user UUID.
LOCK TABLE users IN ACCESS EXCLUSIVE MODE;
DO $$
DECLARE collisions bigint;
BEGIN
  SELECT count(*) INTO collisions FROM (
    SELECT translate(username,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')
    FROM users GROUP BY 1 HAVING count(*) > 1
  ) duplicates;
  IF collisions > 0 THEN
    RAISE EXCEPTION 'USERNAME_CASE_COLLISION count=%', collisions USING ERRCODE='23514';
  END IF;
END $$;
ALTER TABLE users ADD COLUMN display_name TEXT
  CHECK (display_name IS NULL OR (length(btrim(display_name)) BETWEEN 1 AND 100));
CREATE UNIQUE INDEX users_username_ascii_fold_unique
  ON users (translate(username,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'));
CREATE FUNCTION prevent_username_rename() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.username IS DISTINCT FROM OLD.username THEN
    RAISE EXCEPTION 'IMMUTABLE_USERNAME' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION prevent_username_rename() FROM PUBLIC;
CREATE TRIGGER immutable_account_username BEFORE UPDATE OF username ON users
  FOR EACH ROW EXECUTE FUNCTION prevent_username_rename();
