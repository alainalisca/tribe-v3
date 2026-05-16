# Tribe.OS trip work — handoff

**Branch:** `feature/tribe-os` (not yet merged to `main`)
**Window:** 2026-05-07 to 2026-05-10
**Reconciles against:** `Tribe.OS Trip Engineering Plan` (2026-05-07) + `TRIBE_OS_WEEK_1_STARTER_PACK` + `Claude_Code_5_Day_Audit_Fix_Prompts.md`

## TL;DR

The trip plan was written against a stale snapshot of `tribe-v3`. Reality
had moved well past it: payment-flow rewrites, Stripe Connect, rate
limiting, image optimization, soft-delete, promo codes, revenue metrics,
and the basic Tribe.OS waitlist were all already shipped. This session
focused on three things:

1. **Phase 1 of Tribe.OS — the actual signal-gathering** that the trip
   plan is structured around. Existing waitlist captured names but
   nothing the Studio San Diego sit-down can act on; we extended it
   with `pricing_preference` + `comments`, bilingual confirmation +
   admin emails, and a Tribe wordmark in the header.
2. **Tribe.OS premium tier infrastructure** so design partners can be
   manually flipped to premium on return without a billing flow.
3. **Audit doc closure** — most items were already done; we shipped the
   genuine outstanding pieces (alt text, location fuzzing, blocked-users
   table that connections.ts referenced but never existed).

Everything is on `feature/tribe-os`. **Nothing has been merged to `main`**
per Al's "fully tested before main" rule.

## Database migrations applied to live Supabase

| Migration                          | What                                                                                                                               | Applied    |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `056_tribe_os_waitlist.sql`        | Original waitlist table                                                                                                            | (pre-trip) |
| `059_extend_tribe_os_waitlist.sql` | Adds `pricing_preference`, `comments`, `ip_address`, `referrer`                                                                    | 2026-05-08 |
| `060_tribe_os_premium.sql`         | `tribe_os_*` columns on users (tier, status, granted_at, granted_by, stripe_customer_id, stripe_subscription_id) + partial indexes | 2026-05-08 |
| `061_blocked_users.sql`            | `blocked_users` table + RLS + `is_user_blocked()` SECURITY DEFINER RPC                                                             | 2026-05-10 |

## Code shipped on `feature/tribe-os`

### Phase 1 — Tribe.OS waitlist signal capture (`69d8f64`)

- `supabase/migrations/059_extend_tribe_os_waitlist.sql` — additive columns
- `lib/dal/tribeOSWaitlist.ts` — extended interfaces and SELECT/INSERT
- `lib/email/tribeOsWaitlist.ts` — bilingual EN/ES confirmation email
  (HTML + plain text) + admin notification to `tribe@aplusfitnessllc.com`.
  Uses `Promise.allSettled` so a Resend outage cannot fail a successful
  signup.
- `app/api/tribe-os-waitlist/route.ts` — validates `pricingPreference`
  is one of the two enum values, caps `comments` at 2000 chars, captures
  IP from `x-forwarded-for` and Referer header server-side.
- `components/marketing/landing/TribeOSSection.tsx` — copy rewritten
  from starter pack (no marketing jargon, no em dashes, complete
  sentences); pricing-preference radio fieldset with selection styling;
  optional comments textarea.

Verified end-to-end on Vercel preview: form → DB row landed with all
fields → user confirmation email arrived in both EN and ES → admin email
landed at `tribe@aplusfitnessllc.com`.

### Email polish (`7b5cdca`, `338674d`)

- "Tribe." wordmark added to email header above the TRIBE.OS eyebrow.
  Gmail's auto-generated sender avatar can't be replaced without BIMI +
  a paid Verified Mark Certificate, so the brand goes inside the body.
- Sign-off corrected from "A+ Fitness LLC" to "A Plus Fitness LLC".
- Em dash dropped from admin email's empty-comments fallback.

### Mission 6 — Tribe.OS premium tier infrastructure (`c98fa64`)

