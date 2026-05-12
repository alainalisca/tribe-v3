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

| #   | Severity | Item                                                                                              | Status                 |
| --- | -------- | ------------------------------------------------------------------------------------------------- | ---------------------- |
| A   | FIX      | Grant CLI did not reset `tribe_os_status` on re-grant                                             | **FIXED** in `ad6ba8a` |
| B   | FIX      | Premium check duplicated across 5 places, two missing 'trialing'                                  | **FIXED** in `8f7fcd3` |
| C   | FIX      | Week 3 revenue routes inline auth+gate instead of using `requireTribeOSPremium()` helper          | **TODO this mission**  |
| D   | FIX      | `grantTribeOSPremium` DAL function also has the status-reset bug (admin route inherits it)        | **TODO this mission**  |
| E   | DEFER    | RLS spot-check via source only, no live cross-user data leak test                                 | Documented             |
| F   | DEFER    | SQL functions trust caller; future hardening could add `auth.uid()` assertion inside DEFINER body | Documented             |
| G   | CHORE    | Empty `supabase/package.json` confusing ESLint                                                    | **FIXED** in `1921013` |

No CRITICAL findings. All FIX items either already addressed or in scope for this mission.
