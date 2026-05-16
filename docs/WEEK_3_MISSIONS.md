# Week 3 Missions — Pre-Beta Polish (Autonomous Build Day)

Goal: tighten the screws on top of the Weeks 1–2 integration without
requiring user-execution items. Everything in this pack is pure code
or documentation work — no Stripe Dashboard taps, no outreach emails,
no real-device verification needed. Real-device verify remains
pending whenever the user has 15 minutes.

Branch: `feature/tribe-os`. No merge to main until the full
integration is complete and Al gives explicit ask.

## Mission status

| #   | Mission                                                                             | Status  | Commit                          |
| --- | ----------------------------------------------------------------------------------- | ------- | ------------------------------- |
| 1   | Extend leak test to cover gym SQL functions + gym/coach RLS                         | ✅ done | `b2bea6b`                       |
| 2   | Read-only `/os/coaches` roster page                                                 | ✅ done | `274d2b7`                       |
| 3   | Editable `/os/gym` settings page (owner-only PATCH)                                 | ✅ done | `9628877`                       |
| 4   | Update `SECURITY_AUDIT_2026-05-12.md` + `PRE_MERGE_CHECKLIST.md` to reflect 068–072 | ✅ done | (this commit)                   |
| A   | `list_gym_coaches` SECURITY DEFINER + DAL refactor                                  | ✅ done | (migration 073)                 |
| B   | PostHog observability sweep (14 events + 4 funnels)                                 | ✅ done |                                 |
| C   | Beta instructor playbook                                                            | ✅ done |                                 |
| D   | Persistent OS shell + premium-aware nav + mobile + safe-area + filter pills         | ✅ done |                                 |
| E   | Real-device polish from Vercel walkthrough (5 fixes)                                | ✅ done |                                 |
| F   | Discoverability bridge (TribeOSEntryCard on Profile / Instructor / Settings)        | ✅ done | `ad5290c`                       |
| G   | First-visit Quick Guides (5 guides + replay button)                                 | ✅ done | `6f7017f`, `307a195`            |
| H   | DashboardStats + Coach invite/remove + UX glue                                      | ✅ done | `bb8c452`, `2e3d6d5`, `ffa1517` |
| I   | RecentActivityWidget + /create hint                                                 | ✅ done | `47b7681`                       |
| J   | WhatsApp follow-up buttons (client detail + at-risk widget)                         | ✅ done | `24e8281`                       |
| K   | Persistent onboarding checklist on /os/dashboard                                    | ✅ done | `7998813`                       |
| L   | Bulk attendance recording for group sessions                                        | ✅ done | `51f7cc0`                       |
| M   | Tribe.OS redesign: light theme + new IA + Teams + Schedule                          | ✅ done | `b9f31b3`..`ae86d63`            |
| N   | Reconciliation with sibling `tribe-os` codebase (Phases A/B/C)                      | ✅ done | `eb81a80`..`cdf0b3d`            |
| O   | Phase D Round 1: training_partners trigger + /os/teams/[id] + /os/intelligence      | ✅ done | `3f82fe7`, `b334698`            |
| P   | Phase D Round 2: ChurnRiskPanel + bulk rescore + coach picker + historical backfill | ✅ done | `5563131`..`ea53780`            |
| Q   | Phase D Round 3: nightly cron + scoring accuracy + history view                     | ✅ done | `a690727`                       |
| R   | Phase D Round 4: members badges + counter persistence + insight WhatsApp deep-links | ✅ done | `efd7a31`..`f37afd5`            |

## What shipped

### Mission 1 — leak test extension

Five new test phases land. Smoke: A can call `gym_revenue_totals` +
`gym_revenue_buckets` for their own gym (regression catcher for the
membership check in migration 071). Cross-user: B cannot query A's
gym totals/buckets (rejected 42501), B cannot SELECT A's gym row
(RLS blocks), B cannot SELECT A's coach roster (RLS blocks).
Expected next run: **16 PASS / 0 FAIL / 4 WARN**. Closes the DEFER
item from `LATER.md`.

### Mission 2 — `/os/coaches`

New API route `GET /api/tribe-os/coaches` + new page. Owner row gets
a crown icon and green border; other coaches show their initial.
Empty state ("Only you for now") covers the single-coach default.
No-gym error state covers the edge case.

**Known limit per audit finding M:** the page initially rendered only
the caller's own coach row because `gym_coaches_member_select`
collapsed to `user_id = auth.uid()` after the recursion hotfix.
✅ **Resolved later the same day** in migration 073 + DAL refactor
(see "Bonus mission A" below). Finding M flipped from DEFER to
FIX (fixed).

### Mission 3 — `/os/gym`

GET returns the gym row, PATCH is owner-only. Page renders name
(editable), slug (read-only), timezone (curated select), default
currency. Non-owner coaches see the form in read-only mode with an
explanatory notice. Common LATAM+US timezones in the picker; the
gym's current value is preserved at the top if outside the curated
set.

### Mission 4 — Docs

`SECURITY_AUDIT_2026-05-12.md` gets a "Post-gym-tenant integration
audit" section covering migrations 068–072, the new RLS surface,
the new SECURITY DEFINER functions, per-route audit for the new
routes, and Findings J–N (no FIX or CRITICAL items added).
`PRE_MERGE_CHECKLIST.md` gets new Security + Migrations + Gym-tenant
integration sections.

## Bonus mission A (shipped same day) — `list_gym_coaches`

Closed audit finding M. Migration 073 adds a SECURITY DEFINER function
`list_gym_coaches(p_gym_id)` gated by gym_coaches membership; the
DAL's `listCoachesForGym` now calls the RPC instead of SELECTing the
table directly. Two new leak test phases (5f smoke, 5g cross-gym
attack) verify the gate. Once migration 073 is applied to the live
DB, the `/os/coaches` page will show every coach in a multi-coach
gym rather than just the caller. See `LATER.md` for the completion
entry preserving the original problem statement.

