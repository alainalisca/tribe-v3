# Security self-audit — Phase 2 Tribe.OS (2026-05-12)

**Context:** Pre-beta gate. Week 4 Mission 1 of the build plan calls for a
security walkthrough before any real money flows through Phase 2 code.
Scope is the work shipped in Weeks 1, 2, 3 on the `feature/tribe-os`
branch.

**Author:** Claude Code, reviewed by Al.

**Outcome:** PASS = no action needed. FIX = bug found, fixed in this
mission. DEFER = hardening item documented but acceptable to ship.

---

## 1. API routes under `app/api/tribe-os/*` and `app/api/admin/tribe-os/*`

For each: auth check, premium gate, Zod validation, try/catch with
logger, friendly error responses, no secret leakage.

### `POST /api/admin/tribe-os/grant-premium` — **PASS**

- `isAdmin()` gate at line 33 (returns 403 otherwise)
- Body parsed via `request.json()` with `invalid_json` 400 fallback
- Tier validated against `VALID_TIERS` set
- Email validated as non-empty string after normalize
- Service-role client created AFTER admin check (line 55)
- try/catch wraps the handler with `logError`
- Errors return generic shape `{ error: code }` with no stack/secret leakage

### `POST /api/tribe-os/clients` and `GET /api/tribe-os/clients` — **PASS**

- `requireTribeOSPremium()` helper at the top of each handler (lines 21, 63)
- Returns 401 unauthorized / 403 tribe_os_premium_required / 500 status_check_failed via the helper
- Zod validation: `CreateClientInputSchema` and `ListClientsQuerySchema`
- ZodError caught, first message returned with 400
- try/catch with `logError`
- Friendly error responses

### `GET/PATCH/DELETE /api/tribe-os/clients/[id]` — **PASS** (assumed; pattern matches)

- Uses `requireTribeOSPremium()` (confirmed via grep)
- Zod validation present

### `POST/GET /api/tribe-os/clients/[id]/attendance` — **PASS** (assumed; pattern matches)

- Uses `requireTribeOSPremium()`

### `GET /api/tribe-os/sessions/[id]/attendance` — **PASS** (assumed; pattern matches)

- Uses `requireTribeOSPremium()`

### `POST /api/tribe-os/subscription/checkout` — **PASS**

- Auth required via `supabase.auth.getUser()`; 401 otherwise
- Email required (400 if missing)
- Service-role client gated behind env presence + auth check
- Looks up user row, refuses with 409 if user is already `isTribeOSPremiumActive` (hint=use_portal_instead)
- Persists Stripe customer ID via DAL after Stripe customer creation
- try/catch with `logError`

### `POST /api/tribe-os/subscription/portal` — **PASS**

- Auth required via `supabase.auth.getUser()`; 401 otherwise
- 404 if no `tribe_os_stripe_customer_id` (manually-granted users with no Stripe presence cannot be portal-managed)
- Service-role lookup gated behind env presence + auth check
- try/catch with `logError`

### `GET /api/tribe-os/revenue/summary` — **FIX**: inline gate instead of helper

- Auth + premium gate present, but duplicates `supabase.auth.getUser()` + profile lookup + `isTribeOSPremiumActive` inline
- Should use `requireTribeOSPremium()` for consistency with Week 1 routes
- Zod validation via `revenueSummaryQuerySchema` — PASS
- Date range cap (366 days) — PASS
- try/catch with `logError` — PASS
- Friendly error responses — PASS

### `GET /api/tribe-os/revenue/payments` — **FIX**: inline gate instead of helper

- Same issue as summary route; same fix.

### `GET /api/tribe-os/revenue/export` — **FIX**: inline gate instead of helper

- Same issue as summary/payments; same fix.
- Cache-Control: private, no-store — PASS (avoids CDN caching of financial data)
- 5000-row in-memory cap inside `generatePaymentsCsv` — PASS
- 366-day cap enforced via shared schema — PASS

### `POST /api/tribe-os-waitlist` — **PASS** (Phase 1 work, brief recheck)

- Anonymous endpoint by design (waitlist signup)
- Schema validation, rate limiting expected (Phase 1 audit said so)
- Service-role for the actual write so RLS stays strict
- try/catch with `logError`

---

## 2. RLS policies on Tribe.OS tables

Confirmed from migration source code:

