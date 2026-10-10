-- supabase/verify-migration-state.sql
--
-- One-shot script: paste into the Supabase SQL editor against the
-- PRODUCTION database to verify which Tribe.OS migrations (060–083)
-- have been applied. Returns a single result table with one row per
-- migration and a status of 'applied' or 'MISSING'.
--
-- This doesn't read supabase_migrations.schema_migrations directly
-- because not every migration in this repo was applied through the
-- Supabase CLI — some were run manually via psql or the SQL editor,
-- which leaves no audit row. Instead we check for the artifacts each
-- migration introduces (tables, functions, columns). That's the more
-- reliable signal of "did this run."
--
-- Run before merging `feature/tribe-os` → `main`. Any MISSING row is
-- a runtime time-bomb waiting for the first user to hit the surface
-- that depends on it.
--
-- Safe to re-run — pure SELECTs, no side effects.

select '060_tribe_os_premium' as migration,
       case when exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'users'
           and column_name = 'tribe_os_tier'
       ) then 'applied' else 'MISSING' end as status
union all
select '061_blocked_users',
       case when (select to_regprocedure('public.is_user_blocked(uuid,uuid)')) is not null
            then 'applied' else 'MISSING' end
union all
select '062_clients_and_attendance',
       case when (select to_regclass('public.clients')) is not null
              and (select to_regclass('public.client_attendance')) is not null
            then 'applied' else 'MISSING' end
union all
select '063_revenue_dashboard',
       case when (select to_regprocedure('public.instructor_revenue_totals(uuid,date,date,text)')) is not null
            then 'applied' else 'MISSING' end
union all
select '064_revenue_function_auth_assertion',
       -- Hardened the same functions; no separate artifact. We treat
       -- it as applied when 063 is applied (no way to distinguish in
       -- isolation). Run \df on instructor_revenue_totals to verify
       -- the SECURITY DEFINER flag if forensically interested.
       case when (select to_regprocedure('public.instructor_revenue_totals(uuid,date,date,text)')) is not null
            then 'applied (assumed via 063)' else 'MISSING' end
union all
select '065_users_sensitive_columns_revoke',
       -- Permissions revoke, no artifact. Spot-check by running:
       --   select has_table_privilege('authenticated','public.users','select')
       -- and comparing against the migration file.
       'cannot verify automatically'
union all
select '066_users_column_level_grants',
       'cannot verify automatically'
union all
select '067_users_push_token_revoke',
       'cannot verify automatically'
union all
select '068_gym_tenant_schema',
       case when (select to_regclass('public.gyms')) is not null
              and (select to_regclass('public.gym_coaches')) is not null
            then 'applied' else 'MISSING' end
union all
select '069_gym_tenant_backfill',
       -- Backfill; data-only. Check by seeing if any non-zero
       -- gym_coaches rows exist for known users.
       case when exists (select 1 from public.gym_coaches limit 1)
            then 'applied (rows present)' else 'MISSING or empty gym' end
union all
select '070_dual_path_rls',
       -- RLS policy changes; no artifact. Verify via pg_policies if needed.
       'cannot verify automatically'
union all
select '071_gym_revenue_functions',
       case when (select to_regprocedure('public.gym_revenue_totals(uuid,date,date,text)')) is not null
            then 'applied' else 'MISSING' end
union all
select '072_clients_member_enrichment',
       case when exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'clients'
           and column_name = 'last_seen_at'
       ) then 'applied' else 'MISSING' end
union all
select '073_list_gym_coaches',
       case when (select to_regprocedure('public.list_gym_coaches(uuid)')) is not null
            then 'applied' else 'MISSING' end
union all
select '074_gym_teams',
       case when (select to_regclass('public.gym_teams')) is not null
              and (select to_regclass('public.gym_team_members')) is not null
            then 'applied' else 'MISSING' end
union all
select '075_intelligence_schema',
       case when (select to_regclass('public.training_partners')) is not null
              and (select to_regclass('public.community_insights')) is not null
              and (select to_regclass('public.community_insight_members')) is not null
            then 'applied' else 'MISSING' end
union all
select '076_training_partner_trigger',
       case when (select to_regprocedure('public.upsert_training_partners_on_attendance()')) is not null
            then 'applied' else 'MISSING' end
union all
select '077_backfill_training_partners',
       -- Rewritten 2026-09-28 (T-DRIFT2). Was: "training_partners has any row",
       -- so an empty table read MISSING even with nothing to backfill; production
       -- had 2 attended client_attendance rows and 0 pairs. 077's intent is that
       -- every co-attendance pair it can derive has a training_partners row, so
       -- that is what this asks, with 077's own source: attended rows joined to
       -- clients with a gym, pairs within one session and one gym, member_a the
       -- lower client id.
       case when exists (
              select 1
                from public.client_attendance a
                join public.clients ca on ca.id = a.client_id and ca.gym_id is not null
                join public.client_attendance b on b.session_id = a.session_id
                                               and b.client_id > a.client_id and b.attended = true
                join public.clients cb on cb.id = b.client_id and cb.gym_id = ca.gym_id
               where a.attended = true
                 and not exists (select 1 from public.training_partners tp
                                  where tp.gym_id = ca.gym_id
                                    and tp.member_a_id = a.client_id
                                    and tp.member_b_id = b.client_id))
            then 'MISSING -- a co-attendance pair has no training_partners row'
            else 'applied' end
union all
select '078_bump_longest_streak',
       case when (select to_regprocedure('public.bump_longest_streak(uuid,integer)')) is not null
            then 'applied' else 'MISSING' end
union all
select '079_attendance_counter_trigger',
       case when (select to_regprocedure('public.refresh_client_attendance_counters()')) is not null
              and exists (
                select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'clients'
                  and column_name = 'current_streak_days'
              )
            then 'applied' else 'MISSING' end
union all
select '080_team_health_snapshot',
       -- 080 redefines list_teams_for_gym with extra columns
       -- (healthy_count, watch_count, at_risk_count). We check for
       -- the new columns in the function's row-type by looking at
       -- pg_proc.proargtypes — easier: check for at_risk_count
       -- inside any view/function definition.
       case when exists (
         select 1 from pg_proc p
         where p.proname = 'list_teams_for_gym'
           and pg_get_function_result(p.oid) like '%at_risk_count%'
       ) then 'applied' else 'MISSING' end
union all
select '081_intelligence_email_preference',
       case when exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'gyms'
           and column_name = 'intelligence_email_enabled'
       ) then 'applied' else 'MISSING' end
union all
select '082_gym_audit_log',
       case when (select to_regclass('public.gym_audit_log')) is not null
            then 'applied' else 'MISSING' end
union all
select '083_client_attendance_refunds',
       case when exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'client_attendance'
           and column_name = 'refunded_amount_cents'
       ) then 'applied' else 'MISSING' end
union all
select '084_cron_advisory_lock',
       case when (select to_regprocedure('public.cron_try_lock(text)')) is not null
              and (select to_regprocedure('public.cron_release_lock(text)')) is not null
            then 'applied' else 'MISSING' end
union all
select '086_finalize_payment_allow_voided',
       -- 086 redefines finalize_payment to accept the 'voided' status
       -- (Wompi VOIDED). Detect by the 'voided' literal in the function
       -- body — 047's body does not contain it, so this distinguishes
       -- applied (086) from not-yet-applied (047 only).
       case when exists (
         select 1 from pg_proc p
         where p.proname = 'finalize_payment'
           and pg_get_functiondef(p.oid) like '%''voided''%'
       ) then 'applied' else 'MISSING' end
union all
select '087_session_participant_count_trigger',
       case when (select to_regprocedure('public.sync_session_participant_count()')) is not null
              and exists (
                select 1 from pg_trigger
                where tgname = 'trg_sync_session_participant_count'
              )
            then 'applied' else 'MISSING' end
union all
select '088_finalize_payment_tip_fallback',
       -- 088 redefines finalize_payment to add a `tips`-table fallback so
       -- tip charges finalize without a payments row. Detect by the marker
       -- comment baked into the function body — 086/047 do not contain it.
       case when exists (
         select 1 from pg_proc p
         where p.proname = 'finalize_payment'
           and pg_get_functiondef(p.oid) like '%088: tip finalization fallback%'
       ) then 'applied' else 'MISSING' end
union all
select '089_align_referrals',
       -- 089 makes referrals.referred_id nullable + adds converted_at for the
       -- template-row pattern. converted_at is the cleanest detectable marker.
       case when exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'referrals' and column_name = 'converted_at'
       ) then 'applied' else 'MISSING' end
union all
select '090_community_banners_bucket',
       case when exists (
         select 1 from storage.buckets where id = 'community-banners'
       ) then 'applied' else 'MISSING' end
union all
select '091_media_bucket',
       case when exists (
         select 1 from storage.buckets where id = 'media'
       ) then 'applied' else 'MISSING' end
union all
select '092_fix_community_rls_recursion',
       -- 092 replaces the recursive community_posts SELECT policy with the
       -- is_community_member-based one. Detect by the new policy name.
       case when exists (
         select 1 from pg_policies
         where tablename = 'community_posts'
           and policyname = 'Public posts + members + author can read'
       ) then 'applied' else 'MISSING' end
union all
select '093_restore_users_select_grant',
       -- Rewritten 2026-09-28 (T-DRIFT2). Was: "authenticated holds TABLE-level
       -- SELECT on users". 093 did grant that, but 066/067 had already moved
       -- users to column-level grants, 113 records that no table-level SELECT
       -- exists since 067, and a table-level grant voids every column REVOKE
       -- (CLAUDE.md, 093). Production correctly has none, so the old probe
       -- asked for the unsafe state. What 093 was FOR still has to hold:
       -- profiles readable, and the four Tribe.OS billing columns it hid, hidden.
       -- Columns are found via pg_attribute on regclass and checked by
       -- (oid, attnum), so a dropped column cannot make this raise.
       case when has_table_privilege('authenticated', 'public.users', 'SELECT')
              then 'MISSING -- authenticated holds table-level SELECT on users; every column-level restriction is void'
            when not exists (select 1 from pg_attribute a
                              where a.attrelid = 'public.users'::regclass and a.attname = 'name'
                                and not a.attisdropped
                                and has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT'))
              then 'MISSING -- authenticated cannot read users.name; profile pages go blank'
            when exists (select 1 from pg_attribute a
                          where a.attrelid = 'public.users'::regclass and not a.attisdropped
                            and a.attname in ('tribe_os_stripe_customer_id', 'tribe_os_stripe_subscription_id',
                                              'tribe_os_granted_at', 'tribe_os_granted_by')
                            and has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT'))
              then 'MISSING -- a Tribe.OS billing column 093 hid is readable by authenticated'
            else 'applied' end
union all
select '094_release_notes',
       case when to_regclass('public.release_notes') is not null
              and exists (
                select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'users' and column_name = 'last_seen_release'
              )
            then 'applied' else 'MISSING' end
union all
select '095_session_subscriptions',
       case when to_regclass('public.session_subscriptions') is not null
            then 'applied' else 'MISSING' end
union all
select '096_user_private_pii',
       case when to_regclass('public.user_private') is not null
            then 'applied' else 'MISSING' end
union all
select '097_drop_users_pii_columns',
       -- Applied once the sensitive columns are gone from public.users.
       case when not exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'users'
           and column_name = 'payout_account_number'
       ) then 'applied' else 'MISSING' end
union all
select '098_rls_self_escalation_guards',
       case when exists (
         select 1 from pg_trigger where tgname = 'users_banned_guard'
       ) and exists (
         select 1 from pg_trigger where tgname = 'session_participants_status_guard'
       ) then 'applied' else 'MISSING' end
union all
select '099_community_counter_triggers',
       case when exists (
         select 1 from pg_trigger where tgname = 'trg_community_member_count'
       ) then 'applied' else 'MISSING' end
union all
select '100_post_comments_count_trigger',
       case when exists (
         select 1 from pg_trigger where tgname = 'trg_post_comments_count'
       ) then 'applied' else 'MISSING' end
union all
select '101_get_my_conversations_rpc',
       case when exists (
         select 1 from pg_proc where proname = 'get_my_conversations'
       ) then 'applied' else 'MISSING' end
union all
select '102_partner_self_activate_rpc',
       case when exists (
         select 1 from pg_proc where proname = 'self_activate_featured_partner'
       ) then 'applied' else 'MISSING' end
union all
select '103_fix_chat_messages_dm_and_privacy',
       -- BUG-204: session_id made nullable (DM sends no longer fail) +
       -- privacy leak closed (dropped USING(true) policy, added
       -- conversation-scoped SELECT/INSERT). Detect by session_id nullability.
       case when exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'chat_messages'
           and column_name = 'session_id' and is_nullable = 'YES'
       ) then 'applied' else 'MISSING' end
union all
select '104_close_partner_self_update_hole',
       -- Security fix: dropped the over-broad "Partners manage own record"
       -- UPDATE policy on featured_partners (owners could self-activate /
       -- zero their fee directly). Applied once that policy is gone.
       case when not exists (
         select 1 from pg_policies
         where tablename = 'featured_partners'
           and policyname = 'Partners manage own record'
       ) then 'applied' else 'MISSING' end
union all
select '105_drop_notifications_type_check',
       -- Dropped the notifications.type CHECK constraint that silently
       -- rejected valid notification types. Applied once the constraint
       -- no longer exists.
       case when not exists (
         select 1 from pg_constraint where conname = 'notifications_type_check'
       ) then 'applied' else 'MISSING' end
union all
select '106_community_events_update_with_check',
       -- Added WITH CHECK to the community_events UPDATE policy. Applied
       -- once that policy carries a with_check clause.
       case when exists (
         select 1 from pg_policies
         where tablename = 'community_events'
           and policyname = 'community_events_update'
           and with_check is not null
       ) then 'applied' else 'MISSING' end
