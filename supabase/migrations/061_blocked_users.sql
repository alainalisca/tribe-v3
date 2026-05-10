-- 061_blocked_users.sql
-- Per-user block list. Backs the connections-block check in
-- lib/dal/connections.ts that previously referenced this table without
-- it existing — the bidirectional check silently no-op'd because the
-- query against the missing table errored and returned null.
--
-- Privacy model: a block is one-directional in storage (one row per
-- (blocker, blocked) pair) but enforced bidirectionally at check time
-- via the is_user_blocked() RPC. RLS keeps your block list visible
-- only to you so the *blocked* user can't discover that they were
-- blocked.

CREATE TABLE IF NOT EXISTS blocked_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  blocked_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- Optional private note for the blocker — never shown to the blocked user.
  reason text CHECK (reason IS NULL OR char_length(reason) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT no_self_block CHECK (user_id != blocked_user_id),
  CONSTRAINT unique_block UNIQUE (user_id, blocked_user_id)
);

CREATE INDEX IF NOT EXISTS idx_blocked_users_user
  ON blocked_users (user_id);

CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked
  ON blocked_users (blocked_user_id);

ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;

-- The blocker sees and manages their own list. The blocked user can NOT
-- see rows where they appear as blocked_user_id — by design, they
-- shouldn't be able to discover that they were blocked.
CREATE POLICY "Users see own block list"
  ON blocked_users FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users add to own block list"
  ON blocked_users FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users remove own blocks"
  ON blocked_users FOR DELETE
  USING (auth.uid() = user_id);

-- Bidirectional block check. Returns true if either user has blocked the
-- other. SECURITY DEFINER so the connection-request flow can use it
-- without leaking block-recipient information through RLS — the caller
-- only learns the boolean, not which side blocked which.
CREATE OR REPLACE FUNCTION is_user_blocked(p_user_a uuid, p_user_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM blocked_users
    WHERE (user_id = p_user_a AND blocked_user_id = p_user_b)
       OR (user_id = p_user_b AND blocked_user_id = p_user_a)
  );
$$;

REVOKE ALL ON FUNCTION is_user_blocked(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_user_blocked(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION is_user_blocked(uuid, uuid) TO service_role;

COMMENT ON TABLE blocked_users IS
  'Per-user block list. RLS scoped to the blocker. Use is_user_blocked() RPC for bidirectional checks that need to bypass RLS.';

COMMENT ON FUNCTION is_user_blocked IS
  'Returns true if either p_user_a or p_user_b has blocked the other. SECURITY DEFINER bypasses RLS so connection-request flow can check without leaking block direction.';
