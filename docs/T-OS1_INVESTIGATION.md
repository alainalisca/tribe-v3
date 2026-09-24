# T-OS1 Step 0 — Investigation

**Branch:** `feat/t-os1-visits`, cut from `tribe-os/main`.
**Date:** 2026-09-24. **Scope:** Step 0 only. No feature code, no migrations.
**Guard:** `npm run os:guard` → `os-guard OK: branch=tribe-os/main migrations=0 A / 0 held email=log ai=fake` (exit 0), run before anything else per T-OS0 rule 6.

Two spec filenames in the kickoff prompt do not exist as written — the real paths are
`docs/tribe-os/T-OS0_...` and `T-OS1_...`, without a `Claude_Code_` prefix. Both were read in full.

---

## Item 1 — Database state (SQL written, NOT run)

Script: **`docs/T-OS1_STEP0_PROBE.sql`**, 237 lines. Al runs it; this branch never connects to the database.

**Confirmed read-only.** Executable lines (comments stripped) contain no `INSERT`, `UPDATE`, `DELETE`,
`DROP`, `ALTER`, `CREATE`, `GRANT`, `REVOKE`, `TRUNCATE`, `MERGE`, `CALL` or `DO`. Verb census:
18 × `SELECT`, 1 × `WITH`, plus `BEGIN` / `ROLLBACK`. The wrapper is transaction control, writes
nothing, and is there only because the house rule puts every production probe inside one.

Two design notes:

- **One statement, not many.** The Supabase SQL editor renders only the _last_ result set, so a
  script of several SELECTs would silently discard all but the final one. Everything returns as a
  single `jsonb_pretty(...)` row.
- **`information_schema` is used for column inventory only, never for privileges.** DRIFT-04
  records that `information_schema.*_privileges` cannot see table-level grants and returns false
  passes; column existence is a different question, and migration 067 itself uses this view for it.
- **No emails are selected.** Al's row is located _by_ email but only its id and status come back.

### A prediction the script will test, and why it matters

`migrations_applied` (migration 184) was created on 2026-09-21 and **backfilled only 179–184**.
Nothing from 056–085, 153, 158, 166 or 167 was ever recorded in it.

So the ticket's first question — "which Tribe.OS migrations are recorded in `migrations_applied`" —
is expected to return **zero rows**, and that is the correct answer rather than a fault. The real
evidence for this range is object existence, which is why the script checks 15 relations,
16 functions, 19 columns and 6 triggers directly via `to_regclass`, `pg_proc`, `pg_trigger` and
`information_schema.columns`. If rows _do_ come back, the ledger has been extended since and that
is news worth knowing.

### A premise of the whole ticket, verified in the repo

`client_attendance.session_id` is **`uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE`**
(062:134), with `UNIQUE (client_id, session_id)` (062:151).

A Mira visit has no Tribe session. It therefore cannot be recorded in `client_attendance` without
either relaxing that NOT NULL — a change to an existing table, **Class B**, held to the merge gate —
or inventing `sessions` rows, which the consumer app lists. **A new table is the only Class A route.**
The spec's Step 1 is sound for the right reason.

---

## Item 2 — Code map: what the branch must never write (T-OS0 rule 3)

| Owner                                                    | Writes                                                                      | Columns / rows                                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `refresh_client_attendance_counters()` — trigger fn, 079 | `clients`                                                                   | `total_sessions`, `sessions_last_30_days`, `current_streak_days`, `longest_streak_days` (079:95-101)  |
| `persistMemberScore()` — `lib/ai/data-access.ts:233`     | `clients`                                                                   | `churn_risk_score`, `churn_risk_updated_at`, `health_status`, and optionally the three counters above |
| `insight-generator.ts`                                   | `community_insights` (:120, :257), `community_insight_members` (:160, :292) | inserts                                                                                               |
| `upsert_training_partners_on_attendance()` — 076         | `training_partners`                                                         | trigger on `client_attendance` insert + update                                                        |
| `sync_client_last_seen()` — 072                          | `clients`                                                                   | `last_seen_at`, trigger on `client_attendance`                                                        |
| `audit-watchdog` cron                                    | `gym_audit_log` (:290)                                                      | inserts                                                                                               |
| `reconcile-counters` cron                                | via `rpc('recompute_all_total_sessions_hosted')`                            | recomputes counters nightly                                                                           |

**Reads only:** `fetchChurnSignals` (`lib/ai/data-access.ts`) reads `clients (id, gym_id, created_at, last_seen_at)`
and `client_attendance (id, attended, attended_at)`. It writes nothing.

**Six triggers fire on `client_attendance`** — `client_attendance_sync_last_seen`,
`training_partners_on_attendance_insert` / `_update`, `attendance_counters_on_insert` / `_update` / `_delete`.
This is the concrete reason the new `client_visits` table must be separate rather than a new row
shape in `client_attendance`: an insert there fires all six and mutates four `clients` columns that
main's nightly cron also owns. The script verifies all six exist and are enabled.

**Therefore the branch writes only:** `client_visits`, `client_imports`, `gym_import_mappings`,
`client_retention_v2`, `client_touches`, and the five new nullable `clients` columns from Step 2
(`external_source`, `external_id`, `joined_on`, `membership_plan`, `plan_ends_on`) — none of which
any main code path reads or writes.

---

## Item 3 — Retention UX walkthrough: BLOCKED, need input

Not attempted. It needs a running app, a login and a gym, none of which I can obtain without
creating identities — forbidden by T-OS0 rule 5. Required before I can do this:

1. **Which account to log in as.** T-OS0 rule 5 says test identities are existing accounts Al names.
   I need the email, and for Al to sign in himself if the password should not pass through me —
   I will not enter credentials.
