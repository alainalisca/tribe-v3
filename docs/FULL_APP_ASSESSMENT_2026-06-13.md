# Full App Assessment — 2026-06-13

**Trigger:** "There are a lot of errors on the app." Full-length assessment across six dimensions.

**Method:** six parallel deep-dive audits — schema/RPC/env/swallowed-errors (the 2026-05-27 sweep), cron & background jobs, mobile/Capacitor & frontend UX, security, i18n/locale, performance & data-integrity. Cross-validated against `lib/database.types.ts`, `supabase/migrations/*.sql`, `.env.local`, and the live route tree. Headline findings spot-checked by hand.

**Status:** assessment only. PR #33 already fixed the first 6 schema/swallowed-error findings. Everything below is the remaining picture.

---

## The short version

The "lots of errors" you're seeing are almost certainly **dead-route 404s** plus a few **broken pages**. Those are Tier 0 and they're cheap to fix. Underneath them sits a layer of **security holes** (Tier 1) and **silent correctness/perf bugs** (Tier 2) that don't throw visible errors but are doing real damage — leaking data, dropping reminders, duplicating notifications.

Total: ~95 distinct findings beyond what PR #33 already fixed. Grouped and triaged below.

| Tier | Theme                                                                | Count | User sees it?                             |
| ---- | -------------------------------------------------------------------- | ----- | ----------------------------------------- |
| 0    | Visible breakage (404s, broken pages, invisible text)                | 9     | Yes — this is "the errors"                |
| 1    | Security (PII leak, auth bypass, phishing primitives)                | 8     | No — silent until exploited               |
| 2    | Correctness & data integrity (timezone, dup notifications, counters) | 14    | Sometimes — wrong data, missing reminders |
| 3    | Performance (N+1, unbounded queries, realtime fanout)                | 14    | Yes at scale — slowness                   |
| 4    | i18n / locale (English leaking to Spanish users, no accents)         | 21    | Yes — quality                             |
| 5    | Mobile / Capacitor polish                                            | 12    | iOS/Android only                          |

---

# TIER 0 — Visible breakage (fix first; this is what you're seeing)

### T0-1. Dead route `/auth/login` — 404 on 7 primary screens

**Affects:** Any **signed-out** user who taps into Feed, Search, Connections, Challenges (list/detail/create), or the promote-posts page gets redirected to `/auth/login`, which **does not exist** (`app/auth/` only has `page.tsx`, no `login/` subfolder). They land on the Next.js 404 page. This is very likely the single biggest source of "lots of errors."
Call sites: `app/feed/page.tsx:128`, `app/connections/page.tsx:46`, `app/search/page.tsx:85`, `app/challenges/page.tsx:87`, `app/challenges/[id]/page.tsx:104`, `app/challenges/create/page.tsx:120`, `app/promote/posts/page.tsx:158`.
**Solution:** redirect to the real auth route, `/auth`.
**How:** replace `router.push('/auth/login')` → `router.push('/auth')` at all 7 sites. A one-line codemod.
**Why it works:** `app/auth/page.tsx` is the actual sign-in screen and already handles the post-login return. The path was simply wrong — there was never an `/auth/login` route. Confirmed by `ls app/auth/`.

### T0-2. Dead route `/dashboard` — 404 after publishing a promoted post

**Affects:** An instructor who isn't recognized as an instructor on the promote-posts page is bounced to `/dashboard`, which 404s (`app/dashboard/` has only `instructor/` and `partner/` subfolders, no index page).
Call site: `app/promote/posts/page.tsx:185`.
**Solution:** route to `/dashboard/instructor`.
**How:** change the one `router.push('/dashboard')` to `/dashboard/instructor`.
**Why it works:** this branch is inside an instructor-only flow, so `/dashboard/instructor` is the correct destination and it exists.

### T0-3. Dead link `/settings/subscription` — 404 on the paywall

**Affects:** "Already a member? Manage subscription" on the Tribe+ paywall (`app/tribe-plus/page.tsx:154`) lands on a 404. The real route is `/subscriptions`.
**Solution / How:** change `href="/settings/subscription"` → `href="/subscriptions"`.
**Why it works:** `app/subscriptions/page.tsx` exists; `app/settings/subscription/` does not. Confirmed by `ls`.

