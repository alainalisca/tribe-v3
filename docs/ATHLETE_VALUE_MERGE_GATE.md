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

## 6. Order of operations on the day

- [ ] Manual production backup taken. **ID recorded here:** `________`
- [ ] Al's written instruction received.
- [ ] `git merge` — the merge happens FIRST.
- [ ] Only then are the migrations pasted into the SQL editor, each as a
      COMPLETE file, one paste per file, naming the commit on `main` the pasted
      text corresponds to. A partial paste is the one way to get a partial
      apply and it is entirely under the paster's control.
- [ ] `supabase/migrations_applied.json` and the applied-migrations list inside
      `verify-migration-state.sql` updated, and `verify-migration-state.sql`
      run to confirm the two agree with `public.migrations_applied`.

## 7. After the merge

- [ ] `ATHLETE_VALUE_ENABLED=allowlist` in Vercel production, with Al, Ana and
      the two named test accounts and nobody else.
- [ ] Dark phase of **at least 7 days** in the real iOS and Android apps with
      the allowlist accounts.
- [ ] Al flips each feature, one at a time, in writing
      (`ATHLETE_VALUE_FEATURES`).

---

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