2. **Which gym.** A `gyms` row id or slug for the test gym. Item 1's `gyms` block will list the
   candidates; if none is suitable, say which to use.
3. **Whether seeding is allowed, and by what route.** The spec says "seed it". Seeding members and
   attendance writes to `clients` and `client_attendance` — both Tribe.OS-owned, so Class A in
   spirit, but inserting into `client_attendance` **fires all six triggers above and mutates
   `clients` counters**, which main's cron also writes. I will not seed attendance without an
   explicit decision. Seeding `clients` alone is inert and safe.
4. **Confirmation that `npm run dev` in this worktree is acceptable**, and on which port, given the
   main app may already hold 3000.

One answer this walkthrough is meant to produce can already be given from the code:
**"contacted" is tracked nowhere.** No table, column or write path records a WhatsApp tap. The
`wa.me` deep link in `/os/intelligence` opens a URL and nothing else. `community_insights.is_actioned`
(`lib/dal/communityInsights.ts:199`) is the nearest thing and it marks an _insight_ dismissed, not a
_member_ contacted. Step 4's `client_touches` table has no existing equivalent to migrate from.

---

## Item 4 — Import today

**`lib/csv/parseClientsCSV.ts` accepts**, case-insensitively, with aliases:

| field          | accepted headers                                      | required                              |
| -------------- | ----------------------------------------------------- | ------------------------------------- |
| `name`         | `name`, `full name`, `client name`                    | **yes** — missing name is a row error |
| `email`        | `email`, `email address`                              | no                                    |
| `phone`        | `phone`, `phone number`, `mobile`, `whatsapp`         | no                                    |
| `status`       | `status` — one of `active`/`inactive`/`lead`/`lapsed` | no                                    |
| `notes`        | `notes`, `note`                                       | no                                    |
| `tags`         | `tags`, `tag` — comma-separated within the cell       | no                                    |
| `health_notes` | `health notes`, `health_notes`, `medical`             | no                                    |

Unknown columns are ignored with a one-time warning row.

**It inserts. It does not upsert.** `createClientsBulk` (`lib/dal/clients.ts:323`) ends in
`.from('clients').insert(payload).select(...)` — no `upsert`, no `onConflict`. And `clients` carries
**no unique constraint on `(gym_id, email)` or `(gym_id, phone)`**; the only UNIQUE in 062 is
`unique_client_session` on `client_attendance`.

**So re-importing the same file creates a second full set of duplicate client rows.** Nothing
detects it, nothing reports it, and there is no undo beyond the purge route. This is worth stating
plainly because T-OS1 success criterion 1 requires "re-import reports 0 inserted, 0 duplicates" —
achievable for the _new_ routes, which key on `external_id`, but **the existing route cannot be
reused to get there.** Step 2's instruction not to modify it is correct; it also means the two
import paths will behave differently, and the `/os/import` page should say which one it is.

There is no visits import of any kind today.

---

## Item 5 — Sensitive data: `clients.health_notes`

Free text, capped by `healthNotesSchema` (`lib/validations/clients.ts:71,89`). Under Ley 1581 this
is _dato sensible_ and needs explicit consent. Where it appears today:

| surface              | file                                              | exposure                                                                    |
| -------------------- | ------------------------------------------------- | --------------------------------------------------------------------------- |
| Member detail page   | `app/os/clients/[id]/page.tsx:678-679`            | rendered in full, `whitespace-pre-wrap`                                     |
| Member edit form     | `app/os/clients/[id]/edit/page.tsx:144`           | editable free text                                                          |
| Create form          | `components/tribe-os/ClientForm.tsx:146,171`      | editable free text                                                          |
| CSV **export**       | `lib/dal/clients.csv.ts:106,125`                  | **emitted as a plain column in the downloaded file**                        |
| CSV **import**       | `parseClientsCSV.ts:81-83`, `import/route.ts:109` | accepted from `health notes` / `medical` headers                            |
| Standard select list | `lib/dal/clients.ts:290`, `clients.csv.ts:32`     | included in `CLIENT_SELECT`, so every read that uses it carries health data |

**Two observations, reported not fixed:**

1. **The export is the sharpest edge.** A gym owner clicking Export downloads a file containing
   every member's health notes in plain text, with no consent record, no redaction option and no
   audit of what left the building. `/os/audit` logs the export event but not that it carried
   health data.
2. **No consent is recorded anywhere.** There is no `consent_*` column on `clients` and no consent
   table. The member-facing path (`lib/dal/memberSelf.ts:20`) deliberately withholds `notes` and
   `health_notes` from members — so the member cannot see, correct, or withdraw what is held about
   them, which is the part Ley 1581 grants them.

Both are pre-existing on `main` and out of T-OS1's scope. They belong in their own ticket, and
T-OS1's import work will _increase_ the volume of this data if a Mira export carries a medical
column into the `medical` alias.

---

## What I recommend deciding before Step 1

1. **Run the probe.** Nothing in Step 1 should be written against an assumed schema.
2. **Answer item 3's four questions** so the UX walkthrough can happen.
3. **Note that `085_clients_gym_id_not_null.sql.disabled` is disabled** — `clients.gym_id` may be
   nullable in production. `client_visits.gym_id` is `NOT NULL` in the spec, so any client row with
   a null `gym_id` cannot receive visits. The probe's `clients_by_gym` block will show whether such
   rows exist.
4. **Decide the `health_notes` question before the Mira import ships**, since the `medical` header
   alias means a Mira file could import health data silently.

**Stopping here.** No Step 1 work has begun.
