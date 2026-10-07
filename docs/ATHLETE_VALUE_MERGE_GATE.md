# Athlete Value merge gate

**Written by T-AV0 (2026-09-25). Every box below is unchecked, and stays
unchecked until the thing is actually done.**

This is the only document that authorises `athlete/main` to reach `main`. It is
written now, at the start, because a gate written at the end is a gate written
to pass — the same reason CLAUDE.md gives for writing a migration's guard with
the migration rather than after it: a check authored against work that is
already finished tends to encode that work's blind spots as its scope.

Nothing here may be ticked by the person who wants the merge on the strength of
believing it is true. Each box wants a command, an output, or a screenshot.

---

## The single instruction that opens this gate

> **Al, in writing: "merge athlete into main".**

Until that sentence exists, the answer to "can this merge now" is no, however
green everything is. T-AV0's hard line, rule 1.

---

## 1. The branch is finished and current

- [ ] Every T-AV ticket in this release is complete on `athlete/main`.
- [ ] `main` has been merged INTO `athlete/main` in its own commit, at the
      merge attempt, not days before. A branch is not merge-ready because it is
      finished — "ready to merge" is a claim about the branch, not about `main`.
- [ ] `npx tsc --noEmit` — clean. **Run it before the suite.** For any change
      that renames, adds or removes a column, the typecheck is the test and the
      suite is not: the DAL is mocked everywhere, so a column that does not
      exist is just a key to vitest and an error to `tsc`.
- [ ] `npx eslint app/ lib/ components/ hooks/ --max-warnings 1850` — within
      budget.
- [ ] `npm run test:complete` — green, and the files-run count equals the
      files-on-disk count. A green vitest summary is a claim about the tests
      that RAN.
- [ ] `npm run test:e2e` — green.
- [ ] `npm run build` — and record how many routes are static. If that number
      moved, say which change moved it and why; "this route is dynamic" is not
      "this app is dynamic", and the last time that was assumed it took 79
      static routes to 2.

## 2. Every new surface probed as every role

For each new table, RPC and route, record the actual result — not "should be
denied", the response.

- [ ] anon
- [ ] ordinary athlete
- [ ] instructor (own data)
- [ ] a DIFFERENT instructor (someone else's data — the case that actually
      leaks)
- [ ] app admin

Run the write, as the role that would run it. A catalog read answers one of the
three layers that can deny a write; grants, RLS and triggers each deny
independently, and CLAUDE.md records a report that said "one PATCH grants
admin" on the strength of `information_schema` while three of five writes were
refused by objects the catalog does not show.

- [ ] Results table pasted into the PR, one row per (object, role), with the
      error code or the row count.

## 3. Mutation proofs re-run against current code

- [ ] Every mutation proof cited in a T-AV commit message has been re-run from
      that commit message, against the tree as it stands now. **A mutation
      proof expires.** A branch that rebased cleanly and passed twelve tests
      still had two mutations that no longer failed anything.
- [ ] Each driver asserts the mutation LANDED (`assert file != original`)
      before it interprets the guard's response, and asserts the restore landed
      after. A proof whose conclusion does not depend on the proof having been
      performed is not a proof.

## 4. Real devices, the flows from the program spec

- [ ] iOS Safari, on a real iPhone, on the LOCAL stack over the LAN.
      **`.env.av.local` must name the Mac's LAN address, not 127.0.0.1** —
      from the phone, 127.0.0.1 is the phone. The CSP allowance covers
      RFC-1918 addresses over http for exactly this reason.
- [ ] Android Chrome, on a real phone, same.
- [ ] Every acceptance criterion in the program spec exercised end to end, by
      hand, in both languages.
- [ ] The VISITOR's view of every new surface, not only the owner's. Three live
      defects in this repo shipped because the only person who could see the
      problem was the one person not motivated to report it.

## 5. Migrations

- [ ] Renumbered out of the 8000 block into `main`'s sequence, reading
      `origin/main` AT THAT MOMENT (`git fetch origin && git ls-tree
--name-only origin/main supabase/migrations/ | tail -5`). A number is
      claimed by whoever merges first; this repo has three collisions on record
      and two of them merged.
- [ ] Each renumbered file states in its header what it was numbered before and
      why it changed. The number moves; the record does not.
- [ ] Each has a probe in `supabase/verify-migration-state.sql`, and the
      three-digit guards on `main` now see it (they key on `^\d{3}_`, which is
      exactly why the 8000 block was invisible to them).
- [ ] `supabase/migrations_frozen.json` regenerated with
      `scripts/freezeMigrations.ts` only AFTER each is applied.
- [ ] Each rehearsed against production in the house shape: `BEGIN`, the body
      including its guards, a pass/fail table, `ROLLBACK`. **The body includes
      the guards** — a rehearsal spliced around a `DO` block is not that
      migration.
- [ ] Every guard has at least one SUCCESS arm as well as its failure arms.
      Failure arms prove the guard can fire; only a success arm proves it will
      not fire on the live database, which is the only thing the person about
      to run it wants to know.
- [ ] Rehearsal output shown to Al, in full, including the detail strings — not
      the verdict column alone.

## 6. Order of operations on the day: the merge-day runbook

**Al's merge-day decisions, recorded 2026-10-06:**

- **Merge day: 2026-10-06.**
- **`ATHLETE_VALUE_FEATURES=athletes`.**
- **Allowlist: two accounts**, Al and one test account Al controls. Not four:
  Ana and the second test account are not on it.
- **`main` is frozen** from 2026-10-06 until phase 2 is through: Al merges
  nothing into `main` and no other session pushes to it. If `origin/main` moves
  anyway, stop and tell Al; do not merge it.
- **Step 1 was run on 2026-10-06** and `origin/main` moved under it twice:
  #189 (`de04d388`, the 199 record, the precondition) and #191 (`f9fcc745`,
  the discover tab on `/instructors`). Both are merged into `athlete/main`
  (`8795698f`, then `09c49b00`; #191 conflicted only in `messages/en.json` and
  `messages/es.json`, resolved by keeping main's `discover` section and the
  athlete sections whole, no key changed, both files valid JSON with identical
  en/es key sets, 568 each). `athlete/merge-phase1` is rebuilt on `f9fcc745`
  as `663700d9`.
