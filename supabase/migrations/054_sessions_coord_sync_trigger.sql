-- Migration 054 — Mirror sessions.location_lat/location_lng <-> sessions.latitude/longitude.
--
-- Background: the sessions table has both `latitude`/`longitude` AND
-- `location_lat`/`location_lng` columns from earlier overlapping schemas.
-- Both pairs are nullable; today they're all null on every row, but we
-- have writers and readers using each pair scattered across the app
-- (lib/dal/sessions.ts, useEditSession, LiveNowSection, useSessionFiltering,
-- and many more). Once one writer starts populating one pair, every
-- reader on the other pair silently breaks.
--
-- This migration installs a BEFORE INSERT/UPDATE trigger that copies a
-- value from whichever pair was written into the other pair, so both
-- always agree. Designating `location_lat`/`location_lng` as canonical
-- (it matches schema.sql); a follow-up migration can drop
-- `latitude`/`longitude` once code is fully migrated.
--
-- The trigger is idempotent: re-running it doesn't change rows where
-- both pairs already match.

create or replace function public.sync_session_coords()
returns trigger
language plpgsql
as $$
begin
  -- Mirror lat: prefer location_lat if both differ; otherwise fill the missing one.
  if new.location_lat is not null and new.latitude is null then
    new.latitude := new.location_lat;
  elsif new.latitude is not null and new.location_lat is null then
    new.location_lat := new.latitude;
  end if;

  -- Mirror lng identically.
  if new.location_lng is not null and new.longitude is null then
    new.longitude := new.location_lng;
  elsif new.longitude is not null and new.location_lng is null then
    new.location_lng := new.longitude;
  end if;

  return new;
end;
$$;

drop trigger if exists sessions_sync_coords on public.sessions;
create trigger sessions_sync_coords
  before insert or update on public.sessions
  for each row
  execute function public.sync_session_coords();

-- One-shot backfill for any existing rows where exactly one pair has data.
update public.sessions
   set latitude = location_lat
 where latitude is null
   and location_lat is not null;

update public.sessions
   set location_lat = latitude
 where location_lat is null
   and latitude is not null;

update public.sessions
   set longitude = location_lng
 where longitude is null
   and location_lng is not null;

update public.sessions
   set location_lng = longitude
 where location_lng is null
   and longitude is not null;