union all
select '108_fix_join_notify_triggers_session_title',
       -- Rewritten 2026-09-28 (T-DRIFT2). Was: "notify_join_request's body
       -- selects s.title". 111 replaced that function and 136 DROPPED it,
       -- together with notify_join_accepted and both join triggers, when join
       -- notifications moved to the app's push path. Production has neither,
       -- correctly. What must hold now is that they stay retired: if one comes
       -- back, joins run the legacy trigger path again (T-DRIFT1's July outage).
       case when exists (select 1 from pg_proc
                          where pronamespace = 'public'::regnamespace
                            and proname in ('notify_join_request', 'notify_join_accepted'))
              then 'MISSING -- a notify_join_* function retired by 136 exists again'
            when exists (select 1 from pg_trigger
                          where not tgisinternal
                            and tgname in ('on_join_request_created', 'on_join_accepted'))
              then 'MISSING -- a join notify trigger retired by 136 exists again'
            else 'applied' end
union all
select '109_fix_participant_count_drift',
       -- T-COUNT1: dropped the legacy delta trigger update_participant_count so
       -- only the recompute trigger maintains current_participants. Applied
       -- once that legacy trigger is gone from session_participants.
       case when not exists (
         select 1 from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
         where c.relname = 'session_participants'
           and t.tgname = 'update_participant_count'
       ) then 'applied' else 'MISSING' end
union all
select '110_fix_like_comment_follow_counter_drift',
       -- T-COUNT2: consolidated post_likes / post_comments / user_follows to a
       -- single recompute writer each. Applied once the legacy delta functions
       -- are gone.
       case when not exists (
         select 1 from pg_proc
         where pronamespace = 'public'::regnamespace
           and proname in ('on_post_like', 'update_post_like_count',
                           'update_post_comment_count', 'on_user_follow', 'on_user_unfollow')
       ) then 'applied' else 'MISSING' end
union all
select '043_lock_is_admin',
       -- T-SEC2 / drift audit H1: 043 was never deployed to prod, leaving no
       -- guard against is_admin self-escalation. Applied 2026-07-08. Applied
       -- once the BEFORE UPDATE guard trigger exists on users.
       case when exists (
         select 1 from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
         where c.relname = 'users'
           and t.tgname = 'users_is_admin_guard'
       ) then 'applied' else 'MISSING' end
union all
select '111_async_http_and_externalize_secrets',
       -- Rewritten 2026-09-28 (T-DRIFT2). Was: "notify_join_request uses
       -- net.http_post", a function 136 dropped. 111's lasting intent is on the
       -- one trigger function of its five that 136 kept, notify_chat_message_webhook:
       -- the call is async (net.http_post, never extensions.http), the secret
       -- comes from Vault, and no credential is a literal in the body. The other
       -- three 111 functions and their triggers must stay retired (136).
       -- Code checks run on the body's CODE SKELETON: string literals and comments
       -- removed in ONE left-to-right pass (a regex alternation where whichever
       -- token starts first wins), so a "--" inside a string and an apostrophe
       -- inside a comment are both handled, as a tokeniser would. Dollar-quoted
       -- strings nested inside a body are not handled; none of these bodies has
       -- one. The literal-credential check reads the RAW body: a key in a comment
       -- is still a leaked key.
       -- The trigger must be ENABLED: disabled, chat push stops. (The T-AV local
       -- stack disables it on purpose, so this row reads MISSING there.)
       case when exists (select 1 from pg_proc
                          where pronamespace = 'public'::regnamespace
                            and proname in ('notify_new_message', 'send_push_notification_webhook'))
              then 'MISSING -- a push trigger function retired by 136 exists again'
            when exists (select 1 from pg_trigger
                          where not tgisinternal
                            and tgname in ('on_message_sent', 'send_push_notification_trigger'))
              then 'MISSING -- a push trigger retired by 136 exists again'
            when to_regprocedure('public.notify_chat_message_webhook()') is null
              then 'MISSING -- notify_chat_message_webhook is gone; chat push stops'
            when (select regexp_replace(prosrc, '''([^'']|'''')*''|--[^\n]*|/\*([^*]|\*+[^*/])*\*+/', ' ', 'g') !~ 'net\.http_post' or regexp_replace(prosrc, '''([^'']|'''')*''|--[^\n]*|/\*([^*]|\*+[^*/])*\*+/', ' ', 'g') ~* 'extensions\.http'
                    from pg_proc where oid = to_regprocedure('public.notify_chat_message_webhook()'))
              then 'MISSING -- the chat webhook is not async (net.http_post); a slow endpoint blocks chat writes'
            when (select regexp_replace(prosrc, '''([^'']|'''')*''|--[^\n]*|/\*([^*]|\*+[^*/])*\*+/', ' ', 'g') !~* 'vault\.decrypted_secrets'
                    from pg_proc where oid = to_regprocedure('public.notify_chat_message_webhook()'))
              then 'MISSING -- the chat webhook no longer reads its secret from Vault'
            when (select prosrc ~ 'eyJ[A-Za-z0-9_-]{10,}' or prosrc ~* '''x-webhook-secret''\s*,\s*'''
                    from pg_proc where oid = to_regprocedure('public.notify_chat_message_webhook()'))
              then 'MISSING -- a literal credential is in the chat webhook body; rotate it'
            when not exists (select 1 from pg_trigger
                              where tgrelid = 'public.chat_messages'::regclass
                                and tgname = 'chat_message_webhook' and tgenabled <> 'D')
              then 'MISSING -- the chat_message_webhook trigger is missing or disabled; chat push stops'
            else 'applied' end
union all
select '067_users_push_token_revoke',
       -- T-SEC (drift audit RLS-H1): 067 revokes SELECT on push/FCM + Tribe.OS
       -- billing columns from anon/authenticated so they aren't cross-user
       -- readable. Was found unapplied for `authenticated` (push_subscription
       -- holds private push keys). Applied once NEITHER anon nor authenticated
       -- can SELECT push_subscription on users.
       case when not exists (
         select 1 from information_schema.column_privileges
         where table_schema = 'public' and table_name = 'users'
           and column_name = 'push_subscription'
           and privilege_type = 'SELECT'
           and grantee in ('anon', 'authenticated')
       ) then 'applied' else 'MISSING' end
union all
select '113_revoke_users_sensitive_columns',
       -- T-SEC3 Phase B: SELECT on is_admin + payout/earnings columns revoked
       -- from anon/authenticated. Applied once is_admin is no longer granted to
       -- either role (the other 4 columns are revoked in the same statement).
       case when not exists (
         select 1 from information_schema.column_privileges
         where table_schema = 'public' and table_name = 'users'
           and column_name = 'is_admin'
           and privilege_type = 'SELECT'
           and grantee in ('anon', 'authenticated')
       ) then 'applied' else 'MISSING' end
union all
select '112_users_private_fields',
       -- T-SEC3 Phase A (additive): server-side accessors added ahead of the
       -- 113 column revoke. Applied once BOTH definer helpers exist.
       case when exists (
         select 1 from pg_proc
         where proname = 'get_my_private_profile'
           and pronamespace = 'public'::regnamespace
       ) and exists (
         select 1 from pg_proc
         where proname = 'get_admin_user_ids'
           and pronamespace = 'public'::regnamespace
       ) then 'applied' else 'MISSING' end
union all
select '114_users_discoverable_and_self_location',
       -- T-SEC4 Gate 1 (additive): fuzzed users_discoverable view + the
       -- get_my_location() self accessor, added ahead of the Gate 3 coord
       -- revoke. Applied once BOTH objects exist.
       case when exists (
         select 1 from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname = 'users_discoverable' and c.relkind = 'v'
       ) and exists (
         select 1 from pg_proc
         where proname = 'get_my_location'
           and pronamespace = 'public'::regnamespace
       ) then 'applied' else 'MISSING' end
union all
select '115_revoke_users_coords',
       -- T-SEC4 Gate 3: SELECT on location_lat/location_lng revoked from
       -- anon/authenticated. Applied once location_lat is no longer granted to
       -- either role (location_lng is revoked in the same statement).
       case when not exists (
         select 1 from information_schema.column_privileges
         where table_schema = 'public' and table_name = 'users'
           and column_name = 'location_lat'
           and privilege_type = 'SELECT'
           and grantee in ('anon', 'authenticated')
       ) then 'applied' else 'MISSING' end
union all
select '116_get_admin_ids_by_email',
       -- T-SEC5 Batch 2 (additive): definer that resolves the ADMIN_EMAILS
       -- whitelist to user-ids for the bulletin notify path. Applied once the
       -- function exists.
       case when exists (
         select 1 from pg_proc
         where proname = 'get_admin_ids_by_email'
           and pronamespace = 'public'::regnamespace
       ) then 'applied' else 'MISSING' end
union all
select '117_get_session_attendance',
       -- T-SEC5 Batch 3 (additive): server-side attendance matcher definer.
       -- Applied once the function exists.
       case when exists (
         select 1 from pg_proc
         where proname = 'get_session_attendance'
           and pronamespace = 'public'::regnamespace
       ) then 'applied' else 'MISSING' end
union all
select '118_revoke_users_email',
       -- T-SEC5 final: SELECT on users.email revoked from anon/authenticated.
       -- Applied once email is no longer granted to either role.
       case when not exists (
         select 1 from information_schema.column_privileges
         where table_schema = 'public' and table_name = 'users'
           and column_name = 'email'
           and privilege_type = 'SELECT'
           and grantee in ('anon', 'authenticated')
       ) then 'applied' else 'MISSING' end
union all
select '119_join_session_enforce_policy_and_owner',
       -- Rewritten 2026-09-28 (T-DRIFT2). Was: an overload whose
       -- pg_get_function_identity_arguments equals 'uuid, uuid, text, text'.
       -- That function returns argument NAMES as well as types
       -- ('p_session_id uuid, ...'), so the probe could never match. Production
       -- has the hardened 4-argument join_session (last replaced by 185).
       -- T-SEC1's intent: EVERY join_session overload enforces the session's
       -- join_policy and checks the caller. An older overload without those is a
       -- bypass, so all overloads are checked, not "one good one exists".
       -- This reads the code skeleton (string literals and comments removed in one
       -- pass, see 111 above), which shows the checks are written, not that they
       -- are correct; T-SEC1's behaviour tests own that.
       case when not exists (select 1 from pg_proc
                              where pronamespace = 'public'::regnamespace and proname = 'join_session')
              then 'MISSING -- join_session is gone; every join fails'
            when exists (select 1 from pg_proc
                          where pronamespace = 'public'::regnamespace and proname = 'join_session'
                            and (regexp_replace(prosrc, '''([^'']|'''')*''|--[^\n]*|/\*([^*]|\*+[^*/])*\*+/', ' ', 'g') !~* 'join_policy' or regexp_replace(prosrc, '''([^'']|'''')*''|--[^\n]*|/\*([^*]|\*+[^*/])*\*+/', ' ', 'g') !~* 'auth\.uid\(\)'))
              then 'MISSING -- a join_session overload does not check join_policy and the caller'
            when not exists (select 1 from pg_proc
                              where pronamespace = 'public'::regnamespace and proname = 'join_session'
                                and 'p_invite_token' = any (proargnames))
              then 'MISSING -- join_session takes no p_invite_token; invite-only sessions cannot be enforced'
            when to_regprocedure('public.join_session_as_guest(uuid,text,text,text,text)') is null
              then 'MISSING -- join_session_as_guest is gone; guest joins fail'
            else 'applied' end
union all
select '120_guest_tokenless_open_and_waitlist_accept',
       -- T-SEC1 Gate 2.5b: guest RPC token made optional (open-only when absent)
       -- and now returns guest_token, plus the new accept_waitlist_offer
       -- reserved-seat definer. Both ship together; applied once
       -- accept_waitlist_offer exists.
       case when exists (
         select 1 from pg_proc where proname='accept_waitlist_offer'
           and pronamespace='public'::regnamespace
       ) then 'applied' else 'MISSING' end
union all
select '121_gate3_drop_session_participants_insert_rls',
       -- T-SEC1 Gate 3: the four permissive INSERT policies on
       -- session_participants are dropped; direct inserts now default-deny.
       -- Applied once zero INSERT policies remain on the table.
       case when not exists (
         select 1 from pg_policies
         where schemaname='public' and tablename='session_participants' and cmd='INSERT'
       ) then 'applied' else 'MISSING' end
union all
select '122_notifications_realtime',
       -- QA realtime fix: notifications added to the supabase_realtime
       -- publication (+ REPLICA IDENTITY FULL). Applied once the table is
       -- a member of the publication.
       case when exists (
         select 1 from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
       ) then 'applied' else 'MISSING' end
union all
select '123_conversation_participant_join_guard',
       -- Interim DM-vuln mitigation: BEFORE INSERT trigger blocks joining a
       -- conversation you are not part of. Applied once the trigger exists.
       case when exists (
         select 1 from pg_trigger
         where tgname = 'trg_guard_conversation_participant_insert'
       ) then 'applied' else 'MISSING' end
union all
select '124_get_or_create_direct_conversation_rpc',
       -- Permanent DM fix Gate 1: the atomic, self-inclusion-enforcing DM RPC.
       -- Applied once the function exists.
       case when exists (
         select 1 from pg_proc
         where proname = 'get_or_create_direct_conversation'
           and pronamespace = 'public'::regnamespace
       ) then 'applied' else 'MISSING' end
union all
select '125_consolidate_chat_messages_rls',
       -- chat_messages RLS consolidated to one policy per action (session + DM
       -- escape hatch). Applied once the four named policies exist.
       case when (
         select count(*) from pg_policies
         where schemaname='public' and tablename='chat_messages'
           and policyname in ('chat_messages_select','chat_messages_insert',
                              'chat_messages_update','chat_messages_delete')
       ) = 4 then 'applied' else 'MISSING' end
union all
select '126_gate3_drop_conversation_insert_rls',
       -- DM Gate 3: the direct-INSERT door is gone — the get_or_create RPC is the
       -- only write path. Applied once NO INSERT-command policy (polcmd 'a') remains
       -- on conversation_participants (the vuln table); the RPC bypasses RLS as owner.
       case when not exists (
         select 1
         from pg_policy pol
         join pg_class cls on cls.oid = pol.polrelid
         join pg_namespace ns on ns.oid = cls.relnamespace
         where ns.nspname = 'public'
           and cls.relname = 'conversation_participants'
           and pol.polcmd = 'a'
       ) then 'applied' else 'MISSING' end
union all
select '127_rls_h3_gate1_participant_views',
       -- RLS-H3 Gate 1 (additive): the two read surfaces that consumers move onto
       -- before the raw table is locked. Applied once both views exist.
       case when (
         select count(*) from pg_views
         where schemaname = 'public'
           and viewname in ('session_participants_public', 'session_participants_roster')
       ) = 2 then 'applied' else 'MISSING' end
union all
select '128_rls_h3_gate2_guest_and_payment_rpcs',
       -- RLS-H3 Gate 2: guest leave/status + host payment definer RPCs. Applied
       -- once all three functions exist.
       case when (
         select count(*) from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname in ('guest_leave_session', 'guest_participation_status',
                             'session_payment_roster', 'count_active_athletes')
       ) = 4 then 'applied' else 'MISSING' end
union all
select '129_rls_h3_gate3_lock_session_participants',
       -- Gate 3: raw session_participants locked. Applied once the narrow
       -- sp_select_own policy exists (the only SELECT policy on the table).
       case when exists (
         select 1 from pg_policies
         where schemaname='public' and tablename='session_participants' and policyname='sp_select_own'
       ) then 'applied' else 'MISSING' end
union all
select '130_rls_h3_gate3_column_level_grants',
       -- Gate 3b: the guest-PII column revoke made effective (table SELECT dropped,
       -- column-level SELECT re-granted minus the 3). Applied once authenticated no
       -- longer holds SELECT on guest_phone.
       case when not has_column_privilege('authenticated','public.session_participants','guest_phone','SELECT')
            then 'applied' else 'MISSING' end
union all
select '131_rls_h2_gate1_invite_token_backfill_and_rpcs',
       -- RLS-H2 Gate 1: invite_tokens backfill + validate_invite_token /
       -- create_session_invite RPCs. Applied once both functions exist.
       case when (
         select count(*) from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname='public' and p.proname in ('validate_invite_token','create_session_invite')
       ) = 2 then 'applied' else 'MISSING' end
union all
select '132_rls_h2_gate2_invite_notification_rpc',
       -- RLS-H2 Gate 2: caller-scoped notification-resolution RPC. Applied once it exists.
       case when (select to_regprocedure('public.get_invite_token_for_notification(uuid)')) is not null
            then 'applied' else 'MISSING' end
union all
select '133_rls_h2_gate2_invite_notification_rpc_fix',
       -- Rewritten 2026-09-28 (T-DRIFT2). Was: definition NOT LIKE
       -- '%p_session_id::text%'. The fixed body keeps a comment saying it
       -- "was p_session_id::text", and Postgres stores function comments
       -- verbatim, so the probe matched its author's own note and read MISSING
       -- on the fixed function. Now it reads the code skeleton only (string
       -- literals and comments removed in one pass, see 111 above): no ::text
       -- cast on p_session_id, and a direct entity_id = p_session_id comparison.
       case when to_regprocedure('public.get_invite_token_for_notification(uuid)') is null
              then 'MISSING -- get_invite_token_for_notification(uuid) is gone; invite notifications cannot open'
            when (select regexp_replace(prosrc, '''([^'']|'''')*''|--[^\n]*|/\*([^*]|\*+[^*/])*\*+/', ' ', 'g') ~ 'p_session_id\s*::\s*text' from pg_proc
                   where oid = to_regprocedure('public.get_invite_token_for_notification(uuid)'))
              then 'MISSING -- executable code casts p_session_id to text; uuid = text throws on every call'
            when (select regexp_replace(prosrc, '''([^'']|'''')*''|--[^\n]*|/\*([^*]|\*+[^*/])*\*+/', ' ', 'g') !~ 'entity_id\s*=\s*p_session_id' from pg_proc
                   where oid = to_regprocedure('public.get_invite_token_for_notification(uuid)'))
              then 'MISSING -- the body no longer compares entity_id = p_session_id'
            else 'applied' end
union all
select '134_rls_h2_gate3_lock_invite_tokens',
       -- Gate 3: raw invite_tokens locked. Applied once anon no longer holds a
       -- table SELECT grant (the revoke, not just the policy drop).
       case when not has_table_privilege('anon','public.invite_tokens','SELECT')
            then 'applied' else 'MISSING' end
union all
select '135_fix_instructor_participant_visibility',
       -- Hotfix for 129: host row VISIBILITY that approve/decline/kick depend on.
       -- Applied once sp_select_by_instructor exists.
       case when exists (
         select 1 from pg_policies
         where schemaname='public' and tablename='session_participants'
           and policyname='sp_select_by_instructor'
       ) then 'applied' else 'MISSING' end
union all
select '136_retire_edge_function_push_triggers',
       -- Retirement of the dead Edge Function push triggers. Applied once all
       -- four functions are gone AND the kept chat function still exists, so a
       -- run that over-dropped reports MISSING rather than applied.
       case when (select to_regprocedure('public.notify_join_accepted()'))            is null
             and (select to_regprocedure('public.notify_join_request()'))             is null
             and (select to_regprocedure('public.notify_new_message()'))              is null
             and (select to_regprocedure('public.send_push_notification_webhook()'))  is null
             and (select to_regprocedure('public.notify_chat_message_webhook()'))     is not null
            then 'applied' else 'MISSING' end
union all
select '137_lock_payment_instructions_from_anon',
       -- Applied once anon no longer holds SELECT on the column. Reports
       -- MISSING while the table-level grant is in place, which is correct:
       -- a table grant overrides the column grants and re-exposes the field
       -- (that is exactly what the 2026-07-22 outage rollback restored).
       case when not has_column_privilege('anon','public.sessions','payment_instructions','SELECT')
            then 'applied' else 'MISSING' end
union all
select '138_rls_h4_gate1_sessions_public_view',
       -- Gate 1: the anon-facing view exists AND validate_invite_token no longer
       -- returns to_jsonb of the whole row (its body must not contain to_jsonb).
       case when (select to_regclass('public.sessions_public')) is not null
             and pg_get_functiondef('public.validate_invite_token(text)'::regprocedure) not like '%to_jsonb(s)%'
            then 'applied' else 'MISSING' end
union all
select '139_fix_sessions_public_comment',
       -- Cosmetic: corrects the sessions_public COMMENT so it says invite_only is
       -- EXCLUDED, not location-stubbed. Applied once the live view comment carries
       -- the corrected wording.
       case when obj_description('public.sessions_public'::regclass, 'pg_class') like '%EXCLUDED entirely%'
            then 'applied' else 'MISSING' end
union all
select '140_rls_h4_gate3_revoke_sessions_from_anon',
       -- Gate 3 (DRAFT — staged, not yet applied): revokes anon SELECT on the
       -- whole public.sessions table. Correctly reads MISSING until the revoke
       -- runs; applied once anon no longer holds table-level SELECT on sessions.
       case when not has_table_privilege('anon','public.sessions','SELECT')
            then 'applied' else 'MISSING' end
union all
select '141_tc1_gate4_widen_invite_mint',
       -- T-C1 Gate 4 (D7 Option B): invite minting widened to creator OR
       -- confirmed participant; validate_invite_token projects the HOST
       -- (creator_id). Applied once create_session_invite references
       -- session_participants AND the renamed policy exists. (Companion
       -- dry-run lives at supabase/141_..REHEARSAL.sql, outside migrations/.)
       case when exists (
         select 1 from pg_proc
         where proname = 'create_session_invite'
           and pronamespace = 'public'::regnamespace
           and pg_get_functiondef(oid) like '%session_participants%'
       ) and exists (
         select 1 from pg_policies
         where schemaname = 'public' and tablename = 'invite_tokens'
           and policyname = 'Creator or confirmed participant can create invite tokens'
       ) then 'applied' else 'MISSING' end
union all
select '142_flag_founder_test_accounts',
       -- Rewritten 2026-09-28 (T-DRIFT2). Was: "exactly 13 users flagged", which
       -- broke as soon as later accounts were flagged (production: 26). Strict on
       -- what 142 did, with one decided exception: 12 of the 13 accounts 142
       -- names must be flagged, and eaff348f-5df3-4df5-bd80-69ec233aad0e must NOT be.
       -- eaff348f-5df3-4df5-bd80-69ec233aad0e: founder's real account, intentionally unflagged, decided 2026-09-28.
       -- Accounts flagged later do not count against this. The 12 ids are 142's
       -- own list minus that one.
       case when (select count(*) from public.users
                   where id = any (array['d7cc0e7e-44db-4e57-80d3-a82f6e90bff4',
                   'd92d4816-af5d-42ae-9d33-02f330e221bd',
                   '7ad0c072-6519-481d-ba8c-bab2526b3449',
                   '3af48aac-3f33-4055-ab6a-354791d5b1bb',
                   '00bbef64-123f-432f-bf13-0c7572137c9d',
                   'd479736b-bfe1-4f92-9a0f-8d5871859400',
                   'a59598c6-42a0-4b22-aa3d-e61ea778a841',
                   'c5d7e023-bc9d-4c5d-904b-3f7844943672',
                   'ddf4ea3c-3aab-411b-8960-9e57d9bcd526',
                   'fd7dbf6a-6198-42fe-bb1c-347af3d111bd',
                   '8062bb54-d7bd-4946-bbe7-82b9330da69e',
                   '673834b4-d9be-4782-86c9-ff27376233a7']::uuid[])
                     and is_test_account = true) <> 12
              then 'MISSING -- ' ||
                   (select count(*) from public.users
                     where id = any (array['d7cc0e7e-44db-4e57-80d3-a82f6e90bff4',
                   'd92d4816-af5d-42ae-9d33-02f330e221bd',
                   '7ad0c072-6519-481d-ba8c-bab2526b3449',
                   '3af48aac-3f33-4055-ab6a-354791d5b1bb',
                   '00bbef64-123f-432f-bf13-0c7572137c9d',
                   'd479736b-bfe1-4f92-9a0f-8d5871859400',
                   'a59598c6-42a0-4b22-aa3d-e61ea778a841',
                   'c5d7e023-bc9d-4c5d-904b-3f7844943672',
                   'ddf4ea3c-3aab-411b-8960-9e57d9bcd526',
                   'fd7dbf6a-6198-42fe-bb1c-347af3d111bd',
                   '8062bb54-d7bd-4946-bbe7-82b9330da69e',
                   '673834b4-d9be-4782-86c9-ff27376233a7']::uuid[])
                       and is_test_account = true)::text ||
                   ' of the 12 test accounts 142 flagged are still flagged; all 12 must be'
            when exists (select 1 from public.users
                          where id = 'eaff348f-5df3-4df5-bd80-69ec233aad0e'::uuid
                            and is_test_account = true)
              then 'MISSING -- the founder''s real account eaff348f-5df3-4df5-bd80-69ec233aad0e is flagged as a test account; it must not be'
            else 'applied' end
union all
select '143_d9_invite_expiry_session_anchored',
       -- Anchors invite expiry to the session: adds session_invite_expiry(uuid)
       -- and rewires create_session_invite. Applied once the function exists.
       case when exists (
         select 1 from pg_proc
         where proname = 'session_invite_expiry' and pronamespace = 'public'::regnamespace
       ) then 'applied' else 'MISSING' end
union all
select '144_recur1_gate0_sessions_updated_at_trigger',
       -- Adds the trg_sessions_updated_at BEFORE UPDATE trigger on public.sessions.
       case when exists (
         select 1 from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname = 'sessions'
           and t.tgname = 'trg_sessions_updated_at'
       ) then 'applied' else 'MISSING' end
union all
select '145_sec4_media_bucket_lockdown',
       -- Locks storage.objects media writes to the owner. Applied once the
       -- owner-scoped upload policy exists.
       case when exists (
         select 1 from pg_policies
         where schemaname = 'storage' and tablename = 'objects'
           and policyname = 'Users can upload own media'
       ) then 'applied' else 'MISSING' end
union all
select '146_sec4_capture_production_media_policies',
       -- Captures the production media read policy on storage.objects.
       case when exists (
         select 1 from pg_policies
         where schemaname = 'storage' and tablename = 'objects'
           and policyname = 'Authenticated can read media'
       ) then 'applied' else 'MISSING' end
union all
select '147_capture_user_follows_schema',
       -- Captures public.user_follows (with its no_self_follow CHECK and
       -- unique_follow UNIQUE constraints) and session_participants
       -- .payment_confirmed_by. Applied once the table AND both constraints
       -- exist, which distinguishes a real apply from a partial one.
       case when (select to_regclass('public.user_follows')) is not null
              and exists (select 1 from pg_constraint where conname = 'no_self_follow')
              and exists (select 1 from pg_constraint where conname = 'unique_follow')
            then 'applied' else 'MISSING' end
union all
select '148_total_sessions_hosted_counter',
       -- Makes users.total_sessions_hosted a maintained counter via
       -- recompute_all_total_sessions_hosted() plus triggers on sessions.
       case when exists (
         select 1 from pg_proc
         where proname = 'recompute_all_total_sessions_hosted' and pronamespace = 'public'::regnamespace
       ) then 'applied' else 'MISSING' end
union all
select '149_proximity_alerts_preference',
       -- Adds notification_preferences.proximity_alerts (boolean, not null).
       case when exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'notification_preferences'
           and column_name = 'proximity_alerts'
       ) then 'applied' else 'MISSING' end
