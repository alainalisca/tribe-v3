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
   `origin/main` is still `6b8df7ad` (if it moved: re-run the merge rehearsal,
   merge it into `athlete/main` the way `37fb2293` did, and re-run everything
   before going on). Confirm none of 201 to 210 is taken on `origin/main` (if
   one is: stop and tell Al; nothing is renamed again without his decision).
   Confirm 199 is recorded in `supabase/migrations_applied.json` on `origin/main`
   (it is not as of `6b8df7ad`; `chore/record-199-applied` exists for that), or
   step 5 will show a GUARD_184 row MISSING for 199 that has nothing to do with
   this program. `npm run av:guard`. Report all of it to Al.
2. **[AL] Take the production backup.** Supabase Dashboard, the production
   project, **Database > Backups** (the procedure in `docs/WEEK_1_MISSIONS.md`).
   Take a manual backup and copy the backup's identifier and timestamp exactly as
   that page shows them into this line: **Backup ID and time:** `________`. If
   the page offers no manual backup on our plan, record the newest daily
   backup's timestamp instead and say so in this line, because that restore
   point is older than the morning's data.
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
   example `201: show-up columns added, claim policy closed, door read and
confirm installed.`) and no error. **If any file raises an error, nothing
   from that file was applied: stop, do not paste the next one, and send the
   error to Claude Code.** Never paste part of a file (CLAUDE.md, per-paste
   atomicity). Each file also records itself in `public.migrations_applied`.

7. **[AL] Verify AFTER the pastes.** Run the whole verifier again. **Good
   result:** every row from 201 to 210 reads `applied`, nothing else changed
   from step 5, and `GUARD_184_mirror_matches_applied_table` reads `MISSING --
this database has recorded a migration the JSON mirror omits`. That last one
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
     `select id, email from auth.users where email in ('<Al>', '<Ana>', '<test 1>', '<test 2>');`
     Al's email is the one Al signs in to Tribe with.
   - **Set them.** Vercel, the project's **Settings > Environment Variables**,
     **Production** environment only:
     `ATHLETE_VALUE_ENABLED` = `allowlist`;
     `ATHLETE_VALUE_ALLOWLIST` = the four UUIDs, comma-separated (UUIDs, not
     emails; Al's must be in it);
     `ATHLETE_VALUE_FEATURES` = the one feature Al has chosen in writing. Do not
     leave `ATHLETE_VALUE_FEATURES` unset: unset means every feature. None of
     the three may be `NEXT_PUBLIC_`. No redeploy is needed now; the phase 2
     push in step 11 is the deployment that picks them up.
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
      the flag-off e2e project and `t-av24-proof`. The public pass page
      `/pase/{slug}/` looks as it does today: a signed-out visitor is off unless
      the mode is literally `all` (`lib/features/athleteValueServer.ts:30-32`),
      so no "Te invita" chip and no voucher QR. The shared-file changes listed
      under "Things T-AV0 changed in SHARED files" below have no visible effect.
    - **The four allowlisted accounts:** the feature named in
      `ATHLETE_VALUE_FEATURES`, and nothing else.
    - **App admins:** every program surface, whatever the variables say (the
      admin rule above). Al is an app admin.
12. **[AL] Verify once more and smoke-test.** Run the verifier: every row
    `applied` or a known status, `GUARD_184_mirror_matches_applied_table` now
    `applied`. Open `/atletas/` signed in as an ordinary (non-admin,
    non-allowlisted) account: a 404. Open a real `/pase/{slug}/` page signed
    out: unchanged from before today.
13. **[AL] Section 7 begins:** the dark phase of at least 7 days, including the
    real voucher scan on production.

## 7. After the merge

- [ ] `ATHLETE_VALUE_ENABLED=allowlist` in Vercel production, with Al, Ana and
      the two named test accounts and nobody else.
- [ ] Dark phase of **at least 7 days** in the real iOS and Android apps with
      the allowlist accounts.
- [ ] During the dark phase: scan one real voucher QR with an iPhone camera
      on production and confirm it opens `/pase/verificar/` on the production
      domain, then the login return (signed out, sign in, back on the same
      pass). T-AV29 proved this on the local stack only.
- [ ] Al flips each feature, one at a time, in writing
      (`ATHLETE_VALUE_FEATURES`).

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
- [ ] **Apply 201 to 210 in order, each as one complete paste, AFTER the merge commit is on `main`** (CLAUDE.md, "the branch merges before the paste"), and record the commit each paste corresponds to.
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
