# Tribe v3 — Payment Portal Setup Walkthrough

**Audience:** Al (non-developer walking through dashboard config).
**Goal:** Get Wompi (COP) and Stripe (USD) wired correctly so paid sessions work end-to-end, OR confirm Phase 1 cash-only is the right call and defer digital.

Read this all the way through before you open any dashboard tabs. Understanding the whole flow will save you from getting lost in a side tab.

---

## Status — 2026-04-23

Stripe Connect marketplace integration is **code-complete and verified end-to-end in sandbox**. The two gaps this guide flagged in section S-5 are closed:

- **Gap 1 — Instructor Connect onboarding.** Express account creation, hosted onboarding redirect, return/refresh handlers, and `account.updated` webhook sync are all live. See `app/api/stripe/connect/{onboard,return,refresh,status}/route.ts` and migration `051_stripe_connect.sql`.
- **Gap 2 — Marketplace fund routing.** `createStripeCheckoutSession` in `lib/payments/stripe.ts` now sets `transfer_data.destination` and `application_fee_amount` on the session. A verified $12 test payment produced a `charge.succeeded` to the platform, a `transfer.created` to the instructor's Connect account, and an `application_fee.created` event, all returning [200] from the webhook handler.

Production still needs: the live-mode webhook endpoint (see S-4 note below on the trailing slash + middleware), the live signing secret in Vercel env, and the other follow-ups in `STRIPE_HANDOFF.md` (hardcoded "15%" UI label, `rate_limits` RLS noise, `handle_new_user` trigger check). Wompi (COP) is still Phase 2 and untouched.

---

## The big picture — what's already built

The code is **further along than you think.** Your repo has:

- A full payment gateway router in `lib/payments/` that auto-routes COP transactions to Wompi and USD transactions to Stripe.
- A transactional `finalize_payment` RPC in Supabase (commit `937c31b`) that atomically handles webhook → payment status update → participant insert → product fulfillment. If any piece fails, the whole thing rolls back.
- Webhook handlers for both gateways with signature verification, idempotency, and amount-tamper protection.
- A 15% platform fee baked in, with automatic fee-waiver for Tribe+ / Pro subscribers.
- Rate limiting on the payment creation route (10 attempts/min per user).
- Full unit tests on the payment creation and webhook routes.

**What's missing is not code. It's account setup + credentials + webhook URLs.** The `.env.local.example` file shows the four Wompi keys and two Stripe keys you need. Today those are placeholders.

---

## The critical decision before you start

Before you spend two hours setting up Stripe, answer this honestly:

**Is Phase 1 of Tribe's monetization plan cash-only, or do you need digital payments this launch?**

Per your monetization plan (in Notion → Business & Finance once imported, originally `Tribe_Monetization_Plan.docx`):

- **Phase 1 (Weeks 1–4):** 0% platform fee, cash or Nequi, manual confirmation. Goal: attract the first 5 Medellín instructors. **No Stripe. No Wompi. Just a UI toggle and a "mark as paid" flow.**
- **Phase 2 (Weeks 5–8):** Automated payments, 10–15% platform fee, Stripe Connect + Wompi live. This is when digital goes on.
- **Phase 3 (Weeks 9–12):** 15% fee + instructor subscriptions.

**My strong recommendation:** Launch Phase 1 this week. Don't try to wire Wompi and Stripe before Friday. The reasoning:

1. Your 5-instructor target doesn't require digital payments. Cash works fine for 20–40 sessions a week. Nequi (Colombian phone-to-phone transfer) also works without integration.
2. Every hour you spend on Wompi config is an hour you're not onboarding instructors or doing marketing.
3. Once you have 5 instructors using the app reliably, you'll have learned things that will change how you configure Stripe Connect. Configuring it now means possibly re-doing it later.
4. Wompi requires a Colombian business entity for production use. If A Plus Fitness LLC is a US entity (it is — per your email domain), Wompi production signup will be harder than you expect.
5. Stripe Connect for marketplace payouts has its own onboarding flow for each instructor. That's not a "one-time setup," it's a user-facing process you'd need to build.

**What this means concretely for your launch:** You can skip most of this document for now. Read it so you understand the shape of what's coming in Phase 2, but don't execute it this week.

