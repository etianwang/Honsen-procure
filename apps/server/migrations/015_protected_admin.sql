-- Additive protection only: never creates, renames or resets an existing account.
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM users u WHERE u.username='admin' AND
    (NOT u.is_enabled OR u.deleted_at IS NOT NULL OR NOT EXISTS(
      SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='super_administrator'))) THEN
    RAISE EXCEPTION 'EXISTING_ADMIN_REQUIRES_AUTHORIZED_REVIEW';
  END IF;
END $$;
CREATE FUNCTION protect_super_administrators() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE target uuid; remaining bigint;
BEGIN
  -- Every relevant change takes the same transaction lock, including role grants.
  PERFORM pg_advisory_xact_lock(hashtextextended('honsen:super-admin-protection', 0));
  IF TG_TABLE_NAME = 'users' THEN
    IF TG_OP = 'INSERT' THEN RETURN NEW; END IF;
    IF OLD.username = 'admin' AND (TG_OP = 'DELETE' OR
      NEW.id IS DISTINCT FROM OLD.id OR NEW.username IS DISTINCT FROM OLD.username OR
      NEW.business_code IS DISTINCT FROM OLD.business_code OR NOT NEW.is_enabled OR
      NEW.deleted_at IS NOT NULL) THEN
      RAISE EXCEPTION 'PROTECTED_ADMIN' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.is_enabled AND NEW.deleted_at IS NULL THEN RETURN NEW; END IF;
    IF NOT OLD.is_enabled OR OLD.deleted_at IS NOT NULL THEN
      IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;
    target := OLD.id;
    IF NOT EXISTS(SELECT 1 FROM user_roles WHERE user_id=target AND role='super_administrator') THEN
      IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;
  ELSE
    IF TG_OP = 'INSERT' THEN RETURN NEW; END IF;
    IF OLD.role <> 'super_administrator' THEN
      IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.user_id=OLD.user_id AND NEW.role=OLD.role THEN RETURN NEW; END IF;
    target := OLD.user_id;
    IF EXISTS(SELECT 1 FROM users WHERE id=target AND username='admin') THEN
      RAISE EXCEPTION 'PROTECTED_ADMIN' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM users WHERE id=target AND is_enabled AND deleted_at IS NULL) THEN
      IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;
  END IF;
  SELECT count(*) INTO remaining FROM users u JOIN user_roles r ON r.user_id=u.id
    WHERE r.role='super_administrator' AND u.is_enabled AND u.deleted_at IS NULL;
  -- Preserve the existing two-admin safety policy once two have been provisioned;
  -- the initial single bootstrap administrator can never be removed either.
  IF remaining <= 2 THEN
    RAISE EXCEPTION 'LAST_SUPER_ADMINISTRATORS' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION protect_super_administrators() FROM PUBLIC;
CREATE TRIGGER protected_admin_user BEFORE INSERT OR UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION protect_super_administrators();
CREATE TRIGGER protected_admin_role BEFORE INSERT OR UPDATE OR DELETE ON user_roles
  FOR EACH ROW EXECUTE FUNCTION protect_super_administrators();

CREATE FUNCTION deny_administrator_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'ADMINISTRATOR_TRUNCATE_FORBIDDEN' USING ERRCODE='23514'; END $$;
REVOKE ALL ON FUNCTION deny_administrator_truncate() FROM PUBLIC;
CREATE TRIGGER protected_admin_user_truncate BEFORE TRUNCATE ON users
  FOR EACH STATEMENT EXECUTE FUNCTION deny_administrator_truncate();
CREATE TRIGGER protected_admin_role_truncate BEFORE TRUNCATE ON user_roles
  FOR EACH STATEMENT EXECUTE FUNCTION deny_administrator_truncate();

CREATE FUNCTION audit_administrator_governance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid;
BEGIN
  IF TG_TABLE_NAME='user_roles' THEN
    target := CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END;
  ELSE
    target := CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
    IF TG_OP='UPDATE' AND OLD.username <> 'admin' AND NOT EXISTS(
      SELECT 1 FROM user_roles WHERE user_id=target AND role='super_administrator') THEN RETURN NULL; END IF;
    -- Password, login counters and session operations have their own application audit.
    IF TG_OP='UPDATE' AND NEW.username=OLD.username AND NEW.is_enabled=OLD.is_enabled
       AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at
       AND NEW.business_code=OLD.business_code THEN RETURN NULL; END IF;
  END IF;
  INSERT INTO audit_entries(id,entity_type,entity_id,action,reason)
    VALUES(gen_random_uuid(),'user',target,'administrator_governance',
      json_build_object('databaseRole',session_user,'table',TG_TABLE_NAME,'operation',TG_OP)::text);
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION audit_administrator_governance() FROM PUBLIC;
CREATE TRIGGER audit_admin_roles AFTER INSERT OR UPDATE OR DELETE ON user_roles
  FOR EACH ROW EXECUTE FUNCTION audit_administrator_governance();
CREATE TRIGGER audit_admin_status AFTER UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION audit_administrator_governance();
