-- QA triage live probes — run in the Supabase SQL editor against PRODUCTION.
-- Pure SELECTs, no side effects. Answers the catalog-level questions that can't
-- be probed over PostgREST (which doesn't expose pg_catalog / pg_policies).
--
-- Companion to the REST probes already run from outside the DB:
--   * b1: send-push-notification edge function -> HTTP 500 = DEPLOYED (live).
--   * b2: /api/push/send -> route file absent in repo (dead webhook target).
--   * c-103: chat_messages.session_id nullable -> APPLIED (insert with null
--            session_id passed the NOT NULL check, failed only on a bogus FK).

select 'a. notifications in supabase_realtime publication (decides only-on-reopen)' as probe,
       case when exists (
         select 1 from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
       ) then 'YES — realtime is live (bell updates instantly)'
            else 'NO — bell only updates on the 5-min poll / app reopen (Ana''s symptom)' end as result
union all
-- 108 fixed s.name -> s.title; 111 later rewrote the same fns to async net.http_post.
select '108/111. notify_join_request state',
       coalesce((
         select case
           when p.prosrc like '%net.http_post%' then '111 applied (async pg_net, title-fixed)'
           when p.prosrc like '%title AS name%' or p.prosrc like '%title as name%' then '108 applied (sync http); 111 NOT yet'
           when p.prosrc like '%s.name%' then 'BROKEN: s.name still present — BUG-001 join outage LIVE'
           else 'present but unrecognized body'
         end
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'notify_join_request'
       ), 'FUNCTION MISSING')
union all
select '108/111. notify_join_accepted state',
       coalesce((
         select case
           when p.prosrc like '%net.http_post%' then '111 applied (async pg_net, title-fixed)'
           when p.prosrc like '%title AS name%' or p.prosrc like '%title as name%' then '108 applied (sync http); 111 NOT yet'
           when p.prosrc like '%s.name%' then 'BROKEN: s.name still present — BUG-001 approve outage LIVE'
           else 'present but unrecognized body'
         end
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'notify_join_accepted'
       ), 'FUNCTION MISSING')
union all
select '110. recompute_follow_counts present (follow counter drift fix)',
       case when exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'recompute_follow_counts'
       ) then 'applied' else 'MISSING' end
union all
select '110. recompute_post_like_count present',
       case when exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'recompute_post_like_count'
       ) then 'applied' else 'MISSING' end
union all
select '111. notify_new_message async (pg_net)',
       coalesce((
         select case when p.prosrc like '%net.http_post%' then '111 applied (async)'
                     else 'present but NOT async (111 not applied)' end
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'notify_new_message'
       ), 'FUNCTION MISSING')
union all
-- The follow fix depends on user_follows RLS actually allowing the insert.
-- If there is no INSERT/ALL policy with a matching WITH CHECK, the write is a
-- silent 0-row no-op (a third cause of the follow bug) and needs its own fix.
select 'follow. user_follows INSERT policy (must allow follower_id = auth.uid())',
       coalesce((
         select string_agg(policyname || ' [' || cmd || ']: ' || coalesce(with_check, '(no with_check)'), ' || ')
         from pg_policies
         where schemaname = 'public' and tablename = 'user_follows' and cmd in ('INSERT', 'ALL')
       ), 'NO INSERT/ALL POLICY — inserts default-deny (follow will 0-row no-op)')
order by probe;