union all
select '150_notification_prefs_signup_trigger',
       -- Adds the AFTER INSERT trigger on auth.users that seeds a default
       -- notification_preferences row for every new signup.
       case when exists (
         select 1 from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'auth' and c.relname = 'users'
           and t.tgname = 'create_notification_prefs_on_signup'
       ) then 'applied' else 'MISSING' end
union all
select '151_notification_prefs_backfill',
       -- Data migration (no schema artifact): backfills a notification_preferences
       -- row for every existing user and merges legacy session_reminders_enabled
       -- opt-outs. Probed by the invariant it establishes: no auth user lacks a
       -- row (the 150 trigger keeps this true for new signups).
       case when not exists (
         select 1 from auth.users a
         left join public.notification_preferences p on p.user_id = a.id
         where p.user_id is null
       ) then 'applied' else 'MISSING' end
union all
select '152_scope_participant_roster',
       -- Scopes the session_participants_roster view to the session creator, a
       -- confirmed participant, or an app admin. The view predated 152 (127/128)
       -- with NO viewer scoping, so existence alone is not a signal. Probed on the
       -- view definition carrying the auth.uid() scoping the WHERE clause added.
       case when exists (
         select 1 from pg_views
         where schemaname = 'public' and viewname = 'session_participants_roster'
           and definition ilike '%auth.uid()%'
       ) then 'applied' else 'MISSING' end
union all
select '153_host_door_checkin',
       -- Adds the two creator-scoped door check-in RPCs. Applied once BOTH
       -- functions exist (a partial apply that created only one is caught).
       case when exists (
         select 1 from pg_proc
         where proname = 'host_add_session_guest' and pronamespace = 'public'::regnamespace
       ) and exists (
         select 1 from pg_proc
         where proname = 'host_remove_session_guest' and pronamespace = 'public'::regnamespace
       ) then 'applied' else 'MISSING' end
union all
select '154_close_guest_delete_policy',
       -- A revoke: probed by the ABSENCE it establishes. Both unverified guest
       -- DELETE policies are gone AND the orphaned check_guest_identity function
       -- is dropped. (sp_delete_by_instructor and the self-delete policies are
       -- intentionally kept and are not probed here.)
       case when not exists (
         select 1 from pg_policies
         where schemaname = 'public' and tablename = 'session_participants'
           and policyname in ('Guests can leave sessions', 'Allow guests to delete their own participation')
       ) and not exists (
         select 1 from pg_proc
         where proname = 'check_guest_identity' and pronamespace = 'public'::regnamespace
       ) then 'applied' else 'MISSING' end
union all
select '155_door_guest_payment_not_required',
       -- Replaces host_add_session_guest so door guests land payment_status
       -- not_required (via a post-insert UPDATE that overrides the BEFORE INSERT
       -- trigger). Probed on the function body carrying that UPDATE, since the
       -- function already existed (153) so its presence alone is not a signal.
       case when pg_get_functiondef('public.host_add_session_guest(uuid, text, text, text)'::regprocedure)
                 ilike '%payment_status%not_required%'
            then 'applied' else 'MISSING' end
union all
select '156_onboarding_state',
       -- First-run state moved off localStorage onto the user row. Probes all
       -- three parts: both columns AND the dismiss_banner RPC, since the
       -- columns without the function would leave every banner dismissal
       -- failing silently at runtime.
       case when exists (
                  select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'users'
                    and column_name = 'onboarding_completed_at'
                )
             and exists (
                  select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'users'
                    and column_name = 'dismissed_banners'
                )
             and exists (
                  select 1 from pg_proc p
                  join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'dismiss_banner'
                )
            then 'applied' else 'MISSING' end
union all
select '157_grant_onboarding_columns',
       -- Grants SELECT on 156's two columns. 156 added them without a grant,
       -- so the client could not read them at all -- see the guards below.
       case when has_column_privilege('authenticated', 'public.users', 'onboarding_completed_at', 'SELECT')
             and has_column_privilege('authenticated', 'public.users', 'dismissed_banners', 'SELECT')
            then 'applied' else 'MISSING' end
union all

-- ---------------------------------------------------------------------------
-- GUARDS (not migrations): column-level SELECT grants on public.users.
--
-- public.users has NO table-level SELECT grant for authenticated or anon. 066
-- revoked it and re-granted SELECT column by column; 067 extended the list.
-- Any column added afterwards is invisible to every non-service caller until
-- it is granted explicitly, and the client fails with
--   42501 permission denied for table users
-- That is exactly how 156 shipped: it added two columns, granted neither, and
-- blanked the first-run introduction, all five dismissible banners and the
-- What's New badge. Before this guard the rule existed only as a comment in
-- 066's header, which is why it was missed. Three attempts went into finding
-- it, because the DAL is mocked in every unit test and no test can see a
-- permission error.
--
-- USE has_column_privilege(). DO NOT swap in information_schema.column_privileges.
-- That view lists only explicitly granted COLUMN privileges and cannot see a
-- table-level grant. A column readable through a table-level grant is absent
-- from it; a column that is genuinely unreadable is also absent from it. It
-- returns identical output for the two cases this guard exists to tell apart,
-- and it gave a false pass while this bug was being diagnosed.
-- has_column_privilege() resolves table-level and column-level grants together
-- and is the only correct test here.
--
-- The exclusion list is the set of columns deliberately withheld from the
-- client by 066, 067, 113, 115 and 118. Anything NOT on it must be readable.
-- Adding a column to public.users means either granting it or listing it here
-- with the migration that restricts it -- never leaving it in neither.
--
-- ENUMERATE pg_attribute KEYED ON 'public.users'::regclass, AND CALL
-- has_column_privilege WITH (oid, attnum), NOT (name, name). Fixed 2026-09-28.
-- This guard first read information_schema.columns filtered by
-- table_schema = 'public' AND table_name = 'users' and passed c.column_name to
-- has_column_privilege('authenticated', 'public.users', c.column_name, ...).
-- AND does not short-circuit: the planner may evaluate the privilege call
-- before the schema filter, and auth.users is also named "users". Production's
-- plan did, and the whole file died when it was run in production after #182:
--   ERROR 42703: column "instance_id" of relation "users" does not exist
-- (instance_id is an auth.users column). Local and CI never saw it: CI does not
-- execute this file, and the local plan joins pg_namespace before scanning
-- pg_attribute. Forcing a different local plan (enable_nestloop = off)
-- reproduced the same 42703. CLAUDE.md records this exact shape from
-- migration 168's rehearsal.
-- Keyed on regclass, every row is a column of public.users by construction, and
-- the (oid, attnum) form resolves no name, so no evaluation order can hand it a
-- column that does not exist.
-- ---------------------------------------------------------------------------
select 'GUARD_users_columns_readable',
       coalesce(
         'MISSING -- not readable by authenticated: '
           || string_agg(a.attname::text, ', ' order by a.attname),
         'applied'
       )
from pg_attribute a
where a.attrelid = 'public.users'::regclass
  and a.attnum > 0
  and not a.attisdropped
  and a.attname not in (
    -- 066/067: Tribe.OS billing, push and device identity (service-role only)
    'tribe_os_stripe_customer_id', 'tribe_os_stripe_subscription_id',
    'tribe_os_granted_at', 'tribe_os_granted_by',
    'push_subscription', 'fcm_token', 'fcm_platform', 'fcm_updated_at',
    -- 113: admin flag and payout identity
    'is_admin', 'payout_method', 'stripe_account_id', 'wompi_merchant_id',
    'total_earnings_cents',
    -- 115: precise home coordinates
    'location_lat', 'location_lng',
    -- 118: email
    'email',
    -- 214: how the account arrived and who invited it. Every signed-in user can
    -- read every granted users column, so a grant would publish this to all of
    -- them. Admin reads it with the service role.
    'signup_src', 'signup_code', 'signup_ref', 'signup_utm_source',
    'signup_utm_medium', 'signup_utm_campaign', 'signup_utm_content',
    'signup_landing_path', 'signup_first_touch', 'signup_attributed_at'
  )
  and not has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT')
union all

-- The mirror of the guard above: a column the app believes is withheld must
-- actually be withheld. This catches the failure mode 093 introduced, where a
-- table-level GRANT silently re-exposes every restricted column, because a
-- column-level REVOKE cannot take a table-level privilege away. Verified clean
-- against production on 2026-09-09 (auth_email = false).
select 'GUARD_users_columns_restricted',
       coalesce(
         'MISSING -- unexpectedly READABLE by authenticated: '
           || string_agg(r.column_name, ', ' order by r.column_name),
         'applied'
       )
from (values
    ('tribe_os_stripe_customer_id'), ('tribe_os_stripe_subscription_id'),
    ('tribe_os_granted_at'), ('tribe_os_granted_by'),
    ('push_subscription'), ('fcm_token'), ('fcm_platform'), ('fcm_updated_at'),
    ('is_admin'), ('payout_method'), ('stripe_account_id'), ('wompi_merchant_id'),
    ('total_earnings_cents'),
    ('location_lat'), ('location_lng'),
    ('email'),
    ('signup_src'), ('signup_code'), ('signup_ref'), ('signup_utm_source'),
    ('signup_utm_medium'), ('signup_utm_campaign'), ('signup_utm_content'),
    ('signup_landing_path'), ('signup_first_touch'), ('signup_attributed_at')
) as r(column_name)
where exists (
        select 1 from information_schema.columns c
        where c.table_schema = 'public' and c.table_name = 'users'
          and c.column_name = r.column_name
      )
  and has_column_privilege('authenticated', 'public.users', r.column_name, 'SELECT')
union all
select '158_gym_venue_approval',
       -- Probes all four parts: the three sessions columns, auto_approve_roster,
       -- both RPCs, and the view carrying the columns to anon. The columns
       -- without the RPCs would leave every approval failing silently.
       case when exists (
                  select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'sessions'
                    and column_name in ('partner_id', 'partner_status', 'partner_reviewed_at')
                  having count(*) = 3
                )
             and exists (
                  select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'featured_partners'
                    and column_name = 'auto_approve_roster'
                )
             and (select to_regprocedure('public.set_session_partner(uuid,uuid)')) is not null
             and (select to_regprocedure('public.review_venue_request(uuid,text)')) is not null
             and exists (
                  select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'sessions_public'
                    and column_name = 'partner_status'
                )
            then 'applied' else 'MISSING' end
union all

-- ---------------------------------------------------------------------------
-- GUARD: column-level INSERT/UPDATE grants on public.sessions.
--
-- 158 put public.sessions under column-level write grants so the creator cannot
-- set partner_status themselves: the table-level INSERT and UPDATE are revoked
-- from authenticated and re-granted column by column, excluding the two verdict
-- columns. A column added to sessions afterwards is therefore NOT writable by
-- authenticated until it is granted, and it fails in production while every
-- test passes -- the same shape of bug as 156's missing SELECT grant, which
-- took three attempts to find.
--
-- USE has_column_privilege(). DO NOT swap in information_schema.column_privileges.
-- That view lists only explicitly granted COLUMN privileges and cannot see a
-- table-level grant, so it returns the same "absent" answer for a column that
-- is writable via a table-level grant and for one that is genuinely not
-- writable -- identical output for the two cases this guard exists to tell
-- apart. It gave a false pass while 156's bug was being diagnosed.
--
-- partner_status and partner_reviewed_at are excluded on purpose: they are
-- deliberately not writable, and GUARD_sessions_verdict_locked below asserts
-- that they stay that way.
--
-- pg_attribute keyed on 'public.sessions'::regclass, (oid, attnum) privilege
-- calls: the same fix, same date and same reason as GUARD_users_columns_readable
-- above. auth.sessions exists too, and a forced local plan (enable_nestloop =
-- off) made the name-based version of this guard fail with 42703 exactly as the
-- users guard did in production.
-- ---------------------------------------------------------------------------
select 'GUARD_sessions_columns_writable',
       coalesce(
         'MISSING -- not writable by authenticated: '
           || string_agg(c.column_name || '(' || c.missing || ')', ', ' order by c.column_name),
         'applied'
       )
