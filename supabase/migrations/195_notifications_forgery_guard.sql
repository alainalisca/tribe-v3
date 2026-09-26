-- ════════════════════════════════════════════════════════════════════════════
-- 195: close notification forgery (recon finding S3)
--
-- Numbered 195, not 194. `origin/main`'s highest was 193 when this was written,
-- but the unpushed local branch `chore/194-scrub-push-send-bearer` already
-- carries `194_scrub_push_send_bearer.sql`. A number is claimed by whoever
-- merges first, and this repo has three collisions on record; every branch,
-- remote AND local, was scanned for a 19[4-9] file before choosing.
--
-- ─── WHAT WAS WRONG ─────────────────────────────────────────────────────────
--
-- The INSERT policy was `WITH CHECK (auth.uid() IS NOT NULL)` and nothing else,
-- `authenticated` holds INSERT on all ten columns, and there is no trigger. So
-- any signed-in user could write a row into ANY other user's bell, set
-- `actor_id` to a third party so it appeared to come from an instructor, and
-- choose the `action_url` it links to. Measured on the local stack against
-- production's schema: HTTP 201, row written. anon was already refused.
--
-- ─── WHY THIS IS AN RLS POLICY AND NOT A TRIGGER ────────────────────────────
--
-- THIS IS THE LOAD-BEARING DESIGN DECISION, and the reason a trigger would be
-- actively wrong here. `service_role` has `rolbypassrls = true` (checked, not
-- assumed), so an RLS policy constrains browser clients and leaves every
-- server-side sender untouched. Two of those senders REQUIRE that:
--
--   * `app/api/cron/smart-match/route.ts` sets `actor_id` to a THIRD PARTY
--     (`match.matched_user_id`) -- legitimately, it is telling you about
--     someone you matched with.
--   * `app/api/admin/notify/route.ts` takes `actor_id` straight FROM THE
--     REQUEST BODY and fans out to admins.
--
-- A `BEFORE INSERT` trigger fires for every role including `service_role`, so
-- it would break both. The same goes for a CHECK constraint on `actor_id`.
--
-- ─── WHY THE NULL-ACTOR ARM IS SCOPED TO SELF AND NOT DROPPED ───────────────
--
-- `sessions :: trg_first_in_area -> check_first_in_area` is NOT SECURITY
-- DEFINER, so it runs as `authenticated` when an ordinary user creates a
-- session, and it inserts the Trailblazer achievement with NO actor_id. That
-- INSERT is inside a trigger on `sessions`, so if RLS refuses it the whole
-- session insert rolls back: a plain `actor_id = auth.uid()` rule would have
-- made HOSTING A SESSION IN A NEW AREA FAIL, and it would have looked like an
-- unrelated session bug.
--
-- The trigger's row is addressed to the creator themselves, so
-- `actor_id IS NULL AND recipient_id = auth.uid()` keeps it working while
-- refusing a NULL-actor row aimed at anyone else. All eleven browser call
-- sites were enumerated; the only two that can emit a NULL actor are the
-- instructor dashboard's self-addressed nudge, and `hooks/useVenuePicker.ts`,
-- whose `actor_id: user?.id ?? null` is NULL only when `supabase.auth.getUser()`
-- returned nothing -- in which case `auth.uid()` is also NULL and the row was
-- already refused by the clause that has not changed.
--
-- ─── WHY THE TYPE ALLOWLIST ─────────────────────────────────────────────────
--
-- `app/notifications/page.tsx` renders
-- `actor?.avatar_url ? <avatar> : TYPE_ICONS[type]`. So a row with no actor --
-- or an actor who simply has no avatar set -- renders as a TYPE ICON, which is
-- how a Tribe system message looks. `achievement`, `streak_milestone`,
-- `general`, `session_reminder`, `referral_complete` and friends all read as
-- the app speaking rather than a person.
--
-- The allowlist is therefore the set the app ACTUALLY sends from a browser,
-- derived by walking every `createNotification` call site rather than by
-- taste, plus `achievement` for the Trailblazer trigger above. Everything
-- official-looking that no browser path sends -- `streak_milestone`,
-- `general`, `session_reminder`, `session_update`, `referral_complete`,
-- `referral_converted`, `series_occurrences_generated`, `spotlight_selected`,
-- `admin_new_signup`, `smart_match` -- is now refused for a signed-in caller
-- and remains available to `service_role`, which is the only thing that sends
-- them today.
--
-- ─── WHAT IS DELIBERATELY NOT IN THIS MIGRATION ─────────────────────────────
--
--   * S1 and S2 (challenge_participants progress write, and the recursive
--     SELECT policy) stay in T-AV3. They are a different table and a different
--     decision.
--   * A table-level CHECK constraint on `action_url`, which would also cover
--     service-role and trigger writes. It is the stronger guarantee and it is
--     DEFERRED on purpose: a CHECK validates existing rows, production data has
--     not been read, and a migration that aborts on live data is worse than one
--     that waits. `supabase/recon/s3-prod-readonly.sql` counts the offending
--     rows; the constraint lands in a follow-up once that count is known.
--   * UPDATE and DELETE are left exactly as they are. Probed as a real
--     authenticated user: a user cannot reach a row addressed to someone else
--     under either command. UPDATE is `USING (recipient_id = auth.uid())` with
--     WITH CHECK omitted, and Postgres reuses USING as the WITH CHECK for
--     UPDATE, so the row cannot be re-addressed to another user either. There
--     is NO DELETE policy at all, so although both client roles hold the
--     table-level DELETE privilege, RLS matches no rows and a delete is a
--     silent `DELETE 0`. Nothing to fix, so nothing is touched.
--
-- Idempotent: DROP ... IF EXISTS then CREATE. Re-running replaces the policy
-- with the same definition.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DROP POLICY IF EXISTS "Authenticated users can create notifications" ON public.notifications;

CREATE POLICY "Authenticated users can create notifications"
  ON public.notifications
  FOR INSERT
  TO public
  WITH CHECK (
    auth.uid() IS NOT NULL

    -- You are the actor, or there is no actor and the row is for you.
    AND (
      actor_id = auth.uid()
      OR (actor_id IS NULL AND recipient_id = auth.uid())
    )

    -- In-app destinations only. `^/` alone is not enough: `//evil.com/x` is
    -- protocol-relative and resolves off-site, which is exactly the shape an
    -- attacker reaches for. Backslashes and control characters are refused
    -- because some clients normalise `\` to `/`.
    AND (
      action_url IS NULL
      OR (
        action_url ~ '^/'
        AND action_url !~ '^//'
        AND action_url !~ '\\'
        AND action_url !~ '[[:cntrl:]]'
      )
    )

    -- The types a browser client legitimately sends today, plus `achievement`
    -- for the Trailblazer trigger. service_role is unaffected by this list.
    AND type = ANY (ARRAY[
      'achievement',              -- trg_first_in_area, self-addressed
      'bulletin_pending',
      'featured_partner',
      'follow',
      'join_request_approved',
      'join_request_declined',
      'like',
      'profile_incomplete',
      'session',
      'training_interest',
      'venue_request_new'
    ])
  );

COMMENT ON POLICY "Authenticated users can create notifications" ON public.notifications IS
  'Migration 195 (recon finding S3). A signed-in caller may only write a bell they are the actor of, or an actor-less bell addressed to themselves; action_url must be a relative in-app path; type must be one a browser path actually sends. service_role bypasses RLS and is unaffected -- smart-match and admin/notify both set a third-party actor_id on purpose.';

COMMIT;
