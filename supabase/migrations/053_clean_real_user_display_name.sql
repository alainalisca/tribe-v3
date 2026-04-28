-- Migration 053 — Clean the placeholder "test account" display name from
-- a real instructor's profile.
--
-- The user at darianraphael67@gmail.com signed up with a placeholder display
-- name of "test account" but is a real instructor (not seeded), so they
-- weren't flagged in migration 052. The placeholder name leaks onto every
-- public surface (session cards, instructor list, partner roster, chat).
-- Set a sensible default derived from their email; the user can refine it
-- via /profile/edit at any time.
--
-- Idempotent: only updates if the name is still the literal placeholder.

update public.users
   set name = 'Darian'
 where id = 'ac8a8558-799c-456b-bb4b-cf6c05986d5e'
   and lower(coalesce(name, '')) in ('test account', 'test', 'test account 1');
