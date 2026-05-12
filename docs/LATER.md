# LATER

Append-only log of items deferred from the current sprint. The format:

```
## YYYY-MM-DD — short title
**Source:** who raised it (Al, claude, beta instructor name, etc.)
**Description:** what it is.
**Why deferred:** what about the current sprint prevented doing it now.
**Trigger to revisit:** what signal should bring it back to the top.
```

Operational rule from the Week 4 spec and `feedback_no_premature_merge`:
**every feature request, idea, or out-of-scope improvement surfaced during
beta goes here, not into the active sprint.** The scope-creep guard.

---

## 2026-05-12 — Mission 2 real refund test pending

**Source:** Al (deferred mid-Week-4 Mission 1 execution).

**Description:** Stage a real $1 USD test session in production, pay
through a real card via Stripe Connect, then refund via Stripe Dashboard
and verify the full webhook → `payments.refunded_*` columns → revenue
dashboard chain. Confirms that the `charge.refunded` webhook branch
added in Week 3 actually fires in production and that the dashboard
reflects refunds correctly.

**Why deferred:** Mission 1 (security hardening) ran long enough that
the live-money refund test got pushed. The code is in place and the
audit confirmed the wiring is correct; this is a verification step,
not an implementation step.

**Trigger to revisit:** Before the first real beta instructor processes
any payment. Catching a refund-pipeline bug after a real instructor's
real client refund would be embarrassing and trust-damaging. Schedule
before Mission 5 (beta onboarding).

**How to run:** see Mission 2 in the Week 4 build plan. Roughly:
create a paid session as Al, pay $1 from a second account, refund in
Stripe Dashboard, verify `payments.refunded_at` and `refunded_amount_cents`
get populated, verify `/os/revenue` shows the refund row and the
period totals are reduced accordingly, verify CSV export reflects it.

---

## 2026-05-12 — `users_public` view refactor for payout / PII / financial leak

**Source:** Week 4 audit follow-up, caught when expanding the RLS leak
test to check payout and PII columns.

**Description:** The `users` table's "Users can view all profiles" SELECT
policy + column-level GRANT pattern (post-066/067) restricts only a
handful of columns. The following are still readable cross-user by any
authenticated caller:

- `payout_account_number` (bank account number)
- `payout_document_number` (government ID)
- `payout_bank_name`, `payout_account_type`, `payout_document_type`, `payout_method`
- `emergency_contact_name`, `emergency_contact_phone`
- `date_of_birth`
- `stripe_account_id` (Stripe Connect account; needed cross-user for
  payment routing so this one stays accessible)
- `wompi_merchant_id`

The leak test (`scripts/rls-leak-test.js`) prints these as WARN
entries with a pointer to this doc. The test does not fail on them so
the suite stays green and useful.

**Why deferred:** Column-level GRANT/REVOKE is role-based, not
row-based. Revoking payout/PII columns from `authenticated` would also
block self-reads in `/earnings/payout-settings`, `/api/stripe/connect/*`,
`fetchUserProfile`, and other places where the user legitimately reads
their own row via the session client. Doing it right requires:

1. Replace the wildcard SELECT policy on `users` with a self-only
   policy (`auth.uid() = id`).
2. Create a `users_public` view exposing only safe columns, with its
   own permissive policy and SELECT grant for authenticated/anon.
3. Refactor every cross-user `from('users').select(...)` in the app
   to use `users_public` instead. Estimated ~15-25 call sites across
   feed, instructor listings, partner rosters, profile pages, etc.

That refactor is too large to slip into the pre-beta sprint. Risk of
breaking a previously-working cross-user lookup outweighs the leak
severity given that beta is 1-3 instructors who are not adversarial.

**Trigger to revisit:** Before wider public launch (post-beta). Once
multiple instructors are on the platform with bank account numbers
stored, the leak severity rises. The view refactor should be its own
focused mission with a thorough test pass.

---

## 2026-05-12 — Wider `users` cross-user read leak (tier + status)

**Source:** Security audit (DEFER item, follow-up to Week 4 Mission 1).

**Description:** Even after migration 066 narrowed the column GRANT list,
`tribe_os_tier` and `tribe_os_status` remain readable cross-user.
Reveals "is X premium" and their subscription state. Not catastrophic
(premium users self-identify by their features), but not ideal.

**Why deferred:** Removing these columns from the cross-user grant
would break `useTribeOSPremiumGate`, which reads them client-side for
the user's own row. Postgres GRANT/REVOKE is role-based, not row-based,
so we can't say "self can read, others can't". Proper fix needs either
(a) replace the wildcard SELECT policy on `users` with a self-only
policy + a `users_public` view exposing safe columns for cross-user
reads, or (b) move the gate check to a server endpoint that uses
service-role internally. Either approach touches many call sites.

**Trigger to revisit:** Week 5+ hardening pass. If a beta instructor
asks "can other instructors see I'm a paying customer" — yes, today;
that conversation triggers a fix.