### T0-4. Instructor feed cards render invisible text in light mode

**Affects:** `components/feed/InstructorPostCard.tsx` — the card container is `bg-theme-card` (white in light mode) but the author name (`:168`), title (`:184`), body (`:186`), and comment text (`:265`) are hardcoded `text-white` / `text-gray-200`. In light mode that's white-on-white — the entire post body is invisible. This is the most-trafficked feed surface.
**Solution:** use theme tokens that flip with the theme.
**How:** `text-white` → `text-theme-primary`, `text-gray-200` → `text-theme-secondary`, `text-gray-500` → `text-theme-muted`.
**Why it works:** the theme tokens already resolve to dark text on light backgrounds and vice-versa (used correctly elsewhere). The card was authored assuming a permanently-dark surface that the theme system overrides.

### T0-5. Subscriptions feature is fundamentally broken (S-1, from prior audit, NOT yet fixed)

**Affects:** `app/subscriptions/page.tsx` reads, and `components/SubscribeButton.tsx` writes, four columns that don't exist on `session_participants` (`instructor_id`, `is_subscription`, `recurrence_pattern`, `subscription_status`). The page renders empty; clicking Subscribe 500s.
**Solution:** this needs a product decision, not just a code fix — the feature was never given a schema. Three options: (a) new migration adding the columns / a dedicated `session_subscriptions` table, (b) wire to the existing `subscription_payments` infra, (c) remove the feature until designed.
**How:** I recommend (c) for now — hide the entry points and stop the 500s — then design it properly as a Phase-2 item. If you want it live, (a) with a dedicated table is the clean path.
**Why it works:** removing the broken surface stops the visible error immediately; the dedicated-table approach avoids overloading `session_participants` (which is a join table, not a subscription ledger).
**→ Needs your decision.**

### T0-6. Boost / Pro / promo payments 500 at the DB insert (S-3, from prior audit, NOT yet fixed)

**Affects:** `app/api/payment/create/route.ts` — the boost-campaign and Pro-storefront insert writes `payment_type` + `reference_id` to `payments` (`:282`), and the promo path writes `discount_cents` + `promo_code_id` (`:559`). None of those columns exist on `payments`. Every such checkout 500s.
**Solution:** stop writing non-existent columns; persist that metadata where it belongs.
**How:** drop the bad keys from the inserts; route promo redemption to `promo_redemptions` after success, and store boost/pro linkage via the existing `reference_id`-style field if one exists or a small dedicated table. Verify `payments.session_id` NOT NULL (S-6) at the same time — it may need a sentinel or a `DROP NOT NULL` migration.
**Why it works:** the payment row only needs amount/currency/gateway/status to transact; the extra metadata is reconciliation data that has correct homes elsewhere. This mirrors how the tip path already works.
**→ Needs a migration decision (parallels the Wompi/Stripe handoff).**

### T0-7. Direct-message thread shows the OLDEST 50 messages, not the newest

**Affects:** `lib/dal/conversations.ts:286` — `fetchConversationMessages` orders `created_at ASC` then `LIMIT 50`, so opening any long-running DM shows ancient history and hides recent messages. Users will think their messages vanished.
**Solution:** fetch the newest 50, display oldest-first.
**How:** `.order('created_at', { ascending: false }).limit(50)`, then `.reverse()` client-side before render.
**Why it works:** descending + limit grabs the most recent slice; reversing restores reading order. Standard chat-pagination pattern.

### T0-8. DM page + chat input are English-only for Spanish users

**Affects:** `app/messages/page.tsx` empty states (`:120, 217-220`), `components/ChatView.tsx:157` placeholder, and four toasts in `app/messages/[conversationId]/page.tsx` (`:160,191,203,210`). A Spanish user (your primary market) sees English on the entire messaging surface.
**Solution / How:** wrap the strings in `t()` (keys mostly already exist, e.g. `typeMessage`) or a `language === 'es'` ternary.
**Why it works:** the translation system is already in place app-wide; these strings were just missed.

### T0-9. Reminders silently never fire for evening Bogotá sessions

