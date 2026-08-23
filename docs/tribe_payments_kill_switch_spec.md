# Tribe payment kill switch spec

Implementation spec. No code in this document.

## 1. Goal

Tribe cannot legally take a platform fee or process payments until a banking
issue is resolved, and that is not soon. One flag must turn off every surface
that implies Tribe processes payments or takes a cut, while leaving instructor
session pricing and off-platform collection (Nequi, bank transfer, cash) fully
intact. Instructors keep charging; Tribe touches no money.

Hiding the fee display (done in `fix/platform-fee-display`) was necessary but not
sufficient: the on-platform checkout code path still exists and is reachable, and
several surfaces still tell the user Tribe handles money.

## 2. The boundary

There are two distinct paid-session mechanisms in the code. The kill switch must
sit exactly on the line between them.

### 2.1 Stays live (off-platform, no money through Tribe) — DO NOT gate

This is the mechanism the session-join UI actually uses today
(`app/session/[id]/ActionButtons.tsx:206-215` routes paid sessions to
`PaidSessionRequest`, commented "off-platform request, no checkout, no money
through Tribe").

- `components/session/PaidSessionRequest.tsx` — arrange payment directly.
- `payment_instructions` free-text (Nequi/cash): create `app/create/page.tsx:88,187-188,256,763-772`;
  edit `app/session/[id]/edit/PriceSection.tsx:119-121`, `useEditSession.ts`, `editGuards.ts`.
- Session pricing: `is_paid` toggle and `price_cents`/`price_display`
  (`app/create/page.tsx:85,290`, `editGuards.ts:62,76`), and `sessions.price_cents`
  throughout `lib/dal/sessions.ts`.

None of this moves money through Tribe, so none of it is gated. An instructor can
still mark a session paid, set a price, and tell athletes how to pay them directly.

### 2.2 Gets gated (Tribe-side, money through Tribe or implies a fee)

Everything in the C1 inventory below.

## 3. C1: inventory of Tribe-side payment/fee surfaces

### On-platform checkout (money actually flows through Tribe)

- `app/api/payment/create/route.ts` — creates Wompi transactions and Stripe
  Checkout Sessions. **Handles three things in one route:** session participation
  (`:375-701`), boost campaigns / pro storefront (`:233-373`), and tips
  (`:76-230`). Fee math via `calculateFeesForUser`/`calculateFees` (`:549-556`);
  USD sessions require instructor Connect onboarding (`:637-654`).
- Webhooks: `app/api/payment/webhook/wompi/route.ts`, `app/api/payment/webhook/stripe/route.ts`.
- `components/BookingConfirmModal.tsx:107-131` — the on-platform booking modal, incl.
  "Platform fee: Included" and the Wompi/Stripe method line.

> Scope decision for you (flagged, not assumed): gating `payment/create` wholesale
> also disables **tips** and **boost/pro-storefront** purchases, because they route
> money through Tribe too. Under "Tribe touches nothing" that is correct, so this
> spec gates all three. If you want tips or boosts to stay live, the flag needs a
> per-purpose branch instead of gating the whole route. Default recommendation:
> gate all three.

### Stripe Connect onboarding (US-hardcoded dead end, already partly hidden)

- Routes: `app/api/stripe/connect/onboard/route.ts` (country hardcoded `'US'` `:81`),
  `.../status`, `.../return`, `.../refresh`.
- Helpers: `lib/payments/stripe.ts` (`createStripeConnectAccount`, onboarding links).
- UI: `app/earnings/payout-settings/page.tsx:279-300,596-733`;
  `components/tribe-os/StripeConnectBanner.tsx` ("Conecta Stripe para aceptar pagos"),
  rendered at `app/os/revenue/page.tsx:128`.

### Payout nudges / settings

- `components/PayoutSetupBanner.tsx` ("Configura cómo recibir pagos"), rendered at
  `app/dashboard/instructor/page.tsx:232`.
- `app/earnings/payout-settings/page.tsx` — methods `wompi | manual | stripe_connect`
  (`:21`), "15% platform fee" copy (`:623-624`).

### Tribe.OS revenue analytics (computed from `fee_cents`)

- Page `app/os/revenue/page.tsx` (premium-gated). Components
  `app/os/revenue/_components/SummaryCards.tsx:77,89-90,112` (gross / platform fees /
  net), `RevenueChart.tsx`, `PaymentTable.tsx`. DAL `lib/dal/revenue.ts`
  (`gross_cents`/`fee_cents`/`refund_cents`). API
  `app/api/tribe-os/revenue/payments/route.ts` (premium-gated).

### Server-side fee math

- `lib/payments/config.ts:6` `PLATFORM_FEE_PERCENT = 15`; `:50-58` `calculateFees`;
  `:72-84` `calculateFeesForUser`. Fee precedence in checkout
  `app/api/payment/create/route.ts:518-553`.

## 4. C2: the flag

**There is no existing `INSTRUCTOR_PAYMENTS_ENABLED` flag or prior spec for one.** A
repo-wide search found only:

- `TRIBE_OS_BILLING_ENABLED` — gates ONLY the Tribe.OS subscription checkout
  (`app/api/tribe-os/subscription/checkout/route.ts:44-71`, `isBillingEnabled()`).
  This is a different concern (instructors paying Tribe for Tribe.OS), and it must
  stay independent. Do not overload it.
- `NEXT_PUBLIC_ENABLE_STRIPE_PAYOUTS` — client-only, hides the Connect payout UI
  (`app/earnings/payout-settings/page.tsx:30`). Hides UI only, gates no route.
- `PAYMENT_GATEWAY_OVERRIDE` — routing (stripe vs wompi), not an on/off gate.

So this spec introduces the first instructor-payments kill switch. Reuse the name
your prior spec intended: **`INSTRUCTOR_PAYMENTS_ENABLED`**, kept separate from
`TRIBE_OS_BILLING_ENABLED`.

**Where it is read.** One helper, mirroring the `isBillingEnabled()` precedent, in
`lib/payments/config.ts`, for example `isInstructorPaymentsEnabled()` returning
`process.env.NEXT_PUBLIC_INSTRUCTOR_PAYMENTS_ENABLED === 'true'`.

- Use the `NEXT_PUBLIC_` prefix so the same var is readable in both the server API
  routes and the `'use client'` UI components (this app is all client components).
- Default **off**: anything other than the literal `'true'` disables payments. That
  makes "not set" fail safe.
- **Authoritative enforcement is server-side.** The API routes
  (`payment/create`, `stripe/connect/*`) must themselves return a disabled response
  when the flag is off (a 403/503, like the billing gate). Client hiding alone is
  not enough: `docs/BUILD_AUDIT_2026-08-16.md:60-79` confirms the payment path is
  reachable, so UI hiding is cosmetic and the route must refuse.

## 5. C3: `fee_cents` and the revenue cards while the flag is off

- **New writes:** with the flag off, `payment/create` refuses, so no new payment row
  and no new `fee_cents` is written. Nothing accrues.
- **Fee computation:** `calculateFees` / `calculateFeesForUser` should return a fee of
  `0` when the flag is off, so any residual caller yields zero rather than a 15%
  deduction. Do not delete `PLATFORM_FEE_PERCENT`; gate its application.
- **Revenue cards:** a "Gross / Platform fees / Net to you" breakdown implies Tribe
  takes a cut. While the flag is off, **hide the platform-fee and net-to-you rows**
  in `SummaryCards.tsx` (and the equivalent columns in `PaymentTable`/`RevenueChart`),
  leaving at most a single "collected" figure. Simplest shippable option: hide the
  whole Tribe.OS revenue surface while the flag is off, since it is premium-gated and
  dormant anyway. Recommendation: **fee shown as 0, fee/net rows hidden** (keeps any
  gross figure honest without asserting a platform cut). Confirm which you prefer.
- Historical `fee_cents` already in the database is left untouched (capture/analytics
  of past state is not this flag's job).

## 6. C4: marketing copy (separate decision, NOT a code change here)

These assert an "85% / 15% fee" model that is not currently true. Flagging for your
decision; this spec does not change them:

- `app/faq/page.tsx:27-28,97-100`
- `components/marketing/instructors/RevenueModel.tsx:14,19,33,47,58`
- `components/marketing/landing/ForInstructorsPreview.tsx:34,41,81`
- `components/marketing/landing/HowItWorksSection.tsx:52,101`
- `components/marketing/landing/FAQPreviewSection.tsx:16,38`
- `components/marketing/landing/TribeOSSection.tsx:67,128`
- Guides/assets: `onboarding-build/guide.html:256`, `onboarding-build/guide-es.html:258`,
  `social-assets/generate.mjs:140,151`.

Decision needed: reword to the current reality (Tribe takes nothing, instructor keeps
100%, off-platform collection), or leave as the intended future model. Either way it
is copy, decided by you, not gated by the flag.

## 7. C5: shippable steps, smallest and safest first

- **Step 1: add the flag + helper.** `isInstructorPaymentsEnabled()` in
  `lib/payments/config.ts`, reading `NEXT_PUBLIC_INSTRUCTOR_PAYMENTS_ENABLED`,
  default off. No behavior change yet (nothing reads it). Trivial, reviewable alone.
- **Step 2 (safety-critical): server-side refuse.** Gate `app/api/payment/create/route.ts`
  and `app/api/stripe/connect/*` to return a disabled response when the flag is off.
  This is the step that actually stops money moving through Tribe; ship it first of
  the behavior changes. Covers sessions, tips, and boosts (see the scope note in C1).
- **Step 3: hide the client entry points.** `StripeConnectBanner`, `PayoutSetupBanner`,
  the payout-settings Connect card, and `BookingConfirmModal` (or the on-platform
  booking flow entry). With Step 2 already refusing, this removes dead-ends the user
  can no longer complete.
- **Step 4: fee math and revenue cards.** `calculateFees*` return 0 when off; hide the
  fee/net rows in the Tribe.OS revenue components (C3).
- **Step 5 (non-code, yours): marketing copy decision** (C4).

Each step is independently shippable. Test for Steps 2 to 4: set the flag off,
confirm every gated route returns disabled and every gated surface is hidden, and
confirm the off-platform path (mark paid, set price, payment_instructions,
`PaidSessionRequest`) still works end to end. Then set the flag on and confirm the
on-platform surfaces reappear, so the switch is reversible the day banking is fixed.
