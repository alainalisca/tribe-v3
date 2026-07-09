# Live-vs-Repo Drift Audit — T-DRIFT1 (2026-07-08)

**Read-only audit.** Nothing in this document has been applied to the live database. It enumerates the live functions, triggers, and RLS policies, diffs them against the repo (`supabase/migrations/*` + `supabase/schema.sql`), and prioritizes the divergences by risk. Recommended follow-up migrations are listed but **not** written or applied.

## Method

Live objects were dumped from `pg_proc`, `pg_trigger`, and `pg_policies` (public schema) via the Supabase SQL editor (queries in the appendix). Diffed against the repo's 53 functions / 36 trigger definitions / 215 `CREATE POLICY` statements. Where only a signal (e.g. `calls_http`, `does_counter_delta`) was captured and not the full body, the finding is marked **(signal — body review recommended)** rather than asserted as a confirmed defect.

**Scope caveat:** the `pg_policies` dump paginated and was captured alphabetically **through `gym_teams`**; policies for later tables (`messages`, `notifications`, `payments`, `sessions`, `session_participants`, `users`, storefront tables, etc.) are **not** covered here. A full re-run is recommended (appendix).

## Summary

| Class | Count (this audit) | Examples |
|---|---|---|
| Live-only functions (untracked) | ~16 | `notify_new_message`, `send_push_notification_webhook`, `on_post_like`, `on_user_follow`, `set_payment_status_on_join`, `sync_session_coords` |
| Live-only triggers (untracked) | ~20 | `chat-message-notifications`, `on_message_sent`, `trg_post_like_insert/delete`, `trg_user_follow_insert/delete` |
| Repo-only, not deployed | 3 (from migration 043) — **RESOLVED 2026-07-08** | `prevent_is_admin_self_update`, `log_is_admin_change`, `is_app_admin_uid` (043 applied via T-SEC2) |
| Diverged / renamed | 2 | `update_host_rating` (live) vs `update_host_average_rating` (repo); `schema.sql` still defines `update_session_participant_count` that #85/109 dropped |

Two of the untracked drift classes are **the same double-trigger / counter-delta pattern that produced `current_participants = -1`** in T-COUNT1, now found on `post_likes`, `post_comments`, and `user_follows`.

---

## P0 / High