**Affects:** `app/api/cron/reminders/route.ts:61-66` (and `session-reminders`, `post-session-followups`, `daily-motivation`, `engagement`) compute "today" with `new Date().toISOString().split('T')[0]` — UTC. Vercel runs in UTC; your users are in Bogotá (UTC-5). For the ~5-hour window of 7pm–midnight Bogotá, the UTC date has already rolled to tomorrow, so sessions scheduled that evening never match the reminder filter and **never get a reminder**.
**Solution:** compute day boundaries in Bogotá time.
**How:** add a `lib/time/bogotaDate.ts` helper using `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' })` and replace every `toISOString().split('T')[0]` in the cron handlers with it.
**Why it works:** `en-CA` yields `YYYY-MM-DD` and the `timeZone` option anchors it to Bogotá, so the cron's notion of "today" matches the `session.date` the host actually picked. One helper fixes the whole class.

---

# TIER 1 — Security (no visible error, but urgent)

### T1-1. CRITICAL — Cross-user PII / bank-detail leak on `public.users`

**Affects:** `users` has `SELECT USING (true)` (`supabase/schema.sql:78`) and migration 067 only column-REVOKEs the Tribe.OS Stripe IDs + push tokens. So `payout_account_number`, `payout_document_number`, `payout_bank_name`, `stripe_account_id`, `wompi_merchant_id`, `emergency_contact_name/phone`, and `date_of_birth` are readable by **any authenticated user (and anon)** via a direct PostgREST query. This is an exploitable identity-theft / payout-redirect surface. Documented as deferred in `docs/LATER.md` but still live.
**Solution:** stop exposing sensitive columns on the public-readable table.
**How:** ship the `users_public` view (the proper fix), and in the interim run `REVOKE SELECT (payout_*, stripe_account_id, wompi_merchant_id, emergency_contact_*, date_of_birth) ON public.users FROM authenticated, anon;` then update the few self-read code paths to read those columns via an owner-scoped query.
**Why it works:** column-level REVOKE is enforced by Postgres regardless of RLS row policy, so even a crafted PostgREST select can't return the columns. The view is the durable version of the same principle.

### T1-2. CRITICAL — `/api/admin/notify` is unauthenticated when its secret is unset

**Affects:** `app/api/admin/notify/route.ts:14-18` — `if (internalSecret && provided !== internalSecret)` skips the check entirely when `ADMIN_NOTIFY_SECRET` is falsy (and the prior audit found it unset). Anyone can POST a notification that lands in every admin's bell, branded as the platform — a clean phishing primitive.
**Solution:** fail closed.
**How:** `if (!internalSecret || provided !== internalSecret) return 401;` and set `ADMIN_NOTIFY_SECRET` in Vercel.
**Why it works:** a missing secret now denies instead of allows — the only safe default for an auth gate.

### T1-3. HIGH — Two cron routes use fail-open auth

**Affects:** `app/api/send-inactive-nudge/route.ts:25` and `app/api/send-weekly-recap/route.ts:26` compare against `` `Bearer ${process.env.CRON_SECRET}` `` directly; if `CRON_SECRET` is unset the expected value is the literal `"Bearer undefined"`, which an attacker can send. Triggers a mass email blast to your dormant user base from your domain. Every other cron route was migrated to the fail-closed `isValidCronAuth`; these two were missed.
**Solution / How:** replace with `if (!isValidCronAuth(authHeader)) return 401;` using the existing `lib/auth/cron.ts` helper.
**Why it works:** that helper fails closed and compares constant-time; it's already proven on the other 15 cron routes.

### T1-4. HIGH — HTML email injection in `/api/notify-admin-signup`

**Affects:** `app/api/notify-admin-signup/route.ts:72,76,80` — public unauthenticated POST interpolates `userName`/`userEmail`/`signupMethod` into an HTML email to your admin inbox with no escaping. A crafted `userName` injects a phishing link into a Tribe-branded email you'll open.
**Solution / How:** HTML-escape the three values before interpolation (or send as plain text).
**Why it works:** escaping renders `<a href=...>` as inert text instead of a live link; the injection vector is the unescaped interpolation.

### T1-5. HIGH — `/api/notify-nearby` lets a caller blast arbitrary push content

