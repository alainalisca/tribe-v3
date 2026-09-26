# The T-AV local stack

T-AV0, Step 4. Everything this program tests before the merge runs here, not
against production.

```bash
npm run db:start          # supabase start, through av-guard
npm run db:status         # ports and keys
npm run av:schema:pull    # production -> supabase/av-local-schema.sql (needs credentials; see below)
npm run db:reset          # drop, re-apply the dump
npm run av:schema:verify  # did the dump actually land? db reset will not tell you
npm run av:seed           # fake athletes, instructors, BullBox (Prueba), sessions
npm run dev:av            # next dev on :3001 with .env.av.local
npm run db:stop
```

| service    | url                                            |
| ---------- | ---------------------------------------------- |
| API        | http://127.0.0.1:54321                         |
| Postgres   | postgresql://postgres:postgres@127.0.0.1:54322 |
| Studio     | http://127.0.0.1:54323                         |
| Mail (all) | http://127.0.0.1:54324                         |
| App        | http://127.0.0.1:3001                          |

Verified running 2026-09-26 with Docker 29.8.0 and Supabase CLI 2.58.5. The CLI
prints an upgrade notice for 2.118.0 on every command; **2.58.5 was sufficient
for every step here** and was deliberately not upgraded.

Phone testing: put the Mac and the phone on the same Wi-Fi and open
`http://<mac-lan-ip>:3001/`. **Point `NEXT_PUBLIC_SUPABASE_URL` at the Mac's
LAN address too** (`http://<mac-lan-ip>:54321`) — from the phone, `127.0.0.1`
is the phone, and the app would be talking to nothing. Email and password accounts only — the local
stack's mailbox catches everything, so confirmation links work. OAuth and
native push are Step 7's post-merge dark phase, not this.

---

## Current state: loaded and seeded

Al pulled the production schema on 2026-09-26. `supabase/av-local-schema.sql`
is 436,584 bytes and is gitignored — it is a copy of production's shape at a
moment in time, it goes stale, and a committed copy would be read as
authoritative.

`npm run db:reset` loads it. `npm run av:seed` then writes the rows.

Measured after both, against the database rather than against the scripts' own
output, and re-measured 2026-09-25 after a full drop, reload and re-seed.
**The predicate is part of each number**, because two of these are counts that
change meaning without it:

| object                          | count | counted as                              |
| ------------------------------- | ----- | --------------------------------------- |
| public tables                   | 97    | `pg_tables where schemaname='public'`   |
| public views                    | 6     | `pg_views where schemaname='public'`    |
| public functions                | 98    | `pg_proc` joined to namespace `public`  |
| policies                        | 263   | `pg_policies`, all schemas              |
| triggers (non-internal)         | 52    | **`public` only** — see below           |
| indexes                         | 333   | `pg_indexes where schemaname='public'`  |
| auth users / public.users       | 7 / 7 | both tables                             |
| of those, `is_instructor`       | 2     | elena@, felipe@                         |
| featured_partners, pass_active  | 1     | `where pass_active`                     |
| sessions (3 past, 15 upcoming)  | 18    | `date < current_date` / `>=`            |
| confirmed session_participants  | 24    | `where status='confirmed'`              |
| rows through users_discoverable | 7     | the production view, not the base table |

**Triggers is the one that bites.** Database-wide the answer is **60**; the 52
above is `public` alone. The other eight belong to `storage` (7) and
`realtime` (1) and are created by the CLI's own "Initialising schema" step, not
by the dump — the same boundary that made the `av_probe` attempt below report
456 imaginary errors. `av:schema:verify` says 52 because it counts what the
dump DECLARES, which happens to coincide; the two numbers agreeing is not the
same fact twice.

The index row is the mirror image: 333 exist in `public`, and
`av:schema:verify` declares 189, because constraint-backed indexes arrive with
their constraints rather than as `CREATE INDEX`.

Test accounts are `ana@`, `beto@`, `caro@`, `diego@` (athletes), `elena@`,
`felipe@` (instructors) and `bullbox@` (the gym), all `@av.local`, all with the
password `tribe-local-1234`. `ana@av.local` is the id in
`ATHLETE_VALUE_ALLOWLIST` in `.env.av.example`.

### The two instructors were instructors in the prose and not in the column

