# Things that need a human (you)

Running list of items the autonomous build can't finish on its own.
Grows as I keep working. Sorted by urgency — top items block the
biggest unknowns.

## ✅ Migration 082 (gym_audit_log) — RUN

Append-only forensic log table is live. First row will appear the next
time a client is archived or purged from `/os/clients/[id]`.

Inspect with:

```sql
SELECT created_at, action, target_id, payload, actor_user_id
FROM public.gym_audit_log
ORDER BY created_at DESC
LIMIT 5;
```

## ✅ Migration 083 (client_attendance refund columns) — RUN

Refund flow is live. First refund row appears the next time a coach
records one from `/os/clients/[id]` (edit attendance → Refund button).

Inspect with:

```sql
SELECT id, client_id, refunded_amount_cents, currency, refund_reason, refunded_at
FROM client_attendance
WHERE refunded_amount_cents IS NOT NULL
ORDER BY refunded_at DESC
LIMIT 5;
```

**Known follow-up**: the revenue dashboard (`gym_revenue_totals` from
migration 071) only reads from `payments` (Stripe), not from
`client_attendance`. So today's refunds recorded against manual
attendance show up in the audit log + on `/os/clients/[id]` but
don't yet subtract from revenue totals. A future migration could
union the manual-attendance refunds into the gym revenue SQL — flagged
for whoever picks up the revenue dashboard next.

## ⚠️ When you're ready to fire the weekly summary manually

The Vercel **Cron Jobs UI** only shows production crons, and Tribe.OS
crons live on `feature/tribe-os` (preview), not `main` (production).
You can't click "Run" from the UI yet.

To fire it via curl:

1. Vercel → **Settings → Environment Variables** → reveal `CRON_SECRET`
2. Paste the secret in place of `PASTE_SECRET_HERE` below
3. Run:

```bash
curl -H "Authorization: Bearer PASTE_SECRET_HERE" https://tribe-v3-git-feature-tribe-os-alain-aliscas-projects.vercel.app/api/cron/tribe-os/weekly-summary
```

You'll get JSON back. Then check your inbox.

## ⚠️ Cron jobs aren't scheduled until merge to main

Vercel reads the cron schedule **only from the production deployment**.
Your production branch is `main`; all Tribe.OS work lives on
`feature/tribe-os` (preview deployment). Vercel **Settings → Cron Jobs**
shows the crons from production, so any `/api/cron/tribe-os/*` you
see is whatever was in `vercel.json` when `main` was last deployed.

What this means:

- The nightly intelligence engine (`/api/cron/tribe-os/intelligence`,
  schedule `0 7 * * *`) is **NOT** firing automatically. It only runs
  when you click "Run intelligence engine" on `/os/intelligence`.
- The Monday weekly summary (`/api/cron/tribe-os/weekly-summary`,
  schedule `0 8 * * 1`) is **NOT** firing automatically.
- The 6-hourly audit watchdog (`/api/cron/tribe-os/audit-watchdog`,
  every 6 hours) is **NOT** firing automatically.
- All three routes work end-to-end when called manually (curl with
  the CRON_SECRET to the preview URL).

To activate scheduled firing: merge `feature/tribe-os` → `main`. Per
your branch-strategy note this should wait until testing is complete.

## 🚨 Before the next ship-or-test session

### Vercel env vars to set

Required for full functionality on the preview deployment:

- `RESEND_API_KEY` — already set in prod, confirm preview has it too. Without
  this the intelligence digest email silently no-ops.
- `NEXT_PUBLIC_SITE_URL` — used to build absolute deep-links in outgoing
  emails. Should be the canonical URL of your deployment (e.g.
  `https://tribe-v3.vercel.app` or the custom domain when it lands).
  Falls back to `tribe-v3.vercel.app` if unset — fine for now.
- `CRON_SECRET` — already set, used by `/api/cron/tribe-os/intelligence`.
- `SUPABASE_SERVICE_ROLE_KEY` — already set, used by the digest sender +
  the seed endpoint.

For dev / staging testing:

- `ALLOW_SAMPLE_DATA_SEED=true`
- `NEXT_PUBLIC_ALLOW_SAMPLE_DATA_SEED=true`

Both gates must be set for the seed button to render + work. Production
deployments leave both unset.

### Run a real end-to-end test

