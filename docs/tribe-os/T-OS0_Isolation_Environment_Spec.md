# T-OS0: Tribe.OS Isolation on a Shared Database (HARD LINE)

**Ticket:** T-OS0 (revision 2, 2026-09-24. Replaces revision 1, which proposed a separate Supabase project. Tribe and Tribe.OS share ONE Supabase database; that is settled.)
**Priority:** P0. Blocks every other T-OS ticket.
**Type:** Environment, tooling, guardrails. No product features.
**Owner decision (Al, 2026-09-23):** new Tribe.OS work is built completely branched off and does not touch the main app whatsoever until it is completely tested. Hard line.

---

## Ground truth this ticket is built on (verified in the repo 2026-09-24)

Tribe.OS is not a blank slate. A large body of Tribe.OS work is **already on `main` and already in the shared database**: `gyms`, `gym_coaches`, `gym_teams`, `gym_audit_log`, `clients` (with status, churn score, health status, streak counters), `client_attendance`, `training_partners`, `community_insights`, `agent_run_log`, `exercise_videos`, revenue functions, and the `/os/*` pages and `/api/tribe-os/*` routes. Four production crons already run Tribe.OS jobs nightly or weekly: `tribe-os/intelligence`, `tribe-os/weekly-summary`, `tribe-os/audit-watchdog`, `tribe-os/reconcile-counters`.

So "do not touch the main app" means: **new work must not change anything that `main`'s code, `main`'s crons, or the consumer app reads or writes**, even though the database is shared.

---

## THE HARD LINE (applies to every T-OS ticket and overrides any other spec)

```
1. Git. Never commit to, merge into, rebase onto, cherry-pick onto, or push to `main`.
   All new Tribe.OS work lives on `tribe-os/main` and ticket branches cut from it.
   The only path to main is one final merge that Al orders in writing with the
   words "merge tribe-os into main".

2. Database, Class A only before merge. A migration may be applied to the shared
   database before the final merge ONLY if it is Class A (defined below). Every
   Class B migration is written, reviewed and HELD: its filename ends in
   `.held.sql` and it is applied only at the merge gate.

3. No dual writers. Branch code never writes to a column or row that main's code
   or main's crons also write. Branch outputs go to NEW tables or NEW columns.
   (Example: main's nightly intelligence cron writes clients.churn_risk_score.
   The branch must not; it writes its own table.)

4. No real outbound messages. Any new send path (email, push, WhatsApp API, SMS)
   added on the branch defaults to log mode. The branch never sends to a real
   member or athlete.

5. No fake auth users. Creating auth users would create public.users rows that
   the consumer app lists. Test identities are existing accounts Al names.

6. Run `npm run os:guard` before every migration, db script, dev start and push.
   If it fails, STOP and tell Al. If anything anywhere conflicts with rules 1 to 6,
   these rules win and you ask Al.
```

### Class A (may be applied before merge, by Al, after review)

All of these must be true:

- It only **adds**: new tables, new views, new functions with **new names**, new indexes, or new **nullable or defaulted** columns.
- Every table it alters is **Tribe.OS-owned**: `gyms`, `gym_*`, `clients`, `client_attendance`, `community_insight*`, `training_partners`, `agent_run_log`, `exercise_videos`, `tribe_os_*`, or tables created by T-OS tickets.
- It creates **no trigger on any existing table**, and changes no existing policy, grant, trigger or function body.
- Main's code keeps working unchanged: no renamed columns, no new NOT NULL without a default, no new CHECK that existing rows or main's inserts could violate.
- It carries RLS on every new table from the first line, gated by gym membership.

### Class B (HELD until the merge gate)

Anything else. In particular: any change to `users`, `sessions`, `session_participants`, `session_attendance`, `featured_partners`, `partner_instructors`, `payments`, notifications or chat; any `CREATE OR REPLACE` of a function main calls; any policy or grant change on an existing table; any trigger on an existing table; any drop or rename.

If you are unsure which class a migration is, it is Class B.

---

## Step 1: A separate working folder (git worktree)

In a new Terminal tab, from `~/Desktop/Projects/Tribe.Ecosystem.4.4.2026/tribe-v3`:

```bash
git fetch origin
git switch main && git pull --ff-only
git branch tribe-os/main main
git push -u origin tribe-os/main
git worktree add ../tribe-v3-os tribe-os/main
```