- `supabase/migrations/060_tribe_os_premium.sql` — adds
  `tribe_os_tier` (`'solo'` | `'team_studio'`), `tribe_os_status`,
  `tribe_os_granted_at`, `tribe_os_granted_by`,
  `tribe_os_stripe_customer_id`, `tribe_os_stripe_subscription_id`.
  Namespaced under `tribe_os_*` to avoid colliding with the existing
  athlete-side Tribe+ `subscription_tier` (free/plus/pro from migration
  035).
- `lib/dal/tribeOSPremium.ts` — `grantTribeOSPremium`,
  `revokeTribeOSPremium`, `getTribeOSPremiumStatus`,
  `listTribeOSPremiumUsers`, pure `isTribeOSPremiumActive` helper.
- `app/api/admin/tribe-os/grant-premium/route.ts` — admin-only POST
  endpoint, uses existing `isAdmin()` from `lib/admin.ts` (NOT the
  bcrypt-with-env-password pattern the trip plan suggested; the
  codebase has a real admin auth model based on `ADMIN_EMAILS` allowlist).
- `scripts/grant-tribe-os-premium.js` — Node CLI for terminal use.
  Reads `.env.local`, supports `--email/--tier`, `--email/--revoke`,
  `--list`. Audit trail records `granted_by = "cli:<user>@<host>"` so
  CLI grants are distinguishable from admin-route grants.
- `app/os/dashboard/page.tsx` — premium-gated stub page. Redirects
  unauthorized visitors to `/#tribe-os`. Renders bilingual "thanks for
  being a design partner" placeholder for granted users.

Verified end-to-end: granted Al → `/os/dashboard` rendered correctly in
Spanish → revoked → page redirected to home.

### Phase 2 draft schemas (`c0b9430`)

Three drafts under `supabase/migrations/draft/` — explicitly **not**
applied. Supabase migration runner only processes numbered `.sql` files
at the migrations root, not subdirectories; the `.draft.sql` extension
is a second guard.

- `clients_and_attendance.draft.sql` — instructor's private client
  roster + per-session attendance/payment tracking. RLS scoped to
  `instructor_user_id`.
