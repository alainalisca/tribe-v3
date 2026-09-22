-- 188_one_off_sends.sql
--
-- Send-once bookkeeping for one-off outreach, and the first real email
-- opt-out this app has ever had.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY AN OPT-OUT COLUMN, WHEN email_enabled ALREADY EXISTS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Because email_enabled cannot answer the question "did this person ask us to
-- stop", and it never could.
--
--   * 037 created it as BOOLEAN DEFAULT false.
--   * 151 inserted a preferences row for EVERY auth user, supplying only
--     user_id, so every other column took its DB default.
--   * updateNotificationPreferences upserts {...DEFAULT_PREFERENCES, ...patch},
--     so anyone who changed any unrelated toggle also had false written.
--
-- Every false in that column is therefore a default, a backfill, or a
-- side-effect of saving something else. None of them is a choice. This is the
-- backfill-with-no-marker trap that onboarding_completed_at already cost us
-- once: a column whose value is uniform across the population carries no
-- information about the population.
--
-- It is also moot in practice, because THERE IS NO WAY TO OPT OUT. There is no
-- unsubscribe route, no List-Unsubscribe header on any email this app sends,
-- and no suppression table. A user who wants the mail to stop has nowhere to
-- say so.
--
-- email_unsubscribed_at is that place. NULL means the person has never been
-- asked and has never said; a timestamp means they clicked unsubscribe. It is
-- only ever written by a deliberate act, so unlike email_enabled its NULL and
-- its non-NULL both mean something.
--
-- IT DOES NOT REPLACE email_enabled. That column keeps its current job as the
-- consent record read by opt_in email types (see TYPE_META). This one is a
-- hard suppression checked by every channel-email send regardless of policy,
-- including a type declared 'required'. A receipt can outrank a preference; it
-- does not outrank "stop emailing me".
--
-- ═══════════════════════════════════════════════════════════════════════════
-- SEND ONCE: THE CLAIM IS TAKEN BEFORE THE SEND, NOT AFTER
-- ═══════════════════════════════════════════════════════════════════════════
--
-- one_off_sends has a PRIMARY KEY of (campaign, user_id, channel), so a second
-- attempt at the same person on the same campaign cannot insert. That is the
-- send-once guarantee, and it is held by the database rather than by a flag in
-- a script anybody can re-run.
--
-- The ORDER matters and the two options fail differently:
--
--   record after sending  -> a crash between the send and the record leaves no
--                            row, so a re-run sends again. Duplicates.
--   record before sending -> a crash after the claim leaves a claimed row, so
--                            a re-run skips. At worst someone is missed.
--
-- Claim first. Being missed is recoverable by a human deciding to retry a
-- named row; being messaged twice is not recoverable at all. The row is then
-- updated with the outcome, so 'claimed' left behind is exactly the set that
-- needs a look.

-- ── 1. The opt-out ─────────────────────────────────────────────────────────
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS email_unsubscribed_at timestamptz;

COMMENT ON COLUMN public.notification_preferences.email_unsubscribed_at IS
  'THE ONLY REAL EMAIL OPT-OUT. NULL means never asked and never said; a '
  'timestamp means the person clicked unsubscribe. Distinct from '
  'email_enabled, which is false for everyone because 037 defaulted it false '
  'and 151 backfilled a row for every user -- that column records consent for '
  'opt_in types and says nothing about anyone''s wishes. This one suppresses '
  'ALL email including types declared required: a receipt can outrank a '
  'preference, not a request to stop.';

-- notification_preferences is NOT under column-level grants (checked: zero
-- GRANT SELECT (col) statements name it), so the new column is readable by
-- existing table-level grants and needs none of its own. That is the opposite
-- of public.users, where 066/067 mean an ungranted column fails the WHOLE
-- PostgREST request.

-- ── 2. Send-once bookkeeping ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.one_off_sends (
  campaign    text        NOT NULL,
  user_id     uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  channel     text        NOT NULL CHECK (channel IN ('push', 'email')),
  claimed_at  timestamptz NOT NULL DEFAULT now(),
  outcome     text        NOT NULL DEFAULT 'claimed'
                          CHECK (outcome IN ('claimed', 'sent', 'failed', 'suppressed', 'dry_run')),
  detail      text,
  -- Single-use unsubscribe credential for the email channel. Random per send
  -- rather than an HMAC, so no new secret has to exist in the environment
  -- before anything can go out, and revoking one link revokes exactly one.
  unsub_token text UNIQUE,
  PRIMARY KEY (campaign, user_id, channel)
);

COMMENT ON TABLE public.one_off_sends IS
  'One row per (campaign, person, channel), claimed BEFORE the send. The '
  'primary key is the send-once guarantee: a re-run cannot insert, so it '
  'cannot message anyone twice. Rows left at outcome=claimed are sends that '
  'died mid-flight and are the set a human should look at.';

-- ── 3. Lock it down ────────────────────────────────────────────────────────
ALTER TABLE public.one_off_sends ENABLE ROW LEVEL SECURITY;

-- No policy is created on purpose. RLS with zero policies denies every row to
-- every non-superuser role, and service_role bypasses RLS entirely -- so the
-- sender works and nothing else can read who was messaged.

