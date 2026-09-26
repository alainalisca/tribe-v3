# T-AV1 Recon

Program spec section 5, run 2026-09-26 on `athlete/main`. Read only: nothing in
this ticket changed a production object, and the only files it added are this
report and two SQL files.

**How this recon reached production: it did not.** There is no production
database access in this worktree and none was asked for. Every structural
question was answered against the LOCAL stack, which carries production's exact
schema (schema-only dump, `docs/AV_LOCAL_STACK.md`), and every question needing
production ROWS is in one file for Al to run:
`supabase/recon/t-av1-prod-readonly.sql`.

**What that split can and cannot tell you.** The local database is production's
SHAPE, so policies, grants, triggers, constraints, indexes and RLS behaviour are
production's and the probes below are real probes. It is NOT production's data,
so every row count, fill rate and active-user number below is marked
`NEEDS PROD` and is answered by that file, not by me.

---

## The two security findings first

### S1. An athlete can write their own `challenge_participants.progress` (LATENT)

Full detail in the rehearsal: `supabase/recon/t-av1-item3-progress-write.LOCAL.sql`.
Proved with a real JWT for a seeded athlete, `sub` decoded and asserted before
anything else so the arms are not silently about a NULL uid.

| arm | question                                                 | result                                             |
| --- | -------------------------------------------------------- | -------------------------------------------------- |
| A1  | does `auth.uid()` resolve to the athlete?                | PASS -- `current_user=authenticated`               |
| B1  | does the write reach the permission on shipped policies? | **BLOCKED BY RECURSION** (42P17)                   |
| B2  | can an athlete write their own `progress`?               | **YES -- 0 -> 9999 against a target of 4**         |
| B3  | can she write someone else's row?                        | NO -- correctly filtered, 0 rows                   |
| B4  | can the harness see a write land at all? (control)       | YES -- so B3 is a real denial                      |
| C1  | grant                                                    | `authenticated` holds UPDATE on `progress`         |
| C2  | policy                                                   | `USING (user_id = auth.uid())`, WITH CHECK omitted |
| C3  | trigger                                                  | none                                               |

All three layers permit it. **It is not exploitable today**, and the reason is
S2 below rather than any control: every PostgREST request to the table fails, so
nothing reaches the permission. The hole opens the moment the recursion is
fixed, which is why the two must be fixed together and in that order.

Nothing mitigates it in application code: no service-role route writes
`progress`, and `recalculateChallengeProgress` has **zero callers** and would
fail anyway because it writes `updated_at`, a column `challenge_participants`
does not have.

**Correction to the program spec, section 2:** it says that function "writes
`challenge_participants.progress` from the client". True of the code as
written; it never runs.

### S2. `challenge_participants` is unreachable for every role (42P17)

`challenge_participants_select`, created by `048_community_rls_tightening.sql`
(on `main`), contains `EXISTS (SELECT 1 FROM challenge_participants cp ...)` --
it re-enters itself. Measured through PostgREST: **read and write, anon and
authenticated, `return=minimal` and `return=representation`, all four return
42P17**. An UPDATE's `WHERE` is subject to the SELECT policy, so writes die too.

Challenges cannot load for anyone. This is why the feature reads as "dark".

### S3. Any authenticated user can forge an in-app notification (LIVE)

Not in the spec's list; found while probing item 1. **This one works end to
end right now**, unlike S1.

`notifications` INSERT policy is `WITH CHECK (auth.uid() IS NOT NULL)` and
nothing else. `authenticated` holds INSERT on all 10 columns. There is no
trigger.

Measured, as a seeded athlete against a second athlete:

```
POST /rest/v1/notifications  {recipient_id: <beto>, actor_id: <elena, an instructor>,
                              type: "session_join", message: "...",
                              action_url: "https://example.invalid/phish"}
-> HTTP 201, row written
anon, same request -> HTTP 401   (so auth.uid() IS NOT NULL is the ONLY gate)
```

So one athlete can put a notification in another athlete's feed, attribute it
to an instructor via `actor_id`, and choose the `action_url` it links to. Test
rows were deleted; `notifications` is back to 0 locally.

**The first probe of this reported a false DENIED and is worth recording.** With
`Prefer: return=representation` the insert returned `42501 new row violates
row-level security policy`, which reads as the insert being refused. It was the
read-BACK being refused: the SELECT policy is `recipient_id = auth.uid()`, and
the row is addressed to someone else. Re-run with `return=minimal` it is a 201.
An error that denies a different thing than the one under test is
indistinguishable from the denial you were hoping for -- CLAUDE.md's
outcome-versus-recognition family, in a new costume.

---

## Item by item

### 1. Columns, constraints, indexes, policies -- ANSWERED (local)