- **Phase 1 is done (2026-10-07).** PR #192 (`athlete/merge-phase1`,
  `663700d9`) merged by Al on GitHub as **`b1734df3`** on `main`, tree
  identical to `663700d9`; the Vercel production deploy for it read Ready
  ("Deployment has completed", 10:46:15 UTC). The worktree's pre-push hook
  refuses pushes to `main`, so phase 1 went in through a PR rather than a
  direct push (Al's choice).
  - **Step 5 (before), Al:** 201 to 210 all `MISSING`, every other row as
    before.
  - **Step 6, Al:** pasted 201 to 210 in order, each a complete file from
    `b1734df3` via `git show | pbcopy`, each "Success", no errors.
  - **Step 7 (after), Al:** 201 to 210 all `applied`, every other row
    unchanged, `GUARD_184_mirror_matches_applied_table` `MISSING` (expected
    until step 8's record commit).
- **Step 8 is done (2026-10-07).** Record commit `e3b8885b`
  ("chore(migrations): record 201 to 210 as applied", on `b1734df3`) merged
  into `athlete/main` as `9086cd72`. On `athlete/main`: tsc 0, eslint 0
  errors, `test:complete` 319 of 319 files and 2848 tests, the
  applied-before-code guard passing with `KNOWN_NAME_COLLISIONS` empty,
  `test:e2e:av` 3 + 4 passed, and all eleven proofs t-av21 to t-av30 green.
- **Step 9, Vercel, done by Al (2026-10-07):** in Vercel Production only,
  `ATHLETE_VALUE_ENABLED=allowlist`, `ATHLETE_VALUE_ALLOWLIST` with Al's two
  UUIDs, `ATHLETE_VALUE_FEATURES=athletes`; no redeploy (the phase 2 deploy
  picks them up). Phase 2 then goes in as two pull requests, because the
  worktree's pre-push hook refuses pushes to `main`: PR A, the record commit
  alone, merged and its deploy Ready first; then PR B, `athlete/main` into
  `main`.
- **Mutation drivers last passed in full on the `de04d388` tree**
  (`athlete/main` `8795698f`, phase 2 rehearsal `2a3366ef`, 2026-10-06): all
  ten, every arm on its first run. **Not re-run on `f9fcc745`**, by Al's
  decision: #191 changes only `app/instructors/`, `components/instructors/`,
  `lib/discover/`, one line of `lib/analytics.ts` and the two translation
  files, and no driver mutates or reads any of them (checked: no driver names
  any of those paths). The scoped re-run on `f9fcc745` was tsc, eslint and
  `test:complete` on all three trees, then `test:e2e:av` and every proof
  t-av21 to t-av30 on the phase 2 rehearsal (`f1636c1e`): all green.

**Two phases, decided by Al 2026-10-06 (T-AV31).** Main's
`migrationAppliedBeforeCode.test.ts` (the guard written after the 2026-09-21
notification outage) refuses code that reads a column before the migration
adding it is applied and recorded. The athlete code reads columns 201 and 204
add, so it cannot merge in the same step as the migrations. Phase 1 merges the
migrations alone (no app code), Al applies them, they are recorded, and phase 2
merges the code. Same shape as main's #181 then #182. Rehearsed locally:
`athlete/merge-phase1` (migrations only, full suite green, and main's current
`/api/pase` claim verified against the migrated schema) and phase 2 (the
recorded tree plus `athlete/main`, full re-run green).

Every step is marked **[AL]** or **[CLAUDE CODE]**. Nothing marked [CLAUDE CODE]
touches `main`, `origin` or production until Al has written the sentence in the
step before it. If any step does not produce the good result it describes,
stop there and do not continue to the next step.

1. **[CLAUDE CODE] Pre-flight, the morning of.** `git fetch origin`. Confirm
   `origin/main` is still `f9fcc745` (merged into `athlete/main` as `09c49b00`
   on 2026-10-06). `main` is frozen (see the decisions above): if it moved,
   stop and tell Al; do not merge it.
   Confirm none of 201 to 210 is taken on `origin/main` (if one is: stop and
   tell Al; nothing is renamed again without his decision). `npm run av:guard`.
   Report all of it to Al.
   **Precondition: `chore/record-199-applied` is merged into `main` first**, by
   Al, through its own pull request, before step 2. It is on origin, one commit
   (`67e4fa60`, "chore(migrations): record 199 as applied"), and contains no
   SQL that runs: it adds `199_session_media_participants_only` to
   `supabase/migrations_applied.json` and to both mirror lists in
   `verify-migration-state.sql`, generated by `scripts/syncMigrationsApplied.ts`.
   Its message records that 199 was applied to production on 2026-10-05; 199
   inserts its own `migrations_applied` row, so production already has the row
   and only the mirror is behind. Without it, steps 5, 7 and 13 show a
   `GUARD_184_mirror_matches_applied_table` MISSING for 199 that has nothing to
   do with this program. After it merges, `athlete/main` takes it like any
   other `main` commit (this step's "if it moved").
2. **[AL] Take the production backup.** Supabase Dashboard, the production
   project, **Database > Backups** (the procedure in `docs/WEEK_1_MISSIONS.md`).
   Take a manual backup and copy the backup's identifier and timestamp exactly as
   that page shows them into this line: **Backup ID and time:** `________`.
   **Recorded 2026-10-07 (Al): Free plan, no dashboard backup. Own dump
   `~/TribeBackups/tribe-prod_2026-10-07_0523_schema.sql` and
   `~/TribeBackups/tribe-prod_2026-10-07_0523_data.sql`, taken 2026-10-07 05:23:
   147 tables (`CREATE TABLE`), 145 `COPY` blocks, `pass_leads` present.**
   If the page offers no manual backup on our plan, record the newest daily
   backup's timestamp instead and say so in this line, because that restore
   point is older than the morning's data.
   **Then, whatever the plan, a dump of your own, in your own Terminal (Claude
   Code never connects to production and never sees this password).** Docker
   Desktop must be running (the CLI runs `pg_dump` in a container).
   1. The connection string: Supabase Dashboard, the production project, the
      **Connect** button at the top, **Session pooler** string. It contains
      `[YOUR-PASSWORD]`: replace it with the database password. If you do not
      have it, it is reset under **Project Settings > Database**; before
      resetting, check nothing else uses the old one (anything with a
      `SUPABASE_DB_URL`-style value pointing at production).
   2. In Terminal:
      ```bash
      mkdir -p ~/TribeBackups && cd ~/TribeBackups
      D=$(date +%Y-%m-%d_%H%M)
      read -rs PROD_DB_URL
      ```
      Paste the connection string and press Return (nothing is shown, and it
      does not go into your shell history). Then:
      ```bash
      supabase db dump --db-url "$PROD_DB_URL" -f "tribe-prod_${D}_roles.sql" --role-only
      supabase db dump --db-url "$PROD_DB_URL" -f "tribe-prod_${D}_schema.sql"
      supabase db dump --db-url "$PROD_DB_URL" -f "tribe-prod_${D}_data.sql" --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
      unset PROD_DB_URL
      ```
      These are the commands in Supabase's "Backup and Restore using the CLI"
      guide. If the CLI rejects the two `-x` flags, run the data line without
      them.
   3. Confirm it is not empty:
      ```bash
      ls -lh ~/TribeBackups/tribe-prod_${D}_*.sql
      grep -c '^CREATE TABLE' ~/TribeBackups/tribe-prod_${D}_schema.sql
      grep -c '^COPY ' ~/TribeBackups/tribe-prod_${D}_data.sql
      grep -cE '^COPY .*pass_leads' ~/TribeBackups/tribe-prod_${D}_data.sql
      ```
      **Good result:** three files, none of them 0 bytes; the two counts are
      well above zero (dozens); the last line prints `1`. Write the three file
      names into the backup line above.

   **If Docker is not running or freezes: the same three dumps with `pg_dump`
   directly, no Docker.**
   1. Production's Postgres major version. In the SQL editor (read-only):
      `show server_version;` The number before the first dot is the major
      (for example `17.6` is 17). `pg_dump` must be that major or newer; a newer
      `pg_dump` dumps an older server, an older one refuses.
   2. A `pg_dump` of at least that major. Either of these:
      - Already on this Mac: Postgres.app ships `pg_dump` 17
        (`/Applications/Postgres.app/Contents/Versions/17/bin`). Use it if the
        major from step 1 is 17 or lower.
      - Homebrew: `brew install libpq` (keg-only, so it does not touch other
        Postgres tools; as of 2026-10-06 the formula is version 18.6, which
        covers a major of 18 or lower). Its tools are in
        `$(brew --prefix libpq)/bin`.

      Then point the shell at the one you chose and confirm the version:

      ```bash
      PGBIN="$(brew --prefix libpq)/bin"
      "$PGBIN/pg_dump" --version
      ```

      (For Postgres.app: `PGBIN=/Applications/Postgres.app/Contents/Versions/17/bin`.)
      The printed major must be at least production's.

   3. The same password handling, then the three dumps:
      ```bash
      mkdir -p ~/TribeBackups && cd ~/TribeBackups
      D=$(date +%Y-%m-%d_%H%M)
      read -rs PROD_DB_URL
      ```
      Paste the Session pooler connection string (step 2.1 above) and press
      Return. Then:
      ```bash
      "$PGBIN/pg_dumpall" --dbname="$PROD_DB_URL" --roles-only --no-role-passwords -f "tribe-prod_${D}_roles.sql"
      "$PGBIN/pg_dump" "$PROD_DB_URL" --schema-only --quote-all-identifiers -f "tribe-prod_${D}_schema.sql"
      "$PGBIN/pg_dump" "$PROD_DB_URL" --data-only --quote-all-identifiers --exclude-table-data='storage.buckets_vectors' --exclude-table-data='storage.vector_indexes' -f "tribe-prod_${D}_data.sql"
      unset PROD_DB_URL
      ```
      If the roles line is refused for permissions, carry on: the schema and
      data files are the backup that matters, and the roles are Supabase's own.
      The data line prints warnings about circular foreign keys (`users`,
      `communities`, `sessions`): expected for a data-only dump, not a failure
      (Supabase's restore loads data with `session_replication_role = replica`).
      Rehearsed 2026-10-06 against the local stack (Postgres 17.6) with
      Postgres.app's `pg_dump` 17: all three files written, checks 144, 142 and 1.
   4. The same not-empty checks as above (`ls -lh` and the three `grep -c`
      lines), with the same good result.

   The data file holds every user's personal data. Keep `~/TribeBackups` out of
   the repository and out of iCloud-synced folders (Desktop, Documents).

3. **[AL] Authorize phase 1** by writing, in the Claude Code chat, exactly:
   > I authorize phase 1 of the Tribe Athletes merge: merge the athlete migrations into main and push. Backup: <the ID from step 2>.
4. **[CLAUDE CODE] Phase 1 merge.** Rebuild `athlete/merge-phase1` on the
   current `origin/main` if it moved, run tsc, eslint and `npm run test:complete`
   on it, then `git merge` it into `main` and `git push origin main`. Report the
   commit hash on `main`; every paste in step 6 corresponds to that commit. If
   the push is refused (branch protection), stop and tell Al: it then goes
   through a pull request, which Al merges.
   **What Vercel does:** a push to `main` deploys production automatically
   (`engineering-standards.md`), and the iOS and Android apps load that live
   build (`capacitor.config.ts`, `server.url`). Wait for the deploy to read
   Ready.
   **What users see after the phase 1 push: nothing.** Phase 1 contains no app
   code, only the ten migration files, the verifier and three test files, so
   the deployed pages are byte-for-byte the code already running. Even after
   step 6 adds the tables and columns, main's code does not read them: main's
   `/api/pase` claim was run against a database with 201 to 210 applied
   (2026-10-06, local) and answered 200 with the new columns left NULL.
   **[AL] Rollback for phase 1, only if something is wrong after this deploy.**
   Vercel, the project's overview page, the **Production Deployment** tile,
   **Instant Rollback**; in the dialog pick the deployment that was production
   before this push (the one for `cab6a2b4`, or for whatever `main` was), click
   **Continue**, check the domains listed, click **Confirm Rollback**. (Same
   thing from the **Deployments** tab: the row's **(⋮)** menu, **Instant
   Rollback**.) Then:
   - The domains point back to that deployment at once. The iOS and Android
     apps load the live site (`capacitor.config.ts`, `server.url`), so they get
     the rolled-back code the next time a screen loads; a screen already open
     keeps the code it loaded until the app is reloaded or reopened.
   - **Vercel turns off automatic production deploys after a rollback**: later
     pushes to `main` build but do not go live until you click **Undo
     Rollback** on the same tile and promote a deployment. A rolled-back
     deployment also keeps the environment variables it was built with, and
     cron jobs revert to that deployment's schedule (Vercel's Instant Rollback
     documentation).
   - Phase 1 changed no app code, so this rollback changes no page; it exists
     for completeness.
   - The database is not rolled back by Vercel. 201 to 210, if already
     pasted, stay in place, and that is safe: they only add (new columns,
     tables, functions and policies; the two dropped policy and constraint
     names are recreated as supersets in the same file). Main's code reads none
     of the new tables or functions, and every place it touches `pass_leads`
     (the service-role insert and `notified_at` update in `/api/pase`, the
     admin and partner lead lists with explicit column lists, and
     `set_pass_lead_contacted`) is unaffected; the new INSERT policies bind only
     anon and authenticated inserts, and main inserts with the service role.
     Do not try to undo 201 to 210 by hand; reverting the database is a restore
     from step 2, a separate decision.

5. **[AL] Verify BEFORE the pastes.** In the Supabase SQL editor (production),
   paste the whole of `supabase/verify-migration-state.sql` from the phase 1
   commit and run it. **Good result:** it runs to the end with no error; every
   row from `201_t_av21_pass_leads_showup` to `210_t_av27b_notifications` reads
   `MISSING -- ...` (those objects do not exist yet; T-AV30 is what makes this
   a list rather than an error); every other row reads what it read before
   today (`applied`, or one of the known `cannot verify automatically` /
   `assumed` / `info` rows). Screenshot or copy the result for this file.
6. **[AL] Paste 201 to 210, in this order, one complete file per paste,** each
   from the phase 1 commit on `main`:
   1. `201_t_av21_pass_leads_showup.sql`
   2. `202_t_av22_athlete_programs.sql`
   3. `203_t_av22_program_athletes.sql`
   4. `204_t_av22_pass_leads_attribution.sql`
   5. `205_t_av22_athletes_ledger.sql`
   6. `206_t_av22_athletes_writes.sql`
   7. `207_t_av22_athletes_reads.sql`
   8. `208_t_av22_program_columns_server_only.sql`
   9. `209_t_av26_athletes_search.sql`
   10. `210_t_av27b_notifications.sql`

   Select all of the file, paste, run. Each file is one transaction and ends
   with its own checks, so a good run shows the file's closing notice (for
   example the line starting `201: show-up columns added`) and no error. **If any file raises an error, nothing
   from that file was applied: stop, do not paste the next one, and send the
   error to Claude Code.** Never paste part of a file (CLAUDE.md, per-paste
   atomicity). Each file also records itself in `public.migrations_applied`.

7. **[AL] Verify AFTER the pastes.** Run the whole verifier again. **Good
   result:** every row from 201 to 210 reads `applied`, nothing else changed
   from step 5, and `GUARD_184_mirror_matches_applied_table` reads MISSING with
   "this database has recorded a migration the JSON mirror omits". That last one
   is expected and is fixed by step 8; anything else not `applied` is a stop.
8. **[CLAUDE CODE] Record 201 to 210 as applied.** On a branch from `main`: run
   `npx tsx scripts/syncMigrationsApplied.ts <name>` once for each of the ten
   (it takes one name per call), and delete the two T-AV31 entries from
   `KNOWN_NAME_COLLISIONS` in `supabase/migrationAppliedBeforeCode.test.ts`
   (its rot test fails until they are gone). Full suite green. Commit, not yet
   pushed. Then merge that commit and `origin/main` into `athlete/main`, and re-run
   tsc, eslint, `test:complete`, `test:e2e:av`, and every proof and mutation
   driver from t-av21 to t-av30 on it. Report all results to Al.
9. **[AL] Turn the flag to allowlist in Vercel, BEFORE phase 2 is pushed.**
   Unset is not fully off: an unset `ATHLETE_VALUE_ENABLED` reads as `off`
   (`lib/features/athleteValue.ts:78-79`), but an app admin is on whatever
   the mode (`:140`, `return callerIsAppAdmin(supabase)`; spec section 3, and
   the comment at `:31`). Setting it first means the phase 2 deploy is built
   with the final values, and nothing in today's `main` reads these variables,
   so setting them early changes nothing until phase 2 deploys.
   - **Find the UUIDs.** Supabase Dashboard, the production project,
     **Authentication > Users**: search each email and copy the **User UID**
     column. Or, in the SQL editor:
     `select id, email from auth.users where email in ('<Al>', '<test account>');`
     Al's email is the one Al signs in to Tribe with.
   - **Set them.** Vercel, the project's **Settings > Environment Variables**,
     **Production** environment only:
     `ATHLETE_VALUE_ENABLED` = `allowlist`;
     `ATHLETE_VALUE_ALLOWLIST` = the **two** UUIDs, Al's and the test
     account's, comma-separated (UUIDs, not emails);
     `ATHLETE_VALUE_FEATURES` = `athletes` (decided by Al 2026-10-06; the two
     valid names are in section 7, "Feature names"). Do not leave `ATHLETE_VALUE_FEATURES` unset: unset
     means every feature. None of the three may be `NEXT_PUBLIC_`. No redeploy
     is needed now; the phase 2 push in step 11 is the deployment that picks
     them up.
   - **Check who the app admins are.** App admins see every program surface
     whatever these variables say. `is_app_admin()` is
     `EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)`
     (`supabase/migrations/add_admin_rls.sql`); the deciding column is
     `public.users.is_admin` and nothing else (no JWT claim, no admins table,
     and it ignores `banned` and `deleted_at`). In the SQL editor, read-only:
     ```sql
     SELECT u.id, coalesce(u.email, au.email) AS email, u.name,
            u.is_admin, u.banned, u.deleted_at
       FROM public.users u
       LEFT JOIN auth.users au ON au.id = u.id
      WHERE u.is_admin IS TRUE
      ORDER BY u.name;
     ```
     **Good result:** exactly one row, Al. If there are others, decide before
     step 10 whether they should see the program during the dark phase.
     `is_admin` is guarded by the `users_is_admin_guard` trigger (migration
     043): only an admin or the SQL editor can change it, and every change is
     logged in `admin_role_audit`.
   - D2 is tabled: no feature is turned on for BullBox.
10. **[AL] Authorize phase 2** by writing, in the Claude Code chat, exactly:
    > I authorize phase 2 of the Tribe Athletes merge: the allowlist is set in Vercel Production; push the record of 201 to 210, then merge athlete/main into main and push.
11. **[CLAUDE CODE] Phase 2 merge.** `git push origin main` with the record
    commit (Vercel deploys it; it changes only the applied list and a test, so
    users see nothing from that deploy), then `git merge athlete/main` into
    `main` and `git push origin main`. Report both hashes. **What Vercel does:**
    production deploys the athlete code, and the iOS and Android apps load it at
    the same moment.
    **What users see after the phase 2 push:**
    - **Everyone not on the allowlist and not an app admin: no program
      surface.** Every program page is a real 404 (`/atletas/`,
      `/atletas/gym/...`, `/pase/verificar/...`, `/admin/atletas/`), proven by
      the flag-off e2e project and `t-av24-proof`. The shared-file changes
      listed under "Things T-AV0 changed in SHARED files" below have no visible
      effect.
    - **The public pass page `/pase/{slug}/`, for everyone, signed in or not:
      unchanged as long as no partner's athlete program is active.** The chip,
      the attributed consent and the voucher QR are NOT decided per user: they
      appear for ANY visitor to a partner whose `athlete_programs.is_active` is
      true, once the mode is `allowlist` or `all` and `athletes` is listed
      (`lib/features/athletesAttribution.ts:33-42`; the file's header: "an
      allowlist names users, and a guest is not one, so the allowlist cannot
      narrow this path"). After 202 every program defaults to inactive and none
      exists in production, so nothing shows until one is created and switched
      on. Switching a program on is therefore a public change for that
      partner's pass page; with D2 tabled, only the TEST partner (step 12) is
      ever switched on, and only during the section 7 test.
    - **The two allowlisted accounts (Al and the test account):** the feature named in
      `ATHLETE_VALUE_FEATURES`, and nothing else.
    - **App admins:** every program surface, whatever the variables say (the
      admin rule above). Al is an app admin.

    **[AL] Rollback for phase 2, if anything is wrong after this deploy.** The
    same clicks as after step 4: overview page, **Production Deployment** tile,
    **Instant Rollback**, pick the deployment of the record commit (the push
    just before the athlete merge), **Continue**, **Confirm Rollback**. Then:
    - The site and, on their next load, the iOS and Android apps run main's
      code without the athlete program: exactly the phase 1 state, which works
      with 201 to 210 in place (step 4's rollback note).
    - Automatic production deploys stay off until **Undo Rollback**; fix
      forward on a branch, then undo the rollback by promoting the fixed
      deployment.
    - 201 to 210 stay applied and stay recorded; rows the athlete code wrote
      (attendance, outcomes, notifications) stay in their tables, which main's
      code never reads. The Vercel variables stay set; main's code does not
      read them.

12. **[AL] Create the TEST partner.** Paste the whole of
    `supabase/recon/test-partner.PRODUCTION.sql` (from `main`) into the SQL
    editor and run it, once. It needs step 9's admin check first: it aborts,
    changing nothing, unless exactly one account has `users.is_admin`, and it
    routes the TEST partner's leads to that account's email. It creates one
    `featured_partners` row (`tribe-test-pass`, named "TEST Tribe pass (not a
    real gym)", `status = 'pending'`, `pass_active` on, no owner) and its
    `partner_lead_routing` row. **It creates no athlete program**; that waits for
    section 7. **Good result:** the notice `TEST partner ready: ...` and one
    row in the closing SELECT, `pending`, `t`, an empty `user_id`, and your
    email. Rehearsed on the local stack 2026-10-06: both abort arms fire and
    change nothing, a second run changes nothing, `/pase/tribe-test-pass/`
    serves and takes a claim, and the row is invisible to anon and to a
    signed-in non-admin.
    **Why pending and unowned, and where it shows.** `status = 'pending'` is the
    one existing value that hides it from every public surface while the pass
    page still serves it: the home carousel, the `/instructors` gyms section,
    the venue picker, storefront headers and pass buttons, session venue chips
    and `set_session_partner` all filter `status = 'active'` (RLS on
    `featured_partners` is `status = 'active' OR is_app_admin()`); `/g/{slug}`
    reads `partners_public`, which hides exactly `pending` (a `paused` or
    `expired` row WOULD render there, so never change its status); the sitemap
    lists four static URLs and pass pages are noindex; search, crons, edge
    functions and the share routes `/i/` and `/invite/` do not read partners.
    `/pase/tribe-test-pass/` and `POST /api/pase` serve it because they read
    with the service role and check only the slug, `pass_active` and the
    routing row. With an owner set, that owner's `/partners/apply` would show
    an "Activate" button that makes it public in one tap; with no owner there
    is no such screen. Admins still see it: the `/admin` pending count,
    `/admin/partners` (with an Approve button: never press it), and the admin
    leads and athletes screens.
13. **[AL] Verify once more and smoke-test.** Run the verifier: every row
    `applied` or a known status, `GUARD_184_mirror_matches_applied_table` now
    `applied`. Then, signed in as an ordinary (non-admin, non-allowlisted)
    account, on the web and in the iOS app:
    - the 404 checks: `/atletas/` and `/admin/atletas/` both a 404, and Home
      shows no "Atletas" card;
    - sign out and sign back in;
    - the home feed loads, with sessions and pictures;
    - open a session, join it and leave it again, and open its chat;
    - a coach's view: signed in as an instructor account (not allowlisted),
      open the instructor dashboard and one of their sessions as host, and a
      coach's public storefront;
    - a partner's dashboard and lead list (an owner account that is not
      allowlisted): the leads load and "contacted" can still be set;
    - signed out, a real partner's `/pase/{slug}/` page: open it and look
      only. It is unchanged from before today (no chip, no QR; no program is
      active). **Do not claim on a real partner:** a claim sends a real lead
      email to that gym's owner (T-GYM2);
    - signed out, the claim check on the TEST partner:
      `/pase/tribe-test-pass/` shows the TEST name and no chip or QR (it has no
      program yet), and a claim with a test email you control succeeds. The
      lead email arrives in your inbox, and the confirmation at the test
      address.

    Anything that differs from before today is a stop: roll back (step 11).

14. **[AL] Section 7 begins:** the dark phase of at least 7 days, including the
    real voucher scan on production.

## 7. After the merge

- [ ] `ATHLETE_VALUE_ENABLED=allowlist` in Vercel production, with Al and one
      test account Al controls and nobody else (Al, 2026-10-06; runbook step 9).
- [ ] Dark phase of **at least 7 days** in the real iOS and Android apps with
      the allowlist accounts.
- [ ] **During the dark phase: the real voucher scan on production.** Steps in
      "Production voucher test" below.
- [ ] Al flips each feature, one at a time, in writing
      (`ATHLETE_VALUE_FEATURES`).

### Production voucher test (dark phase, allowlist mode)

What the code does in allowlist mode, which the test is shaped around:

- **The voucher QR does not depend on who claims.** `/api/pase` reads no
  session (service role, `app/api/pase/route.ts:134,181`) and draws the QR when
  `attribution.on` (`:308`), which is: mode `all` or `allowlist`, `athletes`
  listed, and the partner's `athlete_programs.is_active`
  (`lib/features/athletesAttribution.ts:33-42`). So a signed-out guest gets the
  QR on an active-program partner; signing the guest in as an allowlisted
  account changes nothing.
- **The coach must already be signed in.** `/pase/verificar/` is gated in
  middleware: a signed-out visitor is not allowed and the path is public, so it
  is a real 404 (`middleware.ts:339-343`), and the page's redirect to sign-in
  (`app/pase/verificar/[passCode]/page.tsx:57-59`) is never reached. The login
  return proven in T-AV29 therefore works only in `all` mode; it cannot be
  tested in production during an allowlist dark phase.
- **Never against BullBox's live record** (CLAUDE.md: the T-GYM2 test-data
  incident). Use a dedicated test partner.

Steps:

1. **[AL]** The TEST partner already exists from runbook step 12
   (`tribe-test-pass`, pending, unowned, leads to you). Nothing to do.
2. **[AL]** In `/admin/atletas/`, "Crear programa" for "TEST Tribe pass", then
   tick "Programa activo". Then on its gym page (`/atletas/gym/<partner id>/`,
   "Agregar atleta"), add **yourself** as the athlete. It has to be an admin:
   the athlete's own `/atletas/` reads the partner's slug through RLS
   (`lib/dal/athleteHome.ts:81`), and RLS hides a pending partner from everyone
   but admins, so a non-admin test athlete would see no link. Signed in as
   you, `/atletas/` then shows the link and your code. Switching the program
   on makes the chip and QR public on THIS partner's pass page only, which no
   public surface links to.
3. **[AL]** Phone A (the guest), Safari, signed out or a private tab: open
   `https://<production domain>/pase/tribe-test-pass/?src=atleta&code=<your code>`.
   The "Te invita" chip shows your first name. Claim with a test email you
   control; the voucher QR appears.
4. **[AL]** Phone B (the coach): in Safari, sign in to Tribe on the production
   domain FIRST, as Al (admin) or as an allowlisted owner or coach of the test
   partner. The camera opens links in Safari, not in the app, so the Safari
   session is the one that counts.
5. **[AL]** Phone B's camera on phone A's QR: the link must be
   `https://<production domain>/pase/verificar/<code>/`. Open it: "Confirmar
   asistencia", tap it, then "Llegó". On `/atletas/` as the test athlete, the
   guest shows as arrived.
6. **[AL]** Expected and correct in allowlist mode: the same scan on a
   signed-out phone is a 404.
7. **[AL]** Afterwards, untick "Programa activo" for the test partner in
   `/admin/atletas/` so its pass page stops showing the chip and QR.

**If the login return must be tested in production before launch**, the
smallest safe option is to test it at the moment the mode becomes `all` for
launch, with the same steps on a signed-out phone B, rather than changing the
gate now: a sign-in redirect for signed-out visitors on `/pase/verificar/` in
allowlist mode would tell strangers the route exists, which the hard line's
real 404 forbids. The local e2e (`e2e/av/scanLogin.spec.ts`, mode `all`)
covers it until then.

### Feature names (`ATHLETE_VALUE_FEATURES`)

Comma-separated. Unset means every feature; set means exactly the listed ones,
and app admins are also limited to the listed ones
(`lib/features/athleteValue.ts:108-111,138`). There are exactly two names in
the code:

- **`athletes`** (`lib/features/athletesAttribution.ts:26`): the whole Tribe
  Athletes program. For signed-in, allowlisted users and app admins: the
  athlete home `/atletas/`, the gym dashboard, door list and settings under
  `/atletas/gym/{id}/`, the admin screen `/admin/atletas/`, the coach's
  door-confirm page `/pase/verificar/{code}/`, the "Atletas" cards on Home,
  Profile and the partner dashboard, and the APIs behind them. For everyone,
  on a partner whose program is switched on: the "Te invita" chip, the
  attributed consent and the voucher QR on `/pase/{slug}/`.
- **`pase`** (`app/pase/page.tsx:48`): the `/pase` catalog index, which today
  is a placeholder page. Not middleware-gated: when it is off, visitors get the
  ordinary not-found page.

**Decided by Al 2026-10-06: `ATHLETE_VALUE_FEATURES=athletes`.** It is the
program under test; `pase` adds only an unfinished placeholder.

### Post-merge cleanup (not blocking the merge)

Found while testing the athlete branch, owned by `main`, deliberately not
fixed there:

- [ ] **PostHog "initialized without a token" console error.**
      `lib/posthog.ts` (`initPostHog`, called from
      `components/PostHogProvider.tsx`) calls `posthog.init()` without checking
      that `NEXT_PUBLIC_POSTHOG_KEY` is set, so any environment without the key
      logs "[PostHog.js] PostHog was initialized without a token" on every page
      and the Next.js dev "Issues" badge counts it. Guard the init on the key.
      Seen on the local stack since T-AV28 removed the placeholder PostHog values
      from `.env.av.example`.
- [ ] **Proof helper retries a dev-server start once on the next/font
      Turbopack fault.** About 1 start in 10 of `scripts/av-dev.mjs` serves
      every request as 500 with "next/font/google queries have exactly one
      entry" (reproduced 2026-10-06, 1 failure in 10 back-to-back starts);
      `start_server` in `supabase/recon/devServer.LOCAL.sh` then waits out its
      180s and the arm reports DID NOT RUN. Detect that line in `dev.log`, stop
      the server and start it once more.
- [ ] **Email tests pin `EMAIL_MODE` instead of inheriting it from the
      environment** (`docs/T-AV20_RELEASE.md` section 6). With `EMAIL_MODE=log`
      loaded, the Resend factory returns its logging client and every test that
      mocks the Resend SDK fails, `main`'s own
      `lib/email/passLead.replyTo.test.ts` included.

---

## 8. Tribe Athletes (T-AV20 sub-program)

Checks specific to the Tribe Athletes tickets (T-AV19 to T-AV27) that cannot
be automated and were deferred to the gate on purpose.

- [x] Physical phone scan of a voucher QR on the LAN, coach confirms, athlete home updates.
      **PASSED 2026-10-06 on a real iPhone** (Al). Elena opened
      `/pase/verificar/BU-335T/` on the LAN at `192.168.8.230:3003`, tapped
      "Confirmar asistencia", then "Se inscribió", and saw "Guardado". On the
      Mac, Ana's home then read Invitados 10, Llegaron 10, Se inscribieron 1,
      and the guest (Denzel) showed the "Se inscribió" badge.
      Found during this test and fixed in T-AV29: the voucher QR encoded
      `http://localhost:3003/...`, which a phone cannot reach, so the scan
      never reached the pass and the URL had to be typed.
- [x] **T-AV29 closed 2026-10-06** (voucher QR and door link use the public
      origin; login returns to the pass). The LAN phone retest was skipped
      because the phone could not reach the Mac that day (network, not the
      app); Al accepted this evidence instead: - **BU-3BCA** (Claude's run, guest "Origen Prueba"): claimed through
      `http://localhost:3003/api/pase/` with Host `localhost:3003`; its QR
      decoded to `http://192.168.8.230:3003/pase/verificar/BU-3BCA/`. The row
      was wiped by the Spanish reseed that followed. - **BU-62HD** (Al's Cowork run, guest "Prueba Claude",
      `prueba.claude@av.local`): POST to `http://192.168.8.230:3003/api/pase/`
      with Host `localhost:3003`, slug `bullbox-prueba`, code `ANA-7KQ`;
      returned 200 and its QR decoded (OpenCV) to
      `http://192.168.8.230:3003/pase/verificar/BU-62HD/`. Verified in the
      local DB by Claude: the `pass_leads` row exists, created 11:36 UTC,
      with `referred_by_athlete_id` = program athlete `...2001`, which is Ana
      Prueba (`ana@av.local`, ref code `ANA-7KQ`, BullBox). - `t-av29-proof.LOCAL.sh` 2 of 2, the `scanLogin` e2e test (QR decoded
      module for module, login returns to the exact pass with `?via=code`
      kept, an off-site `returnTo` lands on this site), and mutation arms
      M1, M2, M3 and U1 all behaving (`t-av29-mutations.LOCAL.sh`).
- [x] **Send modes in Vercel production.** `EMAIL_MODE` and `PUSH_MODE` are unset (or exactly `live`) in the production project. Only the exact value `log` means log, so a stray value would silently stop every email and push on `main`.
      **Checked by Al 2026-10-06:** `EMAIL_MODE` not set and `PUSH_MODE` not set in Vercel Production; both mean live.
- [x] **`NEXT_PUBLIC_SITE_URL` in Vercel Production is the real production domain** (Al). Since T-AV29 the voucher QR and the door link are built from it first, so a wrong or preview value there would print a QR that sends coaches to the wrong site.
      **Checked by Al 2026-10-06:** set to the real production domain with https, applied to all environments.
      Note: because it applies to Preview too, a QR made on a preview deployment opens production. Accepted, no change.
- [x] **Renumber 8200 to 8209 against `origin/main`** at the moment of merging (CLAUDE.md, "A migration number is claimed by whoever merges first"). Rename, state in each header what it was and why it moved, and update every probe id in `supabase/verify-migration-state.sql` and every `migrations_applied` reference.
      **Numbers decided by Al 2026-10-06:** 8200 to 8209 become **201 to 210**, in the same order (8200 -> 201, ... 8209 -> 210). 194, 195 and 200 are skipped because unmerged branches already claim them (`chore/194-scrub-push-send-bearer`, `fix/s3-notification-forgery`, `hotfix/recap-report-policy`). In the same merge-day renumber commit, `supabase/avMigrationCheck.ts` is updated to recognize 201 to 210 as the T-AV set; the tripwire is kept, not deleted. **If any of 201 to 210 is taken on `origin/main` by merge day, stop and tell Al before renaming anything.**
      **Done 2026-10-06 in T-AV31** on `athlete/main`: files renamed, each header states its old number, every reference updated (`avMigrationCheck.ts` now lists 201 to 210 in `AV_RENUMBERED`; the tripwire is kept), and each of 201 to 210 now inserts its own `migrations_applied` row, as every migration since 184 does. `origin/main` was still `6b8df7ad` and none of 201 to 210 was taken. Re-check both on the day (section 6, step 1).
- [x] **Merge rehearsal, 2026-10-06** (`athlete/merge-rehearsal` at `d701e90a`, local only: `origin/main` `6b8df7ad` plus `athlete/main` `4f3f09c9`). One conflict, append-on-append in `supabase/verify-migration-state.sql`, resolved by keeping both blocks with no line of main's removed. On the merged tree: tsc clean, `test:complete` 314 of 314 files and 2820 tests, `test:e2e:av` green, every proof and mutation driver from t-av21 to t-av29 green. **Accepted by Al.** On merge day, re-run it only if `origin/main` has new commits since this rehearsal (its base `6b8df7ad`).
      Local limitation only, not a production concern: migrations 192 and 199 do not apply to the local dump, because the dump has no storage buckets or storage policies (the same reason main's own 090 and 091 probes read MISSING locally). Both abort on their own pre-flights there; neither touches an object the T-AV migrations touch.
- [x] **Apply 201 to 210 in order, each as one complete paste, AFTER the merge commit is on `main`** (CLAUDE.md, "the branch merges before the paste"), and record the commit each paste corresponds to.
      **Done 2026-10-07 by Al, from `b1734df3` (#192):** each "Success", verifier MISSING before and applied after (section 6).
      Two phases since T-AV31: see section 6, steps 4 to 8. The migrations merge first with no code that reads them; the code merges after they are applied and recorded.
- [ ] **D2 answered.** A Colombian lawyer has reviewed gym-to-athlete referral payments and Al has recorded the answer in the spec's decisions log. Blocking for turning the program on for a real gym.
      **2026-10-06: D2 tabled by Al. Does not block the merge; the program stays inactive for real gyms (allowlist only, no feature flipped for BullBox) until D2 is answered and recorded.**
- [ ] **The real BullBox program row is created by hand** through `/admin/atletas/` (or the admin route), never by a seed. `scripts/seed-bullbox.sql` is not touched.
- [ ] **One real push to a device.** An athlete with a real FCM or web-push subscription receives "{guest} arrived at class" once, after a real confirm. Log mode proved the path (`t-av27b-proof`); only a device proves delivery.
- [ ] **The owner's lead email in a real inbox (Gmail).** An attributed claim shows "Invitación de {athlete}" and a working "Confirmar en la puerta" link, and a plain claim's email is unchanged.
- [ ] **`npm run test:e2e:av` green on the merge-day tree**, both projects (flag on: the full loop; flag off: the real 404s).
- [ ] **Every T-AV proof and mutation driver re-run** on the merge-day tree: `supabase/recon/t-av21` to `t-av30` `-proof.LOCAL.sh` and `-mutations.LOCAL.sh`. A mutation proof expires when the code around it moves (CLAUDE.md).
- [x] **Read `docs/T-AV20_RELEASE.md` section 6** (the Spanish-only pass page, admins with the flag off, the pre-existing email-test environment dependency) and decide each item is acceptable for `main`.
      **Read and accepted by Al 2026-10-06, all four items:** the pass page stays Spanish only; app admins reach `/admin/atletas/` with the flag off; the email tests fail when `.env.av.local` is loaded; the keepalive and React streaming notes.

## Already measured, re-run from scratch 2026-09-25 (evidence, not a tick)

These were run during T-AV0 and are recorded so the gate starts from facts
rather than from memory. **None of them ticks a box above** — every one of them
expires, and the boxes are about the tree as it stands on merge day.

Everything below was re-run end to end on 2026-09-25 — database dropped and
reloaded, re-seeded, both snapshot arms re-captured — rather than copied
forward from the previous session's commit message.

- Local stack loaded from the production dump and verified object-by-object:
  97 tables, 6 views, 98 functions, 189 indexes, 52 triggers, 263 policies,
  313 constraints declared, **0 missing** (`npm run av:schema:verify`).
- The load itself enumerated, which `supabase db reset` will not do:
  `--no-seed` then psql with `ON_ERROR_STOP=0` into the same CLI-initialised
  database. **0 errors, 2298 successful command tags**, and the capture path
  proved able to report by feeding it four deliberate errors.
- Seeded: 7 accounts, BullBox (Prueba) with `pass_active = true`, 18 sessions
  (3 past, 15 upcoming), 24 confirmed joins, 7 rows through
  `users_discoverable` — counted in the database, not taken from the seed
  script's own report.
- Parity with `main` at the merge-base `6ff6eeef`, flag off, signed in as a
  seeded athlete: home, profile, session detail and nav **byte-identical**,
  6025 bytes compared, empty diff. With the flag on for an allowlisted user,
  `/pase/` and only `/pase/` differs. Re-runnable: `scripts/av-snapshot.mjs`.
- Per-user gating confirmed in one server process: `ana@av.local` (allowlisted)
  gets the catalog and `{"enabled":true}`, `beto@av.local` gets the 404 and
  `{"enabled":false}`.
- `npx tsc --noEmit` clean; `npm run test:complete` — **258 of 258 files, 2395
  tests, 0 failures**; `npx next build` exit 0 with `/pase` as `ƒ (Dynamic)`.

**Two things the re-run found that the first pass did not, both recorded in
docs/AV_LOCAL_STACK.md:**

1. **`is_instructor` was false on all seven seeded accounts.** The seed's
   `role` field reached the database only inside a bio string, so the two
   documented instructors were ordinary athletes and every instructor surface
   was legitimately empty. Fixed, and the seed now reads the role split back
   out of the database instead of reporting its own input.
2. **The snapshot instrument cannot see the HTTP status.** Measured
   separately: the gated `/pase/` answers **200** with the 404 page as its
   body, where `main`'s `/pase/` — a path with no route — answers **404**.
   This is not a leak the gate introduced: every `notFound()` in this app
   returns 200, on `main` too (`/g/no-such-gym-xyz/` → 200 on both). One
   clause in `app/pase/page.tsx`'s comment is wrong as a result — "the same
   response `/pase` gave before this file existed" — and should be corrected
   or dropped before merge. **Not a blocker; a false sentence in the file that
   explains the gate.**

**What is NOT covered by any of that:** the local database is production's
SHAPE, not its data, and `av:schema:verify` compares names, not definitions,
policy predicates, function bodies or grants. The role-by-role probe in section
2 is still the thing that has to be done by hand, against the real objects.
Two roles were exercised here — an allowlisted athlete and a non-allowlisted
one. **anon, instructor, a DIFFERENT instructor and app admin were not**, and
those are the four rows of section 2 that actually leak.

## Things T-AV0 changed in SHARED files, which this gate has to decide about

These are not athlete-value features. They are branch scaffolding that will
land on `main` with the merge unless someone takes them out, so they get
decided deliberately rather than discovered afterwards.

- [ ] **`package.json`: `pretest` and `pretest:complete` run `av:guard`.**
      `av:guard` FAILS on `main` by design — the branch check is the first
      thing it does. Left as is, `npm test` on `main` is red forever. Decide:
      remove both pre-scripts at the merge, or teach `av:guard` that `main`
      after the merge is allowed. **Removing them is the default.**
- [ ] **`package.json`: `db:*`, `av:*`, `dev:av`.** Harmless on `main` but they
      reference `.env.av.local`, which nobody else has. Keep or drop, say which.
- [ ] **`.githooks/` and the worktree-local `core.hooksPath`.** The hook
      directory is committed; the config that activates it is worktree-local
      (`git config --worktree`), so merging the files does not arm the hook
      anywhere else. Nothing to undo, but `extensions.worktreeConfig` is now
      true on this clone's `.git/config` — a property of the clone, not of the
      branch.
- [ ] **`middleware.ts`: `buildCsp()` appends the local Supabase origin.**
      Fires only for an `http:` URL on a loopback or RFC-1918 address, so a
      production URL — always https — adds nothing and the directive stays
      byte-identical. Asserted directly in `lib/features/athleteValueCsp.test.ts`
      and mutation-proven on four arms, including "protocol guard removed" and
      "private range widened". **This one should STAY after the merge:** it is
      what makes local and phone testing against the local stack possible at
      all, and without it the parity snapshot in this gate cannot be re-run.
      Read the https arm of that test before agreeing.
- [ ] **`middleware.ts`: `/api/features` in `publicApiPaths`.** Needed because
      "you are signed out, so no" is one of the flag's real answers. Goes when
      the flag goes.
- [ ] **`tsconfig.json`: `allowImportingTsExtensions: true`.** Needed because
      `supabase/avMigrationCheck.ts` is imported both by vitest and by node
      under `--experimental-strip-types`. Legal only with `noEmit`, which is
      set. Keep unless the migration check goes.
- [ ] **`supabase/config.toml`** (new file) with `[db.migrations] enabled =
false`. It configures the LOCAL stack only and has no effect on
      production, but it will read as "this repo's migrations are disabled" to
      the next person. Keep the explanatory comment with it or drop the file.
- [ ] **`lib/translationExtras.ts`**: four `av*` keys. Dead once the
      placeholder page goes; delete them with it.
- [ ] **`app/pase/page.tsx`** is a SERVER component in an app where every other
      page is `'use client'`. It must stay a server component — the gate is the
      reason it exists — but `/pase/[slug]` is live and ungated and must be
      re-checked as unaffected after the merge, on a phone.