Re-measured 2026-09-25: `is_instructor` was **false on all seven accounts**.
`PEOPLE` carries a `role` field, and until now that field reached the database
only inside the bio STRING -- `seedProfiles()` wrote `id, email, name, bio,
location, sports` and nothing else. So this document named elena@ and felipe@
as the instructors, the script's own header said it creates instructors, and
`lib/dal/admin.ts` -- which filters on `is_instructor` -- had nobody to return.

An empty instructor surface over a correctly-seeded database looks exactly
like a working filter over a dataset that happens to have no instructors.
Nothing fails, and the thing you are testing is the thing that is missing.

Fixed by writing the column the app gates on. Verified against the database
rather than the seed's report:

| account         | is_instructor | is_verified_instructor |
| --------------- | ------------- | ---------------------- |
| elena@av.local  | true          | false                  |
| felipe@av.local | true          | false                  |
| the other five  | false         | false                  |

`is_verified_instructor` is deliberately still false everywhere.
`protect_verified_instructor()` -- live in production, in no migration in this
repo, present locally only because the schema came from a dump -- makes that
an admin-only write. Seeding it would create a state the app cannot produce.

**And the seed's own report was the reason this survived.** It printed
`profiles 7`, which was true, and was `rows.length` -- the length of an array
the script had just built -- under a comment claiming to print what was
WRITTEN. It now reads the role split back out of the database, so the line can
disagree with the intent that produced it.

## `supabase db reset` SUCCEEDS SILENTLY. Do not read its exit code as a load.

Loading a 436 KB dump printed `Seeding data from supabase/av-local-schema.sql`,
`Finished supabase db reset`, exit 0, and **no per-statement output at all**. A
dump that half-applied would look exactly the same. That is why
`npm run av:schema:verify` exists: it reads every object the dump DECLARES and
asks the catalog whether it is there, and it prints the per-kind counts rather
than a bare PASS.

```
  table       declared   97   missing   0
  view        declared    6   missing   0
  function    declared   98   missing   0
  index       declared  189   missing   0
  trigger     declared   52   missing   0
  policy      declared  263   missing   0
  constraint  declared  313   missing   0
```

It compares **names**, not definitions. An object present under the right name
with the wrong body passes. Proven able to fail by appending three
non-existent objects to a COPY of the dump and watching it name all three.

### How to actually SEE the load errors, without the bare-database trap

`av:schema:verify` answers "is every object there". It does not answer "did any
statement fail", and those are different questions -- a statement can fail
while leaving the object it touches present under the right name. To enumerate
the failures, reproduce the seed step under psql **in the database the CLI has
already initialised**:

```bash
supabase db reset --no-seed        # CLI-initialised: auth, storage, realtime, roles, empty public
psql "$SUPABASE_DB_URL_LOCAL" -v ON_ERROR_STOP=0 --echo-errors \
     -f supabase/av-local-schema.sql > load.out 2> load.err
```

`--no-seed` is what makes this honest. It is the same database, with the same
`auth`/`storage`/`extensions`/`graphql` schemas and the same
`supabase_realtime` publication -- which is precisely what the `av_probe`
attempt above lacked, and why that one invented 456 errors.

Measured 2026-09-25: **0 errors, 0 bytes on stderr, 2298 successful command
tags.**

| tag                                                             | n       | tag                      | n   |
| --------------------------------------------------------------- | ------- | ------------------------ | --- |
| GRANT                                                           | 816     | CREATE TABLE             | 97  |
| ALTER TABLE                                                     | 508     | COMMENT                  | 88  |
| CREATE POLICY                                                   | 263     | CREATE TRIGGER           | 52  |
| CREATE INDEX                                                    | 189     | REVOKE                   | 41  |
| CREATE/ALTER FUNCTION                                           | 98 each | ALTER DEFAULT PRIVILEGES | 12  |
| CREATE VIEW / ALTER VIEW / ALTER PUBLICATION / CREATE EXTENSION | 6 each  | SET                      | 11  |

**A silent stderr and a broken capture path look identical, so the capture was
proved able to report.** Four deliberate errors were fed to the same command
-- duplicate table, undefined table, undefined table in a `CREATE POLICY`,
undefined column in a foreign key -- and all four surfaced. Re-run with the
dump's own `SET client_min_messages = warning` prepended: still 4 of 4, so
that setting suppresses NOTICE and not ERROR. The first of those four also
fails with `relation "users" already exists`, which independently proves the
dump had landed.

