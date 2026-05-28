# Payments Handoff — Wompi Blocker & Stripe Override

**Created:** 2026-05-27 — during the Alex-session bug-fix session.
**Status:** Temporary fix shipped. Long-term decision pending.
**Owner:** Al (alainalisca@aplusfitnessllc.com).

---

## TL;DR

- **Wompi (Colombian payment gateway) is broken in production.** Every charge fails with "Failed to create Wompi transaction." Root cause: `WOMPI_PRIVATE_KEY` and `WOMPI_EVENTS_SECRET` are empty in `.env.local` (and almost certainly on Vercel). `WOMPI_PUBLIC_KEY` is set but useless without the matching private key.
- **Wompi onboarding is blocked** because Al does not currently have a Colombian phone number, Colombian bank account, or Colombian tax ID (RUT) — all of which Wompi requires for merchant registration.
- **Temporary fix:** added a `PAYMENT_GATEWAY_OVERRIDE` env var that forces every payment through Stripe regardless of currency. Set it to `stripe` on Vercel and Stripe handles everything. Unset it (or set it to `wompi`) to restore the per-currency default once Wompi is sorted.
- **Long-term decision needed:** pick a path from the options in [§ Long-term options](#long-term-options) below.

---

## Current state of the codebase

### Files touched in the override commit

| File                                                                    | What changed                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`lib/payments/config.ts`](../lib/payments/config.ts)                   | `getPaymentGateway()` now reads `process.env.PAYMENT_GATEWAY_OVERRIDE` first. If set to `'stripe'` or `'wompi'`, returns that gateway regardless of currency. Otherwise falls back to the per-currency default (COP→wompi, USD→stripe).                                                          |
| [`lib/payments/config.test.ts`](../lib/payments/config.test.ts)         | Added two regression tests for the override.                                                                                                                                                                                                                                                     |
| [`lib/payments/stripe.ts`](../lib/payments/stripe.ts)                   | Widened `CreateStripeCheckoutSessionParams.currency` from `'USD'` to `'USD' \| 'COP'`. Stripe treats COP as a zero-decimal currency.                                                                                                                                                             |
| [`app/api/payment/create/route.ts`](../app/api/payment/create/route.ts) | All three Stripe callsites (tip, boost, session participation) now pass through the actual request currency instead of hardcoding `'USD'`, and divide the amount by 100 when currency is COP (because the app stores COP as `value × 100` per the Wompi convention, but Stripe expects raw COP). |

### How to switch payments live to Stripe

On Vercel:

1. **Project Settings → Environment Variables.**
2. Add `PAYMENT_GATEWAY_OVERRIDE` with value `stripe` to the **Production** environment (and **Preview** if you want to test there).
3. Redeploy (env var changes don't auto-trigger a build).

To switch back to Wompi after fixing it: delete that env var, or set it to `wompi`.

### Files NOT changed (so we don't break the Wompi path for future recovery)

- [`lib/payments/wompi.ts`](../lib/payments/wompi.ts) — left as-is. When `WOMPI_PRIVATE_KEY` / `WOMPI_EVENTS_SECRET` are set, this should work again with no code change.
- [`app/api/payment/webhook/wompi/route.ts`](../app/api/payment/webhook/wompi/route.ts) — webhook handler is fine; it just needs `WOMPI_EVENTS_SECRET` to verify signatures.

---

## What broke Wompi

### The immediate failure

`lib/payments/wompi.ts` calls `getCredentials()`, which throws if `WOMPI_PUBLIC_KEY` or `WOMPI_PRIVATE_KEY` is missing:

```ts
if (!publicKey || !privateKey) {
  throw new Error('Missing Wompi credentials...');
}
```

In `.env.local`:

- `WOMPI_PUBLIC_KEY` — 47 chars (looks like a real `pub_test_...`)
- `WOMPI_PRIVATE_KEY` — **empty string `""`** ❌
- `WOMPI_EVENTS_SECRET` — **empty string `""`** ❌
- `WOMPI_SANDBOX=true`

The empty string is falsy, so the function throws, the outer try/catch returns `null`, and `app/api/payment/create/route.ts` surfaces "Failed to create Wompi transaction" to the UI.

Reproduced locally on 2026-05-27 by hitting Wompi sandbox `/transactions` with the missing private key — got HTTP 401 `INVALID_ACCESS_TOKEN`.

### The structural reason it's blocked

Wompi (like every Colombian payment gateway — PayU, Bold, ePayco, Mercado Pago Colombia) requires the merchant to provide:

- **RUT** (Registro Único Tributario — Colombian tax ID)
- **Colombian bank account** for payouts
- **Colombian phone number** for verification
- In most cases, a Colombian legal entity (SAS or natural person resident in Colombia)

Al does not have these. So we cannot complete Wompi merchant onboarding to obtain the production private key.

---

## Long-term options

Ranked by what I'd actually recommend for this product / market / situation:

### Option 1 — Stripe only (current fix, indefinitely)

**Effort:** none (already done).
**Pros:** zero new work. Stripe accepts Colombian Visa/MC cards. Settles to Al's US bank.
**Cons:** **NO Nequi, NO PSE, NO Bancolombia, NO Daviplata.** That's a real chunk of the Medellín market that doesn't use a credit card for $40k COP yoga classes — they use Nequi push notifications. Conversion rate will be measurably lower than Wompi would give you.
**Verdict:** acceptable as a 1–3 month bridge while you decide the long-term path. Not acceptable as the permanent answer if Medellín is the primary market.

### Option 2 — Have a Colombian co-founder be the Wompi merchant ⭐

**Effort:** depends on the co-founder relationship — code-wise zero (Wompi is already integrated, just needs the right env vars).
**Pros:** unlocks Nequi + PSE + all local methods at Wompi's 2.65% fee. The integration already exists and works the moment the env vars are set. Lowest friction for end users.
**Cons:** requires trust + a legal agreement about how Wompi payouts flow from the co-founder's account to the platform. Tax implications need a Colombian accountant to look at once.
**Verdict:** **this is what I'd push hardest for.** Per the memory file, Victor Ruiz is an active co-founder candidate. If Victor is Colombian (or anyone else on the team is), this is the cheapest, fastest, and most user-friendly path. Worth having the conversation this week.

### Option 3 — dLocal Go (or Rapyd, Tilopay)

**Effort:** ~1 week of dev work to integrate a new gateway adapter + 1–2 weeks of business onboarding.
**Pros:** payment orchestrators built specifically for foreign merchants selling in LatAm. dLocal Go accepts Colombian local methods (PSE at minimum) and pays you out in USD. You're not the Colombian merchant of record — they are.
**Cons:** higher fees than Wompi (~4–6% vs 2.65%). Onboarding still typically wants a US LLC and proof of business (Stripe Atlas works for this). Manual review by their team.
**Verdict:** the right answer if no Colombian co-founder option materializes and you want real local-method support.

### Option 4 — PayPal as fallback

**Effort:** ~3–5 days of dev work for a PayPal adapter.
**Pros:** works internationally, no Colombian entity needed.
**Cons:** Colombian PayPal adoption is much lower than Nequi/cards. Fees are high (~5.4% + flat fee). Payouts to a US bank take 3–5 days. The UX from a phone is clunky.
**Verdict:** use it as a tertiary fallback at best, not as the main option.

### Option 5 — Crypto / USDC

**Effort:** ~2–4 days for a Coinbase Commerce or Privy integration.
**Pros:** zero banking friction. Free to add.
**Cons:** maybe 1–2% of Medellín athlete users will pay this way in 2026.
**Verdict:** nice-to-have, not a solution.

---

## Other related issues uncovered (separate but adjacent)

1. **`WOMPI_EVENTS_SECRET` is empty.** Even if private key gets set, the webhook handler at `app/api/payment/webhook/wompi/route.ts` won't validate signatures and will reject every webhook. Both secrets need to come from the Wompi dashboard together.

2. **Stripe Connect onboarding for instructors.** The Stripe path requires each instructor to have a Stripe Connect account with `stripe_onboarding_complete = true` (see `app/api/payment/create/route.ts:132-149` for the gate). Without this, tips and paid sessions hit a 409 "payout setup incomplete" error. This was already true before today's changes — but now that Stripe is the ONLY gateway, every instructor who wants to accept paid sessions/tips needs Connect onboarding. There's a separate flow for this at `/api/stripe/connect/*` (search for it).

3. **The `join_session` Postgres RPC** was broken on production for ~2 months (returned "Session not found" for every call) and was fixed during this same session by re-running migration `supabase/migrations/042_join_session_rpc.sql` via the Supabase SQL Editor. If joining sessions starts failing again, check that the migration hasn't been overwritten.

---

## Open questions for further investigation

These are the things to think through before deciding the long-term path:

1. **Does Victor Ruiz (or another active candidate) have Colombian residency + bank account?** If yes → push hard on Option 2.
2. **What % of current beta users in Medellín actually have a Visa/MC credit card vs only Nequi/Bancolombia?** A quick survey of the existing waitlist would settle whether Stripe-only is survivable for the beta.
3. **Is a US LLC (Stripe Atlas or similar) in scope?** Both dLocal Go and most "international" PSPs ask for one during onboarding. Stripe Atlas is ~$500 + a yearly maintenance fee.
4. **Tax-side question for an accountant:** if Wompi flows through a Colombian co-founder's account and they wire to the US, how is that treated for both sides? This is what would block Option 2 if anything.
5. **Should Tribe even take a platform fee in COP right now?** During beta with <100 paying users, maybe the right move is to set `PLATFORM_FEE_PERCENT = 0` until volume justifies the operational overhead of routing money.

---

## Commands / code references (for the future Claude session)

```bash
# Reproduce the Wompi failure locally:
node --env-file=.env.local -e "
const { WOMPI_PUBLIC_KEY, WOMPI_PRIVATE_KEY, WOMPI_SANDBOX } = process.env;
const baseUrl = WOMPI_SANDBOX === 'true' ? 'https://sandbox.wompi.co/v1' : 'https://production.wompi.co/v1';
console.log('hasPrivate:', !!WOMPI_PRIVATE_KEY);
fetch(baseUrl + '/transactions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + WOMPI_PRIVATE_KEY },
  body: JSON.stringify({ amount_in_cents: 1000000, currency: 'COP', customer_email: 'x@y.z', reference: 't' + Date.now(), redirect_url: 'https://x' }),
}).then(r => r.text().then(t => console.log(r.status, t)));
"
```

Code anchors:

- Gateway selector: `lib/payments/config.ts:getPaymentGateway()`
- Wompi adapter: `lib/payments/wompi.ts:createWompiTransaction()`
- Stripe adapter: `lib/payments/stripe.ts:createStripeCheckoutSession()`
- All-paths router: `app/api/payment/create/route.ts`
- Wompi webhook: `app/api/payment/webhook/wompi/route.ts`
- Stripe webhook: `app/api/payment/webhook/stripe/route.ts`
- Currency type + unit conventions: `lib/payments/config.ts:Currency`

---

## How to revert the override (when Wompi is fixed)

1. Get `WOMPI_PRIVATE_KEY` and `WOMPI_EVENTS_SECRET` from the Wompi merchant dashboard.
2. Set them on Vercel (Production + Preview) and locally in `.env.local`.
3. **Delete** `PAYMENT_GATEWAY_OVERRIDE` from Vercel (or set it to `wompi`).
4. Redeploy.
5. Test a COP tip end-to-end — should now route through Wompi again.
6. Test a USD tip — should still route through Stripe.

The code path is reversible without any further changes. The Stripe-with-COP support stays in place but only activates when the override is on or when someone explicitly passes COP to the Stripe adapter.