## Bonus mission B — PostHog observability sweep

14 new `tribe_os_*` events wired across the OS surfaces. Full taxonomy

- four suggested funnels in `docs/ANALYTICS_FUNNELS.md`. Properties
  are intentionally lean — no client names, no payment amounts.

## Bonus mission C — Beta instructor playbook

`docs/INSTRUCTOR_PLAYBOOK_BETA.md` — 5-minute self-contained read for
a beta candidate. Bilingual EN+ES (ES marked PENDING VERONICA).
Answers: what Tribe.OS is, what you can do today, what's coming,
what we ask in exchange for the 90 free days, what happens after.

## Mission E — Real-device polish from the Vercel walkthrough

Five fixes after Al ran through the OS surfaces on the preview:

1. **UUID validation** on `/os/clients/[id]` + `/edit` so bogus URLs
   (e.g. `/os/clients/edit`) render the friendly not-found state
   instead of leaking raw Postgres errors. Helper at
   `lib/validations/uuid.ts`.
2. **`/os/coaches` duplicate "invite coming soon"** copy collapsed
   into one placement.
3. **Revenue empty-state card** restyled from white-on-dark mismatch
   to `bg-tribe-surface` + `border-tribe-mid` matching the rest of
   the OS aesthetic.
4. **At-risk widget** now distinguishes "zero clients on the roster"
   (CTA to onboard the first one) from "has clients but none at-risk"
   (affirming empty state). Endpoint returns `{ at_risk,
total_clients }` in one round-trip.
5. **Gym slug** de-emphasized visually on `/os/coaches` (smaller,
   dimmer) so it doesn't compete with the gym name.

## Mission D — Persistent OS shell

`components/tribe-os/OSShell.tsx` rendered via `app/os/layout.tsx` on
every `/os/*` route. Structure:

- **Left:** Tribe.OS wordmark, links to `/os/dashboard`
- **Center (desktop) / bottom-tab-bar (mobile):** four primary nav
  items — Dashboard, Clients, Revenue, Coaches. Active state
  highlights the current section and stays highlighted for child
  routes (`/os/clients/[id]/edit` etc.).
- **Right:** account menu — Gym settings (premium-only), Back to
  Tribe escape hatch.

Every OS page got refactored: dashboard dropped the six-button action
grid (shell handles it now), refocused on the welcome surface + at-
risk widget. Other pages lost their "Volver al panel" back links and
redundant `min-h-screen bg-tribe-dark` outer wrappers (shell provides
them). Dashboard copy tightened from a three-sentence design-partner
paragraph to a tight "Your gym at a glance" + one-line orientation.

## Mission D polish round — premium-aware + mobile + safe-area

Follow-ups after the shell landed:

1. **Premium-aware nav** — shell now probes the user's premium
   status and hides nav links for non-premium users (otherwise they'd
   click a link and get bounced to `/#tribe-os` by the page-level
   gate). Three states: 'unknown' (defensive render to avoid
   no-nav flash for premium users), 'premium' (full nav),
   'not_premium' (wordmark + back-to-Tribe only).
2. **iOS Capacitor safe-area** — `pt-[env(safe-area-inset-top)]`
   on the top header and `pb-[env(safe-area-inset-bottom)]` on the
   bottom tab bar so the status bar / home-indicator don't overlap
   the shell. Web users see 0 inset.
3. **Mobile bottom tab bar** — replaced the horizontal-scroll pill
   row at the top with a fixed four-tab bottom bar on mobile.
   Thumb-reach is much better than top-of-screen. Desktop keeps the
   top nav.
4. **Keyboard Escape closes the account menu** — minimum
   accessibility for keyboard users.

## Mission D polish round — clients page filters

`/os/clients` now has status + tag filter pills. Status pills:
All / Active / Lead / Lapsed / Inactive — click to filter, click
again to clear. Tag pills derive from the unfiltered roster
snapshot so they stay stable as you narrow. Empty states branch
between "no roster yet" and "no rows match these filters". Server-
side: `ListClientsQuerySchema` and the DAL accept the new `status`
filter; the existing `tag` filter remains.

## Mission F — Discoverability bridge from main Tribe to Tribe.OS

Problem surfaced by Al on the Vercel preview: "how do I get from my
normal Tribe account to the Tribe.OS platform? I don't understand the
path." The OS surface was unreachable from the regular app unless you
already knew the `/os/dashboard` URL.

`components/tribe-os/TribeOSEntryCard.tsx` is a small premium-aware
card that probes `users.tribe_os_tier/status` and renders one of:

- **Active premium →** "Open Tribe.OS" link to `/os/dashboard`.
- **Inactive / not premium →** explanatory pitch card with the same
  link (the dashboard renders the upgrade flow inline for non-premium
  users, so the link still works).

Mounted on three high-traffic surfaces for instructors:

1. `/profile` — under the bio block
2. `/dashboard/instructor` — top of the Instructor dashboard
3. `/settings` — under the account section

Cards stay invisible to non-instructors. Cleanest path: anywhere an
instructor lands in the regular app, they can see a one-click bridge
to Tribe.OS.

## Mission G — First-visit Quick Guides

Followup from Al: "perhaps there need to be instructions for the
first time when you log in after signing up. Quick guides that are
optional."

Built reusable infrastructure rather than one-off modals:

- `components/QuickGuide.tsx` — generic multi-step modal with
  back/next/skip + step counter. Brand-themed.
- `hooks/useQuickGuide.ts` — persists a seen-flag in
  `localStorage` keyed by guide name. Auto-opens on first visit;
  exposes `replay()` so a "Take the tour again" button can re-open
  without flipping the flag.

Five guides shipped:

1. `TribeWelcomeGuide` — first ever app visit (main Tribe app).
2. `TribeOSWelcomeGuide` — first `/os/dashboard` visit. Replay
   handle exposed to a "Take the tour again" pill on the dashboard.
