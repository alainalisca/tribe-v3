# Week 2 Missions — Multi-Coach Activation + Member Roster Enrichment

Goal: the gym-tenant scaffolding from Week 1 is no longer dormant.
Existing pages query through `gymId` (no legacy fallback hit).
Non-owner coaches can read gym revenue. Clients have richer status
fields and an "at-risk" widget surfaces lapsed members on the dashboard.

Branch: `feature/tribe-os`. No merge to main until the integration is
complete and Al gives explicit ask.

## Mission status

| #   | Mission                                                                          | Status         | Commit                            |
| --- | -------------------------------------------------------------------------------- | -------------- | --------------------------------- |
| 1   | Wire `/os/clients` + `/os/revenue` routes to use `gymId`                         | ✅ done        | `ecf9c91`                         |
| 2   | Multi-coach revenue SQL functions (`gym_revenue_totals` / `gym_revenue_buckets`) | ✅ done        | `ccd48ff` (migration 071 applied) |
| 3   | Member roster enrichment migration (`status`, `health_notes`, `last_seen_at`)    | ✅ done        | `e0bcd50` (migration 072 applied) |
| 4   | Member profile UI updates (list badges, detail, edit, new)                       | ✅ done        | `bd9caad`                         |
| 5   | At-risk clients widget on `/os/dashboard`                                        | ✅ done        | `a7cd6a3`                         |
| 6   | Real-device verify + leak test + this tracking doc                               | ⏳ in progress | (this commit)                     |

## Migrations applied to live DB

- **071_gym_revenue_functions.sql** — adds `gym_revenue_totals` and
  `gym_revenue_buckets` SQL functions. Gated by `gym_coaches`
  membership (any coach can read gym revenue).
- **072_clients_member_enrichment.sql** — adds `status`, `health_notes`,
  `last_seen_at` columns to `clients`; partial indexes for the at-risk
  query; trigger `sync_client_last_seen` that pushes
  `max(attended_at)` onto `clients.last_seen_at` on attendance
  insert/update. Backfill of `last_seen_at` runs in the same
  migration.

Both verified by the verification queries in the apply sequence.

## What is now wired to the gym path

| Surface                             | Previously                                       | Now                                                        |
| ----------------------------------- | ------------------------------------------------ | ---------------------------------------------------------- |
| `/api/tribe-os/clients` POST        | `instructor_user_id = caller`                    | Writes both `instructor_user_id` AND `gym_id`              |
| `/api/tribe-os/clients` GET         | Scoped by `instructor_user_id`                   | Scoped by `gym_id` when present, falls back to legacy      |
| `/api/tribe-os/revenue/summary`     | `getRevenueSummary(userId)`                      | `getRevenueSummaryForGym(gymId)` → new SQL function        |
| `/api/tribe-os/revenue/payments`    | `listPayments(userId)` via `sessions.creator_id` | `listPaymentsForGym(gymId)` via `payments.gym_id` directly |
| `/api/tribe-os/revenue/export`      | `generatePaymentsCsv(userId)`                    | `generatePaymentsCsvForGym(gymId)` via `payments.gym_id`   |
| New `/api/tribe-os/clients/at-risk` | (did not exist)                                  | `listAtRiskClients(gymContext)` for the dashboard widget   |

The fallback to the user-keyed path remains in every revenue route
for the narrow case of a premium user with no gym record yet (very
rare post-Week-1 Mission 6, but possible).

## Verification gates before declaring Week 2 done

- [x] tsc --noEmit clean after each commit
- [x] Migration 071 applied; `gym_revenue_totals` + `gym_revenue_buckets`
      visible in `pg_proc`
- [x] Migration 072 applied; 3 new columns + 1 trigger + 2 indexes
      visible; backfill ran (0 rows in current state because no
      clients exist yet)
- [ ] Real-device verify on Vercel preview:
  - `/os/dashboard` loads, the at-risk widget renders (empty state
    expected — no clients yet)
  - `/os/clients` loads (legacy path AND gym path both work since
    your gym is wired)
  - `/os/revenue` loads, summary cards + chart render
  - Create a test client via `/os/clients/new` — confirm the Status
    select + Health notes textarea render and the submit succeeds
- [x] `node scripts/rls-leak-test.js` stays at **11 PASS / 0 FAIL / 4 WARN**
      (the WARNs are the documented payout/PII columns deferred in
      `LATER.md`). Verified post-072 and post-mission-5 widget.

## Deferred to Week 3+ (in LATER.md)

- **Gym switcher in the OS shell** — no multi-gym users exist yet
- **Coach roster page + invite flow** — needs beta first to have
  real coaches to invite
- **Cleanup migration that drops the legacy `instructor_user_id` RLS
  path** — Week 5+, after dual-path operation has been stable
- **Leak test coverage for the new gym SQL functions** — Week 3
  hardening pass

## End-of-Week-2 capability summary

A Tribe.OS premium gym can now:

- Add clients tagged with engagement status (active / inactive / lead / lapsed)
- Record private health notes per client (distinct from generic notes)
- See cached last_seen_at maintained automatically by attendance
- See an at-risk widget on the dashboard surfacing members who have
  stopped showing up
- Query revenue through the multi-coach SQL functions (any coach can
  read gym revenue, not just the owner)
- All four /api/tribe-os routes prefer the gym path when available
