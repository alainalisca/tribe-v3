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
| Repo-only, not deployed | 3 (from migration 043) | `prevent_is_admin_self_update`, `log_is_admin_change`, `is_app_admin_uid` |
| Diverged / renamed | 2 | `update_host_rating` (live) vs `update_host_average_rating` (repo); `schema.sql` still defines `update_session_participant_count` that #85/109 dropped |

Two of the untracked drift classes are **the same double-trigger / counter-delta pattern that produced `current_participants = -1`** in T-COUNT1, now found on `post_likes`, `post_comments`, and `user_follows`.

---

## P0 / High

### H1 — Admin-escalation guard (migration 043) is NOT deployed on live *(security)*
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