Best done in one focused 60-minute session:

1. **Seed sample data**: set the two env vars above → redeploy → go to
   `/os/gym` → click "Seed sample data" → confirm.
2. **Verify the dashboard lights up**: KPIs populate, AT-risk widget shows
   Carlos / Sebastián / Luisa, recent activity feed has check-ins.
3. **Run intelligence engine**: `/os/intelligence` → click "Run
   intelligence engine" → confirm all 4 insight types fire
   (CHURN_RISK, RETENTION_OPP, REVENUE, GROWTH).
4. **Confirm the digest email arrived** in your inbox (sent from
   `tribe@aplusfitnessllc.com`). Check Resend dashboard for the send
   record if it doesn't show up.
5. **Test the bilingual templates**: flip language to ES on /os/intelligence
   → insight headlines should re-render in Spanish.
6. **Test CSV export**: `/os/members` → "Export CSV" → open in Excel,
   confirm columns match the importer.
7. **Test CSV import**: edit the exported file, add one row, re-import
   on /os/members → confirm new row appears + dupes go through (current
   implementation has no dedup).
8. **Test `/my-coach`**: temporarily change one of the seeded clients'
   email via SQL editor to match your auth user's email:
   ```sql
   UPDATE clients SET email = '<your-auth-email>'
   WHERE email = 'ana.garcia@sample.tribe.local';
   ```
   Then go to `/my-coach` and confirm the page renders with Ana's data.
