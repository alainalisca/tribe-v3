-- T-OS1 Step 0, item 1: database state. READ ONLY.
--
-- Every statement is a SELECT. The only non-SELECT tokens are the BEGIN /
-- ROLLBACK wrapper, which is transaction control and writes nothing -- it is
-- here because the house rule is that every production probe runs inside one.
-- Strip those two lines if you prefer; the result is identical.
--
-- ONE statement on purpose: the Supabase SQL editor shows only the LAST result
-- set, so a script of several SELECTs would silently discard all but the final
-- one. Everything below is a single jsonb_pretty(...) row.
--
-- information_schema is used ONLY for column inventory here, never for
-- privileges. (DRIFT-04: information_schema.*_privileges cannot see table-level
-- grants and returns false passes. Column existence is a different question and
-- is what migration 067 itself uses.)
--
-- No emails are selected anywhere. Al's own row is located BY email but only
-- its id and status are returned.

begin;

with
-- ── Relations each in-range migration should have created ──────────────────
expected_rel(migration, kind, obj) as (
  values
    ('056_tribe_os_waitlist',        'table', 'public.tribe_os_waitlist'),
    ('062_clients_and_attendance',   'table', 'public.clients'),
    ('062_clients_and_attendance',   'table', 'public.client_attendance'),
    ('068_gym_tenant_schema',        'table', 'public.gyms'),
    ('068_gym_tenant_schema',        'table', 'public.gym_coaches'),
    ('074_gym_teams',                'table', 'public.gym_teams'),
    ('074_gym_teams',                'table', 'public.gym_team_members'),
    ('075_intelligence_schema',      'table', 'public.community_insights'),
    ('075_intelligence_schema',      'table', 'public.community_insight_members'),
    ('075_intelligence_schema',      'table', 'public.agent_run_log'),
    ('075_intelligence_schema',      'table', 'public.exercise_videos'),
    ('075_intelligence_schema',      'table', 'public.training_partners'),
    ('082_gym_audit_log',            'table', 'public.gym_audit_log'),
    ('166_capture_session_attendance','table','public.session_attendance'),
    ('158_gym_venue_approval',       'view',  'public.sessions_public')
),
-- ── Functions each in-range migration should have created ──────────────────
expected_fn(migration, fname) as (
  values
    ('063_revenue_dashboard',        'instructor_revenue_totals'),
    ('063_revenue_dashboard',        'instructor_revenue_buckets'),
    ('071_gym_revenue_functions',    'gym_revenue_totals'),
    ('071_gym_revenue_functions',    'gym_revenue_buckets'),
    ('072_clients_member_enrichment','sync_client_last_seen'),
    ('073_list_gym_coaches',         'list_gym_coaches'),
    ('074_gym_teams',                'list_teams_for_gym'),
    ('076_training_partner_trigger', 'upsert_training_partners_on_attendance'),
    ('078_bump_longest_streak',      'bump_longest_streak'),
    ('079_attendance_counter_trigger','refresh_client_attendance_counters'),
    ('084_cron_advisory_lock',       'cron_try_lock'),
    ('084_cron_advisory_lock',       'cron_release_lock'),
    ('153_host_door_checkin',        'host_add_session_guest'),
    ('153_host_door_checkin',        'host_remove_session_guest'),
    ('158_gym_venue_approval',       'review_venue_request'),
    ('158_gym_venue_approval',       'set_session_partner')
),
-- ── Columns each in-range migration should have added ──────────────────────
expected_col(migration, tbl, col) as (
  values
    ('060_tribe_os_premium',         'users',            'tribe_os_status'),
    ('060_tribe_os_premium',         'users',            'tribe_os_tier'),
    ('060_tribe_os_premium',         'users',            'tribe_os_granted_at'),
    ('068_gym_tenant_schema',        'clients',          'gym_id'),
    ('072_clients_member_enrichment','clients',          'status'),
    ('072_clients_member_enrichment','clients',          'last_seen_at'),
    ('072_clients_member_enrichment','clients',          'health_notes'),
    ('075_intelligence_schema',      'clients',          'churn_risk_score'),
    ('075_intelligence_schema',      'clients',          'churn_risk_updated_at'),
    ('075_intelligence_schema',      'clients',          'health_status'),
    ('075_intelligence_schema',      'clients',          'current_streak_days'),
    ('075_intelligence_schema',      'clients',          'longest_streak_days'),
    ('075_intelligence_schema',      'clients',          'sessions_last_30_days'),
    ('075_intelligence_schema',      'clients',          'total_sessions'),
    ('081_intelligence_email_pref',  'gyms',             'intelligence_email_enabled'),
    ('083_client_attendance_refunds','client_attendance','refunded_at'),
    ('083_client_attendance_refunds','client_attendance','refund_reason'),
    ('158_gym_venue_approval',       'sessions',         'partner_id'),
    ('158_gym_venue_approval',       'sessions',         'partner_status')
),
-- ── Triggers the branch must never disturb (T-OS0 rule 3 evidence) ─────────
expected_trg(migration, tgname, tbl) as (
  values
    ('072_clients_member_enrichment','client_attendance_sync_last_seen',   'client_attendance'),
    ('076_training_partner_trigger', 'training_partners_on_attendance_insert','client_attendance'),
    ('076_training_partner_trigger', 'training_partners_on_attendance_update','client_attendance'),
    ('079_attendance_counter_trigger','attendance_counters_on_insert',     'client_attendance'),
    ('079_attendance_counter_trigger','attendance_counters_on_update',     'client_attendance'),
    ('079_attendance_counter_trigger','attendance_counters_on_delete',     'client_attendance')
),
admin_emails(email) as (
  values ('alainalisca@aplusfitness.co'), ('alainalisca@aplusfitnessllc.com')
)

