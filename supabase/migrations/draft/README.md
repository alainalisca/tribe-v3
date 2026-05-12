# Draft migrations

Schemas drafted but **not applied**. Files here are deliberately not picked
up by the Supabase migration runner — that processes numbered `.sql` files
directly under `supabase/migrations/`, not subdirectories. The `.draft.sql`
extension is a second belt-and-suspenders so accidental sweeps don't apply
them either.

## Why these aren't real migrations yet

Each draft is a Phase 2 Tribe.OS feature whose schema depends on
**validation signal that has not arrived**. The trip plan dated 2026-05-07
deliberately defers applying these schemas until:

1. The waitlist captures enough instructor preferences to confirm scope.
2. The Studio San Diego sit-down (round two, on return to Medellín)
   confirms which features design partners actually want first.

Applying these prematurely locks the schema before that signal exists, and
column-level decisions (e.g. exactly which contact-info fields, exactly
which package billing model) are easier to make once instructors have told
us what matters.

## Promotion to real migrations

When validation greenlights one of these features:

1. Move the file from `draft/` up to `supabase/migrations/`.
2. Rename to the next-free numbered slot (e.g. `061_clients.sql`). At time
   of writing the next free number after `060_tribe_os_premium.sql` is
   `061`.
3. Drop the `.draft.sql` suffix in favor of `.sql`.
4. Re-read the docblock at the top of the file — assumptions noted there
   may need updating against current state.
5. Apply via the same SQL Editor flow used for 056/059/060.

## Files in this folder

- `session_packages.draft.sql` — Pre-paid session packs ("10 sessions for
  $200, valid 90 days").

## Promotion log

- **2026-05-10** — `clients_and_attendance.draft.sql` promoted to
  `supabase/migrations/062_clients_and_attendance.sql`. Several columns
  added during promotion to match the Mission 2 DAL spec: `tags text[]`
  on clients, `amount_paid_cents` + `currency` + `payment_method` on
  client_attendance, `archived_at` on clients, `updated_at` triggers on
  both tables. Integrity CHECK constraints added (archive consistency,
  payment-fields consistency, paid-implies-amount). See migration body
  for design rationale on each.

- **2026-05-12** — `instructor_revenue_summary.draft.sql` promoted to
  `supabase/migrations/063_revenue_dashboard.sql`. Significant changes
  during promotion to match the Week 3 spec and fix latent issues:
  - **Bug fix**: draft referenced `p.user_id` on the payments table;
    actual column is `p.participant_user_id`. Corrected.
  - **Split into two functions**: `instructor_revenue_totals` and
    `instructor_revenue_buckets`. The draft's single-function approach
    returned only totals; the dashboard needs a time series too.
  - **Refund tracking added**: new `payments.refunded_at` and
    `payments.refunded_amount_cents` columns, populated by a new
    `charge.refunded` branch in `/api/payment/webhook/stripe/`. Refunds
    are bucketed by `refunded_at`, not the original `created_at`.
  - **Timezone-aware bucketing**: new `users.timezone` column (defaults
    to `America/Bogota`). Functions take a `p_timezone` arg and use
    `date_trunc(field, ts, tz)` (Postgres 12+) to truncate in the
    instructor's local time. A payment at 23:45 local on the last day
    of a month lives in that month, not the next.
  - **Test-data filter**: payments where the creator or participant has
    `users.is_test_account = true` are excluded. No new column needed —
    relies on the existing migration 052 flag.
  - **Currency-default column**: new `users.tribe_os_revenue_currency_default`
    (nullable, CHECK 'USD' | 'COP') to let instructors pin which
    currency the dashboard leads with.
  - **Indexes**: composite partial index on `payments(session_id,
created_at) WHERE status='approved'` and partial on
    `payments(session_id, refunded_at) WHERE refunded_at IS NOT NULL`.
