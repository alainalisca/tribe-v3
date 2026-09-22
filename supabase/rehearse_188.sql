-- rehearse_188.sql — dry run of the CORRECTED 188. Applies nothing.
--
-- Written 2026-09-22, after 188 was applied without one and failed in
-- production at its own guard with 42883. A rehearsal was guaranteed to find
-- that fault, because the guard is the thing that executes.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY THERE IS NO BEGIN/ROLLBACK, WHICH IS A DEVIATION AND DELIBERATE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- BEGIN; ...; SELECT results; ROLLBACK; does not work here. The ROLLBACK
-- destroys the results before they can be read, and the editor shows the last
-- statement's output, which for that shape is nothing at all.
--
-- So the unwind happens one level in: every mutation runs inside a plpgsql
-- BEGIN ... EXCEPTION block, which is a SUBTRANSACTION. A deliberate RAISE at
-- the end of it rolls back all the DDL. plpgsql variables are NOT
-- transactional, so the verdicts collected before the RAISE survive it, and
-- are written to a temp table created BEFORE the subtransaction -- scaffolding
-- that outlives what it observes, which an earlier rehearsal got wrong by
-- INSERTing its findings inside the block it then rolled back, leaving NULL
-- that rendered as a FAIL and said nothing either way.
--
-- The outer script is still atomic: as of 2026-09-22 we know a pasted
-- multi-statement script runs in ONE implicit transaction. Nothing here
-- depends on that, which is the point -- the unwind is explicit.
--
-- ARM A13 asserts 188's objects are GONE after the unwind. That is the direct
-- evidence that this rehearsal left nothing behind, rather than an assurance.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT EACH ARM IS FOR
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A1  baseline, and NON-VACUITY: the catalog is readable at all.
-- A2  THE BUG: the UNCAST comparison must raise 42883. Without this arm,
--     A3 passing is not evidence the cast fixed anything.
-- A4  apply 188's DDL.
-- A5  the table exists with the shape 188 declares.
-- A6  SUCCESS ARM: the corrected key check PASSES on a table that has the
--     right key. Failure arms prove a guard CAN fire; only this proves it
--     will not fire on correct input, which is the thing the person about to
--     run the migration actually wants to know.
-- A7  MUTATION: the same extraction against a table with the WRONG key must
--     reject it. A detector that reads nothing is quiet about everything.
-- A12 runs 188's guard body VERBATIM (DO wrapper stripped, DECLAREs hoisted)
--     and asserts it does not raise. An earlier rehearsal spliced a migration
--     around its guard and reported 19 green arms over a body that aborted on
--     its first one.

CREATE TEMP TABLE reh_188 (seq int, arm text, verdict text, detail text);

DO $reh$
DECLARE
  v_res      text[] := '{}';
  v_seq      int    := 0;
  v_prefs    bigint;
  v_cols     int;
  v_key      text[];
  v_ok       boolean;
  v_errcode  text;
  v_detail   text;
