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

`npm run db:reset` loads it. `npm run av:seed` then writes the rows. Measured
after both, against the database rather than against the scripts' own output:

| object                         | count |
| ------------------------------ | ----- |
| public tables                  | 97    |
| public views                   | 6     |
| public functions               | 98    |
| policies                       | 263   |
| triggers (non-internal)        | 52    |
| indexes                        | 333   |
| auth users / public.users      | 7 / 7 |
| featured_partners, pass_active | 1     |
| sessions (3 past, 15 upcoming) | 18    |
| confirmed session_participants | 24    |

Test accounts are `ana@`, `beto@`, `caro@`, `diego@` (athletes), `elena@`,
`felipe@` (instructors) and `bullbox@` (the gym), all `@av.local`, all with the
password `tribe-local-1234`. `ana@av.local` is the id in
`ATHLETE_VALUE_ALLOWLIST` in `.env.av.example`.

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