`~/Desktop/Projects/Tribe.Ecosystem.4.4.2026/tribe-v3-os/` is the ONLY folder for Tribe.OS work. The original `tribe-v3` folder stays the main app. Keeping current with main is one direction only: merge `main` INTO `tribe-os/main` in its own PR, then rerun the full suite.

## Step 2: Pre-push hook

`.githooks/pre-push` in the worktree, `git config core.hooksPath .githooks`:

- Reject any push to `refs/heads/main`.
- Reject when the branch does not start with `tribe-os/` or `feat/t-os`.
- Run `node scripts/os-guard.mjs`; reject on failure.

## Step 3: Migration discipline

- New T-OS migrations use a reserved number block, **9000+**, so they never collide with main's sequence. Renumbered once at the merge gate.
- Every migration file starts with a header comment: `-- CLASS: A` or `-- CLASS: B (HELD)`, plus one line per table touched with its owner (`tribe-os` or `consumer`).
- Class B files are named `*.held.sql`.
- `scripts/os-migration-check.mjs` (run by os:guard): parses every 9000+ file and fails if a `CLASS: A` file contains `DROP`, `RENAME`, `CREATE OR REPLACE FUNCTION` for an existing function name, `CREATE TRIGGER`, `ALTER POLICY`, `DROP POLICY`, `GRANT`/`REVOKE` on an existing table, `SET NOT NULL`, or touches a consumer-owned table. It is a tripwire, not a proof; human review still applies.
- Al applies Class A files by hand in the Supabase SQL editor after reading them, and records them in `public.migrations_applied` (migration 184) the same way as any other.

## Step 4: The test gym (real database, fake business)

- One gym row, `slug = 'bullbox-prueba'`, name "BullBox (Prueba)", owned by **Al's own account**, `tribe_os_status` granted by the CLI. Not linked to the real BullBox `featured_partners` row.
- Before seeding, set that gym's intelligence email toggle OFF so main's nightly digest does not email Al about fake members.
- Members and visits are fake (`clients` rows with `tags = '{seed}'`), created by a script that refuses to run against any gym whose slug does not end in `-prueba`. A matching cleanup script deletes only rows tagged `seed` in `-prueba` gyms.
- Check first whether the existing `app/api/tribe-os/dev/seed-sample-data` route can be reused under these rules; report before writing a new one.
- A second identity for "non-member" permission probes: an existing non-admin account that Al names. Ask him; do not create one.

## Step 5: Guard script

`scripts/os-guard.mjs`, as `npm run os:guard` and as `predev`, `pretest`, and inside every `db:*`/`os:*` script. FAIL when:

- the branch is `main` or not `tribe-os/*` / `feat/t-os*`;
- `os-migration-check` fails;
- any new send path's mode env (`EMAIL_MODE`, `PUSH_MODE`) is not `log` on the branch;
- `TRIBE_OS_AI_PROVIDER=anthropic` and `TRIBE_OS_AI_LIVE` is not exactly `true` (see T-OS2).
  Print on pass: `os-guard OK: branch=<b> migrations=<n> A / <m> held email=log ai=<provider>`.

## Step 6: Previews

Vercel preview deployments of `tribe-os/*` branches use the same Supabase as every other preview. That is acceptable under this ticket because the branch code obeys rules 2 to 5. Crons do not run on previews, so anything scheduled must also have an on-demand trigger. Production deployment, production env vars and the Capacitor apps are untouched.

## Step 7: Merge gate (documented now, executed at the end)

`docs/TRIBE_OS_MERGE_GATE.md`, unchecked until the end:

- All T-OS tickets complete on `tribe-os/main`; `main` freshly merged in; `tsc`, lint, tests green.
- Probes (anon, gym member, non-member) for every new table, RPC and route, recorded.
- BullBox pilot sign-off.
- Every held Class B migration dry-run on a Supabase branch or local Postgres restored from a schema-only dump, with results recorded.
- Migrations renumbered into main's sequence.
- Manual production backup taken and its ID recorded.
- Al's written instruction: "merge tribe-os into main".

## Acceptance checks

1. Worktree on `tribe-os/main`, pushed. `git push origin HEAD:main` from it is rejected (paste output).
2. `os:guard` passes, and fails for each bad state (paste output).
3. `os-migration-check` rejects a sample Class A file that contains a `CREATE TRIGGER` on `sessions` (unit test).
4. Test gym exists with email digest off; seed and cleanup scripts refuse any gym not ending in `-prueba`.
5. The consumer app and the production `/os` pages behave exactly as before (Al spot-checks on his phone).

## Cost implications

None. No new Supabase project, no new service, no paid GitHub rulesets.