**If you still want to enable digital payments now** (you have a specific reason — maybe an instructor asked for it), the rest of this guide walks through it.

---

## Phase 1 setup (what you actually need this week)

For a cash-only launch, the payment-related pre-launch work is minimal:

### P1-1 · Verify the session-creation UI exposes a "Free" or "Paid (cash)" toggle

Open the `/create` page in the deployed app. When creating a session, confirm:

- There's a price field AND a "free" toggle.
- When "free," the session has no price displayed anywhere.
- When "paid," the UI shows a payment instructions field where the instructor can write something like "Pay 45,000 COP to Nequi: 300-123-4567" or "Pay cash at the session."

If any of that is missing, that's a small UI fix — add it to the QA tracker.

### P1-2 · Verify session detail shows the payment instructions for paid sessions

On a paid session, the booking button should lead to a screen that says roughly: "This session costs COP 45,000. Pay the instructor via Nequi or cash. Confirm with them directly. You'll be added to the roster once they confirm."

That's the Phase 1 flow. No webhook, no gateway, no card.

### P1-3 · Confirm the `.env.local.example` Stripe/Wompi fields are documented as "Phase 2"

Add a comment in `.env.local.example` above each payment block:

```
# Payments - Wompi (COP) — Phase 2. Leave empty for Phase 1 cash-only launch.
```

This signals to the next developer (or future you) that absent keys are intentional, not a mistake.

### P1-4 · Disable or hide the "Boost campaign" and "Pro Storefront upgrade" CTAs

Both of these require Stripe/Wompi to actually work. If they're visible in the UI right now, they're dead-ends for Phase 1. Either hide them with a feature flag or replace the CTA with a "Coming soon" badge.

Grep: `boost_campaign` and `pro_storefront` — the payment create route (`app/api/payment/create/route.ts` line 65) explicitly handles these as payment types. Until the gateways are configured, any click lands in an error state.

**That's it for Phase 1.** Skip the rest of this document until you're actually ready to flip on digital payments.

---

## Phase 2 setup — Wompi (COP, Colombia)

Only do this section when you're ready to accept Colombian peso digital payments.

### W-1 · Create a Wompi Commerce account

