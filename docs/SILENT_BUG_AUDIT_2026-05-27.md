# Silent-Bug Audit — 2026-05-27

**Trigger:** during a session of fixing critical bugs (share-link "Session not found", reviews insert, Wompi outage), the same anti-patterns kept surfacing. This sweep audits the whole codebase for those patterns and surfaces every instance.

**Method:** three parallel deep-dive agents, each owning one pattern category. Findings cross-validated against `lib/database.types.ts`, `supabase/migrations/*.sql`, and `.env.local`.

**Owner:** Al. **Status:** Not fixed — audit only. Decide what to triage next.

---

## TL;DR

48 distinct latent defects across three categories. **Six of them are likely actively breaking production right now**:

1. Subscriptions page (`app/subscriptions/page.tsx`) — selects columns that don't exist; entire page is broken.
2. Subscribe button (`components/SubscribeButton.tsx`) — inserts columns that don't exist; clicking "Subscribe" 500s.
3. Public instructor share page (`app/i/[id]`) — selects `time, location_name, city` on tables that don't have them; shows "not found" for every instructor share link. **Same bug class as the `/s/[id]` fix this session.**
4. Storefront boost badges (`app/storefront/[id]`) — wrong column names on `boost_campaigns`; badges never render.
5. Boost / Pro-storefront / promo-code payment flows (`app/api/payment/create/route.ts`) — inserts unknown columns on `payments`; every such checkout 500s.
6. Linked-session cards on the feed (`app/feed/page.tsx`) — uses `instructor_id` instead of `creator_id`; cards never render details.

