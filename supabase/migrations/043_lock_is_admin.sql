-- 043_lock_is_admin.sql
-- SEC-02: no explicit policy prevented a user from flipping their own
-- `is_admin` flag via any UPDATE statement on their user row. Even an
-- RLS-allowed "update your own profile" operation could smuggle in
-- `is_admin = true`.
--
-- Belt-and-suspenders fix: a BEFORE UPDATE trigger that rejects any change
-- to `is_admin` unless the caller is an existing admin.

-- Helper: does an admin already exist with this uid?
CREATE OR REPLACE FUNCTION is_app_admin_uid(p_uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = p_uid AND is_admin = true
  );
$$;

GRANT EXECUTE ON FUNCTION is_app_admin_uid(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION prevent_is_admin_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    -- auth.uid() returns NULL for service-role / migration contexts, so we
    -- let those through (seeding, admin tooling with service key). A regular
    -- authenticated user flipping the flag on themselves or anyone else must
    -- already be an admin.
    IF auth.uid() IS NOT NULL AND NOT is_app_admin_uid(auth.uid()) THEN
      RAISE EXCEPTION 'Only admins can modify is_admin'
        USING HINT = 'Contact an existing admin to grant this role.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_is_admin_guard ON users;
CREATE TRIGGER users_is_admin_guard
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION prevent_is_admin_self_update();

-- Lightweight audit log so we can see who promoted whom and when.
CREATE TABLE IF NOT EXISTS admin_role_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  old_is_admin boolean NOT NULL,
  new_is_admin boolean NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_role_audit_target
  ON admin_role_audit (target_user_id, changed_at DESC);

CREATE OR REPLACE FUNCTION log_is_admin_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    INSERT INTO admin_role_audit (target_user_id, actor_user_id, old_is_admin, new_is_admin)
      VALUES (NEW.id, auth.uid(), OLD.is_admin, NEW.is_admin);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_is_admin_audit ON users;
CREATE TRIGGER users_is_admin_audit
  AFTER UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION log_is_admin_change();

ALTER TABLE admin_role_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins_read_audit" ON admin_role_audit;
CREATE POLICY "admins_read_audit" ON admin_role_audit
  FOR SELECT USING (is_app_admin_uid(auth.uid()));