All thirteen tables exist: `session_attendance`, `session_participants`,
`challenges`, `challenge_participants`, `pass_leads`, `featured_partners`,
`user_follows`, `connections`, `referrals`, `referral_codes`, `promo_codes`,
`promo_redemptions`, `notifications`. The spec guessed `promo_code_redemptions`;
the real name is **`promo_redemptions`**. `ConnectionButton` writes
`connections` (requester/recipient/status/shared_session_id).

Findings worth carrying into the tickets:

- **`session_attendance` already has `UNIQUE (session_id, user_id)`.** T-AV2
  plans to add it. That work is done -- but `session_id` and `user_id` are both
  **nullable**, and a UNIQUE constraint treats NULLs as distinct, so NULL-keyed
  rows can still duplicate. The useful change is NOT NULL, not a new index.
- `session_attendance.attended` is `boolean NULL DEFAULT false`. The default is
  what collapses "no-show" into "not marked" -- both are `false`. T-AV2's
  `status` column is the right fix and the recon supports it.
- `session_attendance.marked_at` and `created_at` are `timestamp WITHOUT time
zone`, alone among these tables. Relevant to T-AV6's America/Bogota work.
- `session_participants` carries **five DELETE policies**, three of them the
  same predicate (`auth.uid() = user_id`), and one hardcodes an email address:
  `(auth.jwt() ->> 'email') = 'alainalisca@aplusfitnessllc.com'`. Permissive
  policies OR together, so the redundant three are inert; the email one is a
  standing admin grant tied to one string.
- `referrals` has **two identical SELECT policies**. Inert, but it is the "do
  two policies overlap" question CLAUDE.md says nobody asks.
- `user_follows` SELECT is `USING (true)`: the follow graph is fully public.

### 2. `session_attendance` -- structure ANSWERED, data NEEDS PROD

Who writes it, measured from the policies: **INSERT and UPDATE are restricted to
the session's creator** (`EXISTS (SELECT 1 FROM sessions WHERE sessions.id =
session_attendance.session_id AND sessions.creator_id = auth.uid())`), plus
`sa_admin_manage` for `is_app_admin()`. Athletes cannot write it. T-AV2's
`SECURITY DEFINER` writer is hardening, not a hole being closed.

`attended` **can** be null. There are no triggers on the table at all.

Row count, rows per session, duplicates, and share of past sessions with any row
are rows 30-42 of the production file.

### 3. Athlete writing own `progress` -- ANSWERED. See S1.

### 4. Challenges data -- NEEDS PROD (rows 50-59)

Row 59 is the one to read first: `progress` greater than the challenge's
`target_value`. Any non-zero there is a value no legitimate path produces.

### 5. Triggers -- ANSWERED (local)

`session_participants`:

| trigger                              | fires         | does                                          |
| ------------------------------------ | ------------- | --------------------------------------------- |
| `on_participant_join_set_payment`    | BEFORE INSERT | `set_payment_status_on_join`                  |
| `session_participants_status_guard`  | BEFORE UPDATE | `prevent_participant_status_self_escalation`  |
| `trg_challenge_progress`             | AFTER INSERT  | `update_challenge_progress` -- **+1 on JOIN** |
| `trg_sync_session_participant_count` | AFTER I/U/D   | `sync_session_participant_count`              |

`session_attendance`: **no triggers**. So nothing today connects attendance to
challenge progress, which is exactly the gap T-AV11 fills.

`trg_challenge_progress` confirms the spec: it increments `progress` on INSERT
into `session_participants`, so progress counts **joins, not attendance**.

Legacy push triggers still live: `chat_messages` has both
`chat_message_notification_trigger` (inserts into `push_notifications`) and
`chat_message_webhook` (calls `net.http_post` to
`https://tribe-v3.vercel.app/api/webhook/chat-message/`, URL hardcoded to prod).
`notify_chat_message_webhook` is the only function in `public` that calls
`net.http_post`.

### 6. Real athlete count and weekly actives -- NEEDS PROD (rows 10-27)

The predicate is written into the file and into every row's `notes`:
`deleted_at IS NULL AND banned IS NOT TRUE AND is_test_account IS NOT TRUE AND
is_admin IS NOT TRUE AND is_instructor IS NOT TRUE`. `is_instructor IS NOT TRUE`
rather than `= false`, because the column is nullable and a NULL is an athlete
-- the same trap `lib/dal/admin.ts` already documents.

Weekly actives are 8 buckets of 7 days, counting a join, an `attended` row, or a
chat message.

### 7. `pass_leads` -- NEEDS PROD (rows 70-78)

Structure confirmed local: `tribe_user_id`, `contacted_at`, `notified_at`,
`pass_code` (UNIQUE) all present, plus a partial index on uncontacted leads.
T-AV10's additive columns (`attended_at`, `expires_at`, ...) are all absent, as
the spec expects.