---

## 2026-05-12 — VAPID_PRIVATE_KEY "Needs Attention" in Vercel

**Source:** Surfaced during Week 3 pre-merge env review.

**Description:** Vercel flags `VAPID_PRIVATE_KEY` in the production env
list as "Needs Attention". Unclear cause; likely a rotation reminder or
a value format issue. Push notifications worked recently per Phase 1,
so it's probably not currently broken.

**Why deferred:** Unrelated to Tribe.OS work; would derail the sprint.

**Trigger to revisit:** Before any public launch. Push notifications
matter for the broader Tribe app, and a silent failure in the VAPID
chain is the kind of thing that goes unnoticed until reach drops.

---

## 2026-05-12 — Verónica Spanish review pending

**Source:** Memory note `project_key_people`; multiple `// ES PENDING
VERONICA REVIEW` markers across Week 1, 2, 3 UI code.

**Description:** Every Spanish string Claude Code produced during
Phase 2 is a starter-pack draft pending Verónica's review.

**Why deferred:** Verónica is on vacation per Al's note (date TBD on
return). Sprint cannot wait on the review.

**Trigger to revisit:** When Verónica returns. Process: she reads
through every file with the `// ES PENDING VERONICA REVIEW` marker,
sends edits as a list, Claude applies them, marker comment removed.

---

## 2026-05-12 — `supabase` CLI doesn't parse current `.env.local`

**Source:** Mission 1 of Week 4 setup attempt.

**Description:** `supabase db push` errored with "failed to parse
environment file: .env.local (unexpected character '\' in variable
name)". Likely a multiline JSON value (Google service account creds?)
that the CLI's env parser doesn't handle.

**Why deferred:** Migrations have been applied via the Dashboard SQL
Editor instead. Works, just slower than the CLI would be.

**Trigger to revisit:** If we ever need to script migration application
in CI. Or if Al wants the convenience back.

---

## 2026-05-12 — Multi-coach revenue SQL functions

**Source:** Week 1 (gym-tenant integration) Mission 5, DAL update.

**Description:** `instructor_revenue_totals` and
`instructor_revenue_buckets` (migration 063 + 064 auth assertion) are
keyed on `p_user_id` and gated by `auth.uid() = p_user_id`. They
cannot be invoked with a gym id today. The Mission 5
`getRevenueSummaryForGym` and `listPaymentsForGym` wrappers compensate
by resolving gym → owner user id and delegating — which works because
every gym currently has exactly one owner, but breaks the moment a
multi-coach gym wants a non-owner coach to see revenue.

**Why deferred:** The Path B foundation (Week 1) is about schema and
RLS. Multi-coach revenue queries belong in Week 2 alongside the rest
of the multi-coach UX work (gym switcher, coach roster page,
role-based permissions).

**Trigger to revisit:** Start of Week 2. Build:

- `gym_revenue_totals(p_gym_id, period_start, period_end, p_timezone)`
  gated by `EXISTS (SELECT 1 FROM gym_coaches WHERE gym_id = p_gym_id
AND user_id = auth.uid())`. Reads from `payments.gym_id` directly
  (already backfilled in migration 069).
- `gym_revenue_buckets(p_gym_id, ...)` same gate.
- Swap `lib/dal/revenue.ts` `listPayments` to query
  `payments.gym_id = ?` instead of `sessions.creator_id`.
- Update the `getRevenueSummaryForGym` wrapper to call the new SQL
  functions directly instead of delegating to the user-keyed path.

---

## 2026-05-12 — Cleanup migration: drop legacy `instructor_user_id` RLS path

**Source:** Week 1 Mission 4 (dual-path RLS), file header notes.

**Description:** Migration 070 RLS policies accept either
`instructor_user_id = auth.uid()` OR `gym_coaches` membership. Both
are valid during the transition. Once every Tribe.OS user has been
operating exclusively on the gym path for some time (and every row in
`clients` / `client_attendance` / `payments` has `gym_id` populated),
a cleanup migration should:

1. Verify zero rows with `gym_id IS NULL` for premium tenants.
2. Replace each dual-path policy with a gym-only variant.
3. Flip `clients.gym_id`, `client_attendance.gym_id`,
   `payments.gym_id` to NOT NULL.
4. Drop `clients.instructor_user_id` (or leave as an informational
   column — decision deferred until the cleanup mission runs).

**Why deferred:** Removing the legacy branch is irreversible without
a backup restore. We want at least a few weeks of dual-path operation
to surface any rows that slipped through migration 069's backfill.

**Trigger to revisit:** Week 5+ or when the team is confident no new
rows are landing without `gym_id`. The leak test
(`scripts/rls-leak-test.js`) is the canary — if it ever WARNs about
a row missing `gym_id` for a premium tenant, the cleanup migration
gets delayed until that's fixed.
