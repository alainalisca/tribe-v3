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