9. **Test the home-page Tribe.OS shortcut**: home page header should show
   the briefcase button (only when you're premium).
10. **Test the back-to-Tribe shortcut**: inside `/os/dashboard`, the home
    icon in the top bar should jump you back to `/`.

### Cleanup after testing

```sql
-- Drops every sample-data row + cascades to attendance + partners
DELETE FROM clients WHERE 'sample-data' = ANY(tags);
-- Drops the seeded sessions
DELETE FROM sessions WHERE description = 'Sample data — generated for demo purposes.';
-- Drops any community_insights that referenced sample clients (defensive)
DELETE FROM community_insights WHERE gym_id NOT IN (SELECT id FROM gyms);
```

## 📝 Spanish copy review (Verónica)

Multiple files carry `// ES PENDING VERONICA REVIEW` markers. As of
the latest build, these need her eyes:

- `lib/email/intelligenceDigest.ts` — digest email subject + body
- `components/tribe-os/InsightsBanner.tsx` — dashboard nudge banner
- `components/tribe-os/TrainingPartnersSection.tsx` — member detail
- `components/tribe-os/ReachOutToTeamModal.tsx` — bulk-message modal
- `components/tribe-os/ImportClientsModal.tsx` — CSV import dialog
- `components/tribe-os/MyCoachEntryCard.tsx` — profile entry point
- `components/tribe-os/SampleDataSeedButton.tsx` — dev tools button
- `app/os/teams/page.tsx`, `app/os/teams/[id]/page.tsx` — team surfaces
- `app/os/intelligence/page.tsx` — insight type labels + empty states
- `app/my-coach/page.tsx` — member training dashboard
- `app/os/members/page.tsx` — Import / Export CSV labels
- `app/os/revenue/_components/AttendanceExportButton.tsx`
- `lib/ai/insight-templates.ts` — all four insight-type bodies + signals

Anything labeled "Auto-translation" or "ES PENDING VERONICA REVIEW" in
a copy bag should be replaced with native-quality Spanish.

## 🧪 Real-device validation

Things only verifiable on a physical phone:

- **iOS Safari notification permission** — confirm the in-app prompt
  (`NotificationPrompt`) is the only path that asks, never the auto-fire.
- **Android Chrome location permission** — same: only `requestUserLocation`
  paths should prompt.
- **PWA install prompt** flow.
- **Service worker** persistence across app restarts.
- **WhatsApp deep-links** from /os/clients/[id] + /os/intelligence — confirm
  they open the WhatsApp app on mobile (not just wa.me web).
- **CSV download** on iOS Safari (may surface as a share sheet instead of
  a direct save — that's iOS being iOS, not a bug).

## 🌐 Custom domain swap (pending)

Per the memory note: `tribe-v3.vercel.app` is the staging URL; a custom
domain will land. When it does:

- Update `NEXT_PUBLIC_SITE_URL` env var in Vercel
- Update Stripe webhook endpoints if the URL changed
- Update Stripe Connect return URLs
- Update Resend sender domain verification if relevant
- Update the App Store / Play Store listings if those carry the URL
- Update `lib/email/tribeOsWaitlist.ts` `APP_STORE_URL` / `GOOGLE_PLAY_URL`
  if they were placeholder
- Audit hardcoded `tribe-v3.vercel.app` strings — `grep -r tribe-v3.vercel.app`
  to catch any I missed

## 💳 Stripe Connect onboarding polish

The connect-bank-account flow exists but I haven't manually walked it on
a fresh account. Things to verify when you can:

- Brand-new gym owner → Settings → "Connect bank account" → completes
  Stripe Express onboarding without dead ends
- Webhook updates on capability-changed events
- The `payments` table actually accumulates rows when a session payment
  succeeds end-to-end
- The revenue CSV export gets non-empty rows after at least one real
  payment

## 🧪 Pre-existing test failure (not from this session)

`lib/dal/connections.test.ts` → `sendConnectionRequest > rejects when
either user has blocked the other` is failing. This is in the
athlete-to-athlete connections DAL (consumer Tribe app), NOT
Tribe.OS code. It was failing before this session's work and is
unrelated to anything we built — but worth noting for whoever ends
up running the full suite. Skim once if you have time, otherwise
ignore until the consumer-side surfaces are next on the roadmap.

## 🧹 Code/data items I noticed but didn't act on

- `lib/dal/clients.ts` is now over 900 lines (DAL pattern). Splitting
  into `clients-crud.ts`, `clients-csv.ts`, `clients-attendance.ts`
  would help maintainability but isn't urgent.
- `community_insights.confidence_score` is hardcoded per generator
  (0.7 for CHURN_RISK, 0.6 for RETENTION_OPP, etc.). Could be tuned
  based on real false-positive rates once you have data.
- The OnboardingChecklist's third step ("Invite a coach") links to
  `/os/coaches` — I haven't walked that flow end-to-end.
- No automated tests for the new code. The repo has Jest infrastructure
  (saw `*.test.tsx` files for FilterBar) — could add unit tests for the
  CSV parser, insight templates renderer, scoring math.

## 🛠 Features deferred to next autonomous round

Ranked by my read on impact (✅ = shipped since this doc was created):

1.  ✅ **Coach-added-you welcome email** — shipped. When a coach creates a
    client whose email matches a Tribe user, they get a bilingual email
    pointing at /my-coach. Skips bulk imports (no spam).
2.  ✅ **Bulk dismiss on /os/intelligence** — shipped. "Dismiss all" per
    severity section (CRITICAL excluded for safety).
3.  ✅ **Sample data cleanup button** — shipped. Pair to the seed button
    on /os/gym → drops every sample-tagged row in one click.
4.  ✅ **Per-team insights filter** — shipped. Selector on /os/intelligence
    when the gym has 2+ teams. Server-side filter via team_id param;
    gym-level insights drop when scoped to a team.
5.  ✅ **Insight feedback** — shipped. 👍 Helpful / 👎 Not useful chips
    on each insight card. Stored in `data_payload.feedback` (no
    migration needed); both signals also dismiss the card. The data
    is collected; **TODO for you**: review the rate of "Not useful"
    per insight type after some real-world use → tune the generator
    heuristics (threshold for AT_RISK, REVENUE unpaid count, etc.).
6.  ✅ **Per-client insight history** — shipped. New section on
    /os/clients/[id] showing every insight that ever referenced this
    member with status (Active / Dismissed / Expired) + feedback
    chips when applicable. Helps coaches spot patterns over time
    ("AI has flagged Carlos 4 times in the last 30 days → maybe call,
    not message").
7.  ✅ **Edit + delete attendance** — shipped. Coaches can fix mistakes
    (wrong attended, wrong amount, refund flips paid → false, wrong
    client) without dropping into SQL. Pencil icon on each attendance
    row opens an inline form. The 079 counter trigger re-fires on
    UPDATE OF attended/attended_at + DELETE so cached counters stay
    accurate.
8.  ✅ **Tag filter on /os/members** — shipped. Dropdown next to
    status pills, composes with the status filter ("at-risk VIPs").
9.  ✅ **Unit tests for core lib** — shipped. 48 tests covering
    CSV parser, CSV serializer, i18n templates renderer, and the
    health classifier. Run via `npm test`.
10. ✅ **Stripe Connect banner on /os/revenue** — shipped. When the
    gym owner hasn't finished Stripe Connect onboarding, a nudge
    banner explains why revenue is at zero + links to the existing
    /earnings/payout-settings flow. Hides itself when complete.
11. ✅ **Streak milestone chip** — shipped. 🔥 7/14/30/100-day chip
    on `/os/clients/[id]` and `/my-coach`. Coach sees it → cue to
    acknowledge; member sees their own → pride / motivation.
    Persistent (not toast) so it survives missed days and visits.
12. ✅ **Attendance heatmap** — shipped. Last 90 days of attendance
    as a 13×7 grid on /os/clients/[id]. Lime cells = paid sessions,
    light green = attended (unpaid), gray = no record. Hides itself
    when there's nothing in the window.
13. ✅ **Insight template contract tests** — shipped. 37 new tests
    that fail if anyone adds a template key without both en + es
    translations, or if the rendered output has unresolved
    `{placeholders}`. Catches bilingual drift before production.

    Test totals: 85 passing across 5 files. Run with `npm test`.

14. ✅ **Insight type filter on /os/intelligence** — shipped. Type
    dropdown next to the existing team filter. Always available
    (4 types is small enough to never warrant hiding). Client-side
    filter — no refetch when swapping. Composes with team filter
    so a coach can ask "show me only churn-risk in team X."

15. ✅ **Weekly summary email** — shipped. New cron at `0 8 * * 1`
    (Monday 8am UTC) sends a bilingual recap to each premium gym
    owner with last week's stats: sessions recorded, unique
    attenders, revenue, top attender, at-risk count, active alerts.
    Shares the existing intelligence_email_enabled opt-out flag —
    one toggle for all proactive email.

    **Reminder for you**: this fires AUTOMATICALLY on the next
    Monday at 8am UTC after the deploy lands. If you want to test
    sooner, run the cron manually:

    ```
    curl -H "Authorization: Bearer $CRON_SECRET" \
      https://tribe-v3.vercel.app/api/cron/tribe-os/weekly-summary
    ```

    (Replace the URL with your actual deployment.)

16. ✅ **Member self check-in on /my-coach** — shipped. New "Today's
    sessions" card on /my-coach lists every session the gym owner
    created for today (in the gym's timezone) with an "I'm here"
    button per row. Tap once → optimistic flip to a "Checked in"
    pill, then `POST /api/me/check-in` writes the attendance row
    with `attended=true, paid=false`. Idempotent (a second tap is a
    no-op), today-only (yesterday/tomorrow sessions can't be
    self-marked), and identity-gated (email must match
    `clients.email`). Coach can edit/delete the row from the existing
    attendance flow if a member checks in by accident. Three new
    analytics events: `tribe_member_self_check_in_clicked`,
    `tribe_member_self_check_in_succeeded`,
    `tribe_member_self_check_in_failed`.

    **What this buys you**:
    - Takes attendance-marking off the coach at the start of class
      (was a real pain point at peak times — coach holding phone,
      members lined up).
    - Gives members a small "I'm tracked" moment that reinforces
      /my-coach as a daily-open surface (stickiness).
    - Streak counters update immediately via the 079 trigger.

17. ✅ **Audit log viewer** — shipped. New page at `/os/audit` renders
    the `gym_audit_log` table as a filterable list (action, target
    type, last 25/50/100). Linked from `/os/gym` near the bottom as
    a low-emphasis "View forensic log" entry. Both mobile and desktop
    layouts. Access mirrors migration 082's RLS: any coach in the gym
    can read, none can mutate. Today the log only contains client
    archive + purge entries; future destructive actions will start
    showing up here automatically as their DAL paths call
    `writeAuditEntry`.

    **What this buys you**: real visibility into what happened in a
    multi-coach gym. Before this, the audit table existed but nobody
    could see it without SQL. Now coaches can answer "who archived
    that member last week?" in five seconds.

18. ✅ **Audit log expansion: 3 new action types** — shipped. Three
    new destructive actions now write to `gym_audit_log`: - `attendance.delete` — payload captures `{ client_id,
session_id, attended, paid, amount_paid_cents, currency }` so
    a deleted paid attendance leaves a money-traceable record. - `gym.settings_update` — payload captures a per-field diff
    (`{ changes: { timezone: { from: 'America/Bogota', to: 'UTC' } } }`).
    Only fires when something actually changed; no-op PATCHes
    skip the log. Captures intelligence_email_enabled flips too. - `insight.bulk_dismiss` — payload captures `{ dismissed: <count>,
filter: { severity, type, ids } }`. Single-card dismissals are
    not audited (low impact); only bulk action is sensitive enough
    to log in a multi-coach gym.

                                                All three now render with friendly labels in the /os/audit
                                                viewer (English + Spanish). The pattern is reusable — adding
                                                new audit event types just means calling `writeAuditEntry` from
                                                the relevant route and adding a label entry.

19. ✅ **Member-side data export (GDPR right-to-access)** — shipped.
    The complement to the GDPR purge: a member can now download a
    full JSON of everything Tribe.OS holds on them via a "Download
    my training data" button at the bottom of `/my-coach`. The export
    covers every gym they belong to: identity (name + status),
    cached counters, full attendance history (uncapped — exports
    are meant to be complete), and full partner list.

    Endpoint: `GET /api/me/training/export` returns the JSON with
    `Content-Disposition: attachment` so it saves rather than
    renders. The client-side button uses a blob → object-URL flow
    so the download works on iOS Safari (which sometimes routes
    direct-link downloads to the share sheet). Three new analytics
    events: `tribe_member_data_export_{clicked,succeeded,failed}`.

    **What this buys you**: lets you tell members "you own your data
    and can take it with you anytime" without it being aspirational
    marketing copy. Real privacy/trust signal — important for
    LATAM/EU members where data-portability is increasingly expected.

20. ✅ **"Money owed to you" collection surface** — shipped. New page
    at `/os/revenue/unpaid` lists every client with at least one
    attended-but-not-paid session in the last 30/60/90 days (default
    60). Grouped by client, sorted by most-recent unpaid first. Each
    row gets a one-tap WhatsApp deep link with a bilingual
    payment-reminder message pre-filled — "Hi Carlos, hope you're
    doing well! Just a friendly reminder about 3 training sessions
    since Apr 12 that we still need to settle up…"

    Linked from `/os/revenue` next to the export buttons as
    "Money owed" / "Lo que te deben". Two new analytics events:
    `tribe_os_unpaid_attendance_viewed` and
    `tribe_os_unpaid_whatsapp_clicked`.

    **Design decisions worth knowing**:
    - No dollar amount shown — the schema only stores
      `amount_paid_cents` (NULL when unpaid), so we don't know what
      the coach normally charges per session. The message tells the
      member to settle up but lets the coach quote the exact figure
      in the thread.
    - No bulk send — firing the same WhatsApp to 30 people at once
      is the kind of action that benefits from per-row review.
    - Archived clients are excluded — they're usually not actionable.
    - 60-day default window keeps the surface focused on actionable
      debt vs. write-offs.

21. ✅ **Streak banner on /my-coach (at-risk + milestone)** — shipped.
    Two-state banner that surfaces on `/my-coach` between the hero
    and today's sessions:
    - **At-risk** (loss aversion): `current_streak >= 3` AND member
      hasn't trained today (gym-local time) → "Your 14-day streak is
      at risk — show up today to keep it alive." Variant copy when
      no sessions are on the schedule today (routes to coach).
    - **Milestone** (dopamine): `trained_today` AND current_streak
      exactly equals 7 / 14 / 30 / 100 → "30-day streak unlocked.
      Thirty days. Whatever you trained for, you can feel the
      difference now." Persistent streak chip on the stats grid
      keeps the achievement visible after the celebration day.

    DAL: new `trained_today: boolean` field on `MyTrainingRecord`,
    computed server-side using gym timezone. Belt-and-suspenders:
    also counts `today_sessions[].already_checked_in === true` as
    "trained today" so freshly-checked-in members never see the
    at-risk warning by accident. Two new analytics events:
    `tribe_member_streak_at_risk_shown` and
    `tribe_member_streak_milestone_shown` (fired once per render
    when each state is visible).

    **What this buys you**: the highest-leverage stickiness pattern
    in consumer fitness — Duolingo, Strava, Fitbit all run on
    streak-loss-aversion + milestone-celebration. Tribe.OS now does
    too, without push notifications, without a cron, just visual
    state on a page they already visit.

22. ✅ **"Celebrate these wins" dashboard widget** — shipped. New
    widget on `/os/dashboard` lists clients currently on an active
    streak of 7+ days (with a stale-streak guard requiring
    `last_seen_at` within the last 7 days too). Sorted by
    `current_streak_days` DESC so a 47-day streak surfaces before a
    7-day one. Per-row WhatsApp deep link with a bilingual congrats
    template: "Hey Carlos! Just saw you're on a 30-day streak —
    that's not easy. Proud of you. Keep it going 🔥"

    The widget **self-hides** when no members qualify — unlike the
    at-risk widget (where "no one is at risk" is a meaningful
    affirmation), an empty celebrate-wins state would just be
    dashboard noise. Sits between the at-risk+upcoming grid and the
    activity feed so it's visible without dominating the page.

    DAL: new `listActiveStreakers(supabase, context, opts)` with
    configurable `minStreakDays` / `staleAfterDays` / `limit`.
    Three new analytics events:
    `tribe_os_celebrate_wins_viewed`,
    `tribe_os_celebrate_row_clicked`,
    `tribe_os_celebrate_whatsapp_clicked`.

    **What this buys you**: closes the coach side of the streak
    loop. Member sees their milestone on /my-coach; coach sees the
    same milestone surface up on their dashboard with a one-tap
    way to acknowledge it. That two-sided recognition is what
    turns a "tracking app" into "the gym that cares."

23. ✅ **Last-7-days vs prior-7-days momentum card** — shipped. New
    full-width card on /my-coach sitting between today's sessions
    and the stats grid. Shows "3 sessions" in big type with a
    delta line: "+1 vs the week before" / "1 less than the week
    before" / "Same as the week before" / "Your first week
    tracked here." Self-hides for first-time members with zero
    attendance in both windows.

    Rolling 7-day windows (now → 7d ago vs 7d ago → 14d ago)
    instead of calendar weeks. Two reasons: members care about
    momentum, not which Monday is which; and a rolling window
    sidesteps gym-timezone edge cases at week boundaries. The DAL
    issues two `count: 'exact', head: true` queries so the
    payload stays tiny.

    **What this buys you**: a daily-relevant view of "am I keeping
    pace?" without the weight of a calendar-week comparison.
    Pairs with the streak banner and stats grid to give members
    three different time scales (today / week / lifetime) of their
    own training. Visible immediately on /my-coach; no migration,
    no cron.

24. ✅ **Refund flow with proper tracking** — shipped. Coaches can
    now record a refund against any previously-paid attendance row
    from `/os/clients/[id]`. Workflow: click pencil to edit a row,
    then a "Refund" button appears in the form footer (only when
    `paid=true` AND not already refunded). Opens an inline panel
    asking for refund amount (pre-filled to the full paid amount)
    and a free-text reason (1–500 chars, required). On submit, the
    row gets `refunded_amount_cents` / `refunded_at` /
    `refund_reason` populated and the audit log gets an
    `attendance.refund` entry with all the money-relevant fields
    in the payload.

        The row in the attendance list then shows a yellow "Refunded
        $30.00 USD · Reason: Member rescheduled, no charge agreed"
        badge underneath the notes, so the history is self-explanatory.
        The original `paid=true` + `amount_paid_cents` stays intact —
        we never lose the fact that money changed hands; we add the
        fact that some of it came back.

        New endpoint: `POST /api/tribe-os/attendance/[id]/refund`.
        HTTP status mapping: 404 not_found / 409 already_refunded /
        409 not_paid / 400 amount_invalid / 400 reason_invalid /
        500 db_error. The `attendance.refund` action label renders
        in `/os/audit` with `Attendance refunded` / `Asistencia

    reembolsada`.

        **Requires migration 083 to be run** before the UI works
        (otherwise the POST will fail at the CHECK constraint or
        column-missing level). Migration is short, idempotent, and
        safe — see the "Migration 083" section at the top of this file.

        **Known limitation**: the revenue dashboard reads from the
        `payments` table only, so refunds against manual attendance
        are not yet subtracted from revenue totals. The data is there
        in `client_attendance`; a future migration could union it
        into `gym_revenue_totals`. Doesn't block this feature being
        useful — the audit + per-row badge already give coaches what
        they need for accounting reconciliation.

25. ✅ **Suggested pricing on /os/revenue/unpaid** — shipped. The
    money-owed surface now infers each gym's "typical session
    price" per currency from its own paid attendance history (last
    180 days, lower-middle median, minimum 3-row sample to dodge
    noise). Two new pieces:
    - A "Typical session: $20 USD" chip above the list, one per
      currency that has enough data
    - The per-row WhatsApp template auto-quotes a concrete total
      ("that comes to about $60 USD" instead of vague "let's
      settle up"), multiplying suggested unit × unpaid_count

    Coach edits before sending if the rate is different for this
    member. Sample-size floor + lower-middle median (vs averaged
    median) means the figure shown is always a real paid session
    from the gym's history, not an interpolation.

    **What this buys you**: closes the gap I deliberately left in
    the v1 money-owed page. Coaches no longer have to mentally
    compute the total before tapping WhatsApp; the reminder
    arrives at the member's phone with a concrete number to act on.

26. ✅ **Vitest coverage for the new DAL functions** — shipped. 48
    new tests across 3 files hardening the money-touching and
    identity-gating paths added this session:
    - `lib/dal/clients.refund.test.ts` — 18 tests covering every
      `RefundAttendanceError` discriminator + happy path
    - `lib/dal/memberSelf.checkIn.test.ts` — 16 tests covering
      `SelfCheckInError` paths: identity mismatch, archived member,
      wrong gym, wrong day, idempotency on existing rows,
      service-role-missing
    - `lib/dal/clients.unpaid.test.ts` — 14 tests covering
      grouping logic (count, date bounds, archived exclusion,
      sort order), median computation (3-row sample-size floor,
      lower-middle index, USD/COP independence), and graceful
      degradation when the pricing query fails

    All 48 pass. Full suite still has 12 pre-existing failures in
    `SessionCard.test.tsx`, `FilterBar.test.tsx`, and
    `connections.test.ts` (unrelated to this session's code).

    **What this buys you**: a regression in refund or self-check-in
    logic now surfaces in CI before it ships. The money paths in
    particular (refund amount bounds, currency carry-over,
    already-refunded guard) are now contract-tested, so the
    migration 083 CHECK constraint can't get bypassed by a future
    DAL change without a test failing first.

27. ✅ **"Sign up for Tribe" invite email** — shipped. The
    `notifyClientAdded` bridge now fires on BOTH paths after a coach
    creates a client row:
    - Email matches a Tribe user → existing welcome email, points
      at `/my-coach` ("your data is here")
    - Email does NOT match a Tribe user → new invite email, points
      at `/auth` ("sign up with this exact email so your data
      appears automatically")

    The invite is bilingual and uses the **coach's** preferred_language
    as the fallback (vs the recipient's, which doesn't exist yet for
    a non-user). That mirrors however the coach is already
    communicating with this person offline.

    Framing is explicit about why it isn't cold outreach: "Your coach
    added you using this email" + a soft closing ("if you didn't
    expect this, you can safely ignore — it just means someone at
    [Gym] typed your email by mistake"). Bulk CSV import still
    suppresses both emails so a 200-row roster migration stays quiet.

    Return shape extended: notifyClientAdded now also returns
    `kind: 'welcome' | 'invite'` when a send happened, so analytics
    can split adoption by path. The `skipped_reason: 'not_tribe_user'`
    value was retired — that path is now a successful invite send,
    not a skip.

    New file: `lib/email/signUpInvite.ts`. No new env vars; reuses
    `RESEND_API_KEY` + `NEXT_PUBLIC_SITE_URL`.

    **What this buys you**: a proper acquisition funnel into Tribe.
    A coach adding a member who isn't on Tribe used to be a dead
    end (silent skip). Now the recipient gets a clean invite with
    explicit instructions to sign up with the matching email —
    after which their training data appears automatically without
    the coach having to do anything else.

28. ✅ **Audit watchdog cron + bilingual owner alert email** —
    shipped. Every 6 hours `/api/cron/tribe-os/audit-watchdog`
    scans `gym_audit_log` for destructive-action clusters across
    every premium-active gym and emails the gym owner when
    thresholds trip.

    Threshold rules (`lib/dal/auditWatchdog.ts`, tuned conservatively):
    - 5+ `client.archive` by one coach in 24h
    - 10+ `attendance.delete` by one coach in 24h
    - 3+ `attendance.refund` by one coach in 24h
    - ANY `client.purge` in 24h (owner-only by RLS, so this is
      essentially a "did I really do that?" self-receipt)

    Per-actor counting unless the rule sets `alertOnAny: true`.
    Suppression: when an alert fires, the watchdog writes a
    `gym.alert_sent` audit row with the trigger key in the
    payload. The next run skips that key if there's a matching
    suppression row in the last 24h, so the owner never gets
    spammed every 6h about the same incident.

    Email framing is deliberately non-alarmist: most legitimate
    clusters (a coach pruning the roster before a new season)
    trip these the same way hostile bursts would. The body says
    "we noticed this — take a look" with a deep-link to
    `/os/audit` so the owner can see the events themselves.
    Body lists each triggered alert with actor display name (or
    "—" for any-actor rules), event count, window, and time range.

    Cron is registered in `vercel.json` as
    `/api/cron/tribe-os/audit-watchdog` on a 6-hour cadence.
    **Doesn't fire until merge to main** (same caveat as the
    other tribe-os crons — see the section above). Manually
    testable via curl:

    ```
    curl -H "Authorization: Bearer $CRON_SECRET" https://tribe-v3-git-feature-tribe-os-alain-aliscas-projects.vercel.app/api/cron/tribe-os/audit-watchdog
    ```

    **What this buys you**: closes the safety loop on the audit
    log infrastructure. Migration 082 captured what happens;
    migration 083 added more events to capture; the viewer
    surfaced everything for ad-hoc review; this watchdog now
    pulls the most-likely-hostile patterns out automatically
    so a multi-coach gym doesn't have to manually scan
    `/os/audit` to catch problems.

29. ✅ **Watchdog test coverage** — shipped. 21 tests across
    `lib/dal/auditWatchdog.test.ts` covering the four classes of
    behavior that matter for the audit watchdog:
    - **Threshold math** — under/at/over for each rule, with the
      exact constants from `AUDIT_THRESHOLDS` baked into the
      assertions so a future threshold change forces a deliberate
      test update.
    - **Per-actor independence** — two actors splitting a count
      under threshold doesn't alert; both crossing produces two
      separate alerts; null `actor_user_id` is its own bucket.
    - **alertOnAny rules** — `client.purge` pools all actors into
      one bucket, emits `trigger_key: 'client.purge:any'`, and
      counts across the pool.
    - **Suppression** — matching trigger_key in a recent
      `gym.alert_sent` row blocks the alert; mismatched trigger
      keys, missing payload fields, and malformed payloads all
      fail open (alert still fires).

    Plus combined-scenario tests (multiple rule types tripping in
    one run produce the right number of alerts) and shape stability
    tests (every alert has trigger_key + count + window_hours +
    earliest_at + latest_at).

    Total new DAL tests this session: 69 across 4 files
    (refund 18 + check-in 16 + unpaid 14 + watchdog 21). All
    passing. Full suite's pre-existing 12 failures in
    SessionCard / FilterBar / connections remain (unrelated).

    **What this buys you**: a regression in the suppression logic
    (the most failure-prone part — silently re-spamming owners
    every 6h would erode trust fast) now fails a test. Same for
    threshold-off-by-one mistakes and accidental loss of
    per-actor counting if someone refactors the grouping.

30. **Stripe Connect rough-edge polish** — but this is hard to do
    without an actual test account, so probably better as a human task.
31. **Per-attendance trigger optimization** — migration 079 recomputes
    counters from scratch on every write. Could switch to delta updates
    if perf ever becomes a concern at scale (>10k clients).
32. **Generator feedback loop** — use the feedback data from #5 to:
    - Raise CHURN_RISK threshold from 0.6 → 0.7 if false-positive rate
      > 30% on CHURN_RISK cards
    - Increase REVENUE unpaid-count threshold from 3 → 4 if false-positive
      rate dominates on REVENUE cards
    - Skip re-emitting same-member insight types that were marked
      'false_positive' within the last 60 days (currently 14)
      Needs ~50+ real feedback signals before tuning is meaningful.

I'll keep building down this list and updating this file as new items
surface.
