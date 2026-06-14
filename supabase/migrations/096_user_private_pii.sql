-- 096_user_private_pii.sql  (ADDITIVE — run FIRST, before deploying the code)
--
-- Closes the cross-user PII leak (audit T1-1). public.users has a
-- `FOR SELECT USING (true)` policy AND a table-level SELECT grant to
-- authenticated/anon (migration 093 restored the broad grant after the
-- column-level approach blanked profile pages). That means any logged-in user
-- can read every instructor's bank account number, government-ID document
-- number, emergency contact, and date of birth.
--
-- Column-level REVOKE is unreliable on top of a table-level GRANT (the exact
-- ambiguity that burned migrations 065/067/093), so we don't rely on it.
-- Instead the sensitive fields move into their own table whose access is
-- governed purely by row-level RLS — unambiguous and well understood.
--
-- This migration is ADDITIVE: it creates user_private and backfills it but
-- does NOT drop anything from users yet. Migration 097 drops the columns from
-- users AFTER the new code (which reads/writes user_private) is deployed, so
-- there is no window where live code references a dropped column.

CREATE TABLE IF NOT EXISTS public.user_private (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  -- Wompi payout bank details (Colombian instructors).
  payout_bank_name text,
  payout_account_type text,
  payout_account_number text,
  payout_document_type text,
  payout_document_number text,
  -- Emergency contact + DOB.
  emergency_contact_name text,
  emergency_contact_phone text,
  date_of_birth date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Backfill: copy existing sensitive values for any user that has at least one
-- set. Users with none simply get a row on first write (the DAL upserts).
INSERT INTO public.user_private (
  user_id, payout_bank_name, payout_account_type, payout_account_number,
  payout_document_type, payout_document_number, emergency_contact_name,
  emergency_contact_phone, date_of_birth
)
SELECT
  id, payout_bank_name, payout_account_type, payout_account_number,
  payout_document_type, payout_document_number, emergency_contact_name,
  emergency_contact_phone, date_of_birth
FROM public.users
WHERE payout_bank_name IS NOT NULL
   OR payout_account_type IS NOT NULL
   OR payout_account_number IS NOT NULL
   OR payout_document_type IS NOT NULL
   OR payout_document_number IS NOT NULL
   OR emergency_contact_name IS NOT NULL
   OR emergency_contact_phone IS NOT NULL
   OR date_of_birth IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE public.user_private ENABLE ROW LEVEL SECURITY;

-- Owner-only: a user fully owns their own private row. No public/instructor
-- read policy — these fields are never shown to other users. The service role
-- (used by payment/payout server code) bypasses RLS as usual.
CREATE POLICY "Users manage own private data"
  ON public.user_private
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- updated_at maintenance.
CREATE OR REPLACE FUNCTION public.touch_user_private_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_private_touch_updated_at ON public.user_private;
CREATE TRIGGER user_private_touch_updated_at
  BEFORE UPDATE ON public.user_private
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_user_private_updated_at();