Plus seven Postgres RPCs called from code that have NO matching migration in version control — the same situation that left `join_session` broken for two months. **Recommend running the `pg_proc` query in [§ RPC drift](#category-2-rpc-drift) before anything else** to triage what's actually deployed.

Plus the root infrastructure gap: zero boot-time validation that required secrets are non-empty. This is why nobody noticed Wompi had been silently misconfigured for an unknown period.

---

## How to use this document

- Each finding has a file + line, a severity, a confidence level, and a one-line fix.
- Severity reflects user impact, not effort to fix.
- Confidence: HIGH = verified against the schema/migrations; MEDIUM = needs a manual check on Supabase before fixing (typically because the live DB may have drifted from version control).
- Fix sequencing recommendation is at the bottom — start there if you want a punch list.

---

## Category 1: Schema/column mismatches

Same root anti-pattern as the share-link bug we fixed this session: code references columns that don't exist on the table, PostgREST returns an error, the surrounding code doesn't check `.error`, and the UI silently shows an empty/broken state.

### CRITICAL — actively broken in production

**S-1. Subscriptions feature is fundamentally broken**

- `components/SubscribeButton.tsx:75-90` — inserts/upserts `instructor_id`, `is_subscription`, `recurrence_pattern`, `subscription_status` on `session_participants`. None of those columns exist.
- `app/subscriptions/page.tsx:73-100, 147-151` — reads the same phantom columns; filters `.eq('is_subscription', true)`; line 149 writes `is_subscription` on update.
- **Schema** (`session_participants`): `guest_email, guest_name, guest_phone, id, is_guest, joined_at, paid_at, payment_confirmed_by, payment_gateway, payment_id, payment_status, session_id, status, user_id`. No subscription fields.
- **Fix path**: subscriptions need either (a) a new migration adding the four columns to `session_participants`, (b) a dedicated `session_subscriptions` table, or (c) the feature wired up to the existing `subscription_payments` infrastructure. Worth confirming with Al whether this is meant to ship or whether it should be removed until properly designed.
- **Confidence:** HIGH.

**S-2. Public instructor share page (`/i/[id]`) — same class as the `/s/[id]` bug fixed today**

- `app/i/[id]/InstructorShareClient.tsx:56` — `.select('id, name, avatar_url, bio, city, average_rating, total_reviews')` on `users`. **`city` does not exist** on `users` (the column is `location`).
- `app/i/[id]/InstructorShareClient.tsx:61` — `.select('id, title, sport, date, time, location_name, creator_id')` on `sessions`. **`time` and `location_name` don't exist** (use `start_time` and `location`).
- Result swallowed: `setSessions(sessionsRes.data)` doesn't inspect `sessionsRes.error`. Every public instructor profile share link is broken in the same way `/s/[id]` was.
- **Fix:** change the two selects to use `location`, `start_time`, `location`. ~5 minutes.
- **Confidence:** HIGH.

**S-3. Boost-campaign / Pro-storefront / promo-code payment inserts use phantom columns**

- `app/api/payment/create/route.ts:282-292` — payment insert for boost/pro purchases writes `payment_type` and `reference_id` to `payments`. Neither exists on `payments` per `database.types.ts` and no migration adds them.
- `app/api/payment/create/route.ts:559-570` — payment insert for session-with-promo writes `discount_cents` and `promo_code_id` to `payments`. Those columns live on `product_orders` (migration 013), not `payments`.
- **Impact:** every boost-campaign purchase, every Pro storefront upgrade, and every session-checkout with a promo code currently 500s at the `payments` insert.
- **Fix:** either run a migration adding those columns to `payments`, or persist this metadata elsewhere (promo redemption → `promo_redemptions`, boost-payment metadata → dedicated table or `payments.metadata` JSONB if it exists).
- **Confidence:** HIGH for the bad columns.

**S-4. Feed page selects `instructor_id` on `sessions`**

- `app/feed/page.tsx:228` — `.select('id, sport, date, price_cents, currency, location, instructor_id, title').in('id', sessionIds)`. The column is `creator_id`, not `instructor_id`.
- The whole batched fetch returns an error, `if (sessions)` is false, linked-session cards in the feed silently render no details (just the ID, presumably).
- **Fix:** change `instructor_id` → `creator_id` (4-character change) and any downstream references.
- **Confidence:** HIGH.

**S-5. Storefront boost-badge detection uses wrong columns on `boost_campaigns`**

- `app/storefront/[id]/useStorefrontData.ts:228` — `.from('boost_campaigns').select('session_id').eq('is_active', true)`. Schema: column is `boosted_session_id`; the active filter is `.eq('status', 'active')` (no boolean `is_active`).
- Result is mapped via `boostsResult.data?.map(...)` with no error check. Boost-paid sessions never get the boosted-instructor badge on instructor storefronts.
- **Fix:**
  ```ts
  .from('boost_campaigns')
  .select('boosted_session_id')
  .eq('instructor_id', instructorId)
  .eq('status', 'active')
  ```
  Also update the downstream `.map(b => b.boosted_session_id)`.
- **Confidence:** HIGH.

### LATENT — needs migration verification

**S-6. `payments.session_id` may be NOT NULL but inserts omit it**

- `app/api/payment/create/route.ts:282` — the boost/Pro `payments` insert omits `session_id`. Per `database.types.ts`, `payments.session_id` is typed as required.
- If the live DB still has `NOT NULL` on this column, the insert fails for that reason BEFORE PostgREST evaluates the bad column names from S-3. So fixing S-3 alone may surface this as the next failure.
- **Fix:** either pass a sentinel session ID (UUID-zero) for non-session purchases, or run `ALTER TABLE payments ALTER COLUMN session_id DROP NOT NULL`.
- **Confidence:** MEDIUM — repo doesn't conclusively answer whether the production DB has dropped NOT NULL here.

### Verified clean (no action needed)

- All `reviews` callsites use `host_id` correctly. The `instructor_id` bug found earlier this session is fully resolved across `PostSessionPrompt.tsx`, `PostSessionFlow.tsx`, and the DAL.
- 47 other `sessions` select sites across `app/api/*`, `lib/dal/sessions.ts`, `lib/dal/admin.ts`, `lib/dal/instructorDashboard.ts`, `lib/dal/featuredPartners.ts`, `lib/dal/recentSessions.ts`, `components/NearbyEvents.tsx`, `components/postSession/*`, `components/instructor/AvailabilityPreview.tsx`, `lib/ai/insight-generator.ts`, `lib/dal/revenue.ts` — all reference real columns.
- `tips`, `clients`, `boost_campaigns` (outside the storefront callsite above), and other `session_participants` callsites all use real columns.

---

## Category 2: RPC drift

Same anti-pattern as `join_session`: code calls a Postgres RPC that has no `CREATE FUNCTION` anywhere in `supabase/migrations/`. Either the RPC exists on production but was added out-of-band (drift risk — could be silently dropped by a future migration), or it was never deployed and the call has been silently failing.

### CRITICAL — run this query first to triage

Before doing anything else in this category, run the following in the Supabase SQL Editor for project `twyplulysepbeypqralz`:

```sql
SELECT proname
FROM pg_proc
WHERE proname IN (
  'get_user_attendance_stats',
  'shared_session_users',
  'increment_post_comments',
  'increment_column',
  'increment_counter',
  'increment',
  'decrement'
);
```

Any name NOT in the result is an undeployed RPC — that's a Wompi-class outage waiting to happen. Any name that IS in the result should get captured into a migration file ASAP so it can't be silently dropped later.

### Per-RPC findings

**R-1. `get_user_attendance_stats(p_user_id)` — used on profile stats page**

- Called from `app/profile/[userId]/ProfileStatsServer.tsx:40`.
- No matching `CREATE FUNCTION` in `supabase/migrations/` or `supabase/schema.sql`.
- Profile stats (total sessions, attended sessions, attendance rate) silently render zeros if the RPC doesn't exist. Page would show no error.
- **Action:** verify with pg_proc, then either deploy a migration or fall back to inline aggregation.

**R-2. `shared_session_users(...)` — connection graph**

- Called from `lib/dal/connections.ts:374`.
- No matching definition in version control.
- Mitigated: lines 378-389 have a fallback that runs a direct query on RPC error, so users probably aren't affected — but inefficient and silent.
- **Action:** decide whether to deploy the RPC + capture in migration, or remove the RPC call entirely.

**R-3. `increment` / `decrement` — community member/like/comment counters**

- Called from `lib/dal/communities.ts:219, 254, 403, 432, 494`.
- No matching definitions in `supabase/migrations/`.
- **`joinCommunity` rollback (line 226-230) depends on `increment` succeeding.** If the RPC doesn't exist on prod, joining a community fails end-to-end. Leaves silently drift counts.
- **Action:** highest priority in this category. Run pg_proc, then either deploy the RPCs or refactor to inline `UPDATE communities SET member_count = member_count + 1`.

**R-4. `increment_post_comments` — comment counter on community posts**

- Called from `lib/dal/comments.ts:85`.
- No matching definition.
- Has a fallback path (re-read + write), so it probably works, but with a race window. The fallback masks the RPC's absence.
- **Action:** verify with pg_proc; capture or remove.

**R-5. `increment_column` — likely dead code**

- Called from `lib/dal/comments.ts:81` inside a `.update({...})` payload value.
- That syntax is semantically broken — you can't embed an RPC call as a column value in PostgREST. The line is probably a no-op that silently fails on every comment.
- **Action:** delete the line. The `increment_post_comments` call below it (R-4) is the actual mechanism.

**R-6. `increment_counter` — featured-partner metrics**

- Called from `lib/dal/featuredPartners.ts:322`.
- No matching definition.
- Lines 326-328 explicitly say "Fallback: log and move on if RPC doesn't exist yet" — so partner metric counts have been silently lost the whole time.
- **Action:** decide whether partner metrics are needed; if yes, deploy.

### MEDIUM — verified clean RPCs

The following RPCs were checked and have valid migrations + matching signatures + correct grants:

- `join_session` (migration 042; re-applied this session)
- `finalize_payment` (migration 088; webhooks)
- `is_user_blocked` (migration 061)
- `have_shared_session`, `first_shared_session`, `shared_session_count` (migration 012)
- `instructor_revenue_totals`, `instructor_revenue_buckets`, `gym_revenue_totals`, `gym_revenue_buckets` (revenue dashboard)
- `list_gym_coaches`, `list_teams_for_gym` (gym tenant)
- `cron_try_lock`, `cron_release_lock` (cron lock guard — service-role only, has safe fallback)

**LOW — return-shape risk on `get_user_attendance_stats`:** if the deployed RPC returns a different shape than `Array<{ total_sessions, attended_sessions, attendance_rate }>`, the profile stats page renders zeros silently. Worth checking once R-1 is confirmed deployed.

---

## Category 3: Silently-swallowed errors

Pattern: `const { data } = await supabase.from(...).select(...)` — picks up `data` but discards `error`. The Supabase client doesn't throw, so wrapping in try/catch doesn't help — the surrounding `catch` never fires, `error` is dropped, `data` is null, and the UI quietly shows the empty-state path.

20 CRITICAL findings on primary user paths. Listed by impact, not file order.

### CRITICAL — currently masking real production failures (or could mask the next one)

**E-1. False-403 for instructors trying to create products**

- `app/api/products/route.ts:61` — `const { data: profile } = await supabase.from('users').select('is_instructor')...single()`. If the lookup errors, `profile` is undefined → `!profile?.is_instructor` evaluates true → returns `403 "Only instructors can create products"` to a real instructor.
- `lib/dal/products.ts:41` — same pattern in `createProduct`.
- **Highest leverage in this category.** Real instructors silently blocked with no logs.

**E-2. Instructors silently ejected from their own promote page**

- `app/promote/posts/page.tsx:165` — `const { data: userData } = await supabase.from('users').select('is_instructor')...single()`. On error: `isInst = false` → `router.push('/dashboard')`.

**E-3. Instructor-only UI silently disappears**

- `app/feed/page.tsx:132` — same `is_instructor` lookup. On error, `isInstructor` silently goes false; instructor-only feed actions disappear.
- `app/partners/apply/page.tsx:47` — same pattern, controls gating of the apply UI.

**E-4. Premium customers see the public marketing CTA instead of their dashboard**

- `components/marketing/landing/TribeOSSection.tsx:182` — `const { data } = await supabase.from('users').select('tribe_os_tier, tribe_os_status')...single()`. On error, premium customers see the public marketing CTA instead of their dashboard link.

**E-5. Live-attendance feature silently broken**

- `lib/dal/live.ts:56` — `fetchMyLiveExpiry` returns `{ success: true, data: null }` on RLS/schema failure.
- `lib/dal/live.ts:75` — `fetchLiveUsersWithDetails` returns empty `[]` on error.
- "No one is live" is indistinguishable from a real query failure.

**E-6. Account-deletion data-integrity bug**

- `lib/dal/users.ts:151` — `softDeleteUser` iterates `futureSessions || []` to cancel a deleted user's sessions. If the lookup errors, the user is deleted but their sessions stay live, accepting new participants who'll arrive at an empty location.

**E-7. Charged-but-not-credited on boost-campaign payment failure**

- `app/promote/boosts/page.tsx:443` — `await supabase.from('boost_campaigns').delete().eq('id', campaignId)` in the payment-failure rollback path. If the delete itself fails, the user is charged for a boost they don't get, with no log, and the code throws a generic "Payment creation failed."

**E-8. Anti-spam dedup signal silently lost**

- `app/api/cron/behavioral-nudges/route.ts:109` — `await supabase.from('nudge_log').insert(...)` with no error check. The nudge_log row IS the anti-spam dedup signal; if the insert fails, the cron will re-nudge the same user every run.
- `app/api/cron/smart-match/route.ts:248` — same pattern on `notifications` insert.

**E-9. Counter-drift bugs across community / challenge / comment counts**

- `lib/dal/communities.ts:193, 228, 403, 432` — delete/RPC calls with no error check inside community create/leave/like rollback paths. Pairs with R-3 above.
- `lib/dal/challenges.ts:310` — `participant_count` update with no error check inside leave-challenge flow.
- `lib/dal/comments.ts:142` — `comments_count` update with no error check.

**E-10. Cancelled sessions leave participants in "confirmed" state**

- `lib/dal/sessions.ts:262` — mass-cancel of `session_participants` during session cancellation: no error check. If this fails after the session row is cancelled, participants stay "confirmed" on a cancelled session.

**E-11. Post-payment confirmation page silently misses metadata**

- `app/payment/confirm/page.tsx:72` — `const { data: session } = await supabase.from('sessions').select('sport')...single()`. Sport stays blank but the page still claims "approved." On the post-payment screen — bad UX moment for a silent error.

**E-12. Misc instructor-detection and OS dashboard reads**

- `app/os/dashboard/page.tsx:183`, `components/tribe-os/OSShell.tsx:159` — name/email lookup. Stable today, but if schema changes the failure is invisible.
- `app/storefront/[id]/useStorefrontData.ts:126` — refresh after joining. "Join" button re-appears for sessions the user already joined.
- `app/api/invites/session/route.ts:90` — sender name in invite message. Generic "Someone invited you" fallback, no diagnostic.
- `lib/dal/products.ts:115` — owner check for variant replace. "Product not found or not owned by instructor" hides real errors.

### HIGH — secondary path degradation

20 more findings on listing pages, carousels, search, etc. Detailed list available; not duplicating here. Primary action items:

- `app/settings/training-preferences/page.tsx:43` — pref load. User thinks saved prefs are gone.
- `app/my-orders/page.tsx:61`, `app/orders/page.tsx:59`, `app/my-training/page.tsx:75` — order/profile lists silently empty on error.
- `app/search/page.tsx:300` — follow-status check; renders "Follow" on a user already followed.
- `components/FeaturedInstructorCarousel.tsx:86`, `components/dashboard/PostComposer.tsx:75`, `components/home/FeedPostPreview.tsx:36`, `components/products/StorefrontProductsSection.tsx:57` — listing UIs that quietly shrink on error.
- `lib/dal/revenue.ts:842` — gym timezone fallback to 'UTC' on error. Day-boundary off by one → payments could land in adjacent day buckets on the revenue dashboard.

### LOW — verified intentional fire-and-forget

These are correct as-is:

- Browser autoplay rejections (`audio.play().catch(() => {})`, `video.play().catch(() => {})`).
- `navigator.share().catch(() => {})` for user-cancel.
- Webhook notification handlers (`notifyAfterFinalize().catch(() => undefined)`) — comment explicitly documents fire-and-forget so the gateway doesn't retry on notification failure.
- `progressReferralOnSessionComplete().catch(() => {})`.

Even these would benefit from `.catch(err => logError(err, ...))` so silent failures aren't invisible — but functionally they're correct.

---

## Category 4: Env var hygiene

### CRITICAL — already known

- `WOMPI_PRIVATE_KEY` empty in `.env.local:19`. Already addressed via `PAYMENT_GATEWAY_OVERRIDE=stripe`.
- `WOMPI_EVENTS_SECRET` empty in `.env.local:20`. Webhook signature verification can't succeed until this is populated.

### HIGH — no startup validation

**The root infrastructure gap.** `instrumentation.ts` is a documented no-op placeholder. Nothing in `next.config.ts`, `middleware.ts`, or any boot path validates required env vars. This is why Wompi's empty key sat undetected for an unknown duration.

**Recommended fix:** in `instrumentation.ts`'s `register()`, throw on empty/missing values for the required runtime secrets. Minimum required-in-prod list (server-side code paths actually run):

```
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
WOMPI_PRIVATE_KEY, WOMPI_PUBLIC_KEY, WOMPI_EVENTS_SECRET,
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
RESEND_API_KEY, CRON_SECRET,
VAPID_PRIVATE_KEY, VAPID_EMAIL, NEXT_PUBLIC_VAPID_PUBLIC_KEY,
FIREBASE_SERVICE_ACCOUNT_KEY
```

Failing the boot loudly is cheaper than silently 500-ing every payment for a quarter.

### MEDIUM — code-referenced but NOT in `.env.local`

These are referenced in code but absent from `.env.local`. Confirm each is set on Vercel (or accept that the feature it gates is off):

`ADMIN_NOTIFY_SECRET`, `ALLOW_SAMPLE_DATA_SEED` / `NEXT_PUBLIC_ALLOW_SAMPLE_DATA_SEED`, `DISCORD_FEEDBACK_WEBHOOK_URL`, `EVENTBRITE_API_KEY`, `FEEDBACK_SMS_NUMBER`, `GOOGLE_MAPS_SERVER_KEY`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_COP_PER_USD`, `NEXT_PUBLIC_GOOGLE_PLACES_KEY`, `PAYMENT_GATEWAY_OVERRIDE` (this one is set as of today's fix), `RECONCILE_AUTO_CORRECT`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `WEBHOOK_SECRET`.

Most-important: `ADMIN_NOTIFY_SECRET`, `GOOGLE_MAPS_SERVER_KEY`, `WEBHOOK_SECRET` — these gate non-optional flows.

### LOW — `.env.local` entries with no code references

- `VERCEL_OIDC_TOKEN` (Vercel-CLI managed, harmless).
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` — not found in `app|lib|hooks|components|middleware|instrumentation`. Either dead config or referenced outside the audit set. MEDIUM confidence.

---

## Recommended fix sequencing

Time-boxed and impact-ranked.

### Day 1 (~2-3 hours total): stop active production breakage

1. **Run the `pg_proc` query** in the Supabase SQL Editor (see [§ Category 2](#category-2-rpc-drift)). Capture the result — it determines what else is broken.
2. **Fix S-2** (instructor share page columns). 5-minute change, exactly the same shape as the `/s/[id]` fix already shipped.
3. **Fix S-4** (feed page `instructor_id` → `creator_id`). 4-character change.
4. **Fix S-5** (storefront boost detection). 10 minutes.
5. **Fix E-1** (false 403 on product creation). Currently blocking instructors from creating products with no logs. ~15 min.
6. **Fix E-3 + E-4** (instructor-detection silent fallthroughs on feed / promote / partners / landing). ~30 min.
7. **Add `instrumentation.ts` env-var validation** for the required-secrets list. Fail boot if anything is empty. 20 min.

### Day 2-3 (~4-6 hours): bigger refactors

8. **Fix S-3 + S-6 together**: refactor `app/api/payment/create/route.ts` payment-insert sites to stop writing non-existent columns. Boost / Pro / promo flows are dead until this lands.
9. **Fix S-1** (subscriptions): decide whether to deploy a migration adding the missing columns or remove the feature. Either is a real choice — recommend asking Al before doing either.
10. **Fix the DAL swallowed-error patterns** in `lib/dal/{live,products,users,communities,challenges,comments,sessions}.ts`. Apply the suggested DAL-level fix pattern globally:
    ```ts
    const { data, error } = await supabase.from('x').select('y').eq('id', id).maybeSingle();
    if (error) {
      logError(error, { action: 'fetchX', id });
      return { success: false, error: error.message };
    }
    return { success: true, data };
    ```
11. **Capture or deploy the missing RPCs** (R-1 through R-6) based on what pg_proc returned.

### Ongoing (prevention, not a one-off): block these patterns at PR time

12. Add an ESLint rule disallowing `const { data } = await supabase` without a paired `error` check.
13. Add CI gating for env-var presence (the validator above runs at boot, but a CI check that compares `.env.example` to required-in-code env vars catches regressions earlier).
14. Add a CI step that runs `psql --command "SELECT proname FROM pg_proc WHERE proname IN (...)"` for every RPC the code calls, against a staging DB. Fail the build if any RPC is missing. This is the structural fix for the `join_session` class of bugs.

---

## Reference: code anchors

For the next Claude session to navigate quickly.

| Topic                                                     | File                                                        |
| --------------------------------------------------------- | ----------------------------------------------------------- |
| Gateway selector + override                               | `lib/payments/config.ts`                                    |
| All payment routes                                        | `app/api/payment/create/route.ts`                           |
| Wompi webhook                                             | `app/api/payment/webhook/wompi/route.ts`                    |
| Schema source of truth                                    | `lib/database.types.ts`                                     |
| Migrations                                                | `supabase/migrations/*.sql`                                 |
| RPC: join_session                                         | `supabase/migrations/042_join_session_rpc.sql`              |
| RPC: finalize_payment                                     | `supabase/migrations/088_finalize_payment_tip_fallback.sql` |
| Instrumentation (boot validation site)                    | `instrumentation.ts`                                        |
| Toast helpers                                             | `lib/toast.ts`                                              |
| Logger                                                    | `lib/logger.ts`                                             |
| DAL (where to apply the suggested error-handling pattern) | `lib/dal/*`                                                 |

---

## What this audit did NOT cover

- Security audit (RLS gaps, CORS, auth bypasses, secret leaks) — recommend running `/security-review` as a separate pass if you want that.
- Code-quality / refactor audit (dead code, oversized files, untyped `any`, DAL violations from CLAUDE.md) — `/simplify` is the right tool.
- Performance audit (N+1 queries, list re-renders, bundle size).
- E2E test coverage gaps.
- Mobile-specific (Capacitor) edge cases.

Each is a separate ~2-hour pass if you want it.

---

## Companion doc

[`docs/PAYMENTS_HANDOFF.md`](./PAYMENTS_HANDOFF.md) — Wompi outage diagnosis + Stripe override + long-term gateway options. Some findings in this audit (S-3, S-6, env hygiene) intersect with that doc; read both for full context on the payment layer.
