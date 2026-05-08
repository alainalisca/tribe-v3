# Tribe v3 — Stripe Integration Handoff

**Status:** ~98% complete. Code-complete, tested piecemeal, last-mile webhook round-trip pending a single live test. Working tree is NOT committed yet.

**Context:** Al spent a chat-based session with a Claude agent implementing both code gaps from PAYMENT_PORTAL_SETUP_GUIDE.md (instructor onboarding + marketplace fund routing). The integration works. The remaining friction is that running `stripe listen` + test payment + DB verification via chat has too many round-trips. You're picking this up in Claude Code so you can iterate directly.

## TL;DR for the agent picking this up

1. Verify `stripe listen` is running with a **trailing slash** on the forward URL (`/api/payment/webhook/stripe/`, NOT `/api/payment/webhook/stripe`). Trailing slash is critical — Next.js has `trailingSlash: true` and returns 308 redirect without it, which Stripe treats as delivery failure.
2. Run a fresh test payment end-to-end.
3. Confirm the payment row flips to `approved` and the `session_participants` row is inserted.
4. Commit the working tree.
5. Knock out the pending follow-ups in order if time allows.

## What's already done (in working tree, not yet committed)

Run `git status` and `git diff` to see the diff. Key files:

### New files

- `supabase/migrations/051_stripe_connect.sql` — adds `stripe_account_id`, `stripe_onboarding_complete`, `stripe_onboarding_started_at` to `public.users` with partial index. **Applied to Supabase.**
- `app/api/stripe/connect/onboard/route.ts` — POST. Creates Express account if missing; generates fresh AccountLink; returns URL.
- `app/api/stripe/connect/return/route.ts` — GET. Stripe's return_url. Verifies account with Stripe, flips `stripe_onboarding_complete` if ready, redirects to `/earnings/payout-settings?stripe=complete|incomplete`.
- `app/api/stripe/connect/refresh/route.ts` — GET. Stripe's refresh_url for expired AccountLinks. Mints a fresh link and redirects.
- `app/api/stripe/connect/status/route.ts` — GET. Returns `{ state: 'not_started' | 'in_progress' | 'complete', account_id, charges_enabled, payouts_enabled, requirements_due[] }`. UI polls this.

### Modified files

- `lib/payments/stripe.ts` — added `createStripeConnectOnboardingLink()`, `getStripeConnectAccount()`, `isStripeAccountReady()`. Extended `createStripeCheckoutSession()` with `instructorStripeAccountId`, `applicationFeeCents`, `productName`, `paymentType`. Sets `transfer_data.destination` + `on_behalf_of` when destination provided (destination-charge marketplace model).
- `app/api/payment/webhook/stripe/route.ts` — added `account.updated` case; syncs `stripe_onboarding_complete` based on `charges_enabled && payouts_enabled`.
- `app/api/payment/create/route.ts` — (a) fetches creator's Connect status on session lookup; (b) USD branch refuses payment creation with 409 if creator hasn't completed onboarding; passes `instructorStripeAccountId` + exact `applicationFeeCents` into `createStripeCheckoutSession`; (c) replaced buggy `existingPayment.maybeSingle()` logic with explicit DELETE of pending/processing rows before INSERT — prevents 23505 UNIQUE violations on retries against `payments_session_id_participant_user_id_status_key`; (d) server-side minimum price enforcement (USD ≥ 500 cents / COP ≥ 2,000,000 cents).
- `app/create/page.tsx` — client-side minimum price validation; fixed payment breakdown math to compute fees in cents (was using dollar rounding → sub-dollar fees displayed as $0.00).
- `app/earnings/payout-settings/page.tsx` — added `stripe_connect` payout method option; Stripe Connect card with status badge (Active / In progress / Not connected), requirements list, "Connect payouts with Stripe" / "Resume Stripe setup" buttons; polls `/api/stripe/connect/status` on mount; bilingual (en/es).
- `app/session/[id]/ActionButtons.tsx` — fixed washed-out gateway label color.
- `lib/validations/payment.ts` — rewrote Zod schema. Old schema required `type` enum, but all client callers send `payment_type` (or nothing for session-participation). Made all fields optional; enum now `'session' | 'session_participation' | 'boost_campaign' | 'pro_storefront'`. Includes `reference_id`, `amount_cents`, `success_url`, `cancel_url` for boost client.
- `lib/logger.ts` — `logError` now extracts `message` / `code` / `details` / `hint` from non-Error error shapes (Supabase error objects were logging as "[object Object]").