select jsonb_pretty(jsonb_build_object(

  -- 1a. The ledger. Expected to be EMPTY for this range: migration 184 created
  --     migrations_applied on 2026-09-21 and backfilled only 179-184, so
  --     nothing from 056-085/153/158/166/167 was ever recorded. If rows DO
  --     come back here, the ledger has been extended since and that is news.
  'ledger_rows_in_range', (
    select coalesce(jsonb_agg(jsonb_build_object('migration', migration, 'applied_at', applied_at, 'note', note)
                              order by migration), '[]'::jsonb)
    from public.migrations_applied
    where migration ~ '^(0(5[6-9]|[6-8][0-9]))_|^(153|158|166|167)_'
  ),
  'ledger_total_rows',  (select count(*) from public.migrations_applied),
  'ledger_lowest',      (select min(migration) from public.migrations_applied),

  -- 1a (real evidence). Does the object exist, regardless of the ledger?
  'relations', (
    select jsonb_agg(jsonb_build_object('migration', migration, 'kind', kind, 'obj', obj,
                                        'exists', to_regclass(obj) is not null)
                     order by migration, obj)
    from expected_rel
  ),
  'functions', (
    select jsonb_agg(jsonb_build_object('migration', migration, 'fn', fname,
                                        'overloads', (select count(*) from pg_proc p
                                                       where p.pronamespace = 'public'::regnamespace
                                                         and p.proname = fname))
                     order by migration, fname)
    from expected_fn
  ),
  'columns_missing', (
    select coalesce(jsonb_agg(jsonb_build_object('migration', migration, 'table', tbl, 'column', col)
                              order by migration, tbl, col), '[]'::jsonb)
    from expected_col e
    where not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = e.tbl and c.column_name = e.col
    )
  ),
  'triggers', (
    select jsonb_agg(jsonb_build_object('trigger', tgname, 'table', tbl,
                                        'present', exists (
                                          select 1 from pg_trigger t
                                          join pg_class cl on cl.oid = t.tgrelid
                                          where cl.relname = tbl
                                            and cl.relnamespace = 'public'::regnamespace
                                            and t.tgname = expected_trg.tgname
                                            and not t.tgisinternal),
                                        'enabled', (
                                          select t.tgenabled from pg_trigger t
                                          join pg_class cl on cl.oid = t.tgrelid
                                          where cl.relname = tbl
                                            and cl.relnamespace = 'public'::regnamespace
                                            and t.tgname = expected_trg.tgname
                                            and not t.tgisinternal))
                     order by tbl, tgname)
    from expected_trg
  ),

  -- 1b. Gyms. Ids and slugs only. No names beyond the slug, no emails.
  'gyms_total', (select count(*) from public.gyms),
  'gyms', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', g.id, 'slug', g.slug, 'owner_user_id', g.owner_user_id,
             'tribe_os_status', g.tribe_os_status, 'tribe_os_tier', g.tribe_os_tier,
             'created_at', g.created_at) order by g.slug), '[]'::jsonb)
    from public.gyms g
  ),
  'gyms_matching_bullbox', (
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'slug', slug) order by slug), '[]'::jsonb)
    from public.gyms
    where slug ilike '%bull%' or name ilike '%bull%'
  ),

  -- 1c. tribe_os_status, counts only, plus Al's own row (id + status, no email).
  'users_tribe_os_status_counts', (
    select coalesce(jsonb_object_agg(coalesce(tribe_os_status, 'NULL'), n), '{}'::jsonb)
    from (select tribe_os_status, count(*) n from public.users group by 1) s
  ),
  'gyms_tribe_os_status_counts', (
    select coalesce(jsonb_object_agg(coalesce(tribe_os_status, 'NULL'), n), '{}'::jsonb)
    from (select tribe_os_status, count(*) n from public.gyms group by 1) s
  ),
  'al_rows', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'user_id', u.id, 'tribe_os_status', u.tribe_os_status,
             'tribe_os_tier', u.tribe_os_tier, 'is_admin', u.is_admin,
             'owns_gyms', (select count(*) from public.gyms g where g.owner_user_id = u.id))
           ), '[]'::jsonb)
    from public.users u where u.email in (select email from admin_emails)
  ),

  -- 1d. Row counts.
  'row_counts', jsonb_build_object(
    'clients',            (select count(*) from public.clients),
    'client_attendance',  (select count(*) from public.client_attendance),
    'community_insights', (select count(*) from public.community_insights),
    'agent_run_log',      (select count(*) from public.agent_run_log),
    'gym_coaches',        (select count(*) from public.gym_coaches),
    'session_attendance', (select count(*) from public.session_attendance)
  ),
  'clients_by_gym', (
    select coalesce(jsonb_agg(jsonb_build_object('gym_id', gym_id, 'n', n) order by n desc), '[]'::jsonb)
    from (select gym_id, count(*) n from public.clients group by 1) s
  ),

  -- 1e. Any link between gyms and featured_partners. No migration in the repo
  --     creates one; this asks production directly, because the repo is not
  --     authoritative about production (DRIFT-01).
  'gyms_fp_link_fks', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'constraint', con.conname,
             'from', src.relname, 'to', tgt.relname) order by con.conname), '[]'::jsonb)
    from pg_constraint con
    join pg_class src on src.oid = con.conrelid
    join pg_class tgt on tgt.oid = con.confrelid
    where con.contype = 'f'
      and ((src.relname = 'gyms' and tgt.relname = 'featured_partners')
        or (src.relname = 'featured_partners' and tgt.relname = 'gyms'))
  ),
  'gyms_fp_link_columns', (
    select coalesce(jsonb_agg(jsonb_build_object('table', table_name, 'column', column_name)
                              order by table_name, column_name), '[]'::jsonb)
    from information_schema.columns
    where table_schema = 'public'
      and ((table_name = 'gyms' and column_name ~ 'partner')
        or (table_name = 'featured_partners' and column_name ~ 'gym'))
  ),
  'tables_carrying_both_gym_and_partner_columns', (
    select coalesce(jsonb_agg(distinct table_name order by table_name), '[]'::jsonb)
    from information_schema.columns c1
    where c1.table_schema = 'public' and c1.column_name ~ '^gym_id$'
      and exists (select 1 from information_schema.columns c2
                  where c2.table_schema = 'public' and c2.table_name = c1.table_name
                    and c2.column_name ~ 'partner')
  )
)) as t_os1_step0;

rollback;
