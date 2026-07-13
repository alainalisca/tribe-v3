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
       case when exists (select 1 from public.training_partners limit 1)
            then 'applied (rows present)' else 'MISSING or empty gym' end
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
       -- 093 restores table-level SELECT on public.users to the authenticated
       -- role (the grant that, when missing, blanked every profile page).
       case when exists (
         select 1 from information_schema.role_table_grants
         where table_schema = 'public' and table_name = 'users'
           and grantee = 'authenticated' and privilege_type = 'SELECT'
       ) then 'applied' else 'MISSING' end
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
       -- BUG-001 hotfix: notify_join_request / notify_join_accepted selected
       -- the nonexistent sessions.name, aborting every pending join + approval.
       -- Applied once the corrected function selects s.title (not s.name).
       case when exists (
         select 1 from pg_proc
         where proname = 'notify_join_request'
           and pg_get_functiondef(oid) ilike '%s.title%'
       ) then 'applied' else 'MISSING' end
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
       -- T-HTTP1: the sync HTTP triggers moved to net.http_post and the
       -- hardcoded secrets moved to Vault. Applied once notify_join_request is
       -- async (uses net.http_post, no extensions.http).
       case when exists (
         select 1 from pg_proc
         where proname = 'notify_join_request'
           and pronamespace = 'public'::regnamespace
           and pg_get_functiondef(oid) like '%net.http_post%'
           and pg_get_functiondef(oid) not like '%extensions.http%'
       ) then 'applied' else 'MISSING' end
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
       -- T-SEC1 Gate 1: join_session hardened (server-side policy + token +
       -- p_user_id=auth.uid()). Applied once join_session has the 4-arg
       -- (uuid,uuid,text,text) signature with p_invite_token.
       case when exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname='public' and p.proname='join_session'
           and pg_get_function_identity_arguments(p.oid) = 'uuid, uuid, text, text'
       ) and exists (
         select 1 from pg_proc where proname='join_session_as_guest'
           and pronamespace='public'::regnamespace
       ) then 'applied' else 'MISSING' end
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
order by migration;
