# The T-AV local stack

T-AV0, Step 4. Everything this program tests before the merge runs here, not
against production.

```bash
npm run db:start      # supabase start, through av-guard
npm run db:status     # ports and keys
npm run av:schema:pull # production -> supabase/av-local-schema.sql   (see BLOCKED below)
npm run db:reset      # drop, re-apply the dump
npm run av:seed       # fake athletes, instructors, BullBox (Prueba), sessions
npm run dev:av        # next dev on :3001 with .env.av.local
npm run db:stop
```

| service    | url                                            |
| ---------- | ---------------------------------------------- |
| API        | http://127.0.0.1:54321                         |
| Postgres   | postgresql://postgres:postgres@127.0.0.1:54322 |
| Studio     | http://127.0.0.1:54323                         |
| Mail (all) | http://127.0.0.1:54324                         |
| App        | http://127.0.0.1:3001                          |

Verified running 2026-09-25 with Docker 29.8.0 and Supabase CLI 2.58.5. The CLI
prints an upgrade notice for 2.118.0 on every command; **2.58.5 was sufficient
for every step here** and was deliberately not upgraded.

Phone testing: put the Mac and the phone on the same Wi-Fi and open
`http://<mac-lan-ip>:3001/`. Email and password accounts only — the local
stack's mailbox catches everything, so confirmation links work. OAuth and
native push are Step 7's post-merge dark phase, not this.

---

## BLOCKED: the schema is not production's, and nothing here can fix that

`npm run av:schema:pull` FAILS as of 2026-09-25, so **the local database has no
application schema at all.** Two measurements, not inferences:

```
$ supabase projects list
Unexpected error retrieving projects:
  {"message":"Missing required permission(s): projects_read", ...}

$ supabase db dump --linked
Cannot find project ref. Have you run supabase link?
```

The PAT at `~/.supabase/access-token` cannot read the project list, so
`supabase link` cannot run, so `db dump` has nothing to dump from. `db dump`
also needs a real Postgres connection, which is a database password, not an API
token.

**Either of these unblocks it, and both need Al:**

1. a PAT carrying `projects_read`, plus the project's database password —
   `supabase link --project-ref <ref>` then `npm run av:schema:pull`
2. the direct connection string —
   `SUPABASE_DB_URL='postgresql://...' npm run av:schema:pull`

Until one of them exists, `npm run av:seed` stops on its first table with a
message saying exactly this, rather than inserting what it can.

## Replaying supabase/migrations/ is NOT a workaround. Measured, not assumed.

The obvious substitute is to build the schema from the repo's own migrations.
It was tried, on 2026-09-25, against a clean local database:

| attempt                                      | applied | failed |
| -------------------------------------------- | ------- | ------ |
| migrations alone                             | 43      | 160    |
| `supabase/schema.sql` first, then migrations | **124** | **79** |

The first run fails from migration 010 onward with `relation "users" does not
exist`: the early migrations assume `schema.sql` was applied first, and
`schema.sql` is not a migration. Applying it first gets much further and still
leaves 79 files unapplied, with the failures cascading — one missing column
early takes out every later file that reads it. The leftovers include
`function public.is_app_admin() does not exist`, which is the RPC the
`athlete_value` flag's admin path calls.

**A database in that state is worse than an empty one.** It has most of the
tables, so code runs and queries return rows, and it is missing an unknown
subset of columns, functions, policies and triggers — so a test passing against
it is a confident answer about a database that exists nowhere. The local DB was
reset to empty rather than left in that state.

This is not a surprise, it is the thing CLAUDE.md already says: production holds
objects that exist in no migration here (`protect_verified_instructor()` is
live, `SECURITY DEFINER`, and in no file in this repo; `public.users` has at
least six policies in production against two here). A replayed database is
missing live security controls, so gate testing against it would produce a
green result about protections that are not there.

## What therefore HAS and HAS NOT been shown

- **Shown:** the stack starts and is healthy; `db reset` works; the seed
  script's refusal fires against a non-local URL; the `athlete_value` gate's
  HTTP behaviour, which reads auth and environment only and needs no
  application schema.
- **Not shown:** anything that requires rows — the seeded athletes, the
  BullBox (Prueba) partner, sessions, joins, attendance, or a Playwright
  snapshot of home / profile / session detail against `main`.

Say which of the two any future report rests on. A local pass against a
different schema is a confident answer about the wrong database.
