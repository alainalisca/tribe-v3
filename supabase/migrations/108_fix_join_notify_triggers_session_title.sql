-- 108_fix_join_notify_triggers_session_title.sql
-- BUG-001 (CRITICAL OUTAGE): joining a paid / curated / invite-only session,
-- and approving a pending request, threw "column s.name does not exist" and
-- aborted the join transaction.
--
-- Root cause: two SECURITY DEFINER trigger functions on session_participants,
-- notify_join_request() (fires on a status='pending' insert) and
-- notify_join_accepted() (fires on a pending -> confirmed update), select
-- `s.name` from `sessions s`. The sessions table has no `name` column — the
-- title column is `title`. So every pending join and every approval failed.
--
-- These functions existed ONLY in the live database (a legacy DB-side push
-- path) and were never in the repo — pure schema drift, which is why the bad
-- reference was invisible to code search. #73 (T-PAY1) did not add them; it
-- exposed the bug by routing paid joins to status='pending', which is the
-- branch that runs the broken query. Open joins (status='confirmed' insert)
-- never hit it, so they kept working.
--
-- FIX FORWARD: correct only the column reference, `s.name` -> `s.title AS name`.
-- Aliasing AS name keeps the RECORD field name `name` so the rest of each
-- function body is unchanged (minimal, lowest-risk). This migration also brings
-- both functions under version control so they stop drifting.
--
-- This CREATE OR REPLACE updates the function bodies in place; the existing
-- triggers stay bound to them. The identical SQL was applied directly in the
-- Supabase SQL editor as the immediate outage restore.
--
-- FOLLOW-UPS (out of scope for this hotfix, flagged for a later ticket):
--   1. Both functions make a SYNCHRONOUS extensions.http() POST inside the
--      join transaction. If the edge function is slow or down, joins slow or
--      fail. This should move to an async/queued path.
--   2. They duplicate the app's own join notifications (/api/sessions/
--      notify-join, T-NOTIF1), so users may get double push notifications.
--   3. Consider whether this legacy DB-side push path should exist at all.

CREATE OR REPLACE FUNCTION public.notify_join_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  session_data RECORD;
  requester_name TEXT;
  function_url TEXT;
BEGIN
  -- Only trigger for pending requests
  IF NEW.status = 'pending' THEN
    -- Get session details and creator_id (BUG-001: s.title, not s.name)
    SELECT s.id, s.title AS name, s.date, s.creator_id, u.name as requester_name
    INTO session_data
    FROM sessions s
    JOIN users u ON u.id = NEW.user_id
    WHERE s.id = NEW.session_id;

    -- Build function URL
    function_url := 'https://twyplulysepbeypqralz.supabase.co/functions/v1/send-push-notification';

    -- Call edge function to send notification
    PERFORM extensions.http((
      'POST',
      function_url,
      ARRAY[extensions.http_header('Content-Type', 'application/json')],
      'application/json',
      json_build_object(
        'recipientUserId', session_data.creator_id,
        'title', session_data.requester_name || ' wants to join',
        'body', session_data.name || ' on ' || session_data.date,
        'url', '/sessions/' || NEW.session_id,
        'sessionId', NEW.session_id,
        'type', 'join_request'
      )::text
    )::extensions.http_request);
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_join_accepted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  session_data RECORD;
  host_name TEXT;
  function_url TEXT;
BEGIN
  -- Only trigger when status changes to confirmed
  IF NEW.status = 'confirmed' AND (OLD.status IS NULL OR OLD.status = 'pending') THEN
    -- Get session and host details (BUG-001: s.title, not s.name)
    SELECT s.id, s.title AS name, s.date, s.creator_id, u.name as host_name
    INTO session_data
    FROM sessions s
    JOIN users u ON u.id = s.creator_id
    WHERE s.id = NEW.session_id;

    -- Build function URL
    function_url := 'https://twyplulysepbeypqralz.supabase.co/functions/v1/send-push-notification';

    -- Send notification to requester
    PERFORM extensions.http((
      'POST',
      function_url,
      ARRAY[extensions.http_header('Content-Type', 'application/json')],
      'application/json',
      json_build_object(
        'recipientUserId', NEW.user_id,
        'title', 'You''re in! 🎉',
        'body', session_data.host_name || ' accepted your request for ' || session_data.name,
        'url', '/sessions/' || NEW.session_id,
        'sessionId', NEW.session_id,
        'type', 'request_accepted'
      )::text
    )::extensions.http_request);
  END IF;

  RETURN NEW;
END;
$function$;