1. Go to [wompi.co](https://wompi.co) → **Crea tu comercio** (top right).
2. You'll need a **Colombian business entity** (RUT, NIT, bank account). If A Plus Fitness LLC is US-only, this is your first real blocker — you'll need a Colombian legal presence (yours or a local instructor acting as a counterparty).
3. Alternative: operate through an instructor's Wompi account as a marketplace (they receive payment, you invoice them for the platform fee). Messier but avoids the Colombian entity problem.
4. Submit documentation. Wompi typically approves within 2–5 business days.

### W-2 · Get sandbox keys first

1. Log in → **Desarrolladores** (developer area) → **Llaves**.
2. Toggle to **Sandbox**.
3. Copy: `pub_test_...` (public key) and `prv_test_...` (private key).
4. Add to your local `.env.local`:

```
WOMPI_PUBLIC_KEY=pub_test_xxx
WOMPI_PRIVATE_KEY=prv_test_xxx
WOMPI_SANDBOX=true
```

5. Do NOT add these to Vercel yet. Test locally first.

### W-3 · Configure the sandbox webhook

1. In Wompi developer dashboard → **Webhooks** → **Agregar Endpoint**.
2. **Endpoint URL:** `https://tribe-v3.vercel.app/api/payment/webhook/wompi` (use the actual production URL even for sandbox — Wompi needs a public URL).
3. **Events to send:** `transaction.updated` (the main event your handler listens for).
4. **Save.** Wompi shows you an **Eventos Secret** string. Copy it.
5. Add to local `.env.local`:

```
WOMPI_EVENTS_SECRET=wevt_test_xxx
```

6. Wompi's webhook signature verification (in `lib/payments/wompi.ts`) expects HMAC SHA256 with this secret, so getting this right matters.

### W-4 · Run a sandbox test transaction

1. In the app (running locally at `localhost:3000`), create a test paid session priced in COP.
2. As a second user, click "Book" → should redirect to Wompi's sandbox checkout.
3. Use a **sandbox test card:** `4242 4242 4242 4242`, any future expiration, CVV `123`.
4. Complete the transaction.
5. Wompi redirects back to your `redirect_url`. Check:
   - Did Wompi call the webhook? (Check Wompi dashboard → Eventos → last 10 events.)
   - Did the webhook return 200? If not, your signature verification may be off — check `WOMPI_EVENTS_SECRET`.
   - Did the `payments` row in Supabase move from `pending` → `approved`?
   - Did the `session_participants` row get inserted (finalize_payment RPC)?

### W-5 · Production keys and production webhook

Once sandbox works end-to-end:

1. Switch Wompi dashboard to **Production**.
2. Copy the production keys (`pub_prod_...`, `prv_prod_...`).
3. Create a production webhook pointing at `https://tribe-v3.vercel.app/api/payment/webhook/wompi`. Get a new `WOMPI_EVENTS_SECRET` for production.
4. Add all three to **Vercel → Settings → Environment Variables** (Production only):
   - `WOMPI_PUBLIC_KEY`
   - `WOMPI_PRIVATE_KEY`
   - `WOMPI_EVENTS_SECRET`
   - `WOMPI_SANDBOX=false`
5. Redeploy.
6. Run one small real transaction (COP 1,000 = ~$0.25) as a final smoke test.

### W-6 · Set up payouts

In Wompi dashboard → **Pagos** / **Payouts** settings:

- Link your Colombian bank account.
- Set payout frequency (daily / weekly).
- **Important:** Wompi payouts go to _your_ bank. You then need to pay the instructors separately (minus platform fee). This is why Stripe Connect is cleaner at scale — it handles per-instructor payouts automatically.

---

## Phase 2 setup — Stripe (USD, Stripe Connect)

For US-dollar transactions from non-Colombian users. More complex than Wompi because it's a marketplace setup.

### S-1 · Create a Stripe account

1. Go to [stripe.com](https://stripe.com) and sign up with A Plus Fitness LLC.
2. Provide your EIN (SSN won't work for LLC), business address, and a bank account.
3. Activate your account (Stripe will ask for product description — say "marketplace for fitness sessions in Colombia").

### S-2 · Enable Stripe Connect

For marketplace-style payouts (instructor gets paid, Tribe takes a cut), you need **Stripe Connect**.

1. Stripe dashboard → **Connect** → **Get started**.
2. Choose **Platform or marketplace** account type.
3. Choose **Express accounts** for your instructors (easiest onboarding — instructors go through a Stripe-hosted flow).
4. Configure platform fee: 10–15% per transaction (matches your Phase 2 monetization plan).

### S-3 · Get test mode API keys

1. Stripe dashboard → **Developers** → **API keys** → **Test mode** (toggle in top right).
2. Copy `sk_test_...` (secret key).
3. Add to local `.env.local`:

```
STRIPE_SECRET_KEY=sk_test_xxx
```

### S-4 · Configure the test webhook

1. Stripe dashboard → **Developers** → **Webhooks** → **Add endpoint**.
2. **Endpoint URL:** `https://tribe-v3.vercel.app/api/payment/webhook/stripe/` (or use [Stripe CLI](https://stripe.com/docs/stripe-cli) for local testing: `stripe listen --forward-to localhost:3000/api/payment/webhook/stripe/`). **Trailing slash is required** — `next.config.ts` sets `trailingSlash: true`, so the non-slash form redirects 308 and Stripe treats that as a failed delivery.
3. **Events to send:** `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `account.updated` (last one is required for Connect onboarding completion sync), plus `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `charge.refunded` if you want refund handling.
4. Save. Stripe shows a **signing secret** (`whsec_...`). Copy it.
5. Add to `.env.local`:

**Middleware note.** The project `middleware.ts` auth-gates everything by default; webhook paths live in a `publicApiPaths` allowlist (`/api/payment/webhook/stripe` is already in there). If you add a new webhook endpoint, you must whitelist it there or Stripe's POSTs will be redirected to `/auth` and never reach the handler.

```
STRIPE_WEBHOOK_SECRET=whsec_test_xxx
```

### S-5 · Instructor onboarding flow

**Status (2026-04-23): implemented and verified in sandbox.** What the code does now:

1. Instructor opens `/earnings/payout-settings` → sees a Stripe Connect card with status badge (Not connected / In progress / Active).
2. Clicking "Connect payouts with Stripe" POSTs `/api/stripe/connect/onboard`, which creates the Express account if one doesn't exist and mints a fresh `AccountLink`. The UI redirects them to Stripe's hosted onboarding.
3. On completion, Stripe sends them to `/api/stripe/connect/return` which verifies the account and flips `stripe_onboarding_complete` if `charges_enabled && payouts_enabled` are both true.
4. In parallel, Stripe fires `account.updated` webhooks, and the handler (`app/api/payment/webhook/stripe/route.ts`) syncs `stripe_onboarding_complete` based on the same two booleans. Either path completes the flag; they're idempotent.
5. `/api/stripe/connect/status` returns `{ state, account_id, charges_enabled, payouts_enabled, requirements_due[] }` for the UI to poll.
6. When a customer books a USD-priced session, `/api/payment/create` refuses with 409 if the creator hasn't completed onboarding, and otherwise builds a Checkout Session with `transfer_data.destination = <instructor_account_id>`, `on_behalf_of = <instructor_account_id>`, and `application_fee_amount` equal to the platform's cut. Destination charges model — the full charge lands on the platform, the instructor's portion is transferred automatically, and the platform fee stays behind.

Nothing more to do on the code side for digital launch. Production cutover is the env-var + live-webhook work in S-7, plus the follow-ups in `STRIPE_HANDOFF.md`.

### S-6 · Test with a test card

Stripe test cards: `4242 4242 4242 4242` = success. `4000 0000 0000 0002` = card declined. Full list at [stripe.com/docs/testing](https://stripe.com/docs/testing).

### S-7 · Go live

Once test mode works end-to-end:

1. Stripe dashboard → toggle to **Live mode**.
2. Copy the live API key and webhook signing secret.
3. Add to **Vercel env vars** (Production).
4. Redeploy.
5. Ask a friendly instructor to complete Connect onboarding.
6. Run one real transaction at minimum amount.

---

## What can go wrong, and how to tell

### "I configured everything but webhooks don't fire"

- Check the webhook URL. It must be `https://` (Wompi and Stripe reject HTTP).
- Check that `/api/payment/webhook/wompi` or `/stripe` returns 200 to a manual `curl` test. It should return 400 for missing signature — that's correct.
- Check Wompi/Stripe dashboards for failed webhook attempts and the error message they got back.
- Check Sentry (once LR-01 is done) for captured errors in the webhook route.

### "Webhooks fire but payment status doesn't update"

- Signature verification is probably failing. Most common cause: `WOMPI_EVENTS_SECRET` or `STRIPE_WEBHOOK_SECRET` is the sandbox value while you're hitting production (or vice versa).
- Check the webhook response in the gateway dashboard. If it's a 401, signature. If 500, something downstream.

### "Payment status updates but participant isn't added to session"

- The `finalize_payment` RPC may not have all the right permissions. Check Supabase logs → Postgres logs.
- Or the reference ID doesn't match a payment row. Wompi sends back the `reference` you gave it; verify the one in the webhook payload matches the `payment_id` in your `payments` table.

### "Amounts don't match"

- Wompi uses `amount_in_cents` (same as your codebase). Stripe uses integer amounts in the currency's smallest unit. Both are integers, no floating point.
- The finalize_payment RPC includes an amount-tamper check (SEC-04). If amounts don't match, it raises an exception. Sentry will show this.

---

## What to do right now (my recommendation, again)

1. **Skip Wompi and Stripe setup for this week.** Launch Phase 1 cash-only.
2. Do the Phase 1 checklist items (P1-1 through P1-4 above) — maybe 30 minutes of UI verification and small fixes.
3. Ship. Get 5 instructors on the platform in the first 2 weeks.
4. When an instructor asks "can people pay me through the app?" or you're ready to introduce the 10% fee (Phase 2), come back to this document and run through the W and S sections.

That's the fastest path to a real business. Don't let the payment portal setup be what delays your launch — it's the kind of thing that expands to fill whatever time you give it.
