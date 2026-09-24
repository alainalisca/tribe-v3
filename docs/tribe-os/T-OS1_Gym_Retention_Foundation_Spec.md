# T-OS1: BullBox on Tribe.OS. Visits from Mira, and Retention on Real Data

**Ticket:** T-OS1 (revision 2, 2026-09-24. Revision 1 was written without repo access and proposed rebuilding things that already exist. Discard it.)
**Priority:** P1.
**Runs on:** `feat/t-os1-visits` cut from `tribe-os/main`. **T-OS0 must be complete first and its HARD LINE overrides this document.**
**Why:** Leo (BullBox Mde CrossFit) wants a tool to keep the members he already has. BullBox runs its members, bookings and check-ins in a third-party app called **Mira**. Tribe.OS already has members, churn scoring, insights, a weekly summary and WhatsApp deep links, but it only understands attendance at sessions hosted **in Tribe**. BullBox's classes do not run in Tribe. So today Tribe.OS would score every BullBox member as inactive. This ticket closes that gap without touching anything main uses.

---

## What already exists on main (reuse, do not rebuild)

Verified in the repo on 2026-09-24. Re-verify anything you depend on.

- **Tenancy:** `gyms`, `gym_coaches` (068/069), `lib/dal/gyms.ts`, `gymCoaches.ts`, coach invite/remove routes, `/os/gym`, `/os/coaches`. `requireTribeOSPremium()` returns `{ supabase, userId, gymId }`.
- **Members:** `clients` (062) plus `status` ('active','inactive','lead','lapsed'), `health_notes`, `last_seen_at` (072), churn and counter columns (075). `/os/members`, `/os/clients/[id]`. CSV import of members at `POST /api/tribe-os/clients/import` with `lib/csv/parseClientsCSV`, 500-row cap, audit-logged. Export and purge routes.
- **Attendance:** `client_attendance` (062) with `session_id NOT NULL` referencing `sessions`. Counter trigger (079) and nightly `reconcile-counters` cron.
- **Churn:** `lib/ai/churn-scoring.ts`, a weighted heuristic (no LLM) over `daysSinceLastAttendance`, `attendanceFrequencyDelta`, `streakBroken`, `communityGraphIsolation`, `paymentFailures`, `cancellationRate`, `communityEngagementDrop`. Signals from `lib/ai/data-access.ts` `fetchChurnSignals`. Results persisted onto `clients` by the nightly `tribe-os/intelligence` cron and the rescore routes.
- **Insights:** `community_insights` (075), template-based (`lib/ai/insight-templates.ts`), `/os/intelligence` with dismiss, feedback, and a `wa.me` deep link for single-member insights. Email digest via Resend (`lib/ai/digest-sender.ts`) gated by the gym's email toggle. Weekly summary cron.
- **Other:** teams (074), audit log and watchdog (082), training partners graph (075 to 077), revenue and unpaid, schedule, `agent_run_log`, `lib/ai/config.ts` (models, pricing, rate limits). No code calls the Anthropic API today.

---

## Step 0: Investigation (report only, then STOP)

Write `docs/T-OS1_INVESTIGATION.md` and paste it as plain text in chat.