from (
  select a.attname::text as column_name,
         case
           when not has_column_privilege('authenticated', a.attrelid, a.attnum, 'UPDATE')
            and not has_column_privilege('authenticated', a.attrelid, a.attnum, 'INSERT')
             then 'insert+update'
           when not has_column_privilege('authenticated', a.attrelid, a.attnum, 'UPDATE')
             then 'update'
           else 'insert'
         end as missing
  from pg_attribute a
  where a.attrelid = 'public.sessions'::regclass
    and a.attnum > 0
    and not a.attisdropped
    -- THREE, not two: partner_id is revoked by 162 because it is the only way
    -- the verdict gets computed. See GUARD_sessions_verdict_locked below.
    and a.attname not in ('partner_status', 'partner_reviewed_at', 'partner_id')
    and (not has_column_privilege('authenticated', a.attrelid, a.attnum, 'UPDATE')
      or not has_column_privilege('authenticated', a.attrelid, a.attnum, 'INSERT'))
) c
union all

-- The mirror: the verdict columns must stay unwritable by authenticated, or the
-- gym no longer owns its own name and a creator can approve themselves. Catches
-- a well-meaning future migration re-granting sessions at table level, which
-- would silently re-open it (a column-level REVOKE cannot close it again -- see
-- 093).
select 'GUARD_sessions_verdict_locked',
       coalesce(
         'MISSING -- unexpectedly WRITABLE by authenticated: '
           || string_agg(v.column_name, ', ' order by v.column_name),
         'applied'
       )
from (values ('partner_status'), ('partner_reviewed_at'), ('partner_id')) as v(column_name)
where has_column_privilege('authenticated', 'public.sessions', v.column_name, 'UPDATE')
   or has_column_privilege('authenticated', 'public.sessions', v.column_name, 'INSERT')
union all
select '159_rls_admin_helper_not_inline_is_admin',
       -- Policy-only migration, so the artifact is the policy text itself.
       -- An untouched policy still reads "... FROM users WHERE id = auth.uid()
       -- AND is_admin"; a fixed one reads is_app_admin(). Matching on
       -- "from users" rather than on "is_admin" avoids matching the helper's
       -- own name.
       case when not exists (
         select 1 from pg_policies
         where schemaname = 'public'
           and tablename in ('featured_partners', 'community_news',
                             'local_fitness_events', 'community_bulletin')
           and coalesce(qual, '') ilike '%from users%'
       ) then 'applied' else 'MISSING' end
union all
select '160_drop_duplicate_partner_read_policy',
       -- The duplicate is gone when no policy on featured_partners reads users
       -- directly any more. Same text probe the migration asserts on, so this
       -- row and the migration cannot disagree.
       case when not exists (
         select 1 from pg_policies
         where schemaname = 'public' and tablename = 'featured_partners'
           and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ilike '%from users%'
       ) then 'applied' else 'MISSING' end
union all
select '161_featured_partners_display_order',
       case when exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'featured_partners'
           and column_name = 'display_order'
       ) then 'applied' else 'MISSING' end
union all
select '162_revoke_partner_id_write',
       -- Applied when authenticated can no longer write partner_id by either
       -- privilege. GUARD_sessions_verdict_locked below covers the same ground
       -- continuously; this row answers "did 162 run" specifically.
       case when not has_column_privilege('authenticated', 'public.sessions', 'partner_id', 'INSERT')
             and not has_column_privilege('authenticated', 'public.sessions', 'partner_id', 'UPDATE')
            then 'applied' else 'MISSING' end
union all
select '163_partner_slug_and_public_view',
       -- Three artifacts, all of which must be present: the NOT NULL slug
       -- column, the public view, and anon's grant on it. Checking only the
       -- column would report 'applied' for a half-run migration whose view is
       -- missing, which is the state in which every bio link renders a 404.
       case when exists (
              select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'featured_partners'
                and column_name = 'slug' and is_nullable = 'NO'
            )
            and to_regclass('public.partners_public') is not null
            -- has_table_privilege, never information_schema.table_privileges:
            -- that view cannot see table-level grants and passes either way.
            and has_table_privilege('anon', 'public.partners_public', 'SELECT')
            then 'applied' else 'MISSING' end
union all
select '166_capture_session_attendance',
       -- Capture-only: 166 creates nothing that did not already exist on
       -- production, so "did it run" cannot be answered by looking for a new
       -- object. What it guarantees is that the repo can REBUILD the table, so
       -- this row asserts the table still has the shape 166 records. The
       -- created_at type is the specific thing checked: both timestamps are
       -- `timestamp without time zone`, against the grain of the rest of this
       -- schema, and it is the detail a hand-reconstruction gets wrong. The
       -- unique constraint is checked alongside it because it is the conflict
       -- target upsertAttendance depends on -- losing it breaks writes, not
       -- reads, so nothing else would notice.
       case when to_regclass('public.session_attendance') is not null
             and exists (
               select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'session_attendance'
                 and column_name = 'created_at'
                 and data_type = 'timestamp without time zone'
             )
             and exists (
               select 1 from pg_constraint
               where conname = 'session_attendance_session_id_user_id_key'
             )
            then 'applied' else 'MISSING' end
union all
select '167_lock_session_attendance_reads',
       -- Five artifacts, all of which must hold. Checking the policy alone
       -- would report 'applied' for a half-run migration in which anon still
       -- holds SELECT -- which is precisely the state this migration exists to
       -- end, and the state in which the whole table is world-readable.
       --
       -- TRUNCATE is checked for BOTH client roles, separately from SELECT: it
       -- is the only privilege in the set that escapes RLS entirely, so a
       -- database with perfect policies and a surviving TRUNCATE grant is not
       -- locked down. authenticated is included because its seven grants were
       -- DIRECT, not inherited from PUBLIC, so a revoke aimed only at anon
       -- leaves it holding TRUNCATE.
       --
       -- has_table_privilege, never information_schema.table_privileges: that
       -- view cannot see table-level grants and passes either way.
       case when exists (
              select 1 from pg_policies
              where schemaname = 'public' and tablename = 'session_attendance'
                and policyname = 'sa_select_own_or_host'
            )
            and not exists (
              select 1 from pg_policies
              where schemaname = 'public' and tablename = 'session_attendance'
                and policyname = 'Anyone can view attendance'
            )
            and not has_table_privilege('anon', 'public.session_attendance', 'SELECT')
            and not has_table_privilege('anon', 'public.session_attendance', 'TRUNCATE')
            and not has_table_privilege('authenticated', 'public.session_attendance', 'TRUNCATE')
            then 'applied' else 'MISSING' end
union all
select '168_revoke_users_location_from_anon',
       -- EXPECTED TO REPORT 'MISSING' UNTIL GATE 0 IS DEPLOYED AND 168 IS RUN.
       -- That is the verifier working, not a fault: 168 is deliberately held
       -- until app/i/[id]/InstructorShareClient.tsx stops selecting location
       -- as anon, because PostgREST 401s a whole request over one ungranted
       -- column and that page blanks entirely on a failed profile fetch.
       --
       -- Both directions are asserted. Checking only that anon LOST the column
       -- would report 'applied' for a revoke that went too far and took
       -- authenticated with it -- which would break /storefront/[id],
       -- /instructors, ExploreCitySection, leadDiscovery, admin, and
       -- fetchUserProfile on /profile/[userId], all at once and silently.
       --
       -- has_column_privilege, never information_schema.column_privileges:
       -- the capability question, not "is there a row saying so".
       case when not has_column_privilege('anon', 'public.users', 'location', 'SELECT')
             and has_column_privilege('authenticated', 'public.users', 'location', 'SELECT')
            then 'applied' else 'MISSING' end
union all

select '169_delete_host_participant_rows',
       -- The applied state is a property of the data, not of a schema object:
       -- no session may record its own host as one of its participants. Asked
       -- as a capability question ("does such a row exist") rather than by
       -- looking for a migration name, so it also catches a row recreated after
       -- the migration ran -- which would be a live regression of the join path,
       -- not a missing migration, and is worth surfacing either way.
       --
       -- The counter is checked alongside, because the reason these rows matter
       -- is that trg_sync_session_participant_count (087) turns them into
       -- consumed capacity. A database with the rows gone but
       -- current_participants still overstated is not in the state 169 leaves.
       case when exists (
              select 1
              from public.session_participants sp
              join public.sessions s on s.id = sp.session_id
              where sp.user_id = s.creator_id
                and sp.status = 'confirmed'
                and sp.is_guest = false
            )
            then 'MISSING -- a session still records its own host as a participant, '
                 'which consumes a capacity seat'
            when exists (
              select 1 from public.sessions s
              where s.current_participants <> (
                select count(*) from public.session_participants sp
                where sp.session_id = s.id and sp.status = 'confirmed')
            )
            then 'MISSING -- current_participants disagrees with the confirmed-row '
                 'count on at least one session'
            else 'applied' end
union all

select '170_users_hide_from_attendee_lists',
       -- Three facts, all required. Checking only that the column exists would
       -- report 'applied' for exactly the 156 state: a column present and
       -- ungranted, where the first query naming it fails 42501 and takes its
       -- whole caller down.
       --
       -- The anon arm is asserted as an ABSENCE, because Supabase re-grants
       -- anon by default on some object changes -- the default-grant trap that
       -- has caught this project four times. An anon grant appearing here later
       -- is a regression, not a missing migration, and should be just as loud.
       --
       -- has_column_privilege, never information_schema.column_privileges: that
       -- view cannot see table-level grants and answers 'is there a row saying
       -- so' rather than 'can this role do it'.
       case when not exists (
              select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'users'
                and column_name = 'hide_from_attendee_lists'
            )
            then 'MISSING -- column absent'
            when not has_column_privilege('authenticated', 'public.users', 'hide_from_attendee_lists', 'SELECT')
            then 'MISSING -- column present but NOT granted to authenticated; '
                 'every select naming it fails 42501 (the 156/157 failure)'
            when has_column_privilege('anon', 'public.users', 'hide_from_attendee_lists', 'SELECT')
            then 'MISSING -- anon can read it; 170 deliberately does not grant anon'
            when not has_column_privilege('authenticated', 'public.users', 'hide_from_attendee_lists', 'UPDATE')
            then 'MISSING -- authenticated cannot UPDATE it, so the settings toggle cannot save'
            else 'applied' end
union all

select '171_backfill_instructor_sports',
       -- Like 169, the applied state is a property of the DATA, not of a schema
       -- object, so it is asked as a data question rather than by looking for a
       -- migration name.
       --
       -- Phrased as "no target row still needs the backfill", which is correct
       -- in both worlds: on production the three rows exist and must carry
       -- their canonical arrays, and on a database rebuilt from these
       -- migrations the rows do not exist at all and there is nothing to
       -- backfill. A check written as "all three rows have sports" would report
       -- MISSING forever on any fresh rebuild.
       --
       -- coalesce(array_length(...), 0) = 0 rather than `sports = '{}'`:
       -- BullBox's column was NULL where the other two were empty arrays, and
       -- an equality test against a NULL array yields NULL, not false, so the
       -- obvious predicate would silently match nothing and report 'applied'
       -- on a database that had never been backfilled.
       case when exists (
              select 1 from public.users u
              where u.id in (
                      '307cf7fa-a12e-468d-83f5-1a1cb82226e7'::uuid,   -- Salomon Tabares Adarve
                      '7c4e29a2-7689-4e83-8787-113ebd2c6a42'::uuid,   -- BullBox (instructor row)
                      '804f2c28-9851-4f7f-95ce-4bf5ce85caca'::uuid    -- Dennis
                    )
                and coalesce(array_length(u.sports, 1), 0) = 0
            )
            then 'MISSING -- an instructor row named in 171 still has no sports array, '
                 'so the sport filter on /instructors cannot reach them'
            else 'applied' end
union all

-- Walter White is the control 171 deliberately did NOT touch, asserted here so
-- a later widening of that migration's predicate shows up as a regression
-- rather than as a tidier-looking database. His only offering is Meditation,
-- which has no canonical sport, so he is complete on free text alone (the
-- T-PROF1 rule widened by Issue 1) and must gain no sports value.
select 'GUARD_171_left_its_control_alone',
       case when exists (
              select 1 from public.users u
              where u.id = '673834b4-d9be-4782-86c9-ff27376233a7'::uuid
                and coalesce(array_length(u.sports, 1), 0) > 0
            )
            then 'MISSING -- Walter White has gained a sports array; 171 mapped a '
                 'row it was scoped never to touch'
            else 'applied' end

union all

-- The permanence property, as a standing check rather than a one-off probe.
-- partners_public must NOT filter on status beyond excluding 'pending': the
-- whole point of the view is that a bio link outlives the sponsorship. If a
-- future edit adds status = 'active' to it, every partner's page dies the day
-- their contract lapses, months after the change that caused it -- so this
-- compares the view's row count against the base table filtered by exactly the
-- two exclusions 163 declares. The business_type arm is repeated here rather
-- than ignored so that quietly widening or narrowing it also shows up.
select 'GUARD_partners_public_survives_expiry',
       case when to_regclass('public.partners_public') is null then 'MISSING -- view absent'
            when (select count(*) from public.partners_public)
               = (select count(*) from public.featured_partners
                   where status is distinct from 'pending'
                     and business_type is distinct from 'independent')
            then 'applied'
            else 'MISSING -- partners_public row count no longer matches its '
                 'declared filters; a lapsed sponsorship may kill its bio link' end
union all

-- The security boundary, as a standing check. partners_public is
-- owner-executed, so its SELECT list is the only thing between anon and the
-- commercial columns of featured_partners -- what each partner pays Tribe and
-- what their contract minimums are.
select 'GUARD_partners_public_hides_commercial_columns',
       case when to_regclass('public.partners_public') is null
            -- An absent view has no exposed columns, which would otherwise
            -- report a green 'applied' for a state in which the feature does
            -- not exist at all. Say so instead.
            then 'MISSING -- view absent'
            else coalesce(
              'MISSING -- exposed to anon: ' || string_agg(a.attname, ', ' order by a.attname),
              'applied'
            ) end
from pg_attribute a
where a.attrelid = to_regclass('public.partners_public')
  and a.attnum > 0
  and not a.attisdropped
  and a.attname in (
    'monthly_fee_cents', 'min_sessions_per_month', 'min_rating',
    'total_impressions', 'total_clicks', 'total_bookings',
    'tier', 'status', 'starts_at', 'expires_at',
    'auto_approve_roster', 'user_id'
  )

union all
-- T-LEAD1. The pass config lives on featured_partners; pass_active is the one
-- column the page gates on, so its presence is the signal the migration ran.
select '172_t_lead1_pass_config_and_routing',
       case when exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'featured_partners'
           and column_name = 'pass_active'
       ) and to_regclass('public.partner_lead_routing') is not null
       then 'applied' else 'MISSING' end

union all
-- The half of 172 that is a security property rather than a schema one. The
-- table existing proves nothing: created without its REVOKE it is born with
-- anon holding ALL, because Supabase's default privileges grant it. Ask the
-- capability question, the way 163's guard does.
select 'GUARD_172_lead_routing_unreachable_by_anon',
       case when to_regclass('public.partner_lead_routing') is null
            then 'MISSING -- table absent'
            when has_table_privilege('anon', 'public.partner_lead_routing', 'SELECT')
              or has_table_privilege('authenticated', 'public.partner_lead_routing', 'SELECT')
            then 'MISSING -- a client role can read the partner lead inbox'
            else 'applied' end

union all
select '173_t_lead1_pass_leads',
       case when to_regclass('public.pass_leads') is not null
             and to_regprocedure('public.pass_is_active(uuid,text)') is not null
       then 'applied' else 'MISSING' end

union all
-- anon must be able to file a lead and never read one. Both halves, because
-- either one alone passing is a different broken product: no INSERT means the
-- form silently fails, and SELECT means every stranger's phone number is
-- readable with the key that ships in the client bundle.
select 'GUARD_173_pass_leads_insert_only_for_anon',
       case when to_regclass('public.pass_leads') is null
            then 'MISSING -- table absent'
            when has_table_privilege('anon', 'public.pass_leads', 'SELECT')
            then 'MISSING -- anon can read pass_leads'
            when not has_table_privilege('anon', 'public.pass_leads', 'INSERT')
            then 'MISSING -- anon cannot file a lead'
            else 'applied' end

union all
-- 174 changed three things that can each drift back independently, so each is
-- read separately rather than folded into one 'applied'.
select '174_reviews_self_review_policy',
       case when exists (select 1 from pg_policies
                          where schemaname = 'public' and tablename = 'reviews'
                            and cmd = 'INSERT' and with_check like '%creator_id%')
             and coalesce((select prosecdef from pg_proc
                            where oid = 'public.update_host_rating()'::regprocedure), false)
       then 'applied' else 'MISSING' end

union all
-- The host exclusion is the point of the policy. A policy that mentions
-- creator_id but lost the `auth.uid() <> creator_id` clause reads as applied
-- above while the self-review hole is open again.
select 'GUARD_174_reviews_insert_excludes_the_host',
       case when not exists (select 1 from pg_policies
                              where schemaname = 'public' and tablename = 'reviews' and cmd = 'INSERT')
            then 'MISSING -- no INSERT policy on public.reviews'
            when not exists (select 1 from pg_policies
                              where schemaname = 'public' and tablename = 'reviews' and cmd = 'INSERT'
                                and with_check like '%<>%creator_id%')
            then 'MISSING -- INSERT policy does not exclude the session creator'
            when exists (select 1 from public.reviews where reviewer_id = host_id)
            then 'MISSING -- a self-review row exists'
            else 'applied' end