### Database changes already applied

- Migration 051 applied — verified in Supabase.
- Migration 047 (finalize_payment RPC) was **re-applied** — on-disk file was correct but deployed function had pre-existing bug referencing nonexistent `fp` table alias. Every webhook that hit it would have failed with Postgres error 42P01. Fixed by re-running `DROP FUNCTION IF EXISTS` + `CREATE OR REPLACE` from the migration file.

## What's verified working in sandbox

- ✅ **Gap 1 — Instructor onboarding**: full E2E. User reached green "Active" badge after completing Stripe's hosted onboarding.
- ✅ **Gap 2 — Marketplace fund split**: verified in Stripe Dashboard. $15 test payment split correctly — $1.50 application_fee to platform, $13.50 transfer to instructor Connect account, $0.74 Stripe processing fee from platform balance.
- ✅ **`finalize_payment` RPC**: verified via direct SQL call. Flips status to approved, inserts `session_participants` row, returns correct JSONB with `participant_added: true`.
- ✅ **Stripe events fire correctly**: `checkout.session.completed`, `payment_intent.succeeded`, `charge.succeeded`, `transfer.created`, `application_fee.created`, `account.updated`.

## What's NOT verified yet (your job)

**Webhook round-trip from `stripe listen` → handler returning [200]**. Previous attempts got [308] because the forwarding URL lacked the trailing slash. Needs one live test with the correct URL to confirm the confirm-page flip from "Pago en Proceso" → approved happens automatically without manual SQL intervention.

## Environment state

- Project root: `/Users/alainalisca/Desktop/Tribe.Ecosystem.4.4.2026/tribe-v3`
- `.env.local` has `STRIPE_SECRET_KEY` (`sk_test_...`), `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (`pk_test_...`), `STRIPE_WEBHOOK_SECRET` (`whsec_...`) all populated with sandbox values
- `npm run dev` expected on `:3000`. Check `lsof -i :3000` first; if port conflict, identify and kill orphans.
- Stripe CLI is authed to the "A Plus Fitness LLC" sandbox account
- Two Vercel Preview webhook endpoints are **disabled** in Stripe Dashboard (pointed at auth-protected preview URLs, returned 401 on every delivery). Do NOT re-enable.
- `.next/` may contain stale build artifacts from before the changes; if hot-reload acts up, `rm -rf .next && npm run dev`.

## The test you need to run first

```bash
cd /Users/alainalisca/Desktop/Tribe.Ecosystem.4.4.2026/tribe-v3

# 1. Kill any orphan stripe listen processes
pkill -f "stripe listen" || true

# 2. Start stripe listen WITH TRAILING SLASH (critical — /stripe/ not /stripe)
#    Run in a dedicated terminal/tmux session and leave it there.
stripe listen --forward-to localhost:3000/api/payment/webhook/stripe/

# Note the whsec_ it prints. Diff against grep STRIPE_WEBHOOK_SECRET .env.local
# — they should match (Stripe CLI caches a single signing secret per machine
# per authenticated account).

