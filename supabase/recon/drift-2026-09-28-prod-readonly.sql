-- ════════════════════════════════════════════════════════════════════════════
-- DRIFT RECON 2026-09-28 -- PRODUCTION, READ ONLY
--
-- Paste this WHOLE file into the Supabase SQL editor, in ONE paste, and paste
-- the result table back. Diagnosis for the eight rows of
-- supabase/verify-migration-state.sql (main at f4422996) that did not read
-- 'applied' on 2026-09-28:
--   077, 093, 108, 111, 119, 133, 142, GUARD_184_mirror_matches_applied_table
--
-- ─── WHAT THIS FILE WILL AND WILL NOT DO ────────────────────────────────────
--
--   * `BEGIN READ ONLY`: any write is a runtime error (25006). `ROLLBACK` at
--     the end.
--   * SELECT only. No DDL, no temp tables, no functions created.
--   * NO USER DATA. Counts, true/false, object signatures, migration names and
--     their applied_at, and md5 hashes of function definitions. No id, name,
--     email or row content leaves the database. The 13 account ids from
--     migration 142 are used INSIDE the query to count matches and are never
--     returned.
--   * NO SECRETS. Where a function body might hold a URL or a credential, the
--     file returns only whether a pattern matches (true/false), never the text.
--   * One result set: seq | item | fact | value.
--
-- ─── WHY EACH FACT IS HERE (the probe it answers) ───────────────────────────
--
--   077  probe: training_partners has any row. Facts: its row count, and how
--        many pairs 077's own backfill query would produce from today's
--        client_attendance. 0 pairs means an empty table is correct.
--   093  probe: a TABLE-level SELECT row for authenticated on users in
--        information_schema.role_table_grants. Facts: table-level vs any-column
--        SELECT, and that the restricted columns stay restricted.
--   108, 111  probe: notify_join_request's body. Facts: whether migration 136's
--        drops are in place (the four functions and four triggers it removed),
--        and whether the surviving 111 function (notify_chat_message_webhook)
--        is async and reads its credential from Vault.
--   119  probe: join_session identity arguments = 'uuid, uuid, text, text'.
--        Facts: every join_session overload with its identity arguments, and
--        what the body reads.
--   133  probe: definition not LIKE '%p_session_id::text%'. Facts: whether
--        the cast appears in executable code or only in a comment.
--   142  probe: exactly 13 users flagged is_test_account. Facts: total flagged,
--        how many of 142's 13 ids exist and are flagged, and how many flagged
--        accounts are not among them.
--   184  guard: the JSON mirror equals public.migrations_applied. Facts: names
--        (and applied_at) the table has that the mirror on main lacks, and the
--        reverse.
--
-- Proven to execute on the local stack (production's schema, 2026-09-26 dump)
-- on 2026-09-28, and that a write inside the READ ONLY wrapper is refused.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN READ ONLY;

WITH mirror(migration) AS (VALUES
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
    ('198_service_role_only_internal_rpcs')
),
ids142(id) AS (SELECT unnest(ARRAY['eaff348f-5df3-4df5-bd80-69ec233aad0e'::uuid, 'd7cc0e7e-44db-4e57-80d3-a82f6e90bff4'::uuid, 'd92d4816-af5d-42ae-9d33-02f330e221bd'::uuid, '7ad0c072-6519-481d-ba8c-bab2526b3449'::uuid, '3af48aac-3f33-4055-ab6a-354791d5b1bb'::uuid, '00bbef64-123f-432f-bf13-0c7572137c9d'::uuid, 'd479736b-bfe1-4f92-9a0f-8d5871859400'::uuid, 'a59598c6-42a0-4b22-aa3d-e61ea778a841'::uuid, 'c5d7e023-bc9d-4c5d-904b-3f7844943672'::uuid, 'ddf4ea3c-3aab-411b-8960-9e57d9bcd526'::uuid, 'fd7dbf6a-6198-42fe-bb1c-347af3d111bd'::uuid, '8062bb54-d7bd-4946-bbe7-82b9330da69e'::uuid, '673834b4-d9be-4782-86c9-ff27376233a7'::uuid])),
nd AS (  -- 111/136 function facts, no bodies returned
  SELECT p.proname,
         p.prosrc ~* 'net\.http_post'                         AS async_net,
         p.prosrc ~* 'extensions\.http|\mhttp\s*\('          AS sync_http,
         p.prosrc ~* 'vault\.(decrypted_)?secrets'             AS reads_vault,
         p.prosrc ~ 'eyJ[A-Za-z0-9_-]{10,}'                    AS has_jwt_literal,
         p.prosrc ~* 'x-webhook-secret'' *, *''[A-Za-z0-9_-]{8,}' AS has_literal_secret_header,
         md5(pg_get_functiondef(p.oid))                        AS def_md5
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname = 'notify_chat_message_webhook'
),
att AS (  -- 077's own source, as in the migration
  SELECT ca.client_id, ca.session_id, c.gym_id
    FROM public.client_attendance ca JOIN public.clients c ON c.id = ca.client_id
   WHERE ca.attended = true AND c.gym_id IS NOT NULL
)
SELECT * FROM (
  -- ── 184: the mirror ────────────────────────────────────────────────────
  SELECT 10 AS seq, 'GUARD_184' AS item, 'in migrations_applied, NOT in the JSON mirror on main' AS fact,
         a.migration || ' @ ' || a.applied_at::text AS value
    FROM public.migrations_applied a
   WHERE a.migration NOT IN (SELECT migration FROM mirror)
  UNION ALL
  SELECT 11, 'GUARD_184', 'in the JSON mirror on main, NOT in migrations_applied', m.migration
    FROM mirror m WHERE NOT EXISTS (SELECT 1 FROM public.migrations_applied a WHERE a.migration = m.migration)
  UNION ALL
  SELECT 12, 'GUARD_184', 'migrations_applied rows below the 179 floor (count)',
         (SELECT count(*) FROM public.migrations_applied WHERE migration < '179')::text
  UNION ALL
  SELECT 13, 'GUARD_184', 'migrations_applied total rows / mirror entries',
         (SELECT count(*) FROM public.migrations_applied)::text || ' / ' || (SELECT count(*) FROM mirror)::text
  UNION ALL
  SELECT 14, 'tracking', 'supabase_migrations.schema_migrations exists',
         (to_regclass('supabase_migrations.schema_migrations') IS NOT NULL)::text

  -- ── 077 ────────────────────────────────────────────────────────────────
  UNION ALL
  SELECT 20, '077', 'training_partners rows', (SELECT count(*) FROM public.training_partners)::text
  UNION ALL
  SELECT 21, '077', 'client_attendance attended rows with a gym (077 source)', (SELECT count(*) FROM att)::text
  UNION ALL
  SELECT 22, '077', 'distinct co-attendance pairs 077 would write today',
         (SELECT count(*) FROM (SELECT DISTINCT a.gym_id, a.client_id, b.client_id
                                  FROM att a JOIN att b ON a.session_id = b.session_id
                                   AND a.gym_id = b.gym_id AND a.client_id < b.client_id) p)::text

  -- ── 093 ────────────────────────────────────────────────────────────────
  UNION ALL
  SELECT 30, '093', 'authenticated TABLE-level SELECT on users (what the probe wants)',
         has_table_privilege('authenticated', 'public.users', 'SELECT')::text
  UNION ALL
  SELECT 31, '093', 'authenticated SELECT on ANY users column',
         has_any_column_privilege('authenticated', 'public.users', 'SELECT')::text
  UNION ALL
  SELECT 32, '093', 'authenticated can read users.email / is_admin / location_lat (must be false)',
         has_column_privilege('authenticated', 'public.users', 'email', 'SELECT')::text || ' / ' ||
         has_column_privilege('authenticated', 'public.users', 'is_admin', 'SELECT')::text || ' / ' ||
         has_column_privilege('authenticated', 'public.users', 'location_lat', 'SELECT')::text

  -- ── 108 / 111 / 136 ────────────────────────────────────────────────────
  UNION ALL
  SELECT 40, '108/111', 'functions 136 dropped that still exist (expect none)',
         coalesce((SELECT string_agg(proname, ', ' ORDER BY proname) FROM pg_proc
                    WHERE pronamespace = 'public'::regnamespace
                      AND proname IN ('notify_join_request', 'notify_join_accepted',
                                      'notify_new_message', 'send_push_notification_webhook')), 'none')
  UNION ALL
  SELECT 41, '108/111', 'triggers 136 dropped that still exist (expect none)',
         coalesce((SELECT string_agg(c.relname || '.' || t.tgname, ', ' ORDER BY t.tgname)
                     FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
                    WHERE NOT t.tgisinternal
                      AND t.tgname IN ('on_message_sent', 'send_push_notification_trigger',
                                       'on_join_accepted', 'on_join_request_created')), 'none')
  UNION ALL
  SELECT 42, '111', 'notify_chat_message_webhook exists / async net.http_post / sync http',
         coalesce((SELECT 'true / ' || async_net::text || ' / ' || sync_http::text FROM nd), 'false')
  UNION ALL
  SELECT 43, '111', 'notify_chat_message_webhook reads Vault / JWT literal / literal secret header',
         coalesce((SELECT reads_vault::text || ' / ' || has_jwt_literal::text || ' / ' || has_literal_secret_header::text FROM nd), 'n/a')
  UNION ALL
  SELECT 44, '111', 'notify_chat_message_webhook definition md5', coalesce((SELECT def_md5 FROM nd), 'n/a')
  UNION ALL
  SELECT 45, '111', 'trigger chat_message_webhook on chat_messages: enabled flag (O = on, D = off)',
         coalesce((SELECT t.tgenabled::text FROM pg_trigger t WHERE t.tgrelid = 'public.chat_messages'::regclass
                    AND t.tgname = 'chat_message_webhook'), 'absent')

  -- ── 119 ────────────────────────────────────────────────────────────────
  UNION ALL
  SELECT 50 + row_number() OVER (ORDER BY p.oid), '119',
         'join_session overload: identity arguments | reads join_policy | checks auth.uid() | md5',
         pg_get_function_identity_arguments(p.oid) || ' | ' || (p.prosrc ~* 'join_policy')::text || ' | ' ||
         (p.prosrc ~* 'auth\.uid\(\)')::text || ' | ' || md5(pg_get_functiondef(p.oid))
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'join_session'
  UNION ALL
  SELECT 59, '119', 'join_session_as_guest exists', (to_regprocedure('public.join_session_as_guest(uuid,text,text,text,text)') IS NOT NULL)::text

  -- ── 133 ────────────────────────────────────────────────────────────────
  UNION ALL
  SELECT 60, '133', 'get_invite_token_for_notification(uuid) exists',
         (to_regprocedure('public.get_invite_token_for_notification(uuid)') IS NOT NULL)::text
  UNION ALL
  SELECT 61, '133', 'p_session_id::text anywhere in the body (what the probe tests)',
         coalesce((SELECT (prosrc LIKE '%p_session_id::text%')::text FROM pg_proc
                    WHERE oid = to_regprocedure('public.get_invite_token_for_notification(uuid)')), 'n/a')
  UNION ALL
  SELECT 62, '133', 'p_session_id::text in EXECUTABLE code (line comments stripped)',
         coalesce((SELECT (regexp_replace(prosrc, '--[^\n]*', '', 'g') LIKE '%p_session_id::text%')::text FROM pg_proc
                    WHERE oid = to_regprocedure('public.get_invite_token_for_notification(uuid)')), 'n/a')
  UNION ALL
  SELECT 63, '133', 'compares entity_id = p_session_id (uuid = uuid)',
         coalesce((SELECT (regexp_replace(prosrc, '--[^\n]*', '', 'g') ~ 'entity_id\s*=\s*p_session_id\M(?!::)')::text FROM pg_proc
                    WHERE oid = to_regprocedure('public.get_invite_token_for_notification(uuid)')), 'n/a')
  UNION ALL
  SELECT 64, '133', 'definition md5',
         coalesce((SELECT md5(pg_get_functiondef(oid)) FROM pg_proc
                    WHERE oid = to_regprocedure('public.get_invite_token_for_notification(uuid)')), 'n/a')

  -- ── 142 ────────────────────────────────────────────────────────────────
  UNION ALL
  SELECT 70, '142', 'users flagged is_test_account (probe expects exactly 13)',
         (SELECT count(*) FROM public.users WHERE is_test_account = true)::text
  UNION ALL
  SELECT 71, '142', 'of the 13 ids in migration 142: exist / flagged',
         (SELECT count(*) FROM public.users u WHERE u.id IN (SELECT id FROM ids142))::text || ' / ' ||
         (SELECT count(*) FROM public.users u WHERE u.id IN (SELECT id FROM ids142) AND u.is_test_account = true)::text
  UNION ALL
  SELECT 72, '142', 'flagged accounts NOT among the 13 (flagged later)',
         (SELECT count(*) FROM public.users u WHERE u.is_test_account = true
             AND u.id NOT IN (SELECT id FROM ids142))::text
) r
ORDER BY seq;

ROLLBACK;