### H1 — Admin-escalation guard (migration 043) is NOT deployed on live *(security)* — ✅ RESOLVED 2026-07-08
> **Resolved (T-SEC2, 2026-07-08).** Confirmed exploitable on live — three `users` UPDATE policies allowed self-row updates and `authenticated` held column `UPDATE` on `is_admin` (RLS can't restrict columns), so a non-admin could self-promote. Migration 043 was applied to production and verified: non-admin `is_admin` self-update is blocked, ordinary profile updates still work, and service-role/admin grants still succeed and are audited. `verify-migration-state.sql` now checks for `users_is_admin_guard`. Original finding below.

`043_lock_is_admin.sql` defines `is_app_admin_uid()`, `prevent_is_admin_self_update()` + trigger `users_is_admin_guard`, and `log_is_admin_change()` + trigger `users_is_admin_audit`. **None of these functions exist in live `pg_proc`, and the live `users` table has only `protect_verified_instructor_trigger` and `users_banned_guard` — no `users_is_admin_guard`.** So migration 043 was never applied. This means live has no trigger preventing a user from setting their own `is_admin = true`. Whether it's directly exploitable depends on the `users` UPDATE RLS policy (not in the captured policy subset — must confirm), but the guard the repo believes exists is absent. Compounding: `098_rls_self_escalation_guards.sql` (which *is* deployed) comments that "is_admin was already locked" — an assumption that is false in production.
- **Recommendation:** verify the `users` self-UPDATE policy; re-apply migration 043 (idempotent `CREATE OR REPLACE` + guarded triggers). Treat as P0 until the policy is confirmed to block `is_admin` writes.

### H2 — Synchronous HTTP inside write transactions *(reliability)*
Several triggers make blocking network calls inside the transaction that writes the row:
- `notify_new_message` → trigger `on_message_sent` on `messages` (AFTER INSERT) — **untracked**, `calls_http`. Every DM insert blocks on an HTTP POST.
- `send_push_notification_webhook` → trigger `send_push_notification_trigger` on `push_notifications` (AFTER INSERT) — **untracked**, `calls_http`. Every push row blocks on HTTP.
- `notify_join_request` / `notify_join_accepted` on `session_participants` — `calls_http` (already flagged in the BUG-001 follow-up; column bug fixed in #78, the sync-HTTP concern remains).
- `chat-message-notifications` on `chat_messages` — a `supabase_functions.http_request(...)` webhook to `https://tribe-v3.vercel.app/api/webhook/chat-message/` **with a hardcoded `x-webhook-secret` embedded in the trigger definition** (visible to anyone who can read the catalog). Untracked.

If the edge function/endpoint is slow or down, these stall or abort the originating write (DMs, joins, pushes). The chat webhook additionally **leaks a secret** in the trigger def.
- **Recommendation:** move these off the transaction path (async `pg_net`, a queue, or app-side dispatch like the existing `/api/sessions/notify-join` pattern), and rotate the hardcoded chat webhook secret out of the trigger.

### H3 — Duplicate counter triggers (the T-COUNT1 pattern), untracked *(data integrity)*
The exact double-trigger stacking that drove `current_participants` to `-1` exists elsewhere:
- **`post_likes`** has **three** like-count triggers: `post_like_count_trigger` (`update_post_like_count`) plus `trg_post_like_insert` and `trg_post_like_delete` (`on_post_like`, `does_counter_delta`). Multiple maintainers of the same count → drift.
- **`post_comments`** has **two**: `post_comment_count_trigger` (`update_post_comment_count`) and `trg_post_comments_count` (`recompute_post_comments_count`) — one delta, one recompute, firing on the same events.
- **`user_follows`** has `on_user_follow` / `on_user_unfollow` (`does_counter_delta`) maintaining follower/following counts by `±1`.

`on_post_like`, `on_user_follow`, `on_user_unfollow` are all **untracked** (not in the repo). Same failure mode as T-COUNT1: a delta stacked on (or racing) a recompute yields wrong counts, including negatives.
- **Recommendation:** for each counter, consolidate to a **single recompute-from-scratch** trigger (the pattern migration 109 used), dropping the redundant delta triggers.

---

## Medium

### M1 — Untracked live functions/triggers (invisible to code review) *(signal — body review recommended)*
Live-only, not in the repo, so they can silently reference dropped columns (the BUG-001 `s.name` class) with nothing in version control to catch it:
`on_payment_approved` (payments INSERT+UPDATE), `set_payment_status_on_join` (session_participants BEFORE INSERT), `sync_session_coords` (sessions BEFORE INSERT/UPDATE), `update_instructor_stats` (sessions AFTER UPDATE), `update_last_login`, `update_payment_updated_at`, `update_service_packages_updated_at`, `protect_verified_instructor` (users BEFORE UPDATE — a security guard living only in live), `notify_new_chat_message` (chat_messages — the second, redundant chat-notify path alongside the webhook in H2).
- **Recommendation:** capture each into a tracked migration verbatim, then review bodies for column-reference and logic drift.

### M2 — Redundant / overlapping RLS policies *(within the captured subset)*
RLS is permissive (policies OR together), so duplicates widen access and obscure intent:
- `blocked_users`: two INSERT ("Users add to own block list" + "Users can block others"), two DELETE, two SELECT policies.
- `chat_messages`: overlapping session-based and conversation-based SELECT/INSERT policies (four+ total).
- `community_posts`: two DELETE policies ("Authors and admins…" + "Authors or community admins…").
These indicate migrations layering new policies without dropping superseded ones.
- **Recommendation:** a dedupe pass once the full policy set is dumped (M5 below).

### M3 — `{public}` role on write policies
Many INSERT/UPDATE/DELETE policies target role `{public}` (includes anon) rather than `{authenticated}`, relying entirely on the `USING`/`WITH CHECK` `auth.uid()` clause. Not a hole by itself, but tighter than needed and inconsistent with the newer `{authenticated}` policies (e.g. `community_events`, `exercise_videos`). Review during the dedupe pass.

---

## Low

- **L1** — `schema.sql` is stale: it still defines `update_session_participant_count` (the delta counter dropped from live by #85 / migration 109) and the base-schema count trigger. The migration chain is correct (109 drops it), but the curated base schema misleads. Refresh it.
- **L2** — Name divergence: live `update_host_rating` vs repo `update_host_average_rating` (both maintain review ratings via `trigger_update_host_rating` on `reviews`). Reconcile the name so the repo matches live.

---

## Recommended follow-up migrations (NOT applied)

| ID | Priority | Action |
|---|---|---|
| M-SEC | P0 | Confirm the `users` self-UPDATE RLS policy blocks `is_admin`; re-apply migration 043 (`users_is_admin_guard` + audit) if absent. |
| M-COUNT | High | Consolidate `post_likes`, `post_comments`, `user_follows` counters to a single recompute trigger each; drop redundant delta triggers (mirror #85/109). |
| M-HTTP | High | Move `notify_new_message`, `send_push_notification_webhook`, `notify_join_*`, and the `chat-message-notifications` webhook off the transaction path (async); rotate the hardcoded chat webhook secret. |
| M-CAPTURE | Medium | Import all untracked live functions/triggers into tracked migrations; then body-review for column drift. |
| M-RLS | Medium | Full `pg_policies` dump beyond `gym_teams`; dedupe overlapping policies; tighten `{public}`→`{authenticated}` on writes. |
| M-HYGIENE | Low | Refresh `schema.sql`; reconcile `update_host_rating` naming. |

Each should be confirmed against the live definition first and shipped rolling-safe, per the T-SEC1 / T-COUNT1 playbook. None are written here.

---

## Appendix — catalog queries used (read-only)

```sql
-- Functions with risk flags
select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef,
       (pg_get_functiondef(p.oid) ilike '%extensions.http%' or pg_get_functiondef(p.oid) ilike '%net.http%') as calls_http,
       (pg_get_functiondef(p.oid) ~* 'current_participants\s*[-+]' or pg_get_functiondef(p.oid) ~* '_count\s*=\s*[a-z_]+_count\s*[-+]') as does_counter_delta
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f' order by p.proname;

-- Triggers
select c.relname, t.tgname, pg_get_triggerdef(t.oid)
from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and not t.tgisinternal order by c.relname, t.tgname;

-- RLS policies (re-run WITHOUT the implicit row cap to capture past gym_teams)
select tablename, policyname, cmd, roles, (qual is not null) as has_using, (with_check is not null) as has_with_check
from pg_policies where schemaname = 'public' order by tablename, policyname;

-- Confirm H1: does the is_admin guard exist on live?
select tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid
where c.relname='users' and not t.tgisinternal;   -- expect users_is_admin_guard to be ABSENT
```

---

# RLS Audit (T-DRIFT2) — 2026-07-08

Completes the RLS half that T-DRIFT1 left partial. Full `pg_policies` SELECT-condition dump analyzed (complete through all tables); the compact all-command list paginated at `gym_teams`, so **write-policy dedup for tables alphabetically after `gym_teams` is not yet fully enumerated** — a targeted re-run is noted at the end. Read-only; no live change, no migrations. Findings ranked by risk.

## P0 — verify immediately

### RLS-H1 — `users` is fully public/anon-readable; sensitive columns rest entirely on column REVOKEs *(security)*
Three SELECT policies expose every row of `users`:
- `Users can view all profiles` — `{public}`, `USING (true)`
- `users_select_policy` — `{public}`, `USING (true)`
- `users_select_instructor_public` — `{anon}`, `USING (is_instructor = true)`

`users` holds **`is_admin`, `banned`, `email`, `fcm_token`, `push_subscription`, `stripe_account_id`, `wompi_merchant_id`, `total_earnings_cents`, `payout_method`, `location_lat/lng`** (all confirmed present). RLS is row-level and **cannot restrict columns**, so with `USING (true)` the *only* thing preventing anon/any user from reading these is the **column-level `REVOKE`s in migrations 065/066/067** — which the migration-state verifier marks *"cannot verify automatically,"* and which **T-SEC2 already showed to be incomplete** (anon + authenticated still hold column `UPDATE` on `is_admin`). If the SELECT revokes are likewise missing, admin flags, push tokens, Stripe/Wompi IDs, earnings, and precise home coordinates are **world-readable**.
- **Verify now (read-only):**
  ```sql
  select grantee, string_agg(column_name, ', ' order by column_name) as readable_cols
  from information_schema.column_privileges
  where table_schema='public' and table_name='users' and privilege_type='SELECT'
    and grantee in ('anon','authenticated')
    and column_name in ('is_admin','banned','email','fcm_token','push_subscription',
                        'stripe_account_id','wompi_merchant_id','total_earnings_cents',
                        'payout_method','location_lat','location_lng')
  group by grantee;
  ```
  Any sensitive column listed for `anon`/`authenticated` = exposed. **Follow-up:** (re)apply the column REVOKEs (065–067); collapse the two `USING(true)` policies to one; if public profile browsing is required, expose a safe column subset via a view rather than the whole row.

## High

### RLS-H2 — `invite_tokens` is world-readable → undermines invite-only *(access control)*
`Anyone can view invite tokens` — `{public}`, `USING (true)`. Any anon can enumerate **every** invite token. Since a valid token is exactly what unlocks an invite-only join (T-INV1 / the T-SEC1 RPC), public read of the token table means anyone can pull a token and join any invite-only session. **Follow-up:** remove the public SELECT; token lookups should go through a `SECURITY DEFINER` function / service-role path keyed by the exact token, never a table scan.

### RLS-H3 — `session_participants` public read exposes guest PII + guest_token *(privacy / impersonation)*
Four SELECT policies, three effectively "everyone": `Anyone can view session participants` (`{public}` true), `participants_select_policy` (`{public}` true), `sp_select_authenticated` (`{authenticated}` true), plus `Guests can view own participation`. The table holds **`guest_phone`, `guest_email`, `guest_name`, `guest_token`, `payment_status`** (confirmed). `USING(true)` public read makes guest phone/email world-readable, and **`guest_token` being readable enables guest-session impersonation**. **Follow-up:** scope the SELECT (participant/creator only) and/or column-revoke `guest_token`/`guest_phone`/`guest_email` from `anon`/`authenticated`.

## Medium

### RLS-M1 — `sessions` fully public-readable (3 `USING(true)` policies)
`select_all` (`{authenticated}`), `sessions_select_paid_visible` (`{authenticated}`), `sessions_select_policy` (`{public}`) — all `USING (true)`. Sessions are meant to be discoverable, but this also exposes exact **`location_lat/lng`** and **`payment_instructions`** to anon. Three redundant true-policies is also pure duplication. **Follow-up:** one policy; consider fuzzing/omitting exact coords + payment_instructions for non-participants (the discover DAL already fuzzes coords — RLS should not hand out the raw values).

### RLS-M2 — `community_post_comments` leaks private-community comments
`Users can read comments on visible posts` — `{public}`, `USING (true)` — sits alongside the correctly-scoped `community_post_comments_select` (checks community membership/privacy). RLS is permissive (OR), so the `true` policy **wins** and comments on **private** communities become world-readable. **Follow-up:** drop the `USING(true)` policy; keep the scoped one.

### RLS-M3 — pervasive duplicate / overlapping policies
Same-command duplicates that widen access and obscure intent (RLS OR-combines them):
- `users`: **4 UPDATE** (`Admin can update users`, `Admins can update any user`, `users_update_own_profile`, `users_update_policy` — 3 are self-updates; see T-SEC2) + **3 SELECT**.
- `session_participants`: **4 SELECT** (3 = everyone). `sessions`: **3 SELECT** (all true).
- `blocked_users`: 2×INSERT, 2×DELETE, 2×SELECT (identical `auth.uid()=user_id`).
- `community_posts`: 2×DELETE (`Authors and admins…` + `Authors or community admins…`).
- `post_comments`: 2×SELECT both `USING(true)` (`Anyone can read comments` + `anyone_can_read_comments`).
- `referrals`: 2×SELECT with identical qual. `reported_messages`/`reported_users`: overlapping admin variants.
**Follow-up:** a dedup migration collapsing each set to the single intended policy.

## Low

### RLS-L1 — `{public}` role on write policies (should be `{authenticated}`)
Most INSERT/UPDATE/DELETE policies target `{public}` (includes `anon`) rather than `{authenticated}`, relying entirely on the `auth.uid()` qual. Not exploitable (anon's `auth.uid()` is null so the quals fail), but loose and inconsistent with the newer `{authenticated}` policies. Tighten during the dedup pass.

### RLS-L2 — hardcoded email-admin policies
`reported_messages` / `reported_users` / `users "Admin can update users"` gate on `auth.jwt()->>'email' = 'alainalisca@…'` — a brittle literal, redundant with the `is_app_admin()` / `is_app_admin_uid()` helpers now in place. Retire in favor of the helper.

## Recommended follow-up migrations (NOT written)
| ID | Priority | Action |
|---|---|---|
| M-USERS-COL | P0 | Verify + (re)apply 065–067 column `REVOKE`s on `users`; collapse the `USING(true)` SELECT policies; expose public profile fields via a safe view. |
| M-INVITE | High | Remove public SELECT on `invite_tokens`; move token lookup to a `SECURITY DEFINER` function keyed by exact token. |
| M-PARTICIPANTS | High | Scope `session_participants` SELECT and/or column-revoke `guest_token`/`guest_phone`/`guest_email`. |
| M-SESSIONS | Medium | One SELECT policy; keep exact coords/`payment_instructions` out of anon reads. |
| M-COMMENTS | Medium | Drop the `USING(true)` `community_post_comments` policy (keep the scoped one). |
| M-DEDUP | Medium | Collapse duplicate policy sets (`users` UPDATE ×4, `session_participants`/`sessions` SELECT, `blocked_users`, `community_posts`, `post_comments`, `referrals`, `reported_*`). |
| M-ROLE | Low | `{public}` → `{authenticated}` on writes; retire hardcoded email-admin policies for `is_app_admin()`. |

## Data limitation / next enumeration
The compact all-command dump paginated at `gym_teams`, so **write-policy dedup and the repo name-diff for tables after `gym_teams` are incomplete**. To finish, re-run the compact query in two halves so neither hits the row cap:
```sql
select tablename, policyname, cmd, roles from pg_policies
where schemaname='public' and tablename >= 'gym_teams' order by tablename, policyname;
```
The exposure findings above (H1–M2) are complete regardless — they derive from the full SELECT-condition dump.