- `session_packages.draft.sql` — prepaid session packs (e.g. "10
  sessions for $200, 90 days") with `package_purchases` referencing
  clients. Stripe + Wompi payment IDs both supported. `expires_at`
  snapshotted at purchase so package edits don't retroactively shorten
  existing purchases.
- `instructor_revenue_summary.draft.sql` — STABLE SQL function returning
  aggregate revenue (USD + COP, gross + platform fee + net) for a
  user-period. Caller enforces `auth.uid() = p_user_id` at the DAL
  layer.

`draft/README.md` documents the promotion checklist (move from `draft/`
to `migrations/`, renumber, drop `.draft` suffix, re-read assumptions).

**Promotion gated by Studio San Diego sit-down round two + waitlist
signal.** Don't apply blind.

### Audit fixes (`c6e710c`)

a11y alt attributes — 8 components touched:

- 5 informational images get descriptive alt text:
  `CommunityBulletinTab` ("Bulletin image preview"); `FeedPostPreview`
  and `InstructorPostCard` ("Post image"); `ProductImageUpload`
  (indexed "Product image N"); `PostComposer` ("Image preview").
- 3 decorative images keep `alt=""` but get explicit `aria-hidden="true"`
  so screen readers skip them: `SpotlightBanner` banner background,
  `FinalCTASection` bg photo, `VideoIntro` poster image.

Location privacy:

- `fuzzLocation()` helper at `lib/location.ts:52` already existed but
  was never called. Applied to `fetchInstructors` in
  `lib/dal/instructors.ts` so Browse Instructors no longer returns
  precise user coordinates. ~500m precision is plenty for map markers
  and "instructors near me" sorting.
- Other `location_lat` selects in `lib/dal/connections.ts` already
  compute `distance_km` server-side and don't return raw coords.
- Featured-instructor lookup doesn't select coords.

### Block users feature (`766d71e`)

Closes the Day 2 TASK 2 gap from the audit doc. Previously
`lib/dal/connections.ts` referenced a `blocked_users` table that didn't
exist — the bidirectional check silently no-op'd because the query
errored.

- `supabase/migrations/061_blocked_users.sql` — table with
  `(user_id, blocked_user_id, reason, created_at)`, UNIQUE on the pair,
  CHECK preventing self-block, RLS scoped to the blocker only (the
  blocked user must NOT be able to discover they were blocked), plus
  `is_user_blocked(uuid, uuid) RETURNS boolean` SECURITY DEFINER RPC
  for bidirectional checks.
- `lib/dal/blockedUsers.ts` — `blockUser`, `unblockUser`,
  `listBlockedUsers`, `isUserBlocked`. Block + unblock are idempotent.
- `lib/dal/connections.ts` — `sendConnectionRequest` now calls
  `is_user_blocked()` RPC instead of the manual `.or()` query. The old
  query couldn't see blocks where the recipient blocked the requester
  (RLS), so it was structurally wrong even if the table had existed.
- `app/api/users/block/route.ts` + `app/api/users/unblock/route.ts` —
  POST endpoints, body `{ targetUserId, reason? }`. Use the user's
  session client; RLS does authz.
- `app/settings/blocked/page.tsx` — bilingual EN/ES list with avatar +
  name + blocked date + unblock button. Empty state explains the
  feature. Linked from main `/settings` page under a new "Privacy"
  section.

Verified end-to-end: page renders correctly in Spanish, RPC returns
`false` for non-blocked pairs.

### Dev infrastructure (`3ee0fe3`)

- `package.json` `dev` script now binds `npm run dev` to port **3001**
  to dodge a conflict with Al's Voyagr Vite dev server on 3000.

## Trip plan reconciliation — what changed vs the original spec

The trip plan was written assuming repo state at ~migration 011.
Reality was at migration 058+. Substantial sections of the plan were
either stale or already done. Notable deltas:

| Plan said                                  | Reality                                                                                                                      |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `lib/data-access/` for DAL                 | Actual path is `lib/dal/`                                                                                                    |
| Server Components by default               | All pages use `'use client'` per CLAUDE.md                                                                                   |
| `#C0E863` lime / `#E1F0F4` light blue      | Actual brand: `tribe-green = #84cc16`, `tribe-dark = #272D34`; no light blue token                                           |
| Fira Sans + PT Sans                        | Actual: Plus Jakarta Sans (`var(--font-jakarta)`)                                                                            |
| Migration 013 for waitlist                 | Already at 056 (waitlist) + 059 (extension)                                                                                  |
| Migration 014 for Stripe Connect           | Already at 051                                                                                                               |
| Bcrypt + env password for admin auth       | Actual pattern: `isAdmin()` allowlist via `ADMIN_EMAILS`                                                                     |
| Build dedicated `/os` route w/ inline form | Existing `TribeOSSection` on home page already had inline form; extended in place + added `/os/dashboard` premium-gated page |
| Resend bcc admin via separate Resend send  | Pattern matches; admin email is a separate `resend.emails.send` call wrapped in `Promise.allSettled`                         |

## Audit doc reconciliation

Of 19 items across 5 days, the snapshot at session start:

- **Day 1 (Emergency / Payment / Security):** all 6 done before this
  session. Payment-to-participant flow goes through `finalize_payment`
  RPC (atomic update + participant upsert + product fulfillment + amount
  tamper check + dedup). Wompi timestamp freshness + event-id dedup in
  place. CSP `unsafe-eval` is dev-only via `isDev ?` ternary in
  middleware; `unsafe-inline` kept on script-src with documented
  rationale (Next.js hydration). Image optimization on. Rate limiter
  Supabase-backed (migration 049). Session cancel does refund + notify.
- **Day 2 (Logic Hardening):** `join_session` RPC exists (042).
  Connection block + duplicate check exist; block was structurally
  broken until this session shipped 061. Smart-match nesting is
  per-pair availability comparison (small N, not a problem). Recurring
  sessions exist. Instructor check on paid sessions: `lib/dal/sessions.ts:380`.
- **Day 3 (UI Polish):** Tailwind config consolidated to `.ts` only.
  BottomNav truncate fix + aria-labels in place. Filter dropdown free
  of emojis. `console.error` removed from the 5 named components.
  Streak banner letter-inside-circle pattern correct. **Empty alt
  attributes on 8 files — fixed in this session.**
- **Day 4 (Monetization):** Promo code at checkout fully wired
  (validate + redeem + discount columns). Earnings page reads "15%".
  Min/max price enforced server-side. `fetchRevenueMetrics` exists.
  Engagement cron uses `Promise.allSettled` batches.
- **Day 5 (Account Safety):** `softDeleteUser` exists in
  `lib/dal/users.ts:117` + `admin_delete_user` RPC (050). Challenge
  recalc function at `lib/dal/challenges.ts:415`. `generate-calendar`
  endpoint deliberately public (calendar `.ics` shareable links) with
  rate limiting. **User location fuzzing — fixed in this session.**

After this session: **all 19 audit items are either implemented,
implemented-with-rationale, or have a non-trivial product decision (e.g.
"do you want a block-user UI?" — answered yes and shipped) attached.**

## What still needs human action

### Before merging `feature/tribe-os` to `main`

- [ ] **Visual polish of TribeOSSection** if any of the screenshots
      flagged earlier still bother you (you mentioned a few but said
      "we can fine tune the issues later" — they're not addressed).
- [ ] **Spanish review by Verónica** across the four surfaces with
      `// ES PENDING VERONICA REVIEW` markers:
  - `components/marketing/landing/TribeOSSection.tsx`
  - `lib/email/tribeOsWaitlist.ts` (confirmation email)
  - `app/os/dashboard/page.tsx`
  - `app/settings/blocked/page.tsx`
- [ ] **Stripe Connect live-mode test** —
      `stripe listen --forward-to http://localhost:3001/api/payment/webhook/stripe/`
      (note port 3001 + trailing slash). Complete one real payment to
      close the unverified item from `STRIPE_HANDOFF.md`.
- [ ] **Decide merge timing.** The branch is ready when you say so. I
      will not merge without an explicit ask — the previous session
      recovery from a premature merge is a saved memory rule now.

### Post-trip / post-validation

- [ ] **Studio San Diego sit-down round two** — use waitlist signal + design partner feedback to pick which Phase 2 draft schemas in
      `supabase/migrations/draft/` to promote first.
- [ ] **Promote Phase 2 schemas as needed** — see `draft/README.md` for
      checklist (move from `draft/` to `migrations/`, renumber to next
      free slot, drop `.draft` suffix, re-read assumptions).
- [ ] **Capacitor 2.6.1 native bump** — currently in
      `git stash@{0}` ("cap-sync-2.6.1-haptics: post-trip native
      version bump (2.5.0/2.6.0 -> 2.6.1, +@capacitor/haptics)"). Ready
      to pop and submit when you're back.
- [ ] **BIMI for sender avatar** — Gmail-recognized brand logo on the
      sender thumbnail requires SPF + DKIM + DMARC + paid Verified Mark
      Certificate (~$1,500/year from Entrust or DigiCert). Multi-week
      timeline. Defer until validation justifies the spend.

### Optional cleanup / housekeeping

- [ ] Delete `feature/tribe-os` branch after merge (cleanup, fully merged).
- [ ] Revoke your own `solo` premium grant if you don't want to stay
      flipped (`node scripts/grant-tribe-os-premium.js --email=alainalisca@aplusfitnessllc.com --revoke`).
- [ ] Decide what to do with the duplicate-numbered migrations:
      `013_fix_social_rls_policies.sql` + `013_product_storefront.sql`,
      `014_referrals.sql` + `014_session_comments.sql`. Migration order
      is undefined; could rename one in each pair to next free slot.
      Pre-existing data hazard, not introduced this trip.

## Process notes for the planning side

Things to update in the spec drafts so the next session doesn't repeat
the discovery work:

1. **Branch strategy:** Tribe.OS work goes on `feature/tribe-os` cut
   from `main` (NOT off `feature/social-features`). Audit fixes ship as
   small commits to the same branch — not directly to main, despite
   what the audit doc's "GLOBAL RULES" say. Merge to main only when
   a coherent unit is fully tested.
2. **Commit messages:** No `Co-Authored-By:` trailer (audit doc rule
   line 31). The commits in this session that include the trailer
   (9d581cd, 69d8f64, 7b5cdca, 338674d) predate that rule landing in
   memory; subsequent commits omit it.
3. **Code conventions** (override anything in the spec docs that
   conflicts):
   - DAL path: `lib/dal/`, not `lib/data-access/`.
   - All pages `'use client'`.
   - Bilingual EN/ES via inline `language === 'es' ? ... : ...` ternaries
     for now (the codebase has a `useTranslations()` migration in flight,
     but pre-existing files use ternaries; matching the existing pattern
     keeps PRs minimal).
   - Brand tokens: `tribe-green`, `tribe-dark`, `tribe-surface`,
     `tribe-mid`, `tribe-card`, `tribe-gray-*`, `tribe-red`, `tribe-amber`.
     Defined in `tailwind.config.ts`.
   - Font: `var(--font-jakarta)` (Plus Jakarta Sans).
4. **Migration numbering:** Repo is at 061 after this session. Next
   free slot is 062. Plan-mentioned numbers (013, 014, 015, 016, 017, 018) are stale.
5. **Admin auth pattern:** `isAdmin()` from `lib/admin.ts` (Supabase
   auth + email allowlist in `lib/admin-config.ts`). No bcrypt +
   env-password pattern as the plan suggested.
6. **Service role usage:** Admin endpoints use `isAdmin()` at the gate
   then `createServiceClient` from `@supabase/supabase-js` with
   service-role key for the actual write. Keeps RLS strict.
7. **Resend pattern:** Inline HTML strings in route handlers or in a
   small `lib/email/<feature>.ts` module. No React-component-based
   email rendering. Sender: `Tribe <tribe@aplusfitnessllc.com>`.
   Failures wrapped in `Promise.allSettled` so they never break the
   user-facing flow.
8. **Dev port:** `npm run dev` now binds to **3001**. Update any docs
   or onboarding that say 3000.

## Branch + commit map

```
feature/tribe-os
  3ee0fe3 chore(dev): pin dev server to port 3001
  766d71e feat(audit): blocked_users table + bidirectional check + UI
  c6e710c fix(audit): a11y alt text on 8 components, fuzz instructor coords
  c0b9430 feat(tribe-os): draft Phase 2 schemas
  c98fa64 feat(tribe-os): premium tier infrastructure for design partners
  338674d fix(email): drop em dash from admin notification comments fallback
  7b5cdca fix(email): add Tribe wordmark, correct company name
  69d8f64 feat(tribe-os): capture pricing preference + comments on waitlist signup
main
  9d581cd chore(docs): import handoff/audit references; ignore env backups
  d2c0b3f fix(about,footer): remove founder bio/photo and correct company name (pre-trip)
```

## Verification surfaces

- **Production** (`tribe-v3.vercel.app`): unchanged from pre-trip state.
- **Vercel preview for `feature/tribe-os`**:
  `https://tribe-v3-git-feature-tribe-os-alain-aliscas-projects.vercel.app/`
  - `/` — TribeOSSection with new copy + pricing-preference radio + comments
  - `/os/dashboard` — premium-gated dashboard stub (granted users only)
  - `/settings/blocked` — empty block list UI
- **Local dev:** `http://localhost:3001/` (tribe-v3 dev server now on 3001)