**Affects:** `app/api/notify-nearby/route.ts:37-50` checks `user.id === creatorId` from the body but never verifies the `sessionId` belongs to that creator, and pushes attacker-controlled `sport`/`location` text to every nearby user matching the sport. Mass-phishing push primitive (gated only by whether `CRON_SECRET` is set on the downstream send route).
**Solution:** derive everything from the DB, trust nothing from the body.
**How:** look up the session by `sessionId`, assert `session.creator_id === user.id`, and read `sport`/`location`/`lat`/`lng` from the looked-up row.
**Why it works:** the push content is then provably the creator's own session data, not attacker input.

### T1-6. MEDIUM — Curated-session join policy can be bypassed

**Affects:** `supabase/schema.sql:91` — `session_participants` UPDATE policy is `USING (auth.uid() = user_id)` with **no `WITH CHECK`**. A user with a `pending` row on a curated session can `PATCH` their own row to `status='confirmed'` and appear on the host's roster without approval.
**Solution:** constrain what a participant may set themselves.
**How:** `USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id AND status IN ('cancelled','withdrawn'))` and move host-side confirmation into a SECURITY DEFINER RPC.
**Why it works:** `WITH CHECK` validates the _post-update_ row; restricting the allowed status values blocks self-promotion to confirmed while still letting users cancel.

### T1-7. MEDIUM — Banned users can self-unban

**Affects:** `supabase/schema.sql:79` / `add_admin_rls.sql` — the users-update policy lets `auth.uid()=id` update any column except `is_admin` (which a trigger locks). There's no equivalent guard on `banned`, so a banned user can `PATCH {"banned": false}`.
**Solution / How:** add a `prevent_banned_self_update` trigger mirroring `043_lock_is_admin.sql`, or `REVOKE UPDATE (banned) ON users FROM authenticated`.
**Why it works:** the trigger/REVOKE makes the column server-controlled regardless of the row policy — same pattern already proven for `is_admin`.

### T1-8. MEDIUM/LOW — Unauthenticated Google Places photo proxy (cost-DoS) + non-constant-time Wompi signature compare

**Affects:** `app/api/venues/photo/route.ts` (no auth, no rate limit, burns your Google billing) and `lib/payments/wompi.ts:207` (`===` instead of `timingSafeEqual`).
**Solution / How:** add the existing `checkRateLimit` helper (or auth) to the photo proxy; use `crypto.timingSafeEqual` for the Wompi signature after a length check.
**Why it works:** rate-limiting caps the billing blast radius; constant-time compare removes the (low-risk) timing side-channel and matches how Stripe's verifier already behaves.

---

# TIER 2 — Correctness & data integrity (silent, real damage)

### T2-1. CRITICAL — Comment counter has three competing writers

`lib/dal/comments.ts:78-103` — after inserting a comment it (a) writes a query-builder object into `comments_count`, (b) calls `rpc('increment_post_comments')`, and (c) read-modify-writes `count+1`. Two fire on the same insert; the fallback is a lost-update race. Counts drift permanently.
**Fix:** keep only a DB trigger (mirror the `post_likes` trigger from migration 031); delete all application-side count writes. **Why:** a single atomic writer in the DB can't race itself.

### T2-2. CRITICAL — Recurring-sessions cron: timezone shift + duplicate inserts