3. `ClientsPageGuide` — first `/os/clients` visit.
4. `RevenuePageGuide` — first `/os/revenue` visit.
5. `CoachesPageGuide` — first `/os/coaches` visit.

`components/ReplayToursButton.tsx` clears all five seen-flags so a
user can re-onboard from scratch (mounted on `/settings`).

## Mission H — Dashboard stats + Coach invite/remove + UX glue

After the basic shell + guides landed, the dashboard still felt
empty. Two batches of polish:

**Batch 1 — quick wins:**

- `DashboardStats` (3 cards: active clients / sessions this month /
  revenue this month) above the at-risk widget. One round-trip to
  `/api/tribe-os/dashboard/stats`; failures degrade gracefully.
- Create-session CTA (`Plus` icon → `/create`) on the dashboard so
  new instructors aren't stuck wondering where sessions come from.
- Manage-subscription pill + "Take the tour again" pill at the
  bottom.
- Help link added to the account menu in the OS shell.
- Empty-attendance state on `/os/clients/[id]` no longer renders a
  blank card — explicit "No attendance yet" message.
- Coach-invite CLI commands added to `scripts/grant-tribe-os-premium.js`
  (`--add-coach`, `--remove-coach`) for operator-side adjustments.
- Client list sort options (name / recent / inactive longest).

**Batch 2 — coach management UI:**

- `InviteCoachForm` (owner-only) at the bottom of `/os/coaches` —
  inline email + role form posting to
  `/api/tribe-os/coaches/invite`. Distinguishes "user not on Tribe
  yet" from generic errors with a friendly note.
- Trash icon on non-owner coach rows opens a confirmation dialog
  and posts to `/api/tribe-os/coaches/remove`. Refuses to remove
  the gym owner (every gym needs an owner; ownership transfer is
  a separate, not-yet-built flow).
- Owner-only invite/remove — non-owners see explanatory copy
  instead of broken-looking forms.

## Mission R — Phase D Round 4: AI surface coherence

Four small but compounding improvements that make the AI engine
visible across every surface that touches a member.

### Members table badges (`efd7a31`)

`/os/members` previously rendered status badges from the manual
`status` column only — so an active member the AI scored AT_RISK
could show up as 'Active' here while the at-risk widget on the
dashboard already showed them as 'At Risk'. The two surfaces could
disagree.

Fixed badge precedence (top → bottom):

1. `health_status = 'AT_RISK'` → At Risk
2. `health_status = 'WATCH'` → Watch
3. `status = 'lapsed'` → Watch (manual override)
4. `status = 'inactive'` → Churned
5. `status = 'lead'` → Lead
6. `status = 'active'` + no attendance > 14d → At Risk (heuristic
   fallback for unscored rows)
7. → Active

Watch + At Risk filter pills now query the full roster server-side
and combine `status` + `health_status` client-side, so neither
column-priority path misses members.

### Counter persistence (`560109b` + migration 078)

The four counter columns added in migration 075 (`total_sessions`,
`sessions_last_30_days`, `current_streak_days`,
`longest_streak_days`) were dead weight — nothing wrote to them
and the scoring engine computed everything on demand.

Now `fetchChurnSignals` returns the counters it computes anyway,
and `persistMemberScore` writes them back to the clients row when
called. Free side-effect of every rescore (manual button, cron,
or single-member). `longest_streak_days` ratchets via the
`bump_longest_streak(uuid, integer)` RPC added in migration 078
so a partial run never overwrites a higher historical value.

Other surfaces can now read these columns directly with at most
24-hour staleness (refreshed every cron pass).

### Stats card extension (`a3a87c9`)

`/os/clients/[id]` Stats card grew a second row:

- Last 30 days (`sessions_last_30_days`)
- Current streak with 'Longest: N' sublabel (`current_streak_days`
  - `longest_streak_days`)

Second row only renders when at least one counter is non-zero —
keeps the card visually quiet for un-scored gyms.

### Insight WhatsApp deep-links (`f37afd5`)

`/os/intelligence` insight cards with `action_type = 'SEND_MESSAGE'`
that reference exactly one member now render the action button as
a wa.me deep-link instead of an internal route. The link opens
WhatsApp directly with a pre-composed check-in message keyed off
the member's first name — one tap instead of three.

DAL extended:

- `listInsightsForGym` join now two-hops into clients to embed
  `name` + `phone` per linked member.
- New `members: InsightMember[]` field on `CommunityInsight` carries
  the embedded data; legacy `member_ids: string[]` kept in sync.

UI:

- Avatar preview chips on each card now use the embedded member
  name to seed initials (was always '·' before).
- Two analytics events fire on click:
  `tribe_os_insight_action_clicked` (with `via='whatsapp'`) +
  `tribe_os_whatsapp_clicked` (surface=`intelligence_card`).
- Falls back to the existing internal route when there's no phone
  or the insight covers multiple members.

### Pending follow-ups

- LLM-backed features (message drafter, workout generator, etc.)
  still gated `enabled: false`. Needs `ANTHROPIC_API_KEY` + budget
  decision.
- Cross-app churn signals (`paymentFailures90d`,
  `cancellationRate30d`, `communityEngagementDrop`) still return 0.
- Pre-composed messages could pull from a per-gym template later
  (the current copy is hardcoded EN/ES).
- Insight cards on the dashboard widget (At Risk widget) — same
  WhatsApp deep-link pattern would help there too. Already partially
  in place (whatsappCheckInMessage), but the dashboard widget
  doesn't deep-link through to the insight system.

## Mission Q — Phase D Round 3: nightly cron + scoring accuracy + history view

Closes the loop on the intelligence engine so it runs autonomously
and surfaces accurate scores.

### Scoring accuracy fix (`lib/ai/data-access.ts`)

The two attendance-cadence signals (`attendanceFrequencyDelta` and
`streakBroken`) were reading from `clients.sessions_last_30_days`
and `clients.current_streak_days` — columns added in migration 075
but never maintained. They were always 0, which made:

- `attendanceFrequencyDelta` always contribute its full 0.20 weight
- `streakBroken` never trigger (0 = 0 = no recent break)

Result: every member scored higher than they should. New members
with no attendance were no different from members who had stopped
showing up.

**Fixed** by computing both signals live from `client_attendance`:

- One round-trip pulls the last 90 days of `attended_at` timestamps.
- `sessions30` (last 30 days) vs `sessions30To90` (prior 30-90d
  window) → `attendanceFrequencyDelta` compares the two periods.
- Falls back to a fixed 4/month baseline when < 60d of history.
- `currentStreakDays` = consecutive days back from today with at
  least one attended row (bounded to 60).
- `streakBroken` requires (a) currentStreak=0, (b) last seen 3-14
  days ago, AND (c) prior 30-90d had ≥ 4 sessions (so there was
  a streak to break).

### At-risk widget uses health_status (`lib/dal/clients.ts`)

`listAtRiskClients` now adds `health_status = 'AT_RISK'` as a
fourth OR branch alongside the existing heuristics. When the AI
has scored someone AT_RISK they bubble to the top of the widget;
unscored rows still get caught by the heuristic branches as a
fallback. Ordering switched to `churn_risk_score DESC NULLS LAST`
first so AI-flagged members rank above heuristic-only ones.

### Nightly cron (`app/api/cron/tribe-os/intelligence`)

`GET /api/cron/tribe-os/intelligence` iterates every premium-active
gym and runs the full intelligence pipeline (rescore +
insight-generate). Auth: Bearer `CRON_SECRET` matching the other
Tribe cron jobs. Capped at `MAX_GYMS_PER_RUN` (50) per execution.

Pipeline extracted into `lib/ai/run-intelligence.ts` —
`runIntelligenceForGym(gymId)` is shared by the manual button
endpoint (`POST /api/tribe-os/ai/rescore-all`) and the cron, so
both paths use exactly the same logic.

Scheduled at `0 7 * * *` UTC in `vercel.json` — 2 AM Medellín time
(UTC-5). Per-gym timezone scheduling lands when Tribe.OS fans out
beyond Colombia.

### /os/intelligence history view

New Active / History toggle in the page header. History adds
`include_actioned=true` + `include_expired=true` to the API
request so dismissed and expired cards surface for retrospection.
Empty-state copy distinguishes 'no insights yet' (fresh gym) from
'no past alerts' (history view). The
`tribe_os_intelligence_viewed` analytics event now carries the
view mode.

### Pending follow-ups

- Migration 077 still needs to be applied to the live DB before
  the community-isolation churn signal reflects historical data.
- `CRON_SECRET` must be set in Vercel project env vars (the other
  Tribe crons already require it).
- LLM-backed features (message drafter, workout generator, etc.)
  still gated `enabled: false` in `lib/ai/config.ts`.
- Cross-app signals (`paymentFailures90d`, `cancellationRate30d`,
  `communityEngagementDrop`) still return 0 — wired in when the
  Stripe-webhook payments table + community-app feed integration
  lands.

## Mission P — Phase D Round 2: AI surface + bulk rescore + coach picker

### ChurnRiskPanel (`components/tribe-os/ChurnRiskPanel.tsx`)

New intelligence card on `/os/clients/[id]`. Two visual states:

1. **Never scored** (`churn_risk_score = NULL`): Brain icon + 'Not
   scored yet' headline + 'Rescore now' button.
2. **Scored**: big 2-decimal score tinted by health status
   (green / amber / red), HEALTHY/WATCH/AT_RISK badge, health-
   status shield icon, relative 'Last scored 3 hours ago' time,
   collapsible per-signal breakdown.

The breakdown auto-opens after a fresh rescore so the user can
see what changed. Score updates in local state immediately for
responsiveness; the DB columns (`churn_risk_score`,
`churn_risk_updated_at`, `health_status`) get written inside the
endpoint.

### Bulk rescore + insight generator

`lib/ai/insight-generator.ts`:

- `generateChurnInsights(gymId, scoredMembers)` writes one
  `CHURN_RISK` insight per AT_RISK member with severity
  CRITICAL (score ≥ 0.8) or HIGH (≥ 0.6).
- Dedupes against open (unactioned + unexpired) insights already
  referencing the same client — re-running the engine won't spam.
- 14-day expiry. `data_payload` carries the score breakdown for
  auditability.

`POST /api/tribe-os/ai/rescore-all`:

- Owner-only. Iterates non-archived clients sequentially.
- Persists scores, generates insights.
- Returns scored / skipped / at_risk / insights_created /
  duration_ms.

`/os/intelligence` got a 'Run intelligence engine' button (owner-
only server-side) that calls the bulk endpoint. After a run the
page refreshes + shows 'Scored 47 members · 6 at risk · 4 new
alerts' inline.

### Coach picker in team Edit modal

The team Edit modal previously omitted coach assignment, so saving
Edit would null out `coach_user_id`. Fixed by:

- Fetching the gym's coach list from `/api/tribe-os/coaches` on
  modal open.
- New select dropdown between Description and Color (Unassigned
  default, owner tagged with '(owner)').
- `coach_user_id` now included in the PATCH body.

### Migration 077 — Historical training_partners backfill

One-time SQL that runs the migration 076 trigger logic over
existing `client_attendance` rows. Idempotent — `GREATEST` /
`LEAST` on conflict keeps any trigger-built rows correct.

After applying: the Community Isolation churn signal becomes
retroactive, so rescore-all produces better-calibrated scores
for gyms with attendance history pre-076.

## Mission O — Phase D Round 1: data pipelines + missing surfaces

Three concrete additions to the redesigned Tribe.OS surface, building
on the schema + UI primitives shipped in Mission N.

### Migration 076 — TrainingPartner write trigger (`3f82fe7`)

