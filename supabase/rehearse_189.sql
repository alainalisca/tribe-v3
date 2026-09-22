-- rehearse_189.sql — dry run of 189. Applies nothing.
--
-- Run AFTER 188 (applied 2026-09-22). A1 checks that, because 189 comments a
-- column 188 creates and would fail on a database where 188 had not run.
--
-- Same construction as rehearse_188.sql and for the same reason: no
-- BEGIN/ROLLBACK, because the ROLLBACK destroys the results before they can be
-- read and the editor shows the last statement's output. The unwind is a
-- plpgsql subtransaction ended by a deliberate RAISE; plpgsql variables are
-- not transactional, so the verdicts survive it. A13 asserts the unwind
-- worked, which is evidence rather than an assurance.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- THE ONE THING WORTH REHEARSING HERE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 189's load-bearing property is ONE TOKEN PER PERSON, and the way to get it
-- wrong is quiet. Written as
--
--     UPDATE t SET unsub_token = (SELECT replace(gen_random_uuid()::text,'-',''))
--
-- the uncorrelated sub-select becomes an InitPlan, evaluated ONCE for the
-- whole statement, and every row ends up sharing a token. The migration would
-- succeed, the column would be fully populated, and one person clicking
-- unsubscribe would resolve to somebody else entirely -- with nothing visible
-- until the wrong person stopped receiving mail.
--
-- A2 proves 189's actual expression produces a distinct value per row. A3
-- proves the guard REJECTS a table where they are shared, so A7 passing on the
-- real data is evidence the check works rather than evidence it is quiet.
-- A9 proves the DEFAULT is per-row too, by inserting three rows rather than by
-- reading pg_attrdef and trusting the expression looks right.
--
-- A2/A3/A9 deliberately do NOT gate on the InitPlan form failing. Whether the
-- planner caches it is a property of the planner, and an arm that aborts the
-- rehearsal because a version of Postgres optimised differently would be a
-- false alarm about the one thing this file exists to check.

CREATE TEMP TABLE reh_189 (seq int, arm text, verdict text, detail text);

DO $reh$
DECLARE
  v_res     text[] := '{}';
  v_seq     int    := 0;
  v_rows    bigint;
  v_filled  bigint;
  v_distinct bigint;
  v_ok      boolean;
  v_detail  text;
