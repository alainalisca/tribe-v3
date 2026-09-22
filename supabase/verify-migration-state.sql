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
       -- Fix: entity_id is uuid, so the body must compare uuid=uuid (was ::text,
       -- which threw at runtime). Applied once the function body no longer casts
       -- p_session_id to text.
       case when (select to_regprocedure('public.get_invite_token_for_notification(uuid)')) is not null
              and pg_get_functiondef('public.get_invite_token_for_notification(uuid)'::regprocedure) not like '%p_session_id::text%'
            then 'applied' else 'MISSING' end
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
       -- Additive data migration (applied by hand 2026-08-08, verified live
       -- 2026-08-14): flags the 13 founder/test accounts enumerated in the
       -- file. Structural artifact check pinned to the migration's own
       -- "exactly 13" expectation — if this reads MISSING after more accounts
       -- are legitimately flagged by a LATER migration, update both counts
       -- together.
       case when (select count(*) from public.users where is_test_account = true) = 13
            then 'applied' else 'MISSING' end
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
-- ---------------------------------------------------------------------------
select 'GUARD_users_columns_readable',
       coalesce(
         'MISSING -- not readable by authenticated: '
           || string_agg(c.column_name, ', ' order by c.column_name),
         'applied'
       )
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = 'users'
  and c.column_name not in (
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
    'email'
  )
  and not has_column_privilege('authenticated', 'public.users', c.column_name, 'SELECT')
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
    ('email')
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
-- ---------------------------------------------------------------------------
select 'GUARD_sessions_columns_writable',
       coalesce(
         'MISSING -- not writable by authenticated: '
           || string_agg(c.column_name || '(' || c.missing || ')', ', ' order by c.column_name),
         'applied'
       )
from (
  select column_name,
         case
           when not has_column_privilege('authenticated', 'public.sessions', column_name, 'UPDATE')
            and not has_column_privilege('authenticated', 'public.sessions', column_name, 'INSERT')
             then 'insert+update'
           when not has_column_privilege('authenticated', 'public.sessions', column_name, 'UPDATE')
             then 'update'
           else 'insert'
         end as missing
  from information_schema.columns
  where table_schema = 'public' and table_name = 'sessions'
    -- THREE, not two: partner_id is revoked by 162 because it is the only way
    -- the verdict gets computed. See GUARD_sessions_verdict_locked below.
    and column_name not in ('partner_status', 'partner_reviewed_at', 'partner_id')
    and (not has_column_privilege('authenticated', 'public.sessions', column_name, 'UPDATE')
      or not has_column_privilege('authenticated', 'public.sessions', column_name, 'INSERT'))
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
    ('187_athlete_setup')
    -- <<<END_MIRROR_LIST>>>
           ) as mirror(migration)
           where not exists (select 1 from public.migrations_applied a
                              where a.migration = mirror.migration))
           then 'MISSING -- the JSON mirror claims a migration this database has not recorded'
         when exists (
           select 1 from public.migrations_applied a
           where a.migration not in (
    -- <<<MIRROR_LIST>>> generated by scripts/syncMigrationsApplied.ts -- do not hand-edit
    ('179_users_cover_image_url'),
    ('180_find_training_partners_rpc'),
    ('181_find_training_partners_exclude_instructors'),
    ('182_notifications_action_url'),
    ('183_google_avatar_full_size'),
    ('184_migrations_applied'),
    ('185_invite_tokens_recipient'),
    ('186_sport_demand_counts'),
    ('187_athlete_setup')
    -- <<<END_MIRROR_LIST>>>
           ))
           then 'MISSING -- this database has recorded a migration the JSON mirror omits; re-sync it'
         else 'applied'
       end

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

order by migration;