Two things that could have swallowed an error were checked rather than
assumed: the dump has **no top-level `DO` blocks**, and its three
`EXCEPTION WHEN` handlers are all inside `CREATE FUNCTION` bodies, where they
are stored text at load time and cannot catch anything during the load.

### The probe that was wrong first, because the shape recurs

The first attempt replayed the dump into a fresh `av_probe` database with
`ON_ERROR_STOP=0` and counted errors. It reported **456**: 240
`relation does not exist`, 206 `schema does not exist`, 6
`publication does not exist`, 3 `policy does not exist`, 1 `permission denied
for pg_read_file`.

Every one of those is a property of the probe. `create database av_probe` gives
a bare Postgres with no `auth`, `storage`, `extensions` or `graphql` schema and
no `supabase_realtime` publication — those come from the CLI's own
"Initialising schema" step, which only runs for the database it manages. **A
dump that applied perfectly would have produced the same 456.** Reported as a
finding, it would have read as a broken schema.

## The CSP blocked every browser request to the local stack

`connect-src` allowed `https://*.supabase.co`, which is every Supabase project
except the one in Docker on this Mac. Measured 2026-09-26: signing in through
the app returned **"No account found with these credentials"** while the same
credentials returned a token to `curl` in the same second.

A CSP refusal is not reported as a refusal anywhere anyone looks. It surfaces
as a failed fetch, which the auth form maps to its friendliest error — so the
symptom pointed at the data and the cause was in a header. Step 4.6 of the
ticket, opening the app on a phone against the local stack, was impossible
until this was fixed, not merely awkward.

`buildCsp()` in `middleware.ts` now appends the configured Supabase origin
(and its `ws://` form) **only for an `http:` URL on a loopback or RFC-1918
address**. Production Supabase is always https, so the protocol condition alone
makes this unable to widen a production CSP by one character, whatever the
hostname — which is a much easier property to check than reasoning about which
hostnames are safe. Asserted directly in `lib/features/athleteValueCsp.test.ts`
and mutation-proven on four arms.

**Loopback alone was the first version of this rule, and it was wrong.** Step
4.6 is phone testing, and from the phone `127.0.0.1` is the phone — so
`.env.av.local` has to name the Mac's LAN address, which is not loopback. A
loopback-only check would have silently re-broken the exact case it was
extended for, and it was caught by writing the phone instruction down and
noticing it could not be true.

**A checkout of `main` needs the same allowance before it can sign in.** That
matters for the parity snapshot below: without it you compare a signed-in app
against a signed-out one, which diffs loudly and means nothing.

## Parity with main, flag off — the check, and how to re-run it

`scripts/av-snapshot.mjs` signs in as a seeded athlete and captures the visible
text and the navigation structure of home, profile, session detail and `/pase/`.
Run it against both servers and diff. Both must point at the SAME local
database; two databases produce row-level noise that hides the thing being
looked for.

Result on 2026-09-26, `athlete/main` with `ATHLETE_VALUE_ENABLED=off` against
`main` at the merge-base `6ff6eeef`: **no differences at all.** With the flag
set to `allowlist` and `ana@av.local` in it, exactly one surface differs —
`/pase/` — and the other three plus the nav stay byte-identical.

It captures text and structure, not pixels: dev-mode markup carries build ids
and chunk hashes that differ between two servers started seconds apart, and a
pixel diff over antialiased text produces differences that mean nothing.

### Re-run 2026-09-25, and the three traps that are not in the recipe above

Both arms reproduce. Flag off: **no differences at all**, 6025 bytes compared.
Flag on with ana allowlisted: exactly one block differs, `/pase/`, and home,
profile, session detail and the nav stay byte-identical.

```
 === pase (T-AV gated) (/pase/) ===
-NAV: A:/:Home | A:/messages/:Messages | ... | A:/profile/:Profile
-TEXT: 404 Page not found This link doesn't exist or is no longer available. ...
+NAV:
+TEXT: Preview Pass catalog Gyms and studios you can train at with your Tribe pass. ...
```

Per-user gating, in ONE server process, flag `allowlist` holding ana's id only:
`ana@av.local` -> `{"enabled":true}` and the catalog; `beto@av.local` ->
`{"enabled":false}` and the 404.