1. **Database state, read-only.** Write a single SQL script containing only `SELECT` statements, show it to Al, and let **Al** run it in the Supabase SQL editor. It must answer:
   - Which Tribe.OS migrations (056 to 085, plus 153, 158, 166, 167) are recorded in `migrations_applied`, and whether their objects exist (`to_regclass`, `information_schema.columns`).
   - Does any `gyms` row exist for BullBox? Which gyms exist in total and who owns them (ids and slugs only, no emails)?
   - Which users have `tribe_os_status` set, and which gyms have it set (counts plus Al's own row)?
   - Row counts for `clients`, `client_attendance`, `community_insights`, `agent_run_log`.
   - Is there any column or table linking `gyms` to `featured_partners`?
2. **Code map.** For `fetchChurnSignals`, the counter trigger (079), the reconcile function, the intelligence cron and the weekly-summary cron: which tables and columns each reads and writes. This is the list of things the branch must never write (T-OS0 rule 3).
3. **Retention UX today.** Run the worktree locally, log in as Al against the test gym from T-OS0, seed it, and walk through `/os/dashboard`, `/os/members`, `/os/clients/[id]`, `/os/intelligence`. Screenshot each at 390px wide. List what a gym owner would use daily, what is empty or broken, and whether "contacted" is tracked anywhere after a WhatsApp tap.
4. **Import today.** What columns does `parseClientsCSV` accept? Does it upsert or only insert? What happens on a re-import of the same file?
5. **Sensitive data.** Where is `clients.health_notes` shown and exported? (Health data is _dato sensible_ under Ley 1581 and needs explicit consent. Report only.)

Al reviews the report, and Mira's real export files if Leo provides them, before Step 1.

---

## Step 1: A visits table for attendance that happens outside Tribe (Class A)

New table (name may follow conventions; report it):

**`client_visits`**

- `id uuid pk`, `gym_id uuid not null references gyms(id) on delete cascade`, `client_id uuid not null references clients(id) on delete cascade`
- `visited_at timestamptz not null`, `class_name text`, `coach_name text`
- `source text not null check (source in ('mira_csv','csv','manual'))`, `external_id text`
- `import_id uuid references client_imports(id)` (see Step 2)
- `created_at timestamptz not null default now()`
- `unique (gym_id, client_id, visited_at)` so re-imports are idempotent
- Index `(gym_id, client_id, visited_at desc)`
- RLS: select, insert, delete for `gym_coaches` members of `gym_id` or `is_app_admin()`. No anon.

**No trigger on `clients` and no writes to the existing counter columns** (T-OS0 rule 3). Main's reconcile cron would overwrite them nightly.

New view **`client_activity_v2`** (security invoker): one row per activity, the union of `client_attendance` where `attended = true` (source `'tribe_session'`) and `client_visits`. Everything new reads from this view.

## Step 2: Import members and visits from Mira (Class A)

- New table `client_imports`: `id`, `gym_id`, `kind` ('members' | 'visits'), `source`, `file_name`, `row_count`, `inserted`, `updated`, `skipped`, `errors jsonb`, `imported_by`, `created_at`. RLS by gym. (Create it before `client_visits` because of the foreign key.)
- New nullable columns on `clients` (Class A because `clients` is Tribe.OS-owned and main never writes them): `external_source text`, `external_id text`, `joined_on date`, `membership_plan text`, `plan_ends_on date`. Partial unique index on `(gym_id, external_source, external_id) where external_id is not null`.
- **Mapping, not hardcoding.** A column-mapping step: the owner picks which CSV column is name, email, phone, member id, status, joined date, plan, plan end, visit date and time, class. Mapping saved per gym in a new table `gym_import_mappings` (`gym_id`, `kind`, `mapping jsonb`). When Leo's real Mira export arrives, add a `mira` preset that pre-fills the mapping; until then build it generic.
- New routes `POST /api/tribe-os/import/members` (upsert by external id, else by exact email or phone within the gym, else insert) and `POST /api/tribe-os/import/visits` (resolves each row to a client by external id, email or phone; unresolved rows are reported, never guessed). Zod on every row, 500 rows per request, batched client-side, audit-logged through the existing `writeAuditEntry`.
- Dates parsed in `gyms.timezone`. Accept ISO and `DD/MM/YYYY`. An ambiguous date is an error row.
- New page `/os/import`: upload, map, preview 10 rows, confirm, result summary with downloadable error rows. Bilingual via `messages/{en,es}.json`.
- Do not modify the existing `/api/tribe-os/clients/import` route (main uses it).

## Step 3: Retention scoring that sees visits (Class A, no dual writers)

- New module `lib/tribe-os/retention/` that computes signals from `client_activity_v2`: `days_since_last_activity`, `visits_last_14d`, `visits_last_28d`, `baseline_weekly_rate` (the 8 weeks before the last 2), `trend_ratio`, `plan_ends_in_days`, `is_new` (joined within 30 days).
- Reuse `scoreMember` from `lib/ai/churn-scoring.ts` by passing it signals built from the view. Do not edit that file's weights on the branch; if new weights are needed, add a new config object.
- Every score comes with `reasons text[]` in plain Spanish and English, for example "14 días sin venir", "Viene 60% menos que su promedio", "Su plan vence en 5 días". The reasons are the product.
- Persist to a NEW table `client_retention_v2` (`client_id pk`, `gym_id`, `score`, `level`, `reasons`, `signals jsonb`, `computed_at`), never to `clients.churn_risk_*`.
- Compute on demand (a button, and after every import) because crons do not run on previews. Write the cron route too, but do not register it in `vercel.json` until the merge gate.
- Tests with the seeded test gym: steady, gradual fader, sudden stop, new member, sparse history, plan ending. Assert the exact level and reasons.

## Step 4: The owner's daily screen

Based on Step 0's UX findings, extend the existing surfaces rather than adding a parallel app. Default proposal, confirmed with Al after Step 0:

- `/os/members`: when the gym has `client_visits`, show level and reasons from `client_retention_v2`, sorted by risk.
- A "Habla con ellos hoy" block on `/os/dashboard`: high risk first, then new members under 30 days, then good news (milestones). One tap opens `wa.me` with an editable prefilled message. Reuse the existing wa.me helper.
- Record contact: new table `client_touches` (`gym_id`, `client_id`, `channel`, `note`, `ai_assisted boolean default false`, `created_by`, `created_at`). The list shows "contactado hace 2 días" and does not chase the same person twice. T-OS2 measures itself against this table.
- These edits change existing page files on the branch. That is allowed (branch code); they reach users only at the merge gate.

## Success criteria

1. Test gym: a 150-member file and a 6-month visits file import in under a minute; re-import reports 0 inserted, 0 duplicates.
2. The fader and sudden-stop fixtures are high risk with correct reasons; the steady member is not.
3. Main's nightly crons, run against the test gym, leave `client_retention_v2` untouched, and the branch never changes `clients.churn_risk_*` (prove with a before and after query).
4. Probes (anon, gym member, non-member named by Al) on every new table and route; results in the PR.
5. `os:guard` green; every 9000+ migration marked Class A; `tsc`, lint, tests green; strings in both locales.
6. PR into `tribe-os/main` (never `main`) with 390px screenshots.

## Cost implications

None. No AI calls, no new services. Visits for a 200-member gym add about 40,000 rows a year, which is small.

## Out of scope

AI drafting (T-OS2). A live Mira API integration (only if Mira offers one; separate ticket). Any change to consumer tables, main's crons, or the behavior of main's existing Tribe.OS routes.