union all
-- TRUNCATE escapes RLS entirely, so no policy above can substitute for it.
-- Supabase re-grants to anon on new objects by default, which is how this one
-- got there; it can come back the same way.
select 'GUARD_174_reviews_truncate_revoked',
       case when has_table_privilege('anon', 'public.reviews', 'TRUNCATE')
            then 'MISSING -- anon holds TRUNCATE on public.reviews'
            when has_table_privilege('authenticated', 'public.reviews', 'TRUNCATE')
            then 'MISSING -- authenticated holds TRUNCATE on public.reviews'
            else 'applied' end

union all
select '175_t_lead2_lead_contact_toggle',
       case when to_regprocedure('public.set_pass_lead_contacted(uuid,boolean)') is not null
             and exists (select 1 from pg_indexes
                          where schemaname = 'public' and tablename = 'pass_leads'
                            and indexname = 'idx_pass_leads_created')
       then 'applied' else 'MISSING' end

union all
-- The function is the ONLY write path into pass_leads, and that is true only
-- while the table itself grants no client role UPDATE. Both halves, because
-- either alone is a different broken state: no function means the Contactado
-- toggle is dead for admins and partners, and a client UPDATE grant means the
-- one-column write surface is gone and a partner could rewrite a lead's phone
-- number.
select 'GUARD_175_contacted_is_the_only_writable_column',
       case when to_regprocedure('public.set_pass_lead_contacted(uuid,boolean)') is null
            then 'MISSING -- set_pass_lead_contacted() absent'
            when not coalesce((select prosecdef from pg_proc
                                where oid = 'public.set_pass_lead_contacted(uuid,boolean)'::regprocedure), false)
            then 'MISSING -- set_pass_lead_contacted() is not SECURITY DEFINER'
            when has_function_privilege('anon', 'public.set_pass_lead_contacted(uuid,boolean)', 'EXECUTE')
            then 'MISSING -- anon can EXECUTE set_pass_lead_contacted()'
            -- has_ANY_column_privilege: has_table_privilege cannot see a
            -- column-level grant, so UPDATE (email) on pass_leads to
            -- authenticated would read as "applied" here. Found by 175's
            -- rehearsal, D7. Same correction in the migration's own guard.
            when has_any_column_privilege('authenticated', 'public.pass_leads', 'UPDATE')
              or has_any_column_privilege('anon', 'public.pass_leads', 'UPDATE')
            then 'MISSING -- a client role holds UPDATE on pass_leads'
            else 'applied' end

union all

-- 175 captures a guard that existed in production and in no file. The probe is
-- its PRESENCE plus its shape: absent means a rebuild produced a database where
-- a signed-in user can self-verify as an instructor, which is the only gate on
-- the lead reach-out path.
select '177_capture_protect_verified_instructor',
       case when to_regprocedure('public.protect_verified_instructor()') is not null
             and exists (select 1 from pg_trigger
                          where tgrelid = 'public.users'::regclass
                            and tgname = 'protect_verified_instructor_trigger'
                            and not tgisinternal)
       then 'applied' else 'MISSING' end

union all

select '178_lead_reach_and_users_guards',
       case when to_regprocedure('public.reach_out_to_athlete(uuid)') is not null
             and to_regclass('public.lead_credits') is not null
       then 'applied' else 'MISSING' end

union all

-- The absence of a write grant IS the mechanism, and Supabase re-grants new
-- public objects to anon and authenticated directly. This is how it would
-- silently come back.
select 'GUARD_176_lead_credits_has_no_write_grant',
       case when to_regclass('public.lead_credits') is null
            then 'MISSING -- table absent'
            when has_table_privilege('authenticated', 'public.lead_credits', 'UPDATE')
              or has_table_privilege('authenticated', 'public.lead_credits', 'INSERT')
              or has_table_privilege('authenticated', 'public.lead_credits', 'DELETE')
            then 'MISSING -- authenticated can write lead_credits'
            when not has_table_privilege('authenticated', 'public.lead_credits', 'SELECT')
            then 'MISSING -- authenticated cannot read its own balance'
            else 'applied' end

union all

-- FOR ALL included DELETE, which made the UNIQUE (instructor_id, athlete_id)
-- dedupe self-clearing: an instructor could delete their own row and reach the
-- same athlete again, without limit.
select 'GUARD_176_lead_reaches_no_delete_policy',
       case when (select count(*) from pg_policies
                   where schemaname = 'public' and tablename = 'lead_reaches'
                     and cmd in ('ALL','UPDATE','DELETE')) > 0
            then 'MISSING -- lead_reaches has an ALL/UPDATE/DELETE policy again'
            when not exists (select 1 from pg_policies
                              where schemaname = 'public' and tablename = 'lead_reaches'
                                and cmd = 'INSERT')
            then 'MISSING -- no INSERT policy, so no reach can be filed'
            else 'applied' end

union all

-- Two of three branches used to deny SILENTLY (NEW := OLD, update succeeds,
-- nothing raised). Asserted by SHAPE rather than by name: three RAISE branches
-- and zero silent reverts.
select 'GUARD_176_protect_verified_instructor_raises',
       case when to_regprocedure('public.protect_verified_instructor()') is null
            then 'MISSING -- function absent'
            when (select (length(pg_get_functiondef(p.oid))
                          - length(replace(pg_get_functiondef(p.oid), ':= OLD.', ''))) 
                    from pg_proc p where p.oid = 'public.protect_verified_instructor()'::regprocedure) > 0
            then 'MISSING -- a silent revert is back'
            else 'applied' end

union all

select 'GUARD_176_users_deleted_at_guard',
       case when exists (select 1 from pg_trigger
                          where tgrelid = 'public.users'::regclass
                            and tgname = 'users_deleted_at_guard' and not tgisinternal)
       then 'applied' else 'MISSING' end

union all

select '179_users_cover_image_url',
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='users'
                            and column_name='cover_image_url')
             and has_column_privilege('authenticated','public.users','cover_image_url','SELECT')
       then 'applied' else 'MISSING' end

union all

-- The backfill is the point, not the column. A column that exists and is empty
-- looks applied to any check that only asks whether it exists.
select 'GUARD_179_cover_image_backfilled',
       case when not exists (select 1 from information_schema.columns
                              where table_schema='public' and table_name='users'
                                and column_name='cover_image_url')
            then 'MISSING -- column absent'
            when exists (select 1 from public.users
                          where (banner_url is not null or storefront_banner_url is not null)
                            and cover_image_url is null)
            then 'MISSING -- someone has a banner and no cover_image_url'
            else 'applied' end

union all

select '180_find_training_partners_rpc',
       case when exists (select 1 from pg_proc p
                          where p.oid = 'public.find_training_partners(text, integer)'::regprocedure)
       then 'applied' else 'MISSING' end

union all

-- The function existing is not the property that matters. It exists to keep
-- position off the wire, and an invoker-rights copy would silently rank
-- everyone as location-less because 115 revoked the raw columns from
-- authenticated. Both are asserted, plus that anon never got EXECUTE via the
-- PUBLIC grant Supabase applies to new functions.
select 'GUARD_180_rpc_returns_no_position',
       case
         when not exists (select 1 from pg_proc p
                           where p.oid = 'public.find_training_partners(text, integer)'::regprocedure)
           then 'MISSING -- function absent'
         -- RETURNS TABLE means prorettype = record, whose typrelid is 0, so a
         -- pg_attribute join reads nothing and any check built on it passes
         -- vacuously. Read proargnames/proargmodes instead, and assert the
         -- read SUCCEEDED before asserting what it found.
         when not exists (select 1 from pg_proc p,
                            unnest(p.proargnames, p.proargmodes) with ordinality as a(argname, argmode, ord)
                           where p.oid = 'public.find_training_partners(text, integer)'::regprocedure
                             and a.argmode = 't')
           then 'MISSING -- return columns unreadable, so this check cannot mean anything'
         when exists (select 1 from pg_proc p,
                        unnest(p.proargnames, p.proargmodes) with ordinality as a(argname, argmode, ord)
                       where p.oid = 'public.find_training_partners(text, integer)'::regprocedure
                         and a.argmode = 't'
                         and a.argname ~* '(lat|lng|lon|distance|coord|location|rank_group)')
           then 'MISSING -- a positional column reached the return type'
         when not (select p.prosecdef from pg_proc p
                    where p.oid = 'public.find_training_partners(text, integer)'::regprocedure)
           then 'MISSING -- not SECURITY DEFINER'
         when has_function_privilege('anon', 'public.find_training_partners(text, integer)', 'EXECUTE')
           then 'MISSING -- anon holds EXECUTE'
         else 'applied'
       end

union all

select '181_find_training_partners_exclude_instructors',
       case when exists (select 1 from pg_proc p
                          where p.oid = 'public.find_training_partners(text, integer)'::regprocedure
                            and pg_get_functiondef(p.oid) ~ 'is_instructor IS NOT TRUE')
       then 'applied' else 'MISSING' end

union all

-- The filter EXISTING is not the property. Spelled `= false` it is NULL for
-- every athlete who never touched the toggle, so it would exclude nearly the
-- whole card while looking like a tighter filter. Both halves are asserted,
-- and the read is asserted to have succeeded first.
select 'GUARD_181_instructor_filter_spelling',
       case
         when not exists (select 1 from pg_proc p
                           where p.oid = 'public.find_training_partners(text, integer)'::regprocedure)
           then 'MISSING -- function absent'
         when (select length(pg_get_functiondef(p.oid)) from pg_proc p
                where p.oid = 'public.find_training_partners(text, integer)'::regprocedure) < 500
           then 'MISSING -- definition unreadable, so this check cannot mean anything'
         when not (select pg_get_functiondef(p.oid) ~ 'is_instructor IS NOT TRUE' from pg_proc p
                    where p.oid = 'public.find_training_partners(text, integer)'::regprocedure)
           then 'MISSING -- instructors are not excluded'
         when (select pg_get_functiondef(p.oid) ~ 'is_instructor\s*=\s*false' from pg_proc p
                where p.oid = 'public.find_training_partners(text, integer)'::regprocedure)
           then 'MISSING -- spelled = false, which drops every athlete with a NULL toggle'
         else 'applied'
       end

union all

select '182_notifications_action_url',
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='notifications'
                            and column_name='action_url')
       then 'applied' else 'MISSING' end

union all

-- The column EXISTING is not the property. It carries /invite/<token>, and a
-- token is 32 hex characters -- if it were created as uuid (the confusion that
-- made migration 133 necessary) every invite insert would fail.
select 'GUARD_182_action_url_is_text',
       case
         when not exists (select 1 from information_schema.columns
                           where table_schema='public' and table_name='notifications'
                             and column_name='action_url')
           then 'MISSING -- column absent'
         when (select data_type from information_schema.columns
                where table_schema='public' and table_name='notifications'
                  and column_name='action_url') <> 'text'
           then 'MISSING -- action_url is not text; a token is not a uuid'
         when not has_column_privilege('authenticated','public.notifications','action_url','SELECT')
           then 'MISSING -- authenticated cannot read it, so the link never reaches the client'
         else 'applied'
       end

union all

-- 183 rewrites Google avatar urls from =s96-c to =s600-c. "Applied" is not
-- "the column exists" -- it is that NO live Google avatar still carries a
-- non-600 size suffix. A migration that matched nothing would otherwise look
-- identical to one that worked.
select '183_google_avatar_full_size',
       case
         when not exists (select 1 from public.users
                           where avatar_url like '%googleusercontent.com%'
                             and deleted_at is null and banned is not true
                             and is_test_account is not true)
           then 'applied -- no Google avatars in this database'
         when exists (select 1 from public.users
                       where avatar_url like '%googleusercontent.com%'
                         and avatar_url ~ '=s\d+-c$' and avatar_url !~ '=s600-c$'
                         and deleted_at is null and banned is not true
                         and is_test_account is not true)
           then 'MISSING -- a Google avatar still carries a small size suffix'
         else 'applied'
       end

union all

select '184_migrations_applied',
       case when exists (select 1 from information_schema.tables
                          where table_schema='public' and table_name='migrations_applied')
       then 'applied' else 'MISSING' end

union all

-- The table EXISTING is not the property. An empty one satisfies every
-- "nothing bad is recorded" check while telling the drift detector that no
-- migration has ever run, and a writable one is not a record at all.
select 'GUARD_184_applied_record_is_populated_and_readonly',
       case
         when not exists (select 1 from information_schema.tables
                           where table_schema='public' and table_name='migrations_applied')
           then 'MISSING -- table absent'
         when (select count(*) from public.migrations_applied) < 6
           then 'MISSING -- fewer than the 6 backfilled rows; the record recorded nothing'
         when has_any_column_privilege('anon','public.migrations_applied','INSERT')
           or has_any_column_privilege('authenticated','public.migrations_applied','INSERT')
           then 'MISSING -- a client role can write the applied record'
         else 'applied'
       end

union all

select '185_invite_tokens_recipient',
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='invite_tokens'
                            and column_name='recipient_id')
       then 'applied' else 'MISSING' end

union all

-- BOTH paths, named separately. A gate on one path is not a gate: the guest
-- route accepts an invite token too, and a guest is signed into no account, so
-- enforcing only in join_session leaves a complete bypass. Also asserts the
-- refusal is guarded on recipient_id being NON-NULL, since a function that
-- refused EVERY token would satisfy a one-sided check while breaking every
-- public share link.
select 'GUARD_185_both_join_paths_enforce_recipient',
       case
         when not exists (select 1 from information_schema.columns
                           where table_schema='public' and table_name='invite_tokens'
                             and column_name='recipient_id')
           then 'MISSING -- recipient_id absent'
         when (select length(pg_get_functiondef(p.oid)) from pg_proc p
                where p.oid = 'public.join_session(uuid, uuid, text, text)'::regprocedure) < 1000
           then 'MISSING -- join_session unreadable, so this check cannot mean anything'
         when not (select pg_get_functiondef(p.oid) ~ 'invite_not_for_you' from pg_proc p
                    where p.oid = 'public.join_session(uuid, uuid, text, text)'::regprocedure)
           then 'MISSING -- join_session does not refuse a mismatched recipient'
         when not (select pg_get_functiondef(p.oid) ~ 'invite_not_for_you' from pg_proc p
                    where p.oid = 'public.join_session_as_guest(uuid, text, text, text, text)'::regprocedure)
           then 'MISSING -- the GUEST path does not refuse an addressed token (the bypass)'
         when not (select pg_get_functiondef(p.oid) ~ 'v_token_recipient IS NOT NULL' from pg_proc p
                    where p.oid = 'public.join_session(uuid, uuid, text, text)'::regprocedure)
           then 'MISSING -- the refusal is not guarded on NON-NULL; bearer/share links would break'
         else 'applied'
       end

union all

-- LAYER 2 of the write-before-migration guard.
--
-- supabase/migrations_applied.json is a MIRROR of this table, read by
-- migrationAppliedBeforeCode.test.ts, which runs with no database and so
-- cannot read the table itself. A mirror that could drift undetected would
-- reproduce exactly the failure the table was created to end: the last
-- hand-kept applied-state was wrong about migration 181 within hours.
--
-- So the database checks the mirror. A mirror claiming a migration that has
-- not run would let code referencing its columns merge; a mirror MISSING a
-- migration that has run would block a legitimate merge. Both are drift and
-- both are named.
select 'GUARD_184_mirror_matches_applied_table',
       case
         when not exists (select 1 from information_schema.tables
                           where table_schema='public' and table_name='migrations_applied')
           then 'MISSING -- migrations_applied absent'
         when exists (
           select 1 from (values
    -- <<<MIRROR_LIST>>> generated by scripts/syncMigrationsApplied.ts -- do not hand-edit
    ('179_users_cover_image_url'),
    ('180_find_training_partners_rpc'),
    ('181_find_training_partners_exclude_instructors'),
    ('182_notifications_action_url'),
    ('183_google_avatar_full_size'),
    ('184_migrations_applied'),
    ('185_invite_tokens_recipient'),
    ('186_sport_demand_counts'),
    ('187_athlete_setup'),
    ('188_one_off_sends'),
    ('189_stable_unsub_token'),
    ('190_community_soft_delete'),
    ('191_close_open_community_comments_read'),
    ('192_community_banner_storage_scope'),
    ('193_private_communities_visible_to_members'),
    ('196_admin_delete_user_revoke_anon'),
    ('197_revoke_anon_payment_venue_revenue_rpcs'),
    ('198_service_role_only_internal_rpcs'),
    ('199_session_media_participants_only'),
    ('201_t_av21_pass_leads_showup'),
    ('202_t_av22_athlete_programs'),
    ('203_t_av22_program_athletes'),
    ('204_t_av22_pass_leads_attribution'),
    ('205_t_av22_athletes_ledger'),
    ('206_t_av22_athletes_writes'),
    ('207_t_av22_athletes_reads'),
    ('208_t_av22_program_columns_server_only'),
    ('209_t_av26_athletes_search'),
    ('210_t_av27b_notifications'),
    ('211_t_grow1_lead_attribution'),
    ('212_t_grow1_lead_attended_toggle'),
    ('213_t_grow1_attribution_events'),
    ('214_t_grow1_signup_attribution'),
    ('215_t_grow2_referral_loop')
    -- <<<END_MIRROR_LIST>>>
           ) as mirror(migration)
           where not exists (select 1 from public.migrations_applied a
                              where a.migration = mirror.migration))
           then 'MISSING -- the JSON mirror claims a migration this database has not recorded'
         when exists (
           select 1 from public.migrations_applied a
           -- The reserved blocks are recorded but deliberately NOT mirrored: T-AV
           -- (8000-8999, athlete-value branch) and Tribe.OS (9000-9999, T-OS0).
           -- They are renumbered into main's sequence at their merge gates.
           -- Counted by INFO_184_reserved_block_migrations below instead.
           where a.migration !~ '^[89][0-9]{3}_'
             and a.migration not in (
    -- <<<MIRROR_LIST>>> generated by scripts/syncMigrationsApplied.ts -- do not hand-edit
    ('179_users_cover_image_url'),
    ('180_find_training_partners_rpc'),
    ('181_find_training_partners_exclude_instructors'),
    ('182_notifications_action_url'),
    ('183_google_avatar_full_size'),
    ('184_migrations_applied'),
    ('185_invite_tokens_recipient'),
    ('186_sport_demand_counts'),
    ('187_athlete_setup'),
    ('188_one_off_sends'),
    ('189_stable_unsub_token'),
    ('190_community_soft_delete'),
    ('191_close_open_community_comments_read'),
    ('192_community_banner_storage_scope'),
    ('193_private_communities_visible_to_members'),
    ('196_admin_delete_user_revoke_anon'),
    ('197_revoke_anon_payment_venue_revenue_rpcs'),
    ('198_service_role_only_internal_rpcs'),
    ('199_session_media_participants_only'),
    ('201_t_av21_pass_leads_showup'),
    ('202_t_av22_athlete_programs'),
    ('203_t_av22_program_athletes'),
    ('204_t_av22_pass_leads_attribution'),
    ('205_t_av22_athletes_ledger'),
    ('206_t_av22_athletes_writes'),
    ('207_t_av22_athletes_reads'),
    ('208_t_av22_program_columns_server_only'),
    ('209_t_av26_athletes_search'),
    ('210_t_av27b_notifications'),
    ('211_t_grow1_lead_attribution'),
    ('212_t_grow1_lead_attended_toggle'),
    ('213_t_grow1_attribution_events'),
    ('214_t_grow1_signup_attribution'),
    ('215_t_grow2_referral_loop')
    -- <<<END_MIRROR_LIST>>>
           ))
           then 'MISSING -- this database has recorded a migration the JSON mirror omits; re-sync it'
         else 'applied'
       end


