-- 097_drop_users_pii_columns.sql  (DESTRUCTIVE — run LAST, AFTER the code that
-- reads/writes user_private is deployed)
--
-- Completes the T1-1 fix begun in 096. Now that the sensitive PII lives in
-- user_private (owner-only RLS) and the app reads/writes it there, remove the
-- columns from public.users so they are no longer covered by the broad
-- `FOR SELECT USING (true)` policy + table-level SELECT grant.
--
-- ORDER MATTERS: do NOT run this until the corresponding code is live. While
-- 096 is applied but this is not, the columns still exist on users (harmless —
-- nothing reads them anymore once the code ships). Running this before the
-- code deploys would make old code that still selects these columns error.
--
-- IF NOT EXISTS-style guard via DROP COLUMN IF EXISTS so re-runs are safe.

ALTER TABLE public.users
  DROP COLUMN IF EXISTS payout_bank_name,
  DROP COLUMN IF EXISTS payout_account_type,
  DROP COLUMN IF EXISTS payout_account_number,
  DROP COLUMN IF EXISTS payout_document_type,
  DROP COLUMN IF EXISTS payout_document_number,
  DROP COLUMN IF EXISTS emergency_contact_name,
  DROP COLUMN IF EXISTS emergency_contact_phone,
  DROP COLUMN IF EXISTS date_of_birth;