**Trap 1 -- a leftover dev server answers, and the arm passes for the wrong
reason.** Arm 2 first reported **no differences**, which reads as "the flag
does nothing". It was not the flag: `:3011` was still held by a server from an
earlier run and the newly-launched one had died on `EADDRINUSE`. The snapshot
dutifully captured the old server. **`nohup ... &` returning 0 is not a server
starting**, and a successful HTTP 200 from the port proves only that
_something_ is listening. Kill by port, assert the port is free before
launching, and assert `EADDRINUSE` is absent from the log afterwards --
all three, because the first two do not catch a server that dies after binding.

**Trap 2 -- one directory cannot run two `next dev`.** The second fails with
`Unable to acquire lock at .next/dev/lock`. If the worktree already has a dev
server on `:3001`, materialise the branch elsewhere rather than killing
someone else's process: `git archive <commit> | tar -x -C <dir>`. That also
leaves the locked worktree untouched, which `git worktree add` would not.

**Trap 3 -- Turbopack rejects a symlinked `node_modules`.**
`Symlink node_modules is invalid, it points out of the filesystem root`, and it
is a FATAL panic, not a warning. Use `cp -c -R node_modules <dir>` instead --
APFS clonefile, so 926 MB costs almost no space and a few seconds. Check first
that the branch did not change dependencies (here `dependencies`,
`devDependencies` and `package-lock.json` are all identical to the merge-base,
which is why sharing them is legitimate at all).

### What this instrument CANNOT see: the HTTP status

`av-snapshot.mjs` captures `document.body.innerText`, the nav, and
`location.pathname`. It never reads the response status, so two pages with
identical text and different status codes diff as identical. Measured
separately, on a production build (`next build && next start`), because it is
the axis the snapshot is blind to:

| request                             | branch | main |
| ----------------------------------- | ------ | ---- |
| `/pase/` signed out                 | 200    | 404  |
| `/pase/` signed in, not allowlisted | 200    | 404  |
| `/g/no-such-gym-xyz/`               | 200    | 200  |
| `/pase/no-such-slug-xyz/`           | 200    | 200  |

**Read the bottom two rows before drawing a conclusion from the top two.**
Every `notFound()` in this app returns **200 with the 404 page as its body**,
on `main` as much as on the branch -- `app/not-found.tsx` rendered from a
dynamic route. Only a path with no route at all returns a real 404, which is
what `main`'s `/pase/` is.

So the gated refusal is indistinguishable from every other "this does not
exist" answer the app gives, which is the property that matters, and it is
**not** something T-AV0 introduced. What is wrong is one clause in
`app/pase/page.tsx`'s comment: "the same response `/pase` gave before this
file existed". Before the file existed `/pase/` had no route and returned 404;
now it returns 200. The weaker claim in the same comment -- "the app's
ordinary 404" -- is exactly right.

The first version of this finding was going to be reported as a status-code
leak in the gate. The two rows that make it a pre-existing app-wide property
cost one extra command.

## Replaying supabase/migrations/ is NOT a substitute for the dump. Measured.

Kept because the next person will think of it. Against a clean local database:

| attempt                                      | applied | failed |
| -------------------------------------------- | ------- | ------ |
| migrations alone                             | 43      | 160    |
| `supabase/schema.sql` first, then migrations | 124     | 79     |

The first fails from migration 010 onward with `relation "users" does not
exist`: the early migrations assume `schema.sql` was applied first, and
`schema.sql` is not a migration. The leftovers in the second include
`function public.is_app_admin() does not exist` — the RPC the `athlete_value`
flag's admin path calls.

A database in that state is worse than an empty one: most tables present, an
unknown subset of columns, functions and policies missing, so code runs and
queries return rows and a test passing against it is a confident answer about a
database that exists nowhere. CLAUDE.md already says why —
`protect_verified_instructor()` is live, `SECURITY DEFINER`, and in no file in
this repo.

## Refreshing the dump later

`npm run av:schema:pull` needs a Postgres connection, not just an API token.
The PAT at `~/.supabase/access-token` lacks `projects_read`, so
`supabase link` cannot run. Either of these works:

1. a PAT with `projects_read` plus the database password —
   `supabase link --project-ref <ref>` then `npm run av:schema:pull`
2. `SUPABASE_DB_URL='postgresql://...' npm run av:schema:pull`

It is read-only: `db dump` reads, and T-AV0's hard line permits read-only recon
before the merge and nothing else.