union all

-- Informational, never MISSING: how many reserved-block migrations this
-- database has recorded (8000-8999 T-AV, 9000-9999 Tribe.OS). They are
-- excluded from GUARD_184_mirror_matches_applied_table by design.
select 'INFO_184_reserved_block_migrations',
       'info -- ' || count(*)::text ||
       ' reserved-block migration(s) recorded (8000-8999 T-AV, 9000-9999 Tribe.OS); not mirrored by design'
from public.migrations_applied
where migration ~ '^[89][0-9]{3}_'
union all

select '186_sport_demand_counts',
       case when exists (select 1 from pg_proc p
                          where p.oid = 'public.sport_demand_counts()'::regprocedure)
       then 'applied' else 'MISSING' end

union all

-- The function EXISTING is not the property. Its whole purpose is that a small
-- group is never reported: a cell of 1 names a person. Both the floor and the
-- athletes-only predicate are asserted, and anon must hold no EXECUTE.
select 'GUARD_186_small_groups_are_suppressed',
       case
         when not exists (select 1 from pg_proc p
                           where p.oid = 'public.sport_demand_counts()'::regprocedure)
           then 'MISSING -- function absent'
         when (select length(pg_get_functiondef(p.oid)) from pg_proc p
                where p.oid = 'public.sport_demand_counts()'::regprocedure) < 500
           then 'MISSING -- definition unreadable, so this check cannot mean anything'
         when not (select pg_get_functiondef(p.oid) ~ 'p\.n >= 5' from pg_proc p
                    where p.oid = 'public.sport_demand_counts()'::regprocedure)
           then 'MISSING -- the minimum-group-size floor is gone; a cell of 1 names a person'
         when not (select pg_get_functiondef(p.oid) ~ 'is_instructor IS NOT TRUE' from pg_proc p
                    where p.oid = 'public.sport_demand_counts()'::regprocedure)
           then 'MISSING -- the count includes instructors; demand means athletes'
         when has_function_privilege('anon','public.sport_demand_counts()','EXECUTE')
           then 'MISSING -- anon can read demand counts'
         else 'applied'
       end

union all

select '187_athlete_setup',
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='users'
                            and column_name='athlete_setup_completed_at')
       then 'applied' else 'MISSING' end

union all

-- The column existing is not the property. The requirement is the REFUSAL, and
-- a readable grant -- public.users is under column-level grants, and PostgREST
-- fails the whole request on an ungranted column (migration 157's outage).
select 'GUARD_187_sports_required_at_the_write',
       case
         when not exists (select 1 from pg_proc p
                           where p.oid = 'public.complete_athlete_setup(text[])'::regprocedure)
           then 'MISSING -- the refusing function is absent'
         when (select length(pg_get_functiondef(p.oid)) from pg_proc p
                where p.oid = 'public.complete_athlete_setup(text[])'::regprocedure) < 500
           then 'MISSING -- definition unreadable, so this check cannot mean anything'
         when not (select pg_get_functiondef(p.oid) ~ 'at least one sport is required' from pg_proc p
                    where p.oid = 'public.complete_athlete_setup(text[])'::regprocedure)
           then 'MISSING -- the write accepts an empty sports list'
         when (select pg_get_functiondef(p.oid) ~ 'onboarding_completed_at' from pg_proc p
                where p.oid = 'public.complete_athlete_setup(text[])'::regprocedure)
           then 'MISSING -- it writes the intro-tour column, which means something else'
         when not has_column_privilege('authenticated','public.users','athlete_setup_completed_at','SELECT')
           then 'MISSING -- authenticated cannot read the new column'
         else 'applied'
       end

union all

select '188_one_off_sends',
       case when exists (select 1 from information_schema.tables
                          where table_schema='public' and table_name='one_off_sends')
       then 'applied' else 'MISSING' end

union all

-- The table existing is not the property. The send-once guarantee is the
-- PRIMARY KEY, and the opt-out is only worth anything if no client role can
-- read the table that holds the unsubscribe credentials.
select 'GUARD_188_send_once_and_opt_out',
       case
         when not exists (select 1 from information_schema.tables
                           where table_schema='public' and table_name='one_off_sends')
           then 'MISSING -- one_off_sends absent'
         when (select count(*) from pg_attribute
                where attrelid = 'public.one_off_sends'::regclass
                  and attnum > 0 and not attisdropped) < 6
           then 'MISSING -- catalog read returned too few columns to judge anything'
         when not exists (
           select 1 from pg_constraint
            where conrelid = 'public.one_off_sends'::regclass and contype = 'p'
              -- ::text on both sides: attname is `name`, and name[] = text[]
              -- has no operator (42883). Same fault as 188's first attempt.
              and (select array_agg(a.attname::text order by a.attname::text)
                     from unnest(conkey) k join pg_attribute a
                       on a.attrelid = conrelid and a.attnum = k)
                  = ARRAY['campaign','channel','user_id']::text[])
           then 'MISSING -- no (campaign, user_id, channel) key; a re-run can message people twice'
         when not exists (select 1 from information_schema.columns
                           where table_schema='public' and table_name='notification_preferences'
                             and column_name='email_unsubscribed_at')
           then 'MISSING -- no email opt-out column'
         when has_any_column_privilege('anon','public.one_off_sends','SELECT')
           or has_any_column_privilege('authenticated','public.one_off_sends','SELECT')
           or has_any_column_privilege('anon','public.one_off_sends','INSERT')
           or has_any_column_privilege('authenticated','public.one_off_sends','INSERT')
           then 'MISSING -- a client role can reach one_off_sends and its unsubscribe tokens'
         when not (select relrowsecurity from pg_class where oid='public.one_off_sends'::regclass)
           then 'MISSING -- RLS is off on one_off_sends'
         else 'applied'
       end

union all

select '189_stable_unsub_token',
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='notification_preferences'
                            and column_name='unsub_token')
       then 'applied' else 'MISSING' end

union all

-- The column existing is not the property. ONE TOKEN PER PERSON is: if
-- gen_random_uuid() had been evaluated once for the whole backfill UPDATE,
-- every row would share a token and an unsubscribe click would resolve to the
-- wrong user. And a row with no token means an email with a dead link.
select 'GUARD_189_one_token_per_person',
       case
         when not exists (select 1 from information_schema.columns
                           where table_schema='public' and table_name='notification_preferences'
                             and column_name='unsub_token')
           then 'MISSING -- unsub_token absent'
         when (select count(*) from public.notification_preferences) = 0
           then 'MISSING -- notification_preferences is empty, so this check means nothing'
         when (select count(*) <> count(unsub_token) from public.notification_preferences)
           then 'MISSING -- some rows have no token, so those users get a dead unsubscribe link'
         when (select count(*) <> count(distinct unsub_token) from public.notification_preferences)
           then 'MISSING -- tokens are not unique; an unsubscribe click resolves to the wrong person'
         when not exists (select 1 from pg_attrdef d join pg_attribute a
                            on a.attrelid = d.adrelid and a.attnum = d.adnum
                           where d.adrelid = 'public.notification_preferences'::regclass
                             and a.attname = 'unsub_token')
           then 'MISSING -- no DEFAULT, so rows from 150''s signup trigger get no token'
         else 'applied'
       end

union all

select '190_community_soft_delete',
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='communities'
                            and column_name='deleted_at')
       then 'applied' else 'MISSING' end

union all

-- The column existing is not the property. "Creator only" is, and it rests on
-- the GRANT: the UPDATE policy lets admin members write the whole row, and RLS
-- cannot compare NEW to OLD, so without the column grant an admin could take
-- creator_id or set deleted_at directly. Checked per column, both directions:
-- the locked ones refused, the ones the app writes still writable, because a
-- REVOKE that took everything would break the banner and the edit page with
-- 42501 while the refusal half read green.
select 'GUARD_190_creator_only_delete',
       case
         when not exists (select 1 from information_schema.columns
                           where table_schema='public' and table_name='communities'
                             and column_name='deleted_at')
           then 'MISSING -- communities.deleted_at absent'
         when has_column_privilege('authenticated','public.communities','creator_id','UPDATE')
           then 'MISSING -- authenticated can write creator_id; an admin member can take the community'
         when has_column_privilege('authenticated','public.communities','deleted_at','UPDATE')
           then 'MISSING -- authenticated can write deleted_at, skipping the creator check and the typed name'
         when has_column_privilege('authenticated','public.communities','member_count','UPDATE')
           then 'MISSING -- authenticated can write member_count'
         when has_table_privilege('anon','public.communities','UPDATE')
           then 'MISSING -- anon holds UPDATE on communities'
         when not (has_column_privilege('authenticated','public.communities','name','UPDATE')
                   and has_column_privilege('authenticated','public.communities','description','UPDATE')
                   and has_column_privilege('authenticated','public.communities','sport','UPDATE')
                   and has_column_privilege('authenticated','public.communities','location_name','UPDATE')
                   and has_column_privilege('authenticated','public.communities','location_lat','UPDATE')
                   and has_column_privilege('authenticated','public.communities','location_lng','UPDATE')
                   and has_column_privilege('authenticated','public.communities','is_private','UPDATE')
                   and has_column_privilege('authenticated','public.communities','cover_image_url','UPDATE'))
           then 'MISSING -- a column the edit page or the banner writes lost its grant'
         when not exists (select 1 from pg_policies
                           where schemaname='public' and tablename='communities'
                             and cmd='SELECT' and position('deleted_at' in qual) > 0)
           then 'MISSING -- the SELECT policy does not hide deleted communities'
         when not exists (select 1 from pg_policies
                           where schemaname='public' and tablename='communities'
                             and cmd='UPDATE' and position('deleted_at' in qual) > 0)
           then 'MISSING -- the UPDATE policy still reaches deleted communities'
         when exists (select 1 from pg_policies
                       where schemaname='public' and tablename='communities'
                         and cmd in ('DELETE','ALL'))
           then 'MISSING -- a DELETE or ALL policy exists; hard delete is an admin decision, not a client one'
         when to_regprocedure('public.soft_delete_community(uuid, text)') is null
           then 'MISSING -- soft_delete_community absent'
         when not (select pg_get_functiondef(p.oid) ~ 'Only the creator can delete' from pg_proc p
                    where p.oid = to_regprocedure('public.soft_delete_community(uuid, text)'))
           then 'MISSING -- soft_delete_community no longer refuses non-creators'
         when not (select pg_get_functiondef(p.oid) ~ 'does not match the community name' from pg_proc p
                    where p.oid = to_regprocedure('public.soft_delete_community(uuid, text)'))
           then 'MISSING -- soft_delete_community no longer checks the typed name'
         when has_function_privilege('anon','public.soft_delete_community(uuid, text)','EXECUTE')
           then 'MISSING -- anon can call soft_delete_community'
         else 'applied'
       end

union all

select '191_close_open_community_comments_read',
       case when exists (select 1 from pg_policies
                          where schemaname='public' and tablename='community_post_comments'
                            and policyname='community_post_comments_select')
             and not exists (select 1 from pg_policies
                              where schemaname='public' and tablename='community_post_comments'
                                and policyname='Users can read comments on visible posts')
       then 'applied' else 'MISSING' end

union all

-- The dropped policy being gone is not the property. NO open read policy on
-- this table is: policies are OR'd, so any `true` SELECT policy, under any
-- name, cancels the scoped one again. And the scoped one must still be there,
-- or every comment read fails, public ones included.
select 'GUARD_191_private_comments_stay_private',
       case
         when exists (select 1 from pg_policies
                       where schemaname='public' and tablename='community_post_comments'
                         and cmd in ('SELECT','ALL')
                         and regexp_replace(coalesce(qual,''), '\s+', '', 'g') in ('true','(true)'))
           then 'MISSING -- an open read policy is back; private-community comments are public again'
         when not exists (select 1 from pg_policies
                           where schemaname='public' and tablename='community_post_comments'
                             and policyname='community_post_comments_select'
                             and position('is_community_member' in qual) > 0)
           then 'MISSING -- the scoped read policy is gone or changed; comment reads may fail'
         when not has_table_privilege('anon','public.community_post_comments','SELECT')
           then 'MISSING -- anon cannot read comments; public community comments stop rendering'
         else 'applied'
       end

union all

select '192_community_banner_storage_scope',
       case when to_regprocedure('public.can_manage_community_banner(text)') is not null
             and exists (select 1 from pg_policies
                          where schemaname='storage' and tablename='objects'
                            and policyname='Community managers can upload banners')
             and not exists (select 1 from pg_policies
                              where schemaname='storage' and tablename='objects'
                                and policyname='Authenticated users can upload community banners')
       then 'applied' else 'MISSING' end

union all

-- The 090 policies being gone is not the property. NO write policy on this
-- bucket without the manager check is: storage policies are OR'd, so a
-- bucket-only policy under any name reopens every community's folder.
select 'GUARD_192_banner_writes_scoped',
       case
         when exists (select 1 from pg_policies
                       where schemaname='storage' and tablename='objects'
                         and cmd in ('INSERT','UPDATE','DELETE','ALL')
                         and (coalesce(qual,'') || coalesce(with_check,'')) like '%community-banners%'
                         and (   (cmd in ('UPDATE','DELETE','ALL')
                                  and position('can_manage_community_banner' in coalesce(qual,'')) = 0)
                              or (cmd in ('INSERT','UPDATE','ALL')
                                  and position('can_manage_community_banner' in coalesce(with_check,'')) = 0)))
           then 'MISSING -- a banner write policy skips the manager check; any signed-in user can write any community''s banner'
         when (select count(distinct cmd) from pg_policies
                where schemaname='storage' and tablename='objects'
                  and policyname like 'Community managers can % banners') <> 3
           then 'MISSING -- the INSERT, UPDATE or DELETE banner policy is gone; upsert or cleanup will fail'
         when to_regprocedure('public.can_manage_community_banner(text)') is null
           then 'MISSING -- can_manage_community_banner absent; every banner upload fails'
         when not has_function_privilege('authenticated','public.can_manage_community_banner(text)','EXECUTE')
           then 'MISSING -- authenticated cannot execute can_manage_community_banner; every banner upload fails'
         when not (select pg_get_functiondef(p.oid) ~ 'deleted_at IS NULL' from pg_proc p
                    where p.oid = to_regprocedure('public.can_manage_community_banner(text)'))
           then 'MISSING -- can_manage_community_banner no longer refuses deleted communities'
         when not exists (select 1 from storage.buckets
                           where id='community-banners' and public
                             and file_size_limit is not null and allowed_mime_types is not null)
           then 'MISSING -- the community-banners bucket lost its size or type limit, or is no longer public'
         else 'applied'
       end

union all

select '193_private_communities_visible_to_members',
       case when exists (select 1 from pg_policies
                          where schemaname='public' and tablename='communities'
                            and policyname='Public communities are visible to all'
                            and position('is_community_member' in qual) > 0)
       then 'applied' else 'MISSING' end

union all

-- Members must see their private community, and nothing else may widen the
-- read: policies are OR'd, so a second read policy could reopen private or
-- deleted communities to everyone.
select 'GUARD_193_private_communities_members_only',
       case
         when (select count(*) from pg_policies
                where schemaname='public' and tablename='communities' and cmd in ('SELECT','ALL')) <> 1
           then 'MISSING -- communities has more or fewer than one read policy; private or deleted rows may be exposed'
         when not exists (select 1 from pg_policies
                           where schemaname='public' and tablename='communities'
                             and policyname='Public communities are visible to all'
                             and position('deleted_at IS NULL' in qual) > 0
                             and position('is_community_member' in qual) > 0)
           then 'MISSING -- the read policy lost the member arm or the deleted_at filter'
         when not (select prosecdef from pg_proc
                    where oid = to_regprocedure('public.is_community_member(uuid, uuid)'))
           then 'MISSING -- is_community_member is not SECURITY DEFINER; the read policy would loop through community_members'
         else 'applied'
       end

union all