### 8. DM push not arriving -- ROOT CAUSE FOUND (local, code)

**DMs and session chat share one table.** `sendDirectMessage`
(`lib/dal/conversations.ts:225`) inserts into `chat_messages` with
`conversation_id` set and **`session_id` NULL**.

Both notification paths are session-scoped, and both are therefore blind to a
DM:

1. **`notify_new_chat_message`** loops
   `WHERE sp.session_id = NEW.session_id`. With `session_id` NULL that matches
   zero rows, the loop body never executes, and **no `push_notifications` row is
   ever created for a DM.**
2. **`/api/webhook/chat-message/route.ts`** types `session_id: string`, then
   looks up `sessions` by it and `session_participants` by it. For a DM it falls
   through to `notified: 0` and sends nothing.

Neither path knows `conversation_id` or `conversation_participants` exists. That
is the bug, and it is two independent instances of the same assumption rather
than one fix.

### 9. Referral backend -- ANSWERED (local, code); counts NEEDS PROD (rows 90-97)

It exists and it is wired, contrary to "orphaned": `applyReferralCode` is called
from `app/auth/useAuthHandlers.ts` and `app/auth/callback/page.tsx`;
`getOrCreateReferralCode` and `getReferralStats` from `app/referral/page.tsx`.
Tables `referrals` and `referral_codes` both have RLS with owner-scoped
policies. Whether any of it has ever run is rows 90-97.

### 10. T-ATH1 roster -- VERIFIED, no leak (local, real JWTs)

As a seeded athlete, against a session she is not on:

| probe                                             | result                      |
| ------------------------------------------------- | --------------------------- |
| `session_participants_roster`, session NOT on     | `[]`                        |
| `session_participants_roster`, session she IS on  | rows returned **(control)** |
| `session_participants` base table, session NOT on | `[]`                        |
| anon, roster, any session                         | `[]`                        |

The control is the point: the middle row proves the probe can see rows, so the
empty results are real denials and not a query that was never going to return
anything. T-ATH1 holds.

The view is `security_invoker = false`, so it bypasses RLS and gates itself:
admin, OR session creator, OR a **confirmed** participant of that same session.

### 11. Next free migration number -- 194, RE-READ IT

`origin/main` read at 2026-09-26: highest is **193**
(`193_private_communities_visible_to_members.sql`). Next free is **194**.

Two warnings, both concrete:

- **`athlete/main` does not have 193.** The branch is behind `origin/main`;
  section 1 of the merge gate already requires merging `main` in at the merge
  attempt.
- **A branch named `chore/194-scrub-push-send-bearer` already exists.** No
  remote branch carries a `194_*.sql` file yet -- I scanned every one -- so the
  number is free at this moment. It is exactly the situation that produced three
  collisions on record. Re-read `origin/main` at the moment of writing the file,
  not now.

---

## Go / no-go per Phase 0 ticket

| ticket         | verdict                 | why                                                                                                                                                                           |
| -------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T-AV2**      | **GO**, rescoped        | The unique index already exists -- drop that line. Real work: NOT NULL on `session_id`/`user_id`, the `status` column, and the definer writer. Host-only write already holds. |
| **T-AV3**      | **GO**, and it grew     | S1 and S2 are one fix, in one migration, recursion last. Add `REVOKE UPDATE (progress)` from `anon` too -- anon holds it today.                                               |
| **T-AV4**      | **GO**                  | Nothing in recon blocks it. Cron routes exist, none in `vercel.json`.                                                                                                         |
| **T-AV5**      | **GO**                  | Root cause found and named (item 8). Both halves are session-scoped; the fix is a conversation-scoped path, not a token-registration change.                                  |
| **T-AV6**      | **GO**                  | Note `session_attendance`'s naive timestamps when doing the America/Bogota split.                                                                                             |
| **T-AV7**      | **HOLD** for row counts | `connections` and `user_follows` work structurally; delete-or-link is a data decision. Rows 110-112 decide it.                                                                |
| Roster privacy | **DONE, verified**      | Item 10, with a live control.                                                                                                                                                 |
| Tip step       | **DONE**                | Unchanged from the spec's reading.                                                                                                                                            |
| **NEW: S3**    | **needs a decision**    | Notification forgery is live on `main` today. Not in any Phase 0 ticket. Recommend it joins T-AV3's migration as a `WITH CHECK` on `recipient_id`/`actor_id`.                 |

## What this recon did NOT establish

Every number. All of them are `NEEDS PROD` and none is guessed here. The spec's
"~47 to 51 athletes" and the "107 users / 94 athletes" from the 2026-09-17
commit are both unverified by me, and the second was measured without the
test-account and instructor exclusions this file applies -- so it is a different
population, not a newer reading of the same one.