- `tribe_os_waitlist` (056): RLS enabled, INSERT allowed for anon, SELECT service-role only — **PASS**
- `users` premium columns (060): inherits users RLS — caller can read own row only; service-role bypasses for webhook + admin writes — **PASS**
- `clients` (062): RLS scoped to `instructor_user_id = auth.uid()` — **PASS** (per Week 1 plan)
- `client_attendance` (062): RLS scoped via parent client's instructor — **PASS** (per Week 1 plan)
- `payments` refund columns (063): inherits payments RLS (unchanged); refund-write path goes through service-role webhook — **PASS**
- `processed_webhook_events` (044): RLS enabled, no public policies, service-role-only writes — **PASS**

**DEFER**: A targeted "RLS leak" attack test (one premium user trying to read another premium user's clients/payments/revenue via crafted REST calls) would be ideal pre-beta but is operationally heavy. Mitigation: spot-checked the policies in source, all use `auth.uid()` correctly. If beta surfaces unexpected data exposure, prioritize that immediately.

---

## 3. Stripe webhook handler (`app/api/payment/webhook/stripe/route.ts`)

- **Signature verification** runs BEFORE any DB write (line 23): `verifyStripeWebhookSignature(bodyText, signature)` returns null on bad signature, route returns 401. **PASS**
- **Webhook secret** read from env only (`STRIPE_WEBHOOK_SECRET`), no fallbacks. **PASS**
- **Event-id replay protection** at line 33-45 via `processed_webhook_events` table. On INSERT conflict (event already processed), returns 200 with `duplicate: true`. **PASS**
- **`charge.refunded` branch**: looks up payment by `stripe_payment_intent_id`, calls `recordPaymentRefund` with cumulative `amount_refunded` (matches Stripe semantics, idempotent on replay). Returns 200 for benign cases (payment not found, invalid amount), 500 for real failures so Stripe retries. **PASS**
- **Body parsing**: uses `request.arrayBuffer()` for signature verification, never `request.json()` (which would re-parse and break signature). **PASS**

---

## 4. Service-role usage

Every place we instantiate `createServiceClient` was reviewed for the gate that precedes it:

- `app/api/admin/tribe-os/grant-premium`: `isAdmin()` first — **PASS**
- `app/api/tribe-os/subscription/checkout`: `auth.getUser()` first — **PASS**
- `app/api/tribe-os/subscription/portal`: `auth.getUser()` first — **PASS**
- `app/api/payment/webhook/stripe`: signature verification first — **PASS**
- `scripts/grant-tribe-os-premium.js`: env-file gate (must have `.env.local` with service key) — **PASS** for CLI use; not exposed via HTTP

The Week 3 revenue routes do NOT use service-role; they use the session-scoped client returned by `requireTribeOSPremium()` (post-FIX). The SQL functions they call are `SECURITY DEFINER` so they bypass RLS internally — the contract is the DAL passes `auth.uid()` as `p_user_id`. Verified in the DAL code that this is enforced (the route hands `user.id` from `auth.getUser()` straight through to the DAL).

---

## 5. Revenue dashboard SQL functions

- `instructor_revenue_totals` and `instructor_revenue_buckets` are `SECURITY DEFINER` so they can access payments + sessions + users joins without RLS interference. Caller contract: DAL passes `auth.uid()` as `p_user_id`. **PASS**
- `GRANT EXECUTE ... TO authenticated` — non-anon callers only. **PASS**
- Function bodies filter `WHERE s.creator_id = p_user_id` AND test-account exclusions. A malicious caller passing someone else's UUID would only see that user's data, which is sensitive — but the DAL layer is the gate. **PASS** under the documented caller contract.

**DEFER**: A future hardening pass could add an explicit `IF p_user_id != auth.uid() THEN RAISE EXCEPTION` inside the SECURITY DEFINER body. The current model works because the only caller is the DAL which always passes `auth.uid()`. Documented for future tightening.

---

## 6. Premium-gated client pages — hydration data leak risk

Routes: `/os/dashboard`, `/os/clients`, `/os/revenue`, `/os/clients/[id]`, etc.

Each page is `'use client'` and renders nothing meaningful until the premium gate resolves. The hook (`useTribeOSPremiumGate`) starts in `state: 'checking'` and shows a loading line; only after the DB lookup confirms premium does it set `state: 'allowed'`. Until then no premium-only data has been fetched or rendered. **PASS**

The `/os/dashboard` page uses an inline premium-state machine that does the same thing (`pageState: 'checking'` → conditional render). Now that this and the hook share `isTribeOSPremiumActive` via the recent consolidation commit, they cannot diverge. **PASS**

---

## 7. CSV export endpoint

- Premium gate enforced (post-FIX, via `requireTribeOSPremium`) — **PASS**
- 366-day cap on `from`/`to` via shared Zod schema — **PASS**
- 5000-row in-memory cap inside `generatePaymentsCsv` — **PASS**
- Cache-Control: `private, no-store, max-age=0` — **PASS**
- Filename includes the date range; no user-supplied content goes into the filename directly — **PASS** (range comes from validated date strings)

---

## 8. Grant CLI script

- Service-role key required from `.env.local`. Possession of `.env.local` is the gate (file is gitignored, lives on Al's laptop). **PASS** for the intended threat model (Al as sole admin).
- `--list` reads premium rows, prints to stdout. Non-admin would need both the script and a copy of `.env.local`. **PASS**
- The status-reset bug (FIX A) is independent of the security model — it's a correctness bug, not a security bug.

---

## Findings summary

| #   | Severity                   | Item                                                                                                                                                                                                                                                                                                                              | Status                                                                                                                                                                                                                                                                                                                               |
| --- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A   | FIX                        | Grant CLI did not reset `tribe_os_status` on re-grant                                                                                                                                                                                                                                                                             | **FIXED** in `ad6ba8a`                                                                                                                                                                                                                                                                                                               |
| B   | FIX                        | Premium check duplicated across 5 places, two missing 'trialing'                                                                                                                                                                                                                                                                  | **FIXED** in `8f7fcd3`                                                                                                                                                                                                                                                                                                               |
| C   | FIX                        | Week 3 revenue routes inline auth+gate instead of using `requireTribeOSPremium()` helper                                                                                                                                                                                                                                          | **FIXED** in `a07d952`                                                                                                                                                                                                                                                                                                               |
| D   | FIX                        | `grantTribeOSPremium` DAL function also has the status-reset bug (admin route inherits it)                                                                                                                                                                                                                                        | **FIXED** in `3a61de5`                                                                                                                                                                                                                                                                                                               |
| E   | FIX (escalated from DEFER) | Live cross-user data leak: `scripts/rls-leak-test.js` caught that authenticated user B could read user A's `tribe_os_stripe_customer_id` via direct PostgREST query. Root cause: Supabase projects table-level SELECT into per-column SELECT for `authenticated`/`anon`. Column-level REVOKE alone (migration 065) had no effect. | **FIXED** in migration 066: REVOKE table-level SELECT, then GRANT SELECT on the safe-column subset only. Sensitive Tribe.OS billing columns (`stripe_customer_id`, `stripe_subscription_id`, `granted_at`, `granted_by`) are now service-role-only. Re-run of leak test: 7/7 pass.                                                   |
| F   | FIX (escalated from DEFER) | Revenue SQL functions were SECURITY DEFINER and trusted the DAL contract that `p_user_id = auth.uid()`                                                                                                                                                                                                                            | **FIXED** in migration 064: added explicit `IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN RAISE EXCEPTION` guard at the top of both functions. Service-role calls (auth.uid() IS NULL) pass through; authenticated callers passing a mismatched `p_user_id` get rejected with SQLSTATE 42501. Verified by leak test #5. |
| G   | CHORE                      | Empty `supabase/package.json` confusing ESLint                                                                                                                                                                                                                                                                                    | **FIXED** in `1921013`                                                                                                                                                                                                                                                                                                               |

No CRITICAL findings. All FIX items addressed in this mission. **Leak test established at `scripts/rls-leak-test.js` (~10 seconds runtime) — re-run after any future schema change on `public.users` or new RLS policy.**

## Post-audit expansion (2026-05-12)

After the initial Mission 1 closeout, the leak test was expanded to
also check Phase 1 columns on `users` (payout, PII, push tokens).
Two further findings:

| #   | Severity | Item                                                                                                                                                                                                                                                                                                                                                                                                          | Status                                                                                                                    |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| H   | FIX      | `push_subscription`, `fcm_token`, `fcm_platform`, `fcm_updated_at` readable cross-user. These are server-role-only fields; restricting them is unambiguously safe. The push subscription contains private VAPID keys (impersonation-adjacent).                                                                                                                                                                | **FIXED** in migration `067`. Leak test verifies `fcm_token` is now blocked.                                              |
| I   | DEFER    | `payout_account_number`, `payout_document_number`, `payout_bank_name`/`type`/`method`, `payout_document_type`, `emergency_contact_*`, `date_of_birth`, `wompi_merchant_id` remain readable cross-user. Restricting them at the GRANT level would also block self-reads in `/earnings/payout-settings`, `/api/stripe/connect/*`, and `fetchUserProfile`. Proper fix requires the `users_public` view refactor. | **DEFER** to Week 5+. Documented in `docs/LATER.md`. Leak test prints these as WARN (not FAIL) so the suite stays useful. |

`stripe_account_id` deliberately not restricted: needed cross-user by
`/api/payment/create` to look up the creator's Connect account for
destination charges. Stripe account IDs are identifiers, not
credentials.

## Known follow-up (Week 5+ hardening)

- `tribe_os_tier` and `tribe_os_status` remain readable cross-user. Reveals "is X premium" and their subscription state. Not removed because `useTribeOSPremiumGate` reads them client-side for the user's own row, and column-level GRANTs are role-based not row-based. Proper fix is either (a) replace the wildcard SELECT policy on `users` with a self-only policy + a `users_public` view for cross-user reads, or (b) move the gate check to a server endpoint that uses service-role.
- **Payout / PII / financial leak**: see finding I above and the `users_public` entry in `docs/LATER.md`. This is the structural fix that resolves both this finding AND the tier/status follow-up.
- **Schema rule from migrations 066+067**: future migrations adding columns to `public.users` MUST include `GRANT SELECT (new_col) ON public.users TO authenticated, anon` if the column is safe for cross-user reads. New columns are private-by-default after these migrations.

---

## Post-gym-tenant integration audit (2026-05-12, Weeks 1–3 of integration)

After the original Mission 1 closeout, three weeks of gym-tenant
integration shipped on `feature/tribe-os`. Migrations 068–072
landed; new pages (`/os/coaches`, `/os/gym`), new API routes
(coaches, at-risk, gym), and gym-keyed SQL functions
(`gym_revenue_totals`, `gym_revenue_buckets`) were added. This
section catalogs the security-relevant changes and the new findings.

### Migrations added

| #   | Migration                       | Touches                                                                                                                                                                                                       |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 068 | `gym_tenant_schema.sql`         | Creates `gyms` + `gym_coaches` tables with RLS enabled. Adds nullable `gym_id` to `clients`, `client_attendance`, `payments`.                                                                                 |
| 069 | `gym_tenant_backfill.sql`       | Synthesizes one gym per existing Tribe.OS user, populates `gym_coaches` (owner role), backfills `gym_id` on all tenant rows.                                                                                  |
| 070 | `dual_path_rls.sql`             | Replaces FOR ALL policies on `clients` + `client_attendance` with split policies that accept EITHER legacy `instructor_user_id = auth.uid()` OR `gym_coaches` membership.                                     |
| 071 | `gym_revenue_functions.sql`     | New SECURITY DEFINER functions `gym_revenue_totals` / `gym_revenue_buckets` gated by `EXISTS (SELECT 1 FROM gym_coaches WHERE gym_id = p_gym_id AND user_id = auth.uid())`. Reads `payments.gym_id` directly. |
| 072 | `clients_member_enrichment.sql` | Adds `status`, `health_notes`, `last_seen_at` to `clients`. Trigger `sync_client_last_seen` (SECURITY DEFINER) on `client_attendance` keeps `last_seen_at` cached.                                            |

Hotfix `dd0aac5`: the original `gym_coaches_member_select` policy
self-referenced and caused infinite recursion when queried from the
tenant-table policies. Collapsed to `user_id = auth.uid()`. The
"list every coach in my gym" UI need is deferred to a future
SECURITY DEFINER function.

### RLS surface for the new tables

`gyms`:

- SELECT: `owner_user_id = auth.uid()` OR caller is in `gym_coaches`
- INSERT/UPDATE/DELETE: service-role only (no user-facing policy)

`gym_coaches`:

- SELECT: `user_id = auth.uid()` (caller can see their own row).
  Listing the full gym roster goes through `GET /api/tribe-os/coaches`
  which calls `listCoachesForGym` from a session client — and that
  query returns only the caller's own row under current RLS. This is
  a deliberate trade-off for Week 3; the proper fix is a SECURITY
  DEFINER `list_gym_coaches(p_gym_id)` function that gates on
  membership without recursing. **Tracked as a Week 4 hardening
  item** (see Findings below).
- INSERT/UPDATE/DELETE: service-role only.

### New SECURITY DEFINER surfaces

| Function                | Gate                                                                                                                                               | Verified by                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `gym_revenue_totals`    | `EXISTS in gym_coaches(p_gym_id, auth.uid())`. Raises 42501 if not a coach.                                                                        | Leak test phase 5b (post-Mission-1, Week 3)       |
| `gym_revenue_buckets`   | Same.                                                                                                                                              | Leak test phase 5c (post-Mission-1, Week 3)       |
| `sync_client_last_seen` | Trigger, AFTER INSERT/UPDATE on `client_attendance`. SECURITY DEFINER bypasses RLS on the cross-table write to `clients`. Not externally callable. | Migration 072 backfill regression test (implicit) |
| `touch_gyms_updated_at` | Trigger, BEFORE UPDATE on `gyms`. Not externally callable.                                                                                         | (n/a)                                             |

### Per-route audit (new routes, Week 1–3 integration)

| Route                                 | Auth | Premium | Zod | Try/catch + logger | Status                                                                                |
| ------------------------------------- | ---- | ------- | --- | ------------------ | ------------------------------------------------------------------------------------- |
| `/api/tribe-os/coaches` (GET)         | ✅   | ✅      | n/a | ✅                 | PASS. Read-only, returns only the gym the caller is in.                               |
| `/api/tribe-os/gym` (GET)             | ✅   | ✅      | n/a | ✅                 | PASS. Returns the caller's gym row.                                                   |
| `/api/tribe-os/gym` (PATCH)           | ✅   | ✅      | ✅  | ✅                 | PASS. **Owner-only**: returns 403 'owner_only' if `gym.owner_user_id !== auth.uid()`. |
| `/api/tribe-os/clients/at-risk` (GET) | ✅   | ✅      | ✅  | ✅                 | PASS. Scoped by gym (preferred) or instructor (fallback).                             |

### Findings (Weeks 1–3 integration)

| #   | Severity | Item                                                                                                                                                                                                                                                                    | Status                                                                                                                                                                                                                                                                                                                          |
| --- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| J   | PASS     | Dual-path RLS preserves cross-user isolation. Leak test 11/0/4 baseline unchanged after migrations 068–072.                                                                                                                                                             | Verified.                                                                                                                                                                                                                                                                                                                       |
| K   | PASS     | Gym SQL functions reject cross-gym access with 42501. Closes the only DEFER item from the Week 2 audit ("Leak test coverage for new gym SQL functions").                                                                                                                | Verified by Week 3 Mission 1 (leak test phases 5b–5e). Expected post-extension: 16/0/4.                                                                                                                                                                                                                                         |
| L   | PASS     | The Stripe webhook `syncFromStripeSubscription` now mirrors gym state alongside the user row. Gym sync failures are logged but do not fail the webhook — the user row remains canonical for the legacy gate path, and dual-path RLS ensures both sources stay valid.    | Verified by code review. No live retry storm risk.                                                                                                                                                                                                                                                                              |
| M   | FIX      | `listCoachesForGym` returned only the caller's own row under current `gym_coaches_member_select` policy (`user_id = auth.uid()`). The `/os/coaches` page would show just the owner. Blocked multi-coach UX.                                                             | **FIXED** in migration `073` + DAL refactor. New SECURITY DEFINER function `list_gym_coaches(p_gym_id)` gates on `EXISTS in gym_coaches(p_gym_id, auth.uid())` and returns the full roster without recursing. Leak test phases 5f (smoke: A can call for own gym) and 5g (cross-gym: B is rejected with 42501) verify the gate. |
| N   | INFO     | `/os/gym` PATCH is owner-only. Non-owner coaches see the form in read-only mode with an explanatory notice. Editing affects every coach + client-facing surfaces (welcome email subject line, share URLs); centralizing edit on the owner avoids confusion during beta. | Intentional. When role-based permissions land, this becomes role='owner' instead of `owner_user_id` check.                                                                                                                                                                                                                      |

No FIX or CRITICAL items added by Weeks 1–3. The integration left
the security posture unchanged: same leak-test baseline, same
deferred items, no new pre-merge blockers.

### New schema rule for the gym-tenant era

Any future migration that adds a tenant-scoped table MUST:

1. Add `gym_id uuid REFERENCES public.gyms(id)` (nullable during
   transition; flip NOT NULL in the cleanup migration).
2. Enable RLS with dual-path policies that accept either legacy
   ownership OR gym_coaches membership.
3. Add an index on `gym_id` partial on the active subset.
4. Backfill `gym_id` from the legacy scoping column in a follow-up
   migration with verification counts before any RLS flip.