-- admin_delete_user is SECURITY DEFINER with no caller check, so the grant IS
-- the security control. has_function_privilege asks the capability (including
-- via PUBLIC), not whether a GRANT row exists. Applied to production by hand
-- 2026-09-27 before merge; see the migration header.
select '196_admin_delete_user_revoke_anon',
       case
         when to_regprocedure('public.admin_delete_user(uuid)') is null
           then 'MISSING -- admin_delete_user is gone; the admin delete route will fail'
         when has_function_privilege('anon','public.admin_delete_user(uuid)','EXECUTE')
           then 'MISSING -- anon can execute admin_delete_user; anyone with the anon key can delete any user'
         when has_function_privilege('authenticated','public.admin_delete_user(uuid)','EXECUTE')
           then 'MISSING -- authenticated can execute admin_delete_user; any signed-in user can delete any user'
         when not has_function_privilege('service_role','public.admin_delete_user(uuid)','EXECUTE')
           then 'MISSING -- service_role cannot execute admin_delete_user; the admin delete route will fail'
         else 'applied'
       end

union all

-- Six SECURITY DEFINER RPCs whose caller checks do nothing when auth.uid() is
-- NULL, so the grant is the control. Every overload is checked, and each name
-- must exist: a probe over an empty set would read 'applied' for nothing.
-- Applied to production by hand 2026-09-27 before merge; see the migration.
select '197_revoke_anon_payment_venue_revenue_rpcs',
       case
         when (select count(distinct p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public'
                  and p.proname in ('finalize_payment','set_session_partner','review_venue_request',
                                    'instructor_revenue_totals','instructor_revenue_buckets','list_gym_coaches')) <> 6
           then 'MISSING -- one of the six functions is gone; its caller will fail'
         when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname = 'public'
                         and p.proname in ('finalize_payment','set_session_partner','review_venue_request',
                                           'instructor_revenue_totals','instructor_revenue_buckets','list_gym_coaches')
                         and has_function_privilege('anon', p.oid, 'EXECUTE'))
           then 'MISSING -- anon can execute one of the six; payment approval, venue approval or revenue reads are open to anyone'
         when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname = 'public' and p.proname = 'finalize_payment'
                         and has_function_privilege('authenticated', p.oid, 'EXECUTE'))
           then 'MISSING -- authenticated can execute finalize_payment; a signed-in user could approve their own payment'
         when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname = 'public'
                         and p.proname in ('set_session_partner','review_venue_request','instructor_revenue_totals',
                                           'instructor_revenue_buckets','list_gym_coaches')
                         and not has_function_privilege('authenticated', p.oid, 'EXECUTE'))
           then 'MISSING -- authenticated lost EXECUTE on a venue, revenue or coach RPC; the signed-in screen will fail'
         when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname = 'public'
                         and p.proname in ('finalize_payment','set_session_partner','review_venue_request',
                                           'instructor_revenue_totals','instructor_revenue_buckets','list_gym_coaches')
                         and not has_function_privilege('service_role', p.oid, 'EXECUTE'))
           then 'MISSING -- service_role cannot execute one of the six; the webhooks or server callers will fail'
         else 'applied'
       end

union all

-- Five internal RPCs that only the server calls. Every overload is checked and
-- each name must exist. has_function_privilege includes PUBLIC, which two of
-- them held by default in production.
select '198_service_role_only_internal_rpcs',
       case
         when (select count(distinct p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public'
                  and p.proname in ('bump_longest_streak','recompute_all_total_sessions_hosted',
                                    'recompute_user_total_sessions_hosted','cron_try_lock','cron_release_lock')) <> 5
           then 'MISSING -- one of the five functions is gone; its cron or pipeline will fail'
         when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname = 'public'
                         and p.proname in ('bump_longest_streak','recompute_all_total_sessions_hosted',
                                           'recompute_user_total_sessions_hosted','cron_try_lock','cron_release_lock')
                         and (has_function_privilege('anon', p.oid, 'EXECUTE')
                              or has_function_privilege('authenticated', p.oid, 'EXECUTE')))
           then 'MISSING -- anon or authenticated can execute an internal RPC; cron locks, streaks or counters are writable by clients'
         when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname = 'public'
                         and p.proname in ('bump_longest_streak','recompute_all_total_sessions_hosted',
                                           'recompute_user_total_sessions_hosted','cron_try_lock','cron_release_lock')
                         and not has_function_privilege('service_role', p.oid, 'EXECUTE'))
           then 'MISSING -- service_role cannot execute an internal RPC; a tribe-os cron or the intelligence pipeline will fail'
         when not exists (select 1 from pg_proc
                           where oid = to_regprocedure('public.trg_recompute_sessions_hosted()') and prosecdef)
           then 'MISSING -- trg_recompute_sessions_hosted is not SECURITY DEFINER; session writes will fail'
         else 'applied'
       end

union all

-- Recap photos and stories, rows and files: host, confirmed participants,
-- uploader and admin only. session-photos stays public (listing photos) but
-- cannot be listed by anyone but the owner.
select '199_session_media_participants_only',
       case
         when to_regprocedure('public.can_view_session_media(text)') is null
           or to_regprocedure('public.can_moderate_session_media(text)') is null
           then 'MISSING -- the session media helpers do not exist'
         when exists (select 1 from storage.buckets where id = 'session-stories' and public)
           then 'MISSING -- session-stories is public; any story file can be downloaded by URL'
         when not exists (select 1 from storage.buckets where id = 'session-recap-photos' and not public)
           then 'MISSING -- the private session-recap-photos bucket does not exist; recap uploads will fail'
         when not exists (select 1 from storage.buckets where id = 'session-photos' and public)
           then 'MISSING -- session-photos is not public; every session listing photo stops loading'
         when exists (select 1 from pg_policies
                       where schemaname = 'public' and tablename in ('session_recap_photos', 'session_stories')
                         and cmd in ('SELECT', 'ALL')
                         and position('can_view_session_media' in coalesce(qual, '')) = 0
                         and coalesce(qual, '') <> 'is_app_admin()')
           then 'MISSING -- a SELECT policy on recap photos or stories does not check can_view_session_media'
         when exists (select 1 from pg_policies
                       where schemaname = 'storage' and tablename = 'objects' and cmd in ('SELECT', 'ALL')
                         and coalesce(qual, '') ~ 'session-(stories|recap-photos)'
                         and position('can_view_session_media' in coalesce(qual, '')) = 0)
           then 'MISSING -- a storage SELECT policy exposes story or recap files beyond the session'
         when exists (select 1 from pg_policies
                       where schemaname = 'storage' and tablename = 'objects' and cmd in ('SELECT', 'ALL')
                         and coalesce(qual, '') ~ 'session-photos'
                         and position('auth.uid()' in coalesce(qual, '')) = 0)
           then 'MISSING -- the session-photos bucket can be listed by anyone'
         when has_function_privilege('anon', 'public.can_view_session_media(text)', 'EXECUTE')
           then 'MISSING -- anon can execute can_view_session_media'
         else 'applied'
       end

union all

-- T-AV30. Every lookup of a T-AV object in the probes below goes through
-- to_regprocedure / to_regclass and the OID forms of has_*_privilege, so a
-- database without these migrations reads MISSING instead of erroring. A
-- literal 'public.x(...)'::regprocedure is resolved when the statement is
-- PARSED, before any CASE branch runs, so no earlier "is absent" branch can
-- protect it: one such cast on av_door_pass took the whole verifier down in
-- the 2026-10-06 merge rehearsal. Each probe still tests existence in its
-- first branch, because a NULL from a missing object would otherwise fall
-- through to 'applied'. t-av30-proof.LOCAL.sh runs this against a database
-- with and without the T-AV migrations.
--
-- T-AV21 (athlete-value branch, reserved block; renumbered at the merge gate).
-- The show-up columns exist, the claim policy refuses a pre-attended row (F2),
-- no other permissive INSERT policy reopens it, and only authenticated can
-- reach the door. Columns are read from pg_attribute keyed on regclass.
select '201_t_av21_pass_leads_showup',
       case
         when (select count(*) from pg_attribute
                where attrelid = 'public.pass_leads'::regclass and not attisdropped
                  and attname in ('attended_at', 'attended_marked_by', 'attended_method')) <> 3
           then 'MISSING -- a show-up column is absent from pass_leads'
         when not exists (select 1 from pg_policies
                           where schemaname = 'public' and tablename = 'pass_leads'
                             and policyname = 'Anyone can claim a pass'
                             and position('attended_at IS NULL' in with_check) > 0
                             and position('attended_marked_by IS NULL' in with_check) > 0
                             and position('attended_method IS NULL' in with_check) > 0)
           then 'MISSING -- the claim policy lost an IS NULL clause; anon can file a pre-attended lead'
         when exists (select 1 from pg_policies
                       where schemaname = 'public' and tablename = 'pass_leads' and cmd in ('INSERT', 'ALL')
                         and permissive = 'PERMISSIVE'
                         and policyname not in ('Anyone can claim a pass', 'Admins manage pass leads'))
           then 'MISSING -- another permissive INSERT policy on pass_leads reopens the claim path'
         when to_regprocedure('public.av_door_pass(text)') is null
           or to_regprocedure('public.av_confirm_pass_attendance(text,text)') is null
           or to_regprocedure('public.av_can_work_door(uuid)') is null
           then 'MISSING -- a door function is absent'
         when has_function_privilege('anon', to_regprocedure('public.av_door_pass(text)'), 'EXECUTE')
           or has_function_privilege('anon', to_regprocedure('public.av_confirm_pass_attendance(text,text)'), 'EXECUTE')
           or has_function_privilege('authenticated', to_regprocedure('public.av_can_work_door(uuid)'), 'EXECUTE')
           then 'MISSING -- a client role can execute a door function it must not'
         when has_any_column_privilege('authenticated', 'public.pass_leads', 'UPDATE')
           then 'MISSING -- authenticated holds UPDATE on pass_leads; the door write is no longer the only path'
         else 'applied'
       end

union all

-- T-AV22 (reserved block; renumbered at the merge gate). athlete_programs:
-- RLS on, anon holds nothing, the bonus columns are not selectable by any
-- client role, and is_active is guarded by the admin trigger.
select '202_t_av22_athlete_programs',
       case
         when to_regclass('public.athlete_programs') is null
           then 'MISSING -- athlete_programs is absent'
         when not (select relrowsecurity from pg_class where oid = to_regclass('public.athlete_programs'))
           then 'MISSING -- RLS is off on athlete_programs'
         when has_any_column_privilege('anon', to_regclass('public.athlete_programs'), 'SELECT')
           or has_any_column_privilege('anon', to_regclass('public.athlete_programs'), 'INSERT')
           or has_any_column_privilege('anon', to_regclass('public.athlete_programs'), 'UPDATE')
           then 'MISSING -- anon holds a privilege on athlete_programs'
         when has_column_privilege('authenticated', to_regclass('public.athlete_programs'), 'conversion_bonus_cop', 'SELECT')
           or has_column_privilege('authenticated', to_regclass('public.athlete_programs'), 'conversion_bonus_note_en', 'SELECT')
           or has_column_privilege('authenticated', to_regclass('public.athlete_programs'), 'conversion_bonus_note_es', 'SELECT')
           then 'MISSING -- a coach can read the bonus straight from athlete_programs'
         when not exists (select 1 from pg_trigger
                           where tgrelid = to_regclass('public.athlete_programs')
                             and tgname = 'athlete_programs_is_active_guard' and tgenabled <> 'D')
           then 'MISSING -- is_active is no longer admin-only'
         when to_regprocedure('public.av_my_partner_role(uuid)') is null
           or has_function_privilege('anon', to_regprocedure('public.av_my_partner_role(uuid)'), 'EXECUTE')
           then 'MISSING -- av_my_partner_role is absent or anon can call it'
         else 'applied'
       end

union all

-- T-AV22. program_athletes: no client role writes it, and the contact columns
-- are not selectable; athlete_programs has exactly two permissive SELECTs.
select '203_t_av22_program_athletes',
       case
         when to_regclass('public.program_athletes') is null
           then 'MISSING -- program_athletes is absent'
         when not (select relrowsecurity from pg_class where oid = to_regclass('public.program_athletes'))
           then 'MISSING -- RLS is off on program_athletes'
         when has_any_column_privilege('anon', to_regclass('public.program_athletes'), 'SELECT')
           or has_any_column_privilege('authenticated', to_regclass('public.program_athletes'), 'INSERT')
           or has_any_column_privilege('authenticated', to_regclass('public.program_athletes'), 'UPDATE')
           or has_table_privilege('authenticated', to_regclass('public.program_athletes'), 'DELETE')
           then 'MISSING -- a client role can read as anon or write program_athletes directly'
         when has_column_privilege('authenticated', to_regclass('public.program_athletes'), 'email_lower', 'SELECT')
           or has_column_privilege('authenticated', to_regclass('public.program_athletes'), 'whatsapp_e164', 'SELECT')
           then 'MISSING -- an athlete contact column is selectable'
         when (select count(*) from pg_policies
                where schemaname = 'public' and tablename = 'athlete_programs'
                  and cmd in ('SELECT', 'ALL') and permissive = 'PERMISSIVE') <> 2
           then 'MISSING -- athlete_programs no longer has exactly two permissive SELECT policies'
         else 'applied'
       end

union all

-- T-AV22. The eight attribution and outcome columns exist and the claim
-- policy refuses every one of them preset (F2), alongside T-AV21's three.
select '204_t_av22_pass_leads_attribution',
       case
         when (select count(*) from pg_attribute
                where attrelid = 'public.pass_leads'::regclass and not attisdropped
                  and attname in ('referred_by_athlete_id', 'outcome', 'outcome_at', 'outcome_marked_by',
                                  'retained_at', 'bonus_eligible', 'bonus_settled_at', 'bonus_settled_by')) <> 8
           then 'MISSING -- an attribution or outcome column is absent from pass_leads'
         when exists (select 1 from unnest(array['attended_at', 'attended_marked_by', 'attended_method',
                                                 'referred_by_athlete_id', 'outcome', 'outcome_at',
                                                 'outcome_marked_by', 'retained_at', 'bonus_eligible',
                                                 'bonus_settled_at', 'bonus_settled_by']) c(col)
                       where not exists (select 1 from pg_policies
                                          where schemaname = 'public' and tablename = 'pass_leads'
                                            and policyname = 'Anyone can claim a pass'
                                            and position(c.col || ' IS NULL' in with_check) > 0))
           then 'MISSING -- the claim policy lost an IS NULL clause; anon can file a pre-credited lead'
         when exists (select 1 from pg_policies
                       where schemaname = 'public' and tablename = 'pass_leads' and cmd in ('INSERT', 'ALL')
                         and permissive = 'PERMISSIVE'
                         and policyname not in ('Anyone can claim a pass', 'Admins manage pass leads'))
           then 'MISSING -- another permissive INSERT policy on pass_leads reopens the claim path'
         else 'applied'
       end

union all

-- T-AV22. The one ledger exists and no client role can call it.
select '205_t_av22_athletes_ledger',
       case
         when to_regprocedure('public.av_athletes_ledger(uuid)') is null
           or to_regprocedure('public.av_athletes_ledger_totals(uuid)') is null
           then 'MISSING -- a ledger function is absent'
         when has_function_privilege('anon', to_regprocedure('public.av_athletes_ledger(uuid)'), 'EXECUTE')
           or has_function_privilege('authenticated', to_regprocedure('public.av_athletes_ledger(uuid)'), 'EXECUTE')
           or has_function_privilege('anon', to_regprocedure('public.av_athletes_ledger_totals(uuid)'), 'EXECUTE')
           or has_function_privilege('authenticated', to_regprocedure('public.av_athletes_ledger_totals(uuid)'), 'EXECUTE')
           then 'MISSING -- a client role can read every lead through the ledger'
         else 'applied'
       end

union all

-- T-AV22. Every athlete WRITE function exists, is a definer with a pinned
-- search_path, and is callable by authenticated and not by anon.
select '206_t_av22_athletes_writes',
       case
         when exists (select 1 from unnest(array[
                        'public.av_athletes_add(uuid,uuid,text)', 'public.av_athletes_set_status(uuid,text)',
                        'public.av_athletes_set_level(uuid,text)', 'public.av_athletes_set_outcome(text,text)',
                        'public.av_athletes_mark_retained(uuid)', 'public.av_athletes_mark_bonus_settled(uuid)']) f(sig)
                       where to_regprocedure(f.sig) is null)
           then 'MISSING -- an athlete write function is absent'
         when exists (select 1 from pg_proc
                       where pronamespace = 'public'::regnamespace
                         and proname in ('av_athletes_add', 'av_athletes_set_status', 'av_athletes_set_level',
                                         'av_athletes_set_outcome', 'av_athletes_mark_retained',
                                         'av_athletes_mark_bonus_settled')
                         and (not prosecdef or proconfig is null
                              or has_function_privilege('anon', oid, 'EXECUTE')
                              or not has_function_privilege('authenticated', oid, 'EXECUTE')))
           then 'MISSING -- an athlete write function lost SECURITY DEFINER, its search_path, or its grants'
         else 'applied'
       end

union all

-- T-AV22. Every athlete READ function exists with the same properties, and
-- av_door_pass is the widened version (it names athlete_first_name) while
-- still reading the guest's first name only.
select '207_t_av22_athletes_reads',
       case
         when exists (select 1 from unnest(array[
                        'public.av_athletes_my_summary()', 'public.av_athletes_partner_summary(uuid)',
                        'public.av_door_list(uuid)', 'public.av_door_pass(text)']) f(sig)
                       where to_regprocedure(f.sig) is null)
           then 'MISSING -- an athlete read function is absent'
         when exists (select 1 from pg_proc
                       where pronamespace = 'public'::regnamespace
                         and proname in ('av_athletes_my_summary', 'av_athletes_partner_summary',
                                         'av_door_list', 'av_door_pass')
                         and (not prosecdef or proconfig is null
                              or has_function_privilege('anon', oid, 'EXECUTE')
                              or not has_function_privilege('authenticated', oid, 'EXECUTE')))
           then 'MISSING -- an athlete read function lost SECURITY DEFINER, its search_path, or its grants'
         when position('athlete_first_name' in pg_get_functiondef(to_regprocedure('public.av_door_pass(text)'))) = 0
           then 'MISSING -- av_door_pass is not the T-AV22 version'
         -- T-AV26 widened partner_summary in place (207 header, 2026-10-01).
         when position('retain_from' in pg_get_functiondef(to_regprocedure('public.av_athletes_partner_summary(uuid)'))) = 0
           or position('to_close' in pg_get_functiondef(to_regprocedure('public.av_athletes_partner_summary(uuid)'))) = 0
           then 'MISSING -- av_athletes_partner_summary is not the T-AV26 version (no to_close or retain_from)'
         else 'applied'
       end