BEGIN
  -- ── A1: baseline. 188 applied, 189 not. NON-VACUITY: rows exist to check. ─
  SELECT count(*) INTO v_rows FROM public.notification_preferences;
  v_seq := v_seq + 1;
  v_res := v_res || format('%s|A1 baseline: 188 applied, 189 not, and there are rows to check|%s|one_off_sends=%s, email_unsubscribed_at=%s, unsub_token=%s, preference rows=%s',
    v_seq,
    CASE WHEN to_regclass('public.one_off_sends') IS NOT NULL
          AND EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema='public' AND table_name='notification_preferences'
                         AND column_name='email_unsubscribed_at')
          AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_schema='public' AND table_name='notification_preferences'
                             AND column_name='unsub_token')
          AND v_rows > 0
         THEN 'PASS' ELSE 'FAIL' END,
    coalesce(to_regclass('public.one_off_sends')::text, 'ABSENT -- run 188 first'),
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema='public' AND table_name='notification_preferences'
                         AND column_name='email_unsubscribed_at') THEN 'present' ELSE 'ABSENT' END,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema='public' AND table_name='notification_preferences'
                         AND column_name='unsub_token') THEN 'ALREADY PRESENT' ELSE 'absent' END,
    v_rows);

  -- ── A2: 189's backfill expression is per-row. ───────────────────────────
  CREATE TEMP TABLE reh_tok (id int, tok text);
  INSERT INTO reh_tok (id) SELECT generate_series(1, 50);
  UPDATE reh_tok SET tok = replace(gen_random_uuid()::text, '-', '');
  SELECT count(*), count(tok), count(DISTINCT tok) INTO v_rows, v_filled, v_distinct FROM reh_tok;
  v_seq := v_seq + 1;
  v_res := v_res || format('%s|A2 the backfill expression gives every row its OWN token|%s|50 rows -> %s filled, %s distinct',
    v_seq, CASE WHEN v_rows = 50 AND v_filled = 50 AND v_distinct = 50 THEN 'PASS' ELSE 'FAIL' END,
    v_filled, v_distinct);

  -- ── A3: MUTATION. Shared tokens must be REJECTED by the guard's test. ───
  UPDATE reh_tok SET tok = 'all-the-same';
  SELECT count(*), count(DISTINCT tok) INTO v_rows, v_distinct FROM reh_tok;
  v_ok := (v_distinct = v_rows);
  v_seq := v_seq + 1;
  v_res := v_res || format('%s|A3 MUTATION: 50 rows sharing one token are REJECTED|%s|distinct=%s of %s, guard predicate returned %s',
    v_seq, CASE WHEN v_ok IS NOT TRUE THEN 'PASS' ELSE 'FAIL' END, v_distinct, v_rows, v_ok);

  -- ══ THE SUBTRANSACTION. Everything below is discarded at its end. ═══════
  BEGIN
    -- ── A4: 189's DDL, verbatim. ──────────────────────────────────────────
    ALTER TABLE public.notification_preferences
      ADD COLUMN IF NOT EXISTS unsub_token text;

    ALTER TABLE public.notification_preferences
      ALTER COLUMN unsub_token SET DEFAULT replace(gen_random_uuid()::text, '-', '');

    UPDATE public.notification_preferences
       SET unsub_token = replace(gen_random_uuid()::text, '-', '')
     WHERE unsub_token IS NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS notification_preferences_unsub_token_key
      ON public.notification_preferences (unsub_token);

    COMMENT ON COLUMN public.notification_preferences.unsub_token IS
      'Stable per-user unsubscribe credential, used by EVERY email this app sends. '
      'A bearer token, not a signature: it needs no secret configured, and its '
      'only authority is to stop this person''s email, which they can re-enable in '
      'settings. Resolved by /api/unsubscribe, which sets email_unsubscribed_at.';

    COMMENT ON COLUMN public.one_off_sends.unsub_token IS
      'SUPERSEDED BY notification_preferences.unsub_token (migration 189) and never '
      'written in production. A per-campaign token cannot serve recurring email, '
      'and two unsubscribe mechanisms means one of them going stale in somebody''s '
      'inbox. Left in place rather than dropped: additive first, destructive last.';

    v_seq := v_seq + 1;
    v_res := v_res || format('%s|A4 189 DDL applied inside the subtransaction|PASS|column added, backfilled, indexed, commented', v_seq);

    -- ── A5: the column, and its type. ─────────────────────────────────────
    v_seq := v_seq + 1;
    v_res := v_res || format('%s|A5 unsub_token exists as text|%s|type=%s',
      v_seq,
      CASE WHEN (SELECT data_type FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='notification_preferences'
                    AND column_name='unsub_token') = 'text' THEN 'PASS' ELSE 'FAIL' END,
      coalesce((SELECT data_type FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='notification_preferences'
                   AND column_name='unsub_token'), 'absent'));

    SELECT count(*), count(unsub_token), count(DISTINCT unsub_token)
      INTO v_rows, v_filled, v_distinct
      FROM public.notification_preferences;

    -- ── A6: nobody is left without a token, i.e. without a way out. ───────
    v_seq := v_seq + 1;
    v_res := v_res || format('%s|A6 every row got a token, so no email carries a dead link|%s|%s of %s rows filled',
      v_seq, CASE WHEN v_filled = v_rows THEN 'PASS' ELSE 'FAIL' END, v_filled, v_rows);

    -- ── A7: SUCCESS ARM. One token per person, on the REAL data. ──────────
    v_seq := v_seq + 1;
    v_res := v_res || format('%s|A7 SUCCESS ARM: one token per person on the live data|%s|%s rows, %s distinct tokens',
      v_seq, CASE WHEN v_distinct = v_rows THEN 'PASS' ELSE 'FAIL' END, v_rows, v_distinct);

    -- ── A8: the unique index, which is what keeps it true afterwards. ─────
    v_seq := v_seq + 1;
    v_res := v_res || format('%s|A8 the UNIQUE index exists|%s|%s',
      v_seq,
      CASE WHEN EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
                         AND indexname='notification_preferences_unsub_token_key')
           THEN 'PASS' ELSE 'FAIL' END,
      coalesce((SELECT indexdef FROM pg_indexes WHERE schemaname='public'
                 AND indexname='notification_preferences_unsub_token_key'), '(absent)'));

    -- ── A9: the DEFAULT is per-row. Proved by INSERTING, not by reading the
    --       expression and judging that it looks right -- 150's signup trigger
    --       creates rows without supplying a token, and a default evaluated
    --       once would give every new signup the same link.
    CREATE TEMP TABLE reh_def (id int, tok text DEFAULT replace(gen_random_uuid()::text, '-', ''));
    INSERT INTO reh_def (id) VALUES (1), (2), (3);
    SELECT count(DISTINCT tok) INTO v_distinct FROM reh_def;
    v_seq := v_seq + 1;
    v_res := v_res || format('%s|A9 the DEFAULT gives each new row its own token|%s|3 inserts -> %s distinct, installed default: %s',
      v_seq, CASE WHEN v_distinct = 3 THEN 'PASS' ELSE 'FAIL' END, v_distinct,
      coalesce((SELECT pg_get_expr(d.adbin, d.adrelid)
                  FROM pg_attrdef d JOIN pg_attribute a
                    ON a.attrelid = d.adrelid AND a.attnum = d.adnum
                 WHERE d.adrelid = 'public.notification_preferences'::regclass
                   AND a.attname = 'unsub_token'), '(none)'));

    -- ── A10: the cross-migration comment. It is the only part of 189 that
    --        touches 188's table, so it is the part that fails if 188 is not
    --        there -- and it would fail loudly rather than quietly.
    v_seq := v_seq + 1;
    v_res := v_res || format('%s|A10 188''s superseded column is commented as such|%s|%s',
      v_seq,
      CASE WHEN (SELECT col_description(c.oid, a.attnum) FROM pg_class c
                   JOIN pg_attribute a ON a.attrelid = c.oid
                  WHERE c.oid = 'public.one_off_sends'::regclass AND a.attname = 'unsub_token')
                LIKE 'SUPERSEDED%' THEN 'PASS' ELSE 'FAIL' END,
      coalesce(left((SELECT col_description(c.oid, a.attnum) FROM pg_class c
                       JOIN pg_attribute a ON a.attrelid = c.oid
                      WHERE c.oid = 'public.one_off_sends'::regclass AND a.attname = 'unsub_token'), 45),
               '(none)'));

    -- ── A11: 189's GUARD BODY VERBATIM, wrapper stripped. Must NOT raise. ─
    v_detail := 'did not raise';
    BEGIN
      SELECT count(*), count(unsub_token), count(DISTINCT unsub_token)
        INTO v_rows, v_filled, v_distinct
        FROM public.notification_preferences;

      IF v_rows = 0 THEN
        RAISE EXCEPTION '189 ABORTED: notification_preferences is empty. 151 backfilled a row per auth user, so the checks below would pass over nothing.';
      END IF;

      IF v_filled <> v_rows THEN
        RAISE EXCEPTION '189 ABORTED: % of % rows have no unsub_token, so those users would get an email with a dead unsubscribe link.', v_rows - v_filled, v_rows;
      END IF;

      IF v_distinct <> v_rows THEN
        RAISE EXCEPTION '189 ABORTED: % rows share % distinct tokens. One token per person, or an unsubscribe click resolves to the wrong user.', v_rows, v_distinct;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_indexes
                      WHERE schemaname='public'
                        AND indexname='notification_preferences_unsub_token_key') THEN
        RAISE EXCEPTION '189 ABORTED: the unique index on unsub_token is missing.';
      END IF;

      IF (SELECT pg_get_expr(d.adbin, d.adrelid)
            FROM pg_attrdef d
            JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
           WHERE d.adrelid = 'public.notification_preferences'::regclass
             AND a.attname = 'unsub_token') IS NULL THEN
        RAISE EXCEPTION '189 ABORTED: unsub_token has no DEFAULT, so rows created by 150''s signup trigger would have none.';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_detail := SQLSTATE || ': ' || SQLERRM;
    END;
    v_seq := v_seq + 1;
    v_res := v_res || format('%s|A11 189''s OWN GUARD BODY runs green on this database|%s|%s',
      v_seq, CASE WHEN v_detail = 'did not raise' THEN 'PASS' ELSE 'FAIL' END, v_detail);

    -- ── A12: self-recording. ──────────────────────────────────────────────
    INSERT INTO public.migrations_applied (migration, note)
    VALUES ('189_stable_unsub_token', 'rehearsal — rolled back')
    ON CONFLICT (migration) DO NOTHING;
    v_seq := v_seq + 1;
    v_res := v_res || format('%s|A12 189 records itself in migrations_applied|%s|rows for 189=%s',
      v_seq,
      CASE WHEN EXISTS (SELECT 1 FROM public.migrations_applied WHERE migration='189_stable_unsub_token')
           THEN 'PASS' ELSE 'FAIL' END,
      (SELECT count(*) FROM public.migrations_applied WHERE migration='189_stable_unsub_token'));

    RAISE EXCEPTION 'REHEARSAL_UNWIND';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'REHEARSAL_UNWIND' THEN
      v_seq := v_seq + 1;
      v_res := v_res || format('%s|UNEXPECTED ERROR — the rehearsal did not finish|FAIL|%s: %s',
        v_seq, SQLSTATE, SQLERRM);
    END IF;
  END;

  -- ── A13: proof the unwind left nothing behind. 188's objects must still be
  --        here (they were applied for real); 189's must be gone.
  v_seq := v_seq + 1;
  v_res := v_res || format('%s|A13 the unwind discarded 189 and left 188 alone|%s|unsub_token=%s, index=%s, migrations_applied 189=%s, one_off_sends=%s',
    v_seq,
    CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns
                           WHERE table_schema='public' AND table_name='notification_preferences'
                             AND column_name='unsub_token')
          AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
                           AND indexname='notification_preferences_unsub_token_key')
          AND NOT EXISTS (SELECT 1 FROM public.migrations_applied WHERE migration='189_stable_unsub_token')
          AND to_regclass('public.one_off_sends') IS NOT NULL
         THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema='public' AND table_name='notification_preferences'
                         AND column_name='unsub_token') THEN 'STILL PRESENT' ELSE 'gone' END,
    CASE WHEN EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
                       AND indexname='notification_preferences_unsub_token_key') THEN 'STILL PRESENT' ELSE 'gone' END,
    (SELECT count(*) FROM public.migrations_applied WHERE migration='189_stable_unsub_token'),
    coalesce(to_regclass('public.one_off_sends')::text, 'GONE -- 188 was damaged'));

  INSERT INTO reh_189 (seq, arm, verdict, detail)
  SELECT split_part(r,'|',1)::int, split_part(r,'|',2), split_part(r,'|',3), split_part(r,'|',4)
    FROM unnest(v_res) AS r;
END
$reh$;

DROP TABLE IF EXISTS reh_tok;
DROP TABLE IF EXISTS reh_def;

-- The one result set. Every row must read PASS. 13 of 13.
SELECT seq, arm, verdict, detail FROM reh_189 ORDER BY seq;