Postgres trigger on `client_attendance` that automatically upserts
`training_partners` edges every time a client transitions to
`attended = true`. Two triggers (`AFTER INSERT` + `AFTER UPDATE OF
attended`) share a single SECURITY DEFINER function so we cleanly
handle 'first-time attendance' and 'manual correction from no-show
to attended' without double-counting on unrelated row updates
(payment-field toggles, notes edits).

Function logic:

1. WHEN clause gates to attended-true transitions only.
2. Pulls `gym_id` from the attended client.
3. Iterates over every OTHER attended client at the same session
   in the SAME gym (cross-gym sessions are skipped — pairs require
   same gym).
4. For each pair, upserts `training_partners` with `member_a_id <
member_b_id` canonical ordering enforced by the CHECK constraint.
5. ON CONFLICT bumps `shared_sessions` + `last_shared_at`; nightly
   batch handles `last_30_day_sessions`, `compatibility_score`,
   `retention_correlation`.

Un-attend (true → false) is **not** handled: historical edges stay.
Legacy-tenant clients (`gym_id` NULL) are skipped — the community
graph only exists in the gym tenant.

Once this trigger is live, every attendance write builds the
community graph automatically — no batch reconciliation needed for
new data. A separate backfill job can re-run the logic over historical
attendance when we're ready.

### Teams detail page — `/os/teams/[id]` (`3f82fe7`)

Makes the Teams feature usable end-to-end. The list cards on
`/os/teams` previously linked to a 404; they now go somewhere real.

API:

- `GET /api/tribe-os/teams/[id]` — team + full members
- `PATCH /api/tribe-os/teams/[id]` — update (owner only)
- `DELETE /api/tribe-os/teams/[id]` — delete (owner only)
- `POST /api/tribe-os/teams/[id]/members` — add (owner only)
- `DELETE /api/tribe-os/teams/[id]/members?client_id=…` — remove

DAL: `getTeamWithMembers()` joins `gym_team_members` → `clients`,
filters archived rows, sorts alphabetically. New
`GymTeamWithMembers` type carries the embedded coach name +
member roster.

Page layout:

- Header card with color stripe, name + description, owner-only
  Edit / Delete buttons, stats row (member count + active dot +
  at-risk dot), coach avatar + name.
- Members card with header + Add Member button (owner only) + a
  divided list. Each row: avatar, name, email, last-seen-days,
  health-status badge (success/warning/danger/info/default derived
  from `health_status` + `status`), WhatsApp deep-link when phone
  present, Remove button (owner only).
- Add Member modal: full client roster minus existing members,
  search input, Add button per row.
- Edit modal: name + description + color picker, submits PATCH.
- Delete dialog: red confirm button, calls DELETE then routes back
  to `/os/teams`.

Augmented `GET /api/tribe-os/gym` to return `is_owner` so the page
can gate owner-only affordances without an extra round trip.

Five new analytics events on the page: `team_detail_viewed`,
`team_updated`, `team_deleted`, `team_member_added`,
`team_member_removed`. Plus `whatsapp_clicked` with
`surface='team_detail'`.

### Intelligence page — `/os/intelligence` (`b334698`)

Replaces the ComingSoonPage stub with the real surface that renders
`community_insights` cards.

DAL: `lib/dal/communityInsights.ts` with
`listInsightsForGym(gymId, { unactionedOnly, activeOnly })` and
`actionInsight(insightId)`. Joins with `community_insight_members`
to surface affected client ids. Sorts severity DESC then created_at
DESC in JS (Postgres can't sort by an arbitrary enum literal order
via the query builder).

API:

- `GET /api/tribe-os/intelligence` — lists active insights for the
  caller's gym. `?include_actioned=true` + `?include_expired=true`
  widen the result set for history views.
- `POST /api/tribe-os/intelligence/[id]/dismiss` — marks an insight
  as actioned. RLS-gated; any gym coach can dismiss.

Page layout:

- Brain-icon header.
- Sections grouped by severity (CRITICAL → HIGH → MEDIUM → LOW).
- Each card has:
  - Severity-colored left rail (4px wide,
    `danger/warning/info/dark-60`)
  - Type icon chip + type Badge (matching variant)
  - Confidence percentage tag
  - Headline + body
  - Members-affected count + estimated revenue impact
  - Avatar preview when members are tied to the insight
  - Action button (label from `action_label` or canonical
    `action_type` → `SEND_MESSAGE` / `CREATE_SESSION` /
    `CALL_MEMBER` / `REVIEW_SCHEDULE`)
  - Dismiss X button (calls dismiss endpoint)
- Empty state: lime sparkles icon + 'No insights yet — the nightly
  intelligence engine writes alerts here when it spots churn risk,
  retention opportunities, revenue gaps, or growth signals.'

Three new analytics events: `intelligence_viewed`,
`insight_dismissed` (with type + severity),
`insight_action_clicked` (with type + action_type).

**Why the intelligence page renders empty for now:**
The `community_insights` table is populated by the nightly
intelligence engine, which doesn't exist yet (Phase D follow-up
commit). The page works end-to-end as soon as a row gets inserted
— either by the future nightly batch or by a manual test row.

### Pending in Phase D follow-ups

- Apply migration 076 to the live Supabase DB.
- The four LLM-backed features (message drafter, workout generator,
  revenue forecast, smart scheduling) — still gated `enabled: false`
  pending ANTHROPIC_API_KEY + budget UX decisions.
- Cross-app churn signals — `paymentFailures90d`,
  `cancellationRate30d`, `communityEngagementDrop` still return 0.
- Nightly batch job — runs at 2am gym-local, calls
  `scoreMember()` on every member + writes high-severity insights
  to `community_insights`.
- Historical-attendance backfill for `training_partners`.
- Coach picker UI in the team Edit modal (currently you can only
  set name + description + color; coach is `coach_user_id` and is
  set to null until the modal grows a dropdown sourced from
  `gym_coaches`).

## Mission N — Reconciliation with the sibling `tribe-os` codebase