union all

-- T-AV22. The restrictive INSERT policy exists, binds every role (admin
-- included, through its permissive policy), and names all eleven columns.
select '208_t_av22_program_columns_server_only',
       case
         when not exists (select 1 from pg_policies
                           where schemaname = 'public' and tablename = 'pass_leads'
                             and policyname = 'Program columns are server only'
                             and permissive = 'RESTRICTIVE' and cmd = 'INSERT' and roles = '{public}')
           then 'MISSING -- the restrictive INSERT policy is absent or no longer binds every role; an admin can insert attribution'
         when exists (select 1 from unnest(array['attended_at', 'attended_marked_by', 'attended_method',
                                                 'referred_by_athlete_id', 'outcome', 'outcome_at',
                                                 'outcome_marked_by', 'retained_at', 'bonus_eligible',
                                                 'bonus_settled_at', 'bonus_settled_by']) c(col)
                       where not exists (select 1 from pg_policies
                                          where schemaname = 'public' and tablename = 'pass_leads'
                                            and policyname = 'Program columns are server only'
                                            and position(c.col || ' IS NULL' in with_check) > 0))
           then 'MISSING -- the restrictive policy lost an IS NULL clause'
         else 'applied'
       end

union all

-- T-AV26. The Add-athlete search exists, is a definer with a pinned
-- search_path, is callable by authenticated and not by anon, and still reads
-- users_discoverable (deleted, banned and test accounts never appear).
select '209_t_av26_athletes_search',
       case
         when to_regprocedure('public.av_athletes_search_candidates(uuid,text)') is null
           then 'MISSING -- av_athletes_search_candidates is absent'
         when exists (select 1 from pg_proc
                       where oid = to_regprocedure('public.av_athletes_search_candidates(uuid,text)')
                         and (not prosecdef or proconfig is null
                              or has_function_privilege('anon', oid, 'EXECUTE')
                              or not has_function_privilege('authenticated', oid, 'EXECUTE')))
           then 'MISSING -- av_athletes_search_candidates lost SECURITY DEFINER, its search_path, or its grants'
         when position('users_discoverable' in pg_get_functiondef(to_regprocedure('public.av_athletes_search_candidates(uuid,text)'))) = 0
           then 'MISSING -- av_athletes_search_candidates no longer reads users_discoverable'
         else 'applied'
       end

union all

-- T-AV27b. The notification log is server-only, and the two claim functions
-- carry the grants their callers need and no more: the door's to
-- authenticated, /api/pase's to the service role only.
select '210_t_av27b_notifications',
       case
         when to_regclass('public.av_notification_log') is null
           or to_regprocedure('public.av_athletes_claim_notification(text,text)') is null
           or to_regprocedure('public.av_athletes_claim_lead_notification(uuid)') is null
           then 'MISSING -- the notification log or a claim function is absent'
         when not (select relrowsecurity from pg_class where oid = to_regclass('public.av_notification_log'))
           or has_any_column_privilege('anon', to_regclass('public.av_notification_log'), 'SELECT')
           or has_any_column_privilege('authenticated', to_regclass('public.av_notification_log'), 'SELECT')
           or has_any_column_privilege('authenticated', to_regclass('public.av_notification_log'), 'INSERT')
           then 'MISSING -- av_notification_log lost RLS or a client role can read or write it'
         when has_function_privilege('anon', to_regprocedure('public.av_athletes_claim_notification(text,text)'), 'EXECUTE')
           or not has_function_privilege('authenticated', to_regprocedure('public.av_athletes_claim_notification(text,text)'), 'EXECUTE')
           or has_function_privilege('authenticated', to_regprocedure('public.av_athletes_claim_lead_notification(uuid)'), 'EXECUTE')
           then 'MISSING -- a claim function has the wrong grants'
         -- T-AV27c: the cap takes the event, so "joined" can skip the daily limit.
         when to_regprocedure('public.av_push_allowed(uuid,text)') is null
           or to_regprocedure('public.av_push_allowed(uuid)') is not null
           or has_function_privilege('authenticated', to_regprocedure('public.av_push_allowed(uuid,text)'), 'EXECUTE')
           or position('joined' in pg_get_functiondef(to_regprocedure('public.av_push_allowed(uuid,text)'))) = 0
           then 'MISSING -- av_push_allowed is not the T-AV27c version (event-aware, joined skips the daily cap)'
         when not exists (select 1 from pg_indexes where schemaname = 'public'
                           and indexname = 'av_notification_log_once_per_lead')
           then 'MISSING -- the once-per-lead-and-event index is gone; an event can notify twice'
         else 'applied'
       end

union all

-- T-GROW1. The seven attribution columns are on pass_leads with their size
-- bounds VALIDATED, the restrictive INSERT policy closes all seven to every
-- client role including admin, and 204's clauses are still on the claim policy
-- (which is how we know nothing recreated it).
--
-- pass_leads itself is main's own table, so a literal cast on it resolves at
-- parse time on any database this runs against. The attribution objects are
-- resolved with to_regclass / to_regprocedure in the probes below, per T-AV30.
select '211_t_grow1_lead_attribution',
       case
         when exists (select 1 from unnest(array['attr_ref', 'utm_source', 'utm_medium', 'utm_campaign',
                                                 'utm_content', 'landing_path', 'first_touch']) c(col)
                       where not exists (select 1 from pg_attribute
                                          where attrelid = 'public.pass_leads'::regclass
                                            and attname = c.col and attnum > 0 and not attisdropped))
           then 'MISSING -- pass_leads is missing one of the seven attribution columns'
         -- format_type and not atttypid <> 'jsonb'::regtype, so this probe adds
         -- no literal reg* cast for the T-AV30 guard to have to exempt.
         when (select format_type(atttypid, atttypmod) from pg_attribute
                where attrelid = 'public.pass_leads'::regclass and attname = 'first_touch'
                  and attnum > 0 and not attisdropped) <> 'jsonb'
           then 'MISSING -- pass_leads.first_touch is not jsonb; every ->> on it returns nothing'
         when exists (select 1 from unnest(array['pass_leads_attr_tag_bounds',
                                                 'pass_leads_landing_path_bounds',
                                                 'pass_leads_first_touch_bounds']) c(con)
                       where not exists (select 1 from pg_constraint
                                          where conrelid = 'public.pass_leads'::regclass
                                            and conname = c.con and contype = 'c' and convalidated))
           then 'MISSING -- a size-bound CHECK is absent or was added NOT VALID'
         when not exists (select 1 from pg_policies
                           where schemaname = 'public' and tablename = 'pass_leads'
                             and policyname = 'Attribution columns are server only'
                             and permissive = 'RESTRICTIVE' and cmd = 'INSERT' and roles = '{public}')
           then 'MISSING -- the restrictive attribution policy is absent or no longer binds every role; an admin can insert a forged utm_campaign'
         when exists (select 1 from unnest(array['attr_ref', 'utm_source', 'utm_medium', 'utm_campaign',
                                                 'utm_content', 'landing_path', 'first_touch']) c(col)
                       where not exists (select 1 from pg_policies
                                          where schemaname = 'public' and tablename = 'pass_leads'
                                            and policyname = 'Attribution columns are server only'
                                            and position(c.col || ' IS NULL' in with_check) > 0))
           then 'MISSING -- the restrictive attribution policy lost an IS NULL clause'
         when position('referred_by_athlete_id IS NULL' in
                       coalesce((select with_check from pg_policies
                                  where schemaname = 'public' and tablename = 'pass_leads'
                                    and policyname = 'Anyone can claim a pass'), '')) = 0
           then 'MISSING -- the claim policy lost 204''s clauses, so something recreated it'
         -- The partner leads view renders these columns on the browser client.
         -- 173 granted SELECT at table level so they are covered; a later
         -- column-level regrant would not be, and the view would 42501.
         when exists (select 1 from unnest(array['attr_ref', 'utm_source', 'utm_medium', 'utm_campaign',
                                                 'utm_content', 'landing_path', 'first_touch']) c(col)
                       where not has_column_privilege('authenticated', 'public.pass_leads', c.col, 'SELECT'))
           then 'MISSING -- authenticated cannot SELECT an attribution column; the partner leads view fails'
         when has_any_column_privilege('anon', 'public.pass_leads', 'SELECT')
           then 'MISSING -- anon can SELECT pass_leads'
         else 'applied'
       end

union all

-- T-GROW1 part E. The Asistio toggle exists as a definer with a pinned
-- search_path, is callable by authenticated and not by anon, still names all
-- three attendance columns, and pass_leads still has no client UPDATE grant --
-- which is the property that makes the function the only write path.
select '212_t_grow1_lead_attended_toggle',
       case
         when to_regprocedure('public.set_pass_lead_attended(uuid,boolean)') is null
           then 'MISSING -- set_pass_lead_attended is absent; neither leads view can mark Asistio'
         when to_regprocedure('public.av_can_work_door(uuid)') is null
           then 'MISSING -- av_can_work_door is absent, so the toggle has no authorisation rule to call (201 not applied)'
         when exists (select 1 from pg_proc
                       where oid = to_regprocedure('public.set_pass_lead_attended(uuid,boolean)')
                         and (not prosecdef or proconfig is null
                              or has_function_privilege('anon', oid, 'EXECUTE')
                              or not has_function_privilege('authenticated', oid, 'EXECUTE')))
           then 'MISSING -- set_pass_lead_attended lost SECURITY DEFINER, its pinned search_path, or its grants'
         when exists (select 1 from unnest(array['attended_at', 'attended_marked_by', 'attended_method']) c(col)
                       where position(c.col in pg_get_functiondef(
                               to_regprocedure('public.set_pass_lead_attended(uuid,boolean)'))) = 0)
           then 'MISSING -- set_pass_lead_attended no longer names all three attendance columns'
         when has_any_column_privilege('authenticated', 'public.pass_leads', 'UPDATE')
           or has_any_column_privilege('anon', 'public.pass_leads', 'UPDATE')
           then 'MISSING -- a client role holds UPDATE on pass_leads; the three-column write surface is gone'
         else 'applied'
       end

union all

-- T-GROW1 parts D and F. The visit log exists, has RLS on with ZERO policies
-- and no client privilege of any kind, and the Origen read is service-role only
-- and NOT a definer.
select '213_t_grow1_attribution_events',
       case
         when to_regclass('public.attribution_events') is null
           then 'MISSING -- attribution_events is absent; /api/attr has nowhere to write'
         when not (select relrowsecurity from pg_class where oid = to_regclass('public.attribution_events'))
           then 'MISSING -- attribution_events lost RLS, and with zero policies that means an open table'
         when (select count(*) from pg_policies
                where schemaname = 'public' and tablename = 'attribution_events') <> 0
           then 'MISSING -- attribution_events has a policy; every read and write is meant to go through the service role'
         when has_any_column_privilege('anon', to_regclass('public.attribution_events'), 'SELECT')
           or has_any_column_privilege('anon', to_regclass('public.attribution_events'), 'INSERT')
           or has_any_column_privilege('authenticated', to_regclass('public.attribution_events'), 'SELECT')
           or has_any_column_privilege('authenticated', to_regclass('public.attribution_events'), 'INSERT')
           or has_any_column_privilege('authenticated', to_regclass('public.attribution_events'), 'UPDATE')
           then 'MISSING -- a client role can read or write attribution_events'
         when not has_table_privilege('service_role', to_regclass('public.attribution_events'), 'INSERT')
           then 'MISSING -- service_role cannot INSERT attribution_events; /api/attr 500s on every visit'
         -- Partial on purpose. A plain unique index on session_key would make a
         -- share click collide with the visit before it and be silently dropped.
         when not exists (select 1 from pg_indexes
                           where schemaname = 'public' and tablename = 'attribution_events'
                             and indexname = 'attribution_events_one_visit_per_session'
                             and indexdef ilike '%UNIQUE%'
                             and indexdef ilike '%event_type = ''visit''%')
           then 'MISSING -- the once-per-session visit index is absent, not unique, or not partial'
         when not exists (select 1 from pg_indexes
                           where schemaname = 'public' and tablename = 'attribution_events'
                             and indexname = 'attribution_events_created_idx')
           then 'MISSING -- attribution_events_created_idx is gone; the Origen date window seq scans'
         when to_regprocedure('public.admin_attribution_summary(timestamptz)') is null
           then 'MISSING -- admin_attribution_summary is absent; the Origen tab has no read'
         when exists (select 1 from pg_proc
                       where oid = to_regprocedure('public.admin_attribution_summary(timestamptz)')
                         and (prosecdef
                              or has_function_privilege('anon', oid, 'EXECUTE')
                              or has_function_privilege('authenticated', oid, 'EXECUTE')
                              or not has_function_privilege('service_role', oid, 'EXECUTE')))
           then 'MISSING -- admin_attribution_summary became a definer, or a client role can execute it, or service_role cannot'
         else 'applied'
       end

union all

-- T-GROW1 part C. The ten signup columns exist, no client role can read them,
-- the write-once guard trigger is attached and enabled, and the service role
-- can still write (otherwise /api/attr/signup fails on every new account).
select '214_t_grow1_signup_attribution',
       -- Every lookup by to_regclass and (oid, attnum), never a literal ::regclass
       -- or a column NAME: before 214 runs the columns do not exist, and the
       -- name form of has_column_privilege raises 42703, which would take the
       -- whole verifier down instead of reading MISSING (verifyTavProbes.test.ts).
       case
         when (select count(*) from pg_attribute
                where attrelid = to_regclass('public.users') and attnum > 0 and not attisdropped
                  and attname in ('signup_src', 'signup_code', 'signup_ref', 'signup_utm_source',
                                  'signup_utm_medium', 'signup_utm_campaign', 'signup_utm_content',
                                  'signup_landing_path', 'signup_first_touch', 'signup_attributed_at')) <> 10
           then 'MISSING -- not all ten users.signup_* columns exist'
         when exists (select 1 from pg_attribute a
                       where a.attrelid = to_regclass('public.users') and a.attnum > 0 and not a.attisdropped
                         and a.attname like 'signup\_%'
                         and (has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT')
                              or has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT')))
           then 'MISSING -- a client role can read a signup_* column; how each person arrived would be public'
         when not exists (select 1 from pg_trigger t
                           where t.tgrelid = to_regclass('public.users')
                             and t.tgname = 'users_signup_attribution_guard'
                             and not t.tgisinternal and t.tgenabled = 'O'
                             and (t.tgtype & 2) <> 0 and (t.tgtype & 4) <> 0 and (t.tgtype & 16) <> 0)
           then 'MISSING -- users_signup_attribution_guard is absent, disabled, or not BEFORE INSERT OR UPDATE; authenticated holds table-level UPDATE on users, so the columns are client-writable without it'
         when not exists (select 1 from pg_constraint
                           where conrelid = to_regclass('public.users') and conname = 'users_signup_attr_stamped'
                             and contype = 'c' and convalidated)
           then 'MISSING -- users_signup_attr_stamped is gone; attribution could exist with no stamp and bypass write-once'
         when not coalesce((select has_column_privilege('service_role', a.attrelid, a.attnum, 'UPDATE')
                              from pg_attribute a
                             where a.attrelid = to_regclass('public.users')
                               and a.attname = 'signup_attributed_at' and not a.attisdropped), false)
           then 'MISSING -- service_role cannot write users.signup_attributed_at; /api/attr/signup fails'
         else 'applied'
       end

union all

-- T-GROW2. Lead referral codes exist and are server-only; one credit per
-- referred person; clients can create only code rows in referrals. Every lookup
-- by to_regclass, so this reads MISSING (not an error) before 215 runs.
select '215_t_grow2_referral_loop',
       case
         when not exists (select 1 from pg_attribute
                           where attrelid = to_regclass('public.pass_leads') and attname = 'lead_ref_code'
                             and not attisdropped)
           then 'MISSING -- pass_leads.lead_ref_code is absent; /api/pase cannot store a lead''s share code'
         when not exists (select 1 from pg_indexes
                           where schemaname = 'public' and tablename = 'pass_leads'
                             and indexname = 'pass_leads_lead_ref_code_key' and indexdef ilike '%UNIQUE%')
           then 'MISSING -- lead_ref_code is not unique; two leads could share a code and split each other''s credit'
         when not exists (select 1 from pg_policies
                           where schemaname = 'public' and tablename = 'pass_leads'
                             and policyname = 'Lead referral code is server only' and permissive = 'RESTRICTIVE')
           then 'MISSING -- a client can insert a lead with its own lead_ref_code'
         when not exists (select 1 from pg_indexes
                           where schemaname = 'public' and tablename = 'referrals'
                             and indexname = 'referrals_one_credit_per_referred' and indexdef ilike '%UNIQUE%')
           then 'MISSING -- a referred person can be credited to more than one referrer'
         when not exists (select 1 from pg_policies
                           where schemaname = 'public' and tablename = 'referrals'
                             and policyname = 'Clients create only code rows' and permissive = 'RESTRICTIVE'
                             and position('referred_id IS NULL' in with_check) > 0)
           then 'MISSING -- a client can insert a referrals row claiming to have referred anyone'
         else 'applied'
       end

order by migration;