`app/api/cron/recurring-sessions/route.ts` — UTC date math materializes child sessions on the wrong calendar day (#T0-9 family), and there's no lock + no unique index on `(recurring_parent_id, date)`, so a duplicate cron delivery inserts two children.
**Fix:** Bogotá date helper + `withCronLock(...)` + partial unique index `CREATE UNIQUE INDEX ON sessions (recurring_parent_id, date) WHERE recurring_parent_id IS NOT NULL`. **Why:** the index makes the duplicate insert a no-op at the DB level even if two runs race; the lock prevents the wasted work.

### T2-3. CRITICAL/HIGH — Duplicate push notifications (no idempotency)

`app/api/notifications/send/route.ts` + `session-reminders`/`engagement`/`smart-match` crons set the "sent" flag _after_ fanning out, with no idempotency key. A cron retry re-sends to everyone. `smart-match` re-notifies the same match **every day** until status leaves `pending`.
**Fix:** set the flag _before_ sending, or INSERT-ON-CONFLICT into a `notifications_sent` log keyed by `(recipient, source_event)` before pushing. For smart-match, only notify on a newly-inserted match row. **Why:** the dedupe key makes a second delivery a no-op; flipping the flag first closes the retry window.

### T2-4. HIGH — Reminder/follow-up "sent" flags set even when the send failed

`reminders`, `session-reminders`, `post-session-followups` all `await fetch('/api/notifications/send')` fire-and-forget then unconditionally set `reminder_sent: true`. A 500 from the notification service still marks it sent — that reminder is lost forever.
**Fix:** check `res.ok` before setting the flag. **Why:** the flag should mean "delivered," not "attempted."

### T2-5. HIGH — `engagement` re-engagement uses `updated_at` as "last active"

`app/api/cron/engagement/route.ts:175` — `updated_at` changes on any profile edit (avatar, settings), so "inactive 3 days" misfires, and the day count is shown to the user ("It's been X days"). **Fix:** use `last_login_at`/`last_active_at` (already used by `behavioral-nudges`). **Why:** that column tracks actual activity, not row mutations.

### T2-6 … T2-14 (HIGH/MEDIUM — see cron + perf audits)

Reminder window too narrow (15-min, misses delayed crons); `fetchUsersWithPush` `.or()` chaining likely queues no-push users; daily-motivation/engagement double-fire without a lock; `behavioral-nudges` writes `nudge_log` without checking the error (breaks its own anti-spam dedup) and is capped at 500 users with no pagination; `smart-match` only processes 50 users/day; `waitlist-expiry` read-then-expire race sends false "offer expired" notices; notifications stored English-only in DB (see Tier 4). Full detail in the cron audit section of the appendix.

---

# TIER 3 — Performance (slowness, compounds with scale)

The dominant pattern is **N+1 queries and unbounded selects** on the social/messaging surfaces:

- **T3-1 (HIGH)** `getOrCreateDirectConversation` (`lib/dal/conversations.ts:53`) and **T3-2** `getUnreadCount` (`:349`) loop a query per conversation — a user with 50 DMs pays 50 round-trips per messages-tab render. **Fix:** single `IN`/`GROUP BY` query.
- **T3-3 (HIGH)** `fetchUserConversations` (`:171`) pulls **all** messages of every conversation to find the latest one. **Fix:** `DISTINCT ON (conversation_id) … ORDER BY created_at DESC`.
- **T3-4 (HIGH)** Home feed `fetchUpcomingSessions` selects `*` + full participant + creator graph for every future session, unbounded. **Fix:** `.limit(50)`, explicit columns, lazy-load avatars.
- **T3-5 (HIGH)** `useLiveStatus` is N+1 across feed sessions. **Fix:** one `session_id = ANY(...)` query.
- **T3-6 (HIGH)** `NotificationBell` realtime subscribes to **all** notifications with no `recipient_id` filter and a shared channel name — every user's bell wakes on every other user's notification. **Fix:** `filter: recipient_id=eq.${userId}`, per-user channel name.
- **T3-7 (HIGH)** Storefront pulls every follower row just to `.length` it. **Fix:** `count: 'exact', head: true`.
- **T3-8 (HIGH)** `softDeleteUser` cancels future sessions in a serial loop. **Fix:** single `.update().in('id', ids)`.
- **T3-9 (MEDIUM)** Missing indexes: `user_follows(follower_id, following_id)` + `(following_id)`, `session_participants(user_id, status)`. **Fix:** add them.
- **T3-10 (HIGH)** Feed pulls every like row to count locally — `instructor_posts.like_count` already exists via trigger. **Fix:** read the column.
- **T3-11..14** realtime chat per-message user lookup (cache it); follow/like toggles lack in-flight guards (spam-tap race); `togglePostLike` read-then-write race (use `ON CONFLICT`); no list virtualization on long feeds.

**Why these matter:** none throw an error today, but each one's cost grows linearly (or worse) with users/messages/followers. The messages tab and home feed will feel broken — multi-second spinners — well before you'd call it "scale."

---

# TIER 4 — i18n / locale (Spanish users see English)

Your primary market is Medellín; these all degrade the Spanish experience:

- **T4-1 (CRITICAL-ish)** Raw `session.sport` rendered untranslated on the session-detail page, the public share page, requests, and matches — Spanish users see "Running" not "Correr". **Fix:** `sportTranslations[sport]?.es ?? sport` (pattern already used on cards).
- **T4-2** Notifications are stored English-only in the DB (`waitlist-expiry`, `behavioral-nudges` ignores its own `messageEs`, `spotlight-rotation`, invites). **Fix:** store both languages or read the recipient's `preferred_language` before insert.
- **T4-3** The entire Spanish translation table (`lib/translationBase.ts`, `lib/translationExtras.ts`, `lib/motivationalMessageData.ts`) **has no accents and no `¡`/`¿`** — "Configuracion", "Sesion", "Contrasena". Visible on every screen. **Fix:** bulk accent pass, then Verónica reviews.
- **T4-4** `'es-ES'` used instead of `'es-CO'` in 23 date-format call sites; several `toLocaleString()`/`toLocaleDateString()` with no locale at all (server-default English). **Fix:** find-replace + a `formatDate(date, language)` helper.
- **T4-5** Pluralization: "1 spots left" / "1 cupos" in 6 places — no singular case. **Fix:** a `pluralizeSpots(n, language)` helper.
- Plus assorted hardcoded-English toasts on boost/payout/product-purchase paths.

**Note:** `messages/en.json`/`es.json` exist but appear unused at runtime (the live catalog is `lib/translations.ts`) and the JSON contains em-dashes that violate your copy rule — don't wire them up without an audit.

---

# TIER 5 — Mobile / Capacitor (iOS/Android only)

- **T5-1 (HIGH)** `window.location.href` used for **internal** navigation in ~8 places — in the Capacitor WKWebView this is a full-page reload that drops the JS heap, kills Supabase auth listeners, and breaks swipe-back. Worst on the notification toast. **Fix:** `router.push()` for any `/`-relative path; reserve `window.location.href` for external/Stripe URLs.
- **T5-2 (HIGH)** `window.open(url, '_blank')` for external links (WhatsApp share, Google Maps directions) silently no-ops in WKWebView. **Fix:** install `@capacitor/browser` and `Browser.open({url})`, feature-detected.
- **T5-3 (HIGH)** `navigator.share` without a clipboard fallback in `InviteIncentiveModal` and `referral` — does nothing on Android WebView. **Fix:** reuse the try-share-then-clipboard helper already in `useSessionActions`.
- **T5-4 (HIGH)** CSV drag-and-drop in `ImportClientsModal` doesn't fire in iOS WebView — coaches get stuck. **Fix:** detect iOS, promote the file-picker button.
- **T5-5 (MEDIUM)** Icon buttons under 44×44px; a `<button>` nested in `<Link>` (hydration warning + halved tap target); `key={index}` on the photo-upload list (deleting the wrong thumbnail); `.safe-area-top` hardcodes a 44px floor that adds a phantom gap on non-notched Android/iPad.

---

## Recommended sequencing

**Today (a few hours, stops the visible errors):** T0-1, T0-2, T0-3 (dead routes — trivial), T0-4 (invisible text), T0-7 (DM order), T0-8 (DM i18n). Then T1-2, T1-3 (fail-open auth — one-liners each).

**This week (the dangerous-but-silent layer):** T1-1 (PII leak — highest-severity security), T1-4, T1-5, T1-6, T1-7. T0-5 and T0-6 need your product/migration decisions first. T2-1, T2-2, T2-3 (data-integrity: counters, dup notifications), T2-4. The Bogotá-date helper (T0-9 / T2-2 family) fixes a whole cluster of cron bugs at once.

**Next (perf + polish before more users):** Tier 3 N+1 cluster (messages tab especially), the missing indexes, Tier 4 accent pass + sport translation, Tier 5 Capacitor navigation.

**Decisions I need from you:**

1. Subscriptions (T0-5): fix or remove for now?
2. Payments metadata (T0-6): add columns via migration, or persist elsewhere?
3. The RPC drift from the prior audit still needs the `pg_proc` query run against production (community join may be broken).

---

## Appendix: source audits

This document consolidates six audits. The earlier `docs/SILENT_BUG_AUDIT_2026-05-27.md` (schema/RPC/env/swallowed-errors) and `docs/PAYMENTS_HANDOFF.md` (Wompi/Stripe) remain the detailed references for their areas. PR #33 already shipped fixes for the first six findings of the silent-bug audit.