-- Supabase grants new public objects to anon and authenticated DIRECTLY.
-- REVOKE FROM PUBLIC does NOT reach those grants; each role must be named.
-- This trap has now been hit five times in this repo (T-SEC3 and after).
REVOKE ALL ON TABLE public.one_off_sends FROM PUBLIC;
REVOKE ALL ON TABLE public.one_off_sends FROM anon;
REVOKE ALL ON TABLE public.one_off_sends FROM authenticated;

-- ── 4. Guards ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_cols int;
BEGIN
  -- NON-VACUITY FIRST. Every assertion below is satisfied by a table that is
  -- not there at all, or by a catalog read that matched nothing.
  SELECT count(*) INTO v_cols
    FROM pg_attribute
   WHERE attrelid = 'public.one_off_sends'::regclass
     AND attnum > 0 AND NOT attisdropped;
  IF v_cols < 6 THEN
    RAISE EXCEPTION
      '188 ABORTED: read % columns on one_off_sends, so the checks below would '
      'pass over nothing.', v_cols;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='notification_preferences'
                    AND column_name='email_unsubscribed_at') THEN
    RAISE EXCEPTION '188 ABORTED: email_unsubscribed_at was not added.';
  END IF;

  -- The send-once guarantee IS the primary key. Without it this table is a log
  -- and a re-run messages everyone again.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.one_off_sends'::regclass AND contype = 'p'
       AND (SELECT array_agg(a.attname ORDER BY a.attname)
              FROM unnest(conkey) k JOIN pg_attribute a
                ON a.attrelid = conrelid AND a.attnum = k)
           = ARRAY['campaign','channel','user_id']
  ) THEN
    RAISE EXCEPTION
      '188 ABORTED: one_off_sends has no (campaign, user_id, channel) primary '
      'key. That key is the only thing preventing a re-run from messaging the '
      'same person twice.';
  END IF;

  -- has_any_column_privilege, not has_table_privilege: the latter answers
  -- "granted AT TABLE LEVEL" and returns a confident false while a role holds
  -- the privilege on a single column. Migration 175's rehearsal found that the
  -- hard way.
  IF has_any_column_privilege('anon', 'public.one_off_sends', 'SELECT')
     OR has_any_column_privilege('authenticated', 'public.one_off_sends', 'SELECT')
     OR has_any_column_privilege('anon', 'public.one_off_sends', 'INSERT')
     OR has_any_column_privilege('authenticated', 'public.one_off_sends', 'INSERT') THEN
    RAISE EXCEPTION
      '188 ABORTED: a client role holds access to one_off_sends. It records who '
      'was messaged and carries unsubscribe credentials.';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.one_off_sends'::regclass) THEN
    RAISE EXCEPTION '188 ABORTED: RLS is not enabled on one_off_sends.';
  END IF;

  RAISE NOTICE '188: one_off_sends created, email opt-out column added.';
END $$;

-- ── 5. Record this migration as applied ────────────────────────────────────
INSERT INTO public.migrations_applied (migration, note)
VALUES ('188_one_off_sends', 'send-once table (PK is the guarantee) + the first real email opt-out')
ON CONFLICT (migration) DO NOTHING;

-- ── Verification. Every *_ok must read true. ───────────────────────────────
SELECT
  (SELECT count(*) FROM pg_attribute
    WHERE attrelid='public.one_off_sends'::regclass AND attnum>0 AND NOT attisdropped) AS one_off_sends_columns,
  (SELECT data_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='notification_preferences'
      AND column_name='email_unsubscribed_at')                                        AS opt_out_column_type,
  EXISTS (SELECT 1 FROM pg_constraint
           WHERE conrelid='public.one_off_sends'::regclass AND contype='p')           AS send_once_key_ok,
  (SELECT relrowsecurity FROM pg_class WHERE oid='public.one_off_sends'::regclass)    AS rls_on_ok,
  (NOT has_any_column_privilege('anon','public.one_off_sends','SELECT')
   AND NOT has_any_column_privilege('authenticated','public.one_off_sends','SELECT')) AS clients_cannot_read_ok,
  -- Nobody has ever been able to unsubscribe, so this must be 0 on first run.
  (SELECT count(*) FROM public.notification_preferences
    WHERE email_unsubscribed_at IS NOT NULL)                                          AS already_unsubscribed,
  -- The two audiences, measured with the gates the send will apply.
  (SELECT count(*) FROM public.users u
    WHERE u.deleted_at IS NULL AND u.banned IS NOT TRUE AND u.is_test_account IS NOT TRUE
      AND u.is_instructor IS NOT TRUE
      AND coalesce(array_length(u.sports, 1), 0) = 0)                                 AS blank_athletes,
  (SELECT count(*) FROM public.users u
    WHERE u.deleted_at IS NULL AND u.banned IS NOT TRUE AND u.is_test_account IS NOT TRUE
      AND u.is_instructor IS NOT TRUE
      AND coalesce(array_length(u.sports, 1), 0) = 0
      AND u.fcm_token IS NOT NULL)                                                    AS blank_athletes_with_token;