BEGIN
  -- ── Outside the subtransaction: baseline, nothing mutated yet. ──────────
  SELECT count(*) INTO v_prefs FROM public.notification_preferences;
  v_seq := v_seq + 1;
  v_res := v_res || format('%s|A1 baseline: 188 has not been applied|%s|one_off_sends=%s, email_unsubscribed_at=%s, notification_preferences rows=%s',
    v_seq,
    CASE WHEN to_regclass('public.one_off_sends') IS NULL
          AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_schema='public' AND table_name='notification_preferences'
                             AND column_name='email_unsubscribed_at')
          AND v_prefs > 0
         THEN 'PASS' ELSE 'FAIL' END,
    coalesce(to_regclass('public.one_off_sends')::text, 'absent'),
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema='public' AND table_name='notification_preferences'
                         AND column_name='email_unsubscribed_at') THEN 'present' ELSE 'absent' END,
    v_prefs);

  -- A2/A3 need a table with a known key to compare against. pg_temp, so it
  -- disappears with the session whatever else happens.
  CREATE TEMP TABLE reh_probe_right (campaign text, user_id uuid, channel text,
                                     PRIMARY KEY (campaign, user_id, channel));
  CREATE TEMP TABLE reh_probe_wrong (campaign text, user_id uuid, channel text,
                                     PRIMARY KEY (campaign, user_id));

  -- ── A2: THE BUG. The uncast comparison must raise 42883. ────────────────
  BEGIN
    SELECT (SELECT array_agg(a.attname ORDER BY a.attname)
              FROM pg_constraint c
              JOIN unnest(c.conkey) k ON true
              JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
             WHERE c.conrelid = 'pg_temp.reh_probe_right'::regclass AND c.contype='p')
           = ARRAY['campaign','channel','user_id']
      INTO v_ok;
    v_errcode := 'none';
  EXCEPTION WHEN OTHERS THEN
    v_errcode := SQLSTATE;
  END;
  v_seq := v_seq + 1;
  v_res := v_res || format('%s|A2 the uncast comparison raises 42883 (the fault 188 hit)|%s|SQLSTATE=%s',
    v_seq, CASE WHEN v_errcode = '42883' THEN 'PASS' ELSE 'FAIL' END, v_errcode);

  -- ── A3: THE FIX. The cast comparison must execute. ──────────────────────
  BEGIN
    SELECT (SELECT array_agg(a.attname::text ORDER BY a.attname::text)
              FROM pg_constraint c
              JOIN unnest(c.conkey) k ON true
              JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
             WHERE c.conrelid = 'pg_temp.reh_probe_right'::regclass AND c.contype='p')
           = ARRAY['campaign','channel','user_id']::text[]
      INTO v_ok;
    v_errcode := 'none';
  EXCEPTION WHEN OTHERS THEN
    v_errcode := SQLSTATE; v_ok := NULL;
  END;
  v_seq := v_seq + 1;
  v_res := v_res || format('%s|A3 the ::text comparison executes and is TRUE for the right key|%s|SQLSTATE=%s, result=%s',
    v_seq, CASE WHEN v_errcode='none' AND v_ok THEN 'PASS' ELSE 'FAIL' END, v_errcode, coalesce(v_ok::text,'null'));

  -- ── A7 (run early, it needs no 188 state): MUTATION. Wrong key rejected. ─
  SELECT (SELECT array_agg(a.attname::text ORDER BY a.attname::text)
            FROM pg_constraint c
            JOIN unnest(c.conkey) k ON true
            JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
           WHERE c.conrelid = 'pg_temp.reh_probe_wrong'::regclass AND c.contype='p')
         = ARRAY['campaign','channel','user_id']::text[]
    INTO v_ok;
  v_seq := v_seq + 1;
  v_res := v_res || format('%s|A7 MUTATION: a table keyed (campaign,user_id) is REJECTED|%s|comparison returned %s, saw key: %s',
    v_seq, CASE WHEN v_ok IS NOT TRUE THEN 'PASS' ELSE 'FAIL' END, coalesce(v_ok::text,'null'),
    (SELECT string_agg(a.attname::text, ',' ORDER BY a.attname::text)
       FROM pg_constraint c JOIN unnest(c.conkey) k ON true
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
      WHERE c.conrelid = 'pg_temp.reh_probe_wrong'::regclass AND c.contype='p'));

  -- ══ THE SUBTRANSACTION. Everything below is rolled back at its end. ═════
  BEGIN
    -- ── A4: 188's DDL, verbatim. ──────────────────────────────────────────
    ALTER TABLE public.notification_preferences
      ADD COLUMN IF NOT EXISTS email_unsubscribed_at timestamptz;

    CREATE TABLE IF NOT EXISTS public.one_off_sends (
      campaign    text        NOT NULL,
      user_id     uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      channel     text        NOT NULL CHECK (channel IN ('push', 'email')),
      claimed_at  timestamptz NOT NULL DEFAULT now(),
      outcome     text        NOT NULL DEFAULT 'claimed'
                              CHECK (outcome IN ('claimed', 'sent', 'failed', 'suppressed', 'dry_run')),
      detail      text,
      unsub_token text UNIQUE,
      PRIMARY KEY (campaign, user_id, channel)
    );

    ALTER TABLE public.one_off_sends ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE public.one_off_sends FROM PUBLIC;
    REVOKE ALL ON TABLE public.one_off_sends FROM anon;
    REVOKE ALL ON TABLE public.one_off_sends FROM authenticated;

    v_seq := v_seq + 1;
    v_res := v_res || format('%s|A4 188 DDL applied inside the subtransaction|PASS|one_off_sends=%s',
      v_seq, coalesce(to_regclass('public.one_off_sends')::text, 'absent'));

    -- ── A5: the shape 188 declares. ───────────────────────────────────────
    SELECT count(*) INTO v_cols FROM pg_attribute
     WHERE attrelid = 'public.one_off_sends'::regclass AND attnum > 0 AND NOT attisdropped;
    v_seq := v_seq + 1;
    v_res := v_res || format('%s|A5 the table has 7 columns|%s|saw %s: %s',
      v_seq, CASE WHEN v_cols = 7 THEN 'PASS' ELSE 'FAIL' END, v_cols,
      (SELECT string_agg(attname::text, ',' ORDER BY attnum) FROM pg_attribute
        WHERE attrelid='public.one_off_sends'::regclass AND attnum>0 AND NOT attisdropped));

    -- ── A6: SUCCESS ARM. The corrected key check passes on the real table. ─
    SELECT array_agg(a.attname::text ORDER BY a.attname::text) INTO v_key
      FROM pg_constraint c
      JOIN unnest(c.conkey) k ON true
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
     WHERE c.conrelid = 'public.one_off_sends'::regclass AND c.contype = 'p';
    v_seq := v_seq + 1;
    v_res := v_res || format('%s|A6 SUCCESS ARM: the key guard PASSES on the real table|%s|saw key: %s',
      v_seq,
      CASE WHEN v_key = ARRAY['campaign','channel','user_id']::text[] THEN 'PASS' ELSE 'FAIL' END,
      coalesce(array_to_string(v_key, ','), '(none)'));

    -- ── A8: RLS on, and NO policy, which is what denies every client role. ─
    v_seq := v_seq + 1;
    v_res := v_res || format('%s|A8 RLS enabled with zero policies|%s|relrowsecurity=%s, policies=%s',
      v_seq,
      CASE WHEN (SELECT relrowsecurity FROM pg_class WHERE oid='public.one_off_sends'::regclass)
            AND (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='one_off_sends') = 0
           THEN 'PASS' ELSE 'FAIL' END,
      (SELECT relrowsecurity FROM pg_class WHERE oid='public.one_off_sends'::regclass),
      (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='one_off_sends'));

    -- ── A9: client roles revoked. has_any_column_privilege, not
    --       has_table_privilege, which reads false while a role holds the
    --       privilege on a single column (migration 175's finding).
    v_seq := v_seq + 1;
    v_res := v_res || format('%s|A9 anon and authenticated cannot read or insert|%s|anon:sel=%s,ins=%s auth:sel=%s,ins=%s',
      v_seq,
      CASE WHEN NOT has_any_column_privilege('anon','public.one_off_sends','SELECT')
            AND NOT has_any_column_privilege('authenticated','public.one_off_sends','SELECT')
            AND NOT has_any_column_privilege('anon','public.one_off_sends','INSERT')
            AND NOT has_any_column_privilege('authenticated','public.one_off_sends','INSERT')
           THEN 'PASS' ELSE 'FAIL' END,
      has_any_column_privilege('anon','public.one_off_sends','SELECT'),
      has_any_column_privilege('anon','public.one_off_sends','INSERT'),
      has_any_column_privilege('authenticated','public.one_off_sends','SELECT'),
      has_any_column_privilege('authenticated','public.one_off_sends','INSERT'));

    -- ── A10: the opt-out column. ──────────────────────────────────────────
    v_seq := v_seq + 1;
    v_res := v_res || format('%s|A10 email_unsubscribed_at exists as timestamptz|%s|type=%s',
      v_seq,
      CASE WHEN (SELECT data_type FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='notification_preferences'
                    AND column_name='email_unsubscribed_at') = 'timestamp with time zone'
           THEN 'PASS' ELSE 'FAIL' END,
      coalesce((SELECT data_type FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='notification_preferences'
                   AND column_name='email_unsubscribed_at'), 'absent'));

    -- ── A11: self-recording. ──────────────────────────────────────────────
    INSERT INTO public.migrations_applied (migration, note)
    VALUES ('188_one_off_sends', 'rehearsal — rolled back')
    ON CONFLICT (migration) DO NOTHING;
    v_seq := v_seq + 1;
    v_res := v_res || format('%s|A11 188 records itself in migrations_applied|%s|rows for 188=%s',
      v_seq,
      CASE WHEN EXISTS (SELECT 1 FROM public.migrations_applied WHERE migration='188_one_off_sends')
           THEN 'PASS' ELSE 'FAIL' END,
      (SELECT count(*) FROM public.migrations_applied WHERE migration='188_one_off_sends'));

    -- ── A12: 188's GUARD BODY VERBATIM, wrapper stripped. It must NOT raise.
    v_detail := 'did not raise';
    BEGIN
      SELECT count(*) INTO v_cols
        FROM pg_attribute
       WHERE attrelid = 'public.one_off_sends'::regclass
         AND attnum > 0 AND NOT attisdropped;
      IF v_cols < 6 THEN
        RAISE EXCEPTION '188 ABORTED: read % columns on one_off_sends, so the checks below would pass over nothing.', v_cols;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema='public' AND table_name='notification_preferences'
                        AND column_name='email_unsubscribed_at') THEN
        RAISE EXCEPTION '188 ABORTED: email_unsubscribed_at was not added.';
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.one_off_sends'::regclass AND contype = 'p'
           AND (SELECT array_agg(a.attname::text ORDER BY a.attname::text)
                  FROM unnest(conkey) k JOIN pg_attribute a
                    ON a.attrelid = conrelid AND a.attnum = k)
               = ARRAY['campaign','channel','user_id']::text[]
      ) THEN
        RAISE EXCEPTION '188 ABORTED: one_off_sends has no (campaign, user_id, channel) primary key.';
      END IF;

      IF has_any_column_privilege('anon', 'public.one_off_sends', 'SELECT')
         OR has_any_column_privilege('authenticated', 'public.one_off_sends', 'SELECT')
         OR has_any_column_privilege('anon', 'public.one_off_sends', 'INSERT')
         OR has_any_column_privilege('authenticated', 'public.one_off_sends', 'INSERT') THEN
        RAISE EXCEPTION '188 ABORTED: a client role holds access to one_off_sends.';
      END IF;

      IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.one_off_sends'::regclass) THEN
        RAISE EXCEPTION '188 ABORTED: RLS is not enabled on one_off_sends.';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_detail := SQLSTATE || ': ' || SQLERRM;
    END;
    v_seq := v_seq + 1;
    v_res := v_res || format('%s|A12 188''s OWN GUARD BODY runs green on this database|%s|%s',
      v_seq, CASE WHEN v_detail = 'did not raise' THEN 'PASS' ELSE 'FAIL' END, v_detail);

    -- Unwind. Everything in this block is discarded; v_res is not.
    RAISE EXCEPTION 'REHEARSAL_UNWIND';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'REHEARSAL_UNWIND' THEN
      v_seq := v_seq + 1;
      v_res := v_res || format('%s|UNEXPECTED ERROR — the rehearsal did not finish|FAIL|%s: %s',
        v_seq, SQLSTATE, SQLERRM);
    END IF;
  END;

  -- ── A13: proof the unwind worked and this left nothing behind. ──────────
  v_seq := v_seq + 1;
  v_res := v_res || format('%s|A13 the unwind discarded everything|%s|one_off_sends=%s, email_unsubscribed_at=%s, migrations_applied rows for 188=%s',
    v_seq,
    CASE WHEN to_regclass('public.one_off_sends') IS NULL
          AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_schema='public' AND table_name='notification_preferences'
                             AND column_name='email_unsubscribed_at')
          AND NOT EXISTS (SELECT 1 FROM public.migrations_applied WHERE migration='188_one_off_sends')
         THEN 'PASS' ELSE 'FAIL' END,
    coalesce(to_regclass('public.one_off_sends')::text, 'absent'),
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema='public' AND table_name='notification_preferences'
                         AND column_name='email_unsubscribed_at') THEN 'present' ELSE 'absent' END,
    (SELECT count(*) FROM public.migrations_applied WHERE migration='188_one_off_sends'));

  INSERT INTO reh_188 (seq, arm, verdict, detail)
  SELECT split_part(r,'|',1)::int, split_part(r,'|',2), split_part(r,'|',3), split_part(r,'|',4)
    FROM unnest(v_res) AS r;
END
$reh$;

DROP TABLE IF EXISTS reh_probe_right;
DROP TABLE IF EXISTS reh_probe_wrong;

-- The one result set. Every row must read PASS. 13 of 13.
SELECT seq, arm, verdict, detail FROM reh_188 ORDER BY seq;
