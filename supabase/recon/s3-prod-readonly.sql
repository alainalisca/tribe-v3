-- ════════════════════════════════════════════════════════════════════════════
-- S3 (notification forgery) -- PRODUCTION, READ ONLY, COUNTS ONLY
--
-- Paste this WHOLE file into the Supabase SQL editor in ONE paste and paste the
-- result table back. It answers three questions and nothing else:
--
--   1. how many notifications exist
--   2. how many have an action_url that is not a relative in-app path
--   3. how many have an actor_id that differs from the user who could have
--      created them -- see the honesty note below, because that one is only
--      PARTLY knowable
--
-- ─── SAFETY ─────────────────────────────────────────────────────────────────
--
--   * `BEGIN READ ONLY` makes a write a runtime error (25006), not a promise.
--     Proven, not assumed: an INSERT inside this wrapper raises "cannot execute
--     INSERT in a read-only transaction" and a CREATE TABLE likewise.
--   * `ROLLBACK` at the end, so nothing is left open in the editor.
--   * SELECT only. No DDL, no temp tables, no functions.
--   * EVERY emitted value is an integer count or a percentage. No id, name,
--     email, message body, URL or url fragment is projected anywhere. Rows are
--     classified by predicates; the offending values themselves never leave the
--     database.
--   * Proven to execute against the local stack (production's schema) first.
--
-- ─── WHY QUESTION 3 IS ONLY PARTLY KNOWABLE, SAID PLAINLY ───────────────────
--
-- `notifications` has no `created_by`, no inserting-role column and no audit
-- trail. Postgres does not record which role or which user wrote a row. So
-- "actor_id differs from the user who could have created them" CANNOT be
-- answered in general: for the eight service-role senders the actor legitimately
-- differs from anyone in particular, and those rows are indistinguishable from
-- a forged one by inspection alone.
--
-- What IS knowable is a bounded proxy, and it is reported as exactly that:
--
--   * rows whose `type` is one no browser path sends. Those can only have come
--     from service_role, so they are NOT evidence of forgery.
--   * rows whose `type` IS a browser-sendable one AND whose actor_id is
--     neither NULL nor the recipient. Under the old policy a forged row would
--     land here -- but so does every legitimate cross-user bell (a follow, an
--     approval, a like), which is the overwhelming majority. This number is an
--     UPPER BOUND on the population a forgery could hide in, not a count of
--     forgeries.
--   * rows that are self-addressed with a non-null actor that is not the
--     recipient -- impossible from any current code path.
--
-- A NON-ZERO ANSWER TO THE LAST ONE WOULD BE THE INTERESTING RESULT. A
-- non-zero answer to the middle one is expected and means nothing on its own.
-- Saying so here is the point: a number presented without that caveat would be
-- read as a forgery count, and it is not one.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN READ ONLY;

WITH browser_types(t) AS (
  -- the exact set migration 195 allows a signed-in caller to send
  VALUES ('achievement'),('bulletin_pending'),('featured_partner'),('follow'),
         ('join_request_approved'),('join_request_declined'),('like'),
         ('profile_incomplete'),('session'),('training_interest'),('venue_request_new')
),
n AS (SELECT * FROM public.notifications)
SELECT * FROM (

  -- ─── 1. how many exist ───────────────────────────────────────────────────
  SELECT 10 AS ord, 'total' AS bucket, 'notifications rows' AS metric,
         count(*)::text AS value,
         '' AS notes FROM n

  -- ─── 2. action_url shape ─────────────────────────────────────────────────
  UNION ALL SELECT 20,'action_url','action_url IS NULL', count(*)::text,
         'the overwhelming majority: only the session-invite route sets one'
         FROM n WHERE action_url IS NULL
  UNION ALL SELECT 21,'action_url','action_url set', count(*)::text,'' FROM n WHERE action_url IS NOT NULL
  UNION ALL SELECT 22,'action_url','  relative in-app path (what 195 allows)', count(*)::text,
         'starts with / , not // , no backslash, no control chars'
    FROM n WHERE action_url IS NOT NULL
      AND action_url ~ '^/' AND action_url !~ '^//' AND action_url !~ '\\' AND action_url !~ '[[:cntrl:]]'
  UNION ALL SELECT 23,'action_url','  NOT a relative in-app path', count(*)::text,
         'THIS IS THE NUMBER THAT DECIDES THE DEFERRED CHECK CONSTRAINT. 0 = safe to add.'
    FROM n WHERE action_url IS NOT NULL
      AND NOT (action_url ~ '^/' AND action_url !~ '^//' AND action_url !~ '\\' AND action_url !~ '[[:cntrl:]]')
  -- Rows 24-27 OVERLAP and do not sum to row 23. A value like `\evil.com` is
  -- both "contains a backslash" and "not rooted", so it is counted twice.
  -- They are four independent questions about the same set, not a partition of
  -- it -- verified by seeding one of each shape locally and watching 23 report
  -- 4 while 24+25+26+27 reported 5.
  UNION ALL SELECT 24,'action_url','    of those, absolute (http/https/other scheme)', count(*)::text,
         'no URL is printed, only how many. Rows 24-27 overlap; see the note in the file.'
         FROM n
   WHERE action_url IS NOT NULL AND action_url ~ '^[A-Za-z][A-Za-z0-9+.-]*:'
  UNION ALL SELECT 25,'action_url','    of those, protocol-relative (//host)', count(*)::text,''
    FROM n WHERE action_url IS NOT NULL AND action_url ~ '^//'
  UNION ALL SELECT 26,'action_url','    of those, containing a backslash', count(*)::text,''
    FROM n WHERE action_url IS NOT NULL AND action_url ~ '\\'
  UNION ALL SELECT 27,'action_url','    of those, relative but not rooted (no leading /)', count(*)::text,''
    FROM n WHERE action_url IS NOT NULL AND action_url !~ '^/' AND action_url !~ '^[A-Za-z][A-Za-z0-9+.-]*:'

  -- ─── 3. actor_id, as the bounded proxy described in the header ───────────
  UNION ALL SELECT 40,'actor','actor_id IS NULL', count(*)::text,
         'system/cron bells and the Trailblazer trigger' FROM n WHERE actor_id IS NULL
  UNION ALL SELECT 41,'actor','actor_id = recipient_id', count(*)::text,
         'self-addressed with an actor; createNotification suppresses this, so a
          non-zero is odd but not necessarily forged' FROM n WHERE actor_id = recipient_id
  UNION ALL SELECT 42,'actor','actor_id set and <> recipient_id', count(*)::text,
         'every normal cross-user bell lives here too -- NOT a forgery count'
    FROM n WHERE actor_id IS NOT NULL AND actor_id <> recipient_id
  UNION ALL SELECT 43,'actor','  ...and type is NOT browser-sendable', count(*)::text,
         'can only have come from service_role. Expected to be large. Not suspicious.'
    FROM n WHERE actor_id IS NOT NULL AND actor_id <> recipient_id
      AND type NOT IN (SELECT t FROM browser_types)
  UNION ALL SELECT 44,'actor','  ...and type IS browser-sendable', count(*)::text,
         'UPPER BOUND on where a forgery could hide. Mostly legitimate follows/approvals/likes.'
    FROM n WHERE actor_id IS NOT NULL AND actor_id <> recipient_id
      AND type IN (SELECT t FROM browser_types)
  UNION ALL SELECT 45,'actor','rows whose actor_id is not a real user', count(*)::text,
         'STRUCTURALLY 0: notifications_actor_id_fkey REFERENCES users(id) ON DELETE SET NULL.
          Kept as an integrity check -- a non-zero would mean that FK is gone -- NOT as a
          forgery signal. Verified by trying to insert a dangling actor locally: rejected.'
    FROM n WHERE actor_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = n.actor_id)

  -- ─── 4. would anything already on disk fail migration 195? ───────────────
  UNION ALL SELECT 60,'195','rows a browser caller could NOT create under 195', count(*)::text,
         'informational only: 195 constrains NEW inserts, it does not validate existing rows'
    FROM n WHERE NOT (
      (actor_id IS NOT NULL OR recipient_id IS NOT NULL)
      AND (action_url IS NULL OR (action_url ~ '^/' AND action_url !~ '^//' AND action_url !~ '\\' AND action_url !~ '[[:cntrl:]]'))
      AND type IN (SELECT t FROM browser_types)
    )
  UNION ALL SELECT 61,'195','distinct notification types in use', count(DISTINCT type)::text,
         'count only, the type strings are not printed' FROM n

) r
ORDER BY ord;

ROLLBACK;