# 3. Confirm npm run dev is running on 3000
lsof -i :3000
# If not running: npm run dev
```

Then drive a real test payment. Recommended approaches:

**Option A — automated with Playwright/Puppeteer:** Script a browser flow that (1) signs in as the instructor account, (2) creates a USD paid session ≥ $5, (3) signs out, (4) signs in as a second user, (5) navigates to that session, (6) clicks Pay & Join, (7) enters Stripe test card `4242 4242 4242 4242` / `12/34` / `123` / `12345`, (8) waits for Stripe Checkout redirect back, (9) asserts the confirm page renders success state.

**Option B — manual:** open the app at localhost:3000 in two browsers (normal + incognito). Create session as one user, pay as the other. Faster for a one-shot verification than scripting.

**Option C — `stripe trigger` for webhook plumbing only (doesn't exercise full pipeline):** `stripe trigger checkout.session.completed`. Proves handler returns [200] but synthetic event won't match a real payment row so `finalize_payment` returns `payment_not_found`. Fine as a first smoke-test.

## Verification SQL

After the test payment, confirm:

```sql
-- Most recent payment should show status='approved' (not 'processing')
SELECT id, status, amount_cents, gateway, created_at, updated_at
FROM public.payments
ORDER BY created_at DESC LIMIT 1;

-- Participant row should exist for the buyer, status='confirmed'
SELECT sp.session_id, sp.user_id, sp.status, sp.joined_at
FROM public.session_participants sp
WHERE sp.session_id = '<session_id_from_payment_row>';

-- Instructor's users row should have stripe_account_id + stripe_onboarding_complete=true
SELECT id, email, stripe_account_id, stripe_onboarding_complete
FROM public.users
WHERE email = 'alainalisca@aplusfitnessllc.com';
```

## Known pre-existing issues (unrelated to Stripe work but surfaced during it)

1. **Orphaned `auth.users` rows**: two Google CloudTestLab accounts from March 2026 have no matching `public.users` profile. Check if a `handle_new_user()` trigger exists on `auth.users` — if not, add one as a new migration.
2. **`rate_limits` RLS 42501**: `/api/payment/create` logs an RLS violation on every call during `checkRateLimit_insert`. Non-fatal (wrapped in try/catch) but noisy. Service role should bypass but current policy seems to block.
3. **Hardcoded "15%" UI label**: `app/earnings/payout-settings/page.tsx` says "Tribe retains a 15% platform fee" but `sessions.platform_fee_percent` can override per-session (test session used 10%). Should read the actual value or make the variance explicit in UI copy.
4. **`/api/venues/nearby` returns 500**: unrelated to payments; noticed in dev server logs. Needs investigation before launch.

## Open follow-up work (in priority order)

1. **Commit working tree** — once test passes, `git add . && git commit -m "feat(stripe): complete Connect marketplace integration"`. Push to a feature branch.
2. **Update `PAYMENT_PORTAL_SETUP_GUIDE.md`** to reflect Gaps 1 and 2 are now closed.
3. **Production webhook endpoint** — when going live, register `https://tribe-v3.vercel.app/api/payment/webhook/stripe/` (WITH trailing slash) in Stripe live mode. Stripe Dashboard → Developers → Webhooks → Add endpoint. Subscribe to: `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `account.updated`. Copy the live signing secret into Vercel production env vars.
4. **Unit tests** — add vitest coverage for: `createStripeCheckoutSession` with `transfer_data`, the `/api/stripe/connect/onboard` route, the `account.updated` webhook branch, and the retry-cleanup DELETE in `/api/payment/create`.
5. **Fix `rate_limits` RLS** — tighten or broaden the policy so service-role inserts stop returning 42501.
6. **Fix hardcoded "15%" label** in payout-settings page.
7. **Investigate `/api/venues/nearby` 500**.
8. **Add `handle_new_user()` trigger** as migration 052 if missing.

## Acceptance criteria for "done"

- `stripe listen` terminal shows `[200] POST http://localhost:3000/api/payment/webhook/stripe/` for a `checkout.session.completed` event from a real test payment
- `public.payments` row for the test payment has `status = 'approved'`
- `public.session_participants` row exists linking the buyer to the session with `status = 'confirmed'`
- Browser's "Pago en Proceso" page auto-flips to success view within ~5 seconds without manual SQL intervention
- Working tree committed
