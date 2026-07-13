-- Migration 122 verification — run in the Supabase SQL editor. Expect 4 rows, all PASS.
--
-- SELF-CONTAINED: performs the same two statements as migration 122 inside a
-- BEGIN ... ROLLBACK, then verifies the end-state and rolls everything back — so
-- running it does NOT apply the migration. Production is untouched.

BEGIN;

-- Apply 122 in-transaction (rolled back at the end).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

CREATE OR REPLACE FUNCTION pg_temp._notif_realtime_verify()
RETURNS TABLE(check_name text, result text)
LANGUAGE plpgsql AS $$
DECLARE
  v_relid oid := 'public.notifications'::regclass;
  v_bad int;
  v_sel int;
  v_ri text;
BEGIN
  -- 1. notifications is now in the supabase_realtime publication
  check_name := '1. notifications in supabase_realtime publication';
  result := CASE WHEN EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN 'PASS' ELSE 'FAIL (not published)' END;
  RETURN NEXT;

  -- 2. RLS still ENABLED (publishing must not have loosened anything)
  check_name := '2. RLS still ENABLED on notifications';
  result := CASE WHEN (SELECT relrowsecurity FROM pg_class WHERE oid = v_relid)
                 THEN 'PASS' ELSE 'FAIL (RLS disabled!)' END;
  RETURN NEXT;

  -- 3. every SELECT policy is still recipient-scoped — users can only receive
  --    their OWN notifications. Flags any SELECT policy whose USING qual is null,
  --    literally 'true', or missing recipient_id / auth.uid().
  SELECT count(*) INTO v_sel
    FROM pg_policies
    WHERE schemaname='public' AND tablename='notifications' AND cmd='SELECT';
  SELECT count(*) INTO v_bad
    FROM pg_policies
    WHERE schemaname='public' AND tablename='notifications' AND cmd='SELECT'
      AND (qual IS NULL OR qual = 'true'
           OR qual NOT LIKE '%recipient_id%' OR qual NOT LIKE '%auth.uid()%');
  check_name := '3. all SELECT policies still recipient_id = auth.uid() (own-only)';
  result := CASE WHEN v_sel > 0 AND v_bad = 0
                 THEN 'PASS (' || v_sel || ' recipient-scoped SELECT policies)'
                 ELSE 'FAIL (' || v_bad || ' of ' || v_sel || ' SELECT policies not recipient-scoped)' END;
  RETURN NEXT;

  -- 4. REPLICA IDENTITY FULL (relreplident = 'f'). Cast the internal "char"
  -- column to text so string concatenation has an unambiguous operator.
  SELECT relreplident::text INTO v_ri FROM pg_class WHERE oid = v_relid;
  check_name := '4. notifications REPLICA IDENTITY = FULL';
  result := CASE WHEN v_ri = 'f' THEN 'PASS' ELSE 'FAIL (relreplident=' || v_ri || ')' END;
  RETURN NEXT;

  RETURN;
END $$;

SELECT * FROM pg_temp._notif_realtime_verify();

ROLLBACK;