Al pointed at a separate Next.js + Prisma codebase at
`/Users/alainalisca/Desktop/Projects/Tribe.Ecosystem.4.4.2026/
tribe-os/` and said it's closer to the vision for Tribe.OS than the
look I had been building. That codebase carries:

- a canonical UI primitive library (Button / Card / Badge / Avatar
  / Input / StatCard / DataTable / EmptyState)
- the canonical brand-green `#A8DA36` from the design-guidelines PDF
  (vs. tribe-v3's `#84cc16` Tailwind lime-500)
- nested color scales (`tribe-green-50/100/dark`, `tribe-dark-40/60/80`)
- `rounded-tribe`, `shadow-tribe`, `spacing.sidebar`, `spacing.topbar`
  tokens
- canonical sidebar with left-border accent on active items
- a full Prisma schema with intelligence-ready fields
  (`Member.churnRiskScore`, `TrainingPartner`, `CommunityInsight`,
  `AgentRunLog`, `ExerciseVideo`)
- the agentic-AI infrastructure from
  `AGENTIC_FEATURES_STRATEGY.md` — Tier 1 churn scoring, message
  drafter, workout generator, revenue forecast, smart scheduling

I reconciled tribe-v3 against that codebase in three phases.

### Phase A (`eb81a80`) — Canonical tokens + UI primitives + shell

- `tailwind.config.ts`: brand green flipped to canonical `#A8DA36`
  globally. Added nested `tribe-green-50/100/dark`, `tribe-dark-40/
60/80`, `tribe-success/warning/danger/info/sky/peach`, `rounded-
tribe (10px)`, `shadow-tribe / -lg / -green`, `spacing.sidebar
(220px)`, `spacing.topbar (60px)`. Legacy flat names kept as
  aliases so existing call sites still compile.
- Ported all 8 UI primitives into `components/tribe-os/ui/`. Each
  primitive is a thin wrapper around Tailwind classes that uses the
  new tokens. Namespaced under `tribe-os/ui/` so they don't collide
  with the consumer-app shadcn primitives.
- Refactored `OSShell.tsx`: sidebar width 224→220px, left-border
  accent on active nav items (canonical pattern), bigger 5×5 icons,
  user card uses the canonical Avatar pattern with lime ring, sign-
  out button uses `red-100/200` (matches tribe-os). Topbar height
  56→60px, surfaces now use `bg-tribe-dark-40` / `border-tribe-dark-
40/80` instead of generic gray-50/200.
- Refactored `DashboardStats` to consume the new `<StatCard />`
  primitive directly — first page to use the new library.

### Phase B (`0f1896a`, `1ac6f49`) — Component-by-component refactor

Three dashboard widgets + the teams and schedule cards moved onto
the new primitives + token system:

- `AtRiskClientsWidget` — wraps in `<Card><CardHeader><CardContent>`.
  Pulsing red dot on the AlertCircle icon. Avatar primitive +
  ghost-variant Button for "Reach Out". Rows in `divide-y
divide-tribe-dark-40`.
- `UpcomingSessionsCard` — Card wrap + status badges switched from
  blue/amber/red Tailwind to canonical `tribe-sky/peach/red-100`
  with `tribe-info/warning/danger` text.
- `RecentActivityWidget` — Card wrap + activity dots colored
  `tribe-green/info/dark-60` (was `blue-400/gray-300`).
- `/os/teams` team card — color stripe up to 1.5px to match the
  canonical, lime ghost-Button for "message team", member count
  prominent + dot-prefixed active/at-risk legend, avatar primitive
  everywhere.
- `/os/schedule` session card — `rounded-tribe` + `shadow-tribe` +
  hover-lift to `shadow-tribe-lg`. Status badges via the `<Badge />`
  primitive (variant=info/success/default/danger). Enrollment bar
  on `bg-tribe-dark-40`. Full sweep of remaining gray-\* classes on
  the schedule page → `tribe-dark-{40..80}`.

### Phase C (`cdf0b3d`) — Intelligence schema + Tier 1 AI foundation

Migration `075_intelligence_schema.sql` is fully additive — no data
migration needed:

1. `clients` table: new columns `churn_risk_score`,
   `churn_risk_updated_at`, `health_status` (default HEALTHY),
   `total_sessions`, `sessions_last_30_days`, `current_streak_days`,
   `longest_streak_days`. Indexes on (gym_id, health_status) and
   (gym_id, churn_risk_score).
2. `training_partners` — community-graph edges with
   shared_sessions / last_30_day_sessions / compatibility_score /
   retention_correlation. Unique on (member_a_id, member_b_id).
3. `community_insights` + `community_insight_members` — insight
   cards with type/severity/headline/body/action_type and a
   data_payload JSON for auditability.
4. `agent_run_log` — every AI invocation logs model + token usage
   - cost_usd + duration_ms + success. Powers the cost dashboard.
5. `exercise_videos` — curated YouTube library for the workout
   generator (global + per-gym overrides via NULL gym_id semantics).

`lib/ai/`:

- `config.ts` — canonical model IDs (Haiku + Sonnet), pricing,
  rate-limit tiers, feature flags, churn weights, health thresholds.
- `types.ts` — `ChurnSignals`, `ScoreInput`, `ScoreOutput`,
  `AIResponse<T>`, `HealthStatus`.
- `churn-scoring.ts` — pure-compute weighted heuristic (no LLM).
  7-signal score → 0–1 + HEALTHY/WATCH/AT_RISK label.
- `logger.ts` — `aiLogger(feature, gymId)` start/success/failure
  helper that writes to `agent_run_log` via service-role.
- `data-access.ts` — `fetchChurnSignals(clientId, gymId)` gathers
  live data from clients + training_partners; `persistMemberScore()`
  writes back. Adapted from the tribe-os Prisma version to use
  Supabase JS.

Endpoint: `POST /api/tribe-os/ai/rescore-member` — premium-gated
manual rescoring for one client. Returns ScoreOutput + AIResponseMeta.

**Manual step you'll need to run:**

- Apply migration 075 (and 074 if you haven't yet) to the live
  Supabase DB before the new surfaces become end-to-end functional.

**Pending follow-ups (Phase D, not in this round):**

- The four LLM-backed features (message drafter, workout generator,
  revenue forecast, session scheduler) — need ANTHROPIC_API_KEY +
  per-gym rate limiting + a budget UX. Their feature flags are wired
  with `enabled: false` until we make that product call.
- Cross-app signals — paymentFailures90d / cancellationRate30d /
  communityEngagementDrop currently return 0 in `data-access.ts`.
  Need the Stripe-webhook payments table and the consumer Tribe
  community-app feed wired in.
- The nightly batch job — cron route that scores every member in
  every gym at 2am gym-local. Will live as a Vercel Cron + Edge
  Function once we have the scaffold.
- A `/os/intelligence` page that renders `community_insights` cards.
  Currently a `ComingSoonPage` stub.
- Sibling-codebase Prisma → tribe-v3 Supabase migration of the
  TrainingPartner attendance-write trigger (the thing that
  populates `training_partners` on every co-attendance).

## Mission M — Tribe.OS redesign (light theme + new IA + new entities)

Direction change after reviewing the new mockups (5 screens covering
Dashboard / Members / Teams / Schedule / Revenue). The previous dark-
theme shell was replaced wholesale with a light-content, dark-sidebar
layout, plus a new IA and two new entities. Shipped across seven
commits.

**Shell (`b9f31b3`)**

- New OSShell: dark left sidebar with vertical nav (9 items), user
  card + Sign Out pinned to the bottom, light-theme top bar on the
  main content area with section title + notification bell + help.
- Mobile: sidebar becomes a slide-out drawer.
- New IA: Dashboard / Members / Teams / Programs / Schedule /
  Revenue / Messages / Intelligence / Settings.
- Stub pages for Programs / Messages / Intelligence via a shared
  ComingSoonPage component (deleted as features ship).
- /os/settings redirects to /os/gym; /os/members redirects to
  /os/clients in this commit (later: /os/clients redirects to
  /os/members; see commit 7 below).

**Dashboard rebuild (`c512234`)**

- Time-aware greeting ("Good morning/afternoon/evening, [first name]").
- 4 KPI cards with MoM deltas: Total Members, Active Sessions,
  Monthly Revenue, Retention Rate. Per-metric isolated failures.
- /api/tribe-os/dashboard/stats now returns prior-month figures and
  computes retention rate (share of last-month-active members still
  active this month).
- Two-column mid section: Upcoming Sessions (table, today+tomorrow,
  enrollment progress bars, status badges) + Members at Risk (Reach
  Out CTAs).
- Recent Activity feed below as a single column.
- New /api/tribe-os/dashboard/upcoming-sessions endpoint.
- AtRiskClientsWidget, RecentActivityWidget, DashboardStats,
  OnboardingChecklist all converted from dark to light.

**Members rebuild (`795aec9`)**

- New /os/members surface (the redirect target). Search + Add Member
  CTA at top, "All Members" card with filter pills
  (All / Active / Watch / At Risk / Churned) and a table with
  columns matching the mockup: avatar+name+email, status, teams
  (placeholder), tags, days since login, sessions(30d), actions
  (view + WhatsApp).
- Status filter mapping while the DB enum still uses
  {active, lead, lapsed, inactive}: UI Active→active, Watch→lapsed,
  Churned→inactive, At Risk→client-side computed (active + last
  attendance > 14d).
- Teams column shows "—" until membership data flows from the
  Teams model (next commit).

**Teams (`cb0027b`)** — net-new feature

- Migration 074: gym_teams (id, gym_id, name, description, color,
  coach_user_id) and gym_team_members (team_id, client_id).
  Color enum: lime/blue/amber/red/purple/slate. Unique (gym_id, name).
- RLS: all gym members SELECT, owner-only INSERT/UPDATE/DELETE on
  gym_teams; gym_team_members writes via service-role.
- list_teams_for_gym SECURITY DEFINER RPC returns each team with
  member_count, active_count, at_risk_count, and a preview_members
  JSON array.
- lib/dal/gymTeams.ts and lib/validations/teams.ts.
- GET /api/tribe-os/teams (list) + POST (create, owner-only,
  returns 400 duplicate_name on unique violation).
- /os/teams page with team cards matching mockup 1: color stripe,
  name + description, member count + active/at-risk breakdown,
  head coach (avatar + name), member-avatar preview with +N
  overflow, View Members link. Create Team modal with color picker.

**Schedule (`44ec1df`)** — net-new surface

- /os/schedule with week navigator (prev/next, week-of label,
  "This Week" reset). List view ships first; Calendar view next round.
- Sessions grouped by day Mon–Sun in 3-up grids with empty-day
  placeholders. Each card: time range, name, coach, enrollment
  progress + spots, status badge.
- Each card links to /os/sessions/[id]/attendance.
- New /api/tribe-os/schedule?from=&to= endpoint joins sessions with
  creator name as coach_name.

**Revenue restyle (`62d982f`)**

- Page wrapper + all 6 subcomponents (SummaryCards, PaymentTable,
  PeriodSelector, EmptyState, ExportButton, RevenueChart) converted
  to light theme. Containers go from heavy box-shadow on dark to
  white + border-gray-200. Period selector pills become white with
  gray borders + lime when active.
- Note: the full mockup 5 redesign (Annual Revenue / Avg per Member
  / Outstanding Payments KPIs + Revenue-by-Type breakdown) is a
  follow-up — those require new DB shape for payment categorization.

**Light-theme sweep (`ae86d63`)**

- Batch conversion of dark-theme classes across 7 pages and 4
  components via a single sed pass per file. Pages: /os/clients/[id]
  detail (47 changes), edit, new, redirect; /os/coaches (25);
  /os/gym (17); /os/sessions/[id]/attendance (19). Components:
  ClientForm, InviteCoachForm, RecordAttendanceInline,
  RecordGroupAttendanceButton.
- OSShell sidebar kept dark on purpose. Components used outside
  /os/\* (TribeOSEntryCard, ReplayToursButton,
  SessionAttendanceSection, QuickGuide) stay dark to fit consumer-
  app surfaces.
- /os/clients root now redirects to /os/members.

**Pending follow-up after this redesign**

- Apply migration 074 to the live DB before /os/teams works
  end-to-end (it'll return 500 on the list_teams_for_gym RPC until
  then).
- Verónica's ES review of every new copy file shipped here.
- Calendar view variant for /os/schedule.
- Mockup-5 revenue KPIs (Annual / Avg per Member / Outstanding)
  - Revenue-by-Type breakdown — needs payment categorization DB
    changes.
- Teams detail page (/os/teams/[id]) with add/remove members.
- Programs, Messages, Intelligence — full implementations to
  replace the ComingSoonPage stubs.
- Quick Guides: their dark-theme styling is now inconsistent with
  the light OS surfaces; the Quick Guides shipped with light-theme
  variants in OS only (kept dark on consumer-app home).

## Mission L — Bulk attendance recording for group sessions

The single-client `RecordAttendanceInline` flow was great for one-
on-one training, but a group class with 10 attendees meant 60+
clicks. New page at `/os/sessions/[id]/attendance` collapses that
into a roster screen:

- Page loads the active client list + any existing attendance for
  the session in parallel. Each row pre-populates from prior data
  so re-opening is idempotent.
- Submit fires parallel POSTs to the existing single-client
  `/api/tribe-os/clients/[id]/attendance` endpoint. Same RLS, same
  Zod validation, no bespoke batch endpoint. Failed rows are
  marked individually so the user can retry without losing the
  successful writes.
- Entry point: new `RecordGroupAttendanceButton` on `/os/dashboard`
  next to the "Create paid session" CTA. Opens a modal listing the
  user's 10 most recent sessions; clicking one navigates to its
  bulk-attendance page. Sessions are lazy-loaded on first modal
  open so dashboard first paint isn't slowed.
- Three new analytics events:
  `tribe_os_bulk_attendance_picker_opened`,
  `tribe_os_bulk_attendance_viewed`,
  `tribe_os_bulk_attendance_saved`.

## Mission J — WhatsApp follow-up buttons

WhatsApp is the dominant comms channel for the Medellín market —
the primary way an instructor follows up with a client. Added
one-click affordances on the two surfaces with the highest follow-
up intent:

- **`/os/clients/[id]` contact section:** WhatsApp pill next to the
  phone number when present. Pre-fills a friendly check-in message
  keyed off the client's first name.
- **At-risk widget rows on `/os/dashboard`:** small WhatsApp icon
  button on each row (separate clickable from the row's link to
  the detail page). Pre-fills a gentle "haven't seen you lately"
  message. `phone` now flows through `AtRiskClient` → endpoint →
  widget.

New `lib/phone.ts` handles normalization for `wa.me/<digits>` with
a default country code of 57 (CO). Two new analytics events:
`tribe_os_whatsapp_clicked` carries a `surface` property so we can
compare engagement between the two entry points.

## Mission K — Persistent onboarding checklist on /os/dashboard

New subscribers got the one-time `TribeOSWelcomeGuide` modal but
nothing persistent to drive action. Three "0" stat cards + the
"add your first client" AtRisk CTA + "no activity yet" recent-
activity card together left the user to interpret what to do next.

`OnboardingChecklist` consolidates that into one clear card with
three concrete actions:

1. Add your first client
2. Record your first attendance
3. Invite a coach (optional)

Each item has its own data signal from
`/api/tribe-os/dashboard/onboarding-state` (parallel head-only
counts: non-archived clients, attendance rows, non-owner coaches).
The card auto-hides once all three are done, or when the user
dismisses it. Dismissal flag lives in `localStorage` so it doesn't
reappear on every visit. `ReplayToursButton` on `/settings` also
clears the dismissal flag so "see the intro again" brings back the
checklist along with the welcome guides.

## Mission I — Recent Activity widget + Tribe.OS hint on /create

Final autonomous-build sweep before re-syncing with Al:

- `RecentActivityWidget` mounts between the at-risk widget and the
  create-session CTA on `/os/dashboard`. Sister widget to AtRisk:
  positive signal (who showed + paid) vs negative (who haven't I
  seen). New endpoint `/api/tribe-os/dashboard/recent-activity`
  reads the last N attendance rows; RLS scopes to the caller's
  gym automatically.
- Small inline note on `/create` (inside the paid-session card)
  pointing instructors at Tribe.OS for ongoing client + revenue
  management. Closes a discoverability gap: instructors charging
  for one-off sessions through the main app are the most likely
  Tribe.OS converts.

## Deferred to Week 4+ (in LATER.md)

- Beta launch resumption (Week 4 Missions 2–6 from the original
  pre-integration plan): real $1 USD refund test, mobile device
  verification, outreach, onboarding 1–3 instructors, retrospective.
- Verónica review pass on the five Quick Guides + all
  `ES PENDING VERONICA REVIEW`-marked components.
- Ownership transfer flow (the only way to change a gym's
  `owner_user_id` today is direct SQL).

## Verification gates

- [x] tsc --noEmit clean after each commit
- [ ] Leak test run by the user produces **16 PASS / 0 FAIL / 4 WARN**
      (the 4 WARN entries are the documented payout/PII columns)
- [ ] Real-device verify on Vercel preview at HEAD includes:
  - `/os/dashboard` loads with the at-risk widget (now in the
    expected empty state since no clients exist yet) plus the new
    Coaches + Gym settings buttons
  - `/os/coaches` shows you as the gym owner
  - `/os/gym` shows the editable form; changing the gym name persists
    via the PATCH route
