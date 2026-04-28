-- Migration 055 — Coarse coord backfill for sessions with NULL lat/lng.
--
-- Context: every existing session row stores `location` as free text
-- ("parque lleras", "Carrera 70 #45", etc.) and has NULL on every
-- coord pair (latitude/longitude AND location_lat/location_lng). The
-- home-page distance-based filters, neighborhood bounding-box queries,
-- and the session-detail map preview all break when coords are null.
--
-- This migration assigns each null-coord session the centre of the
-- popular neighborhood whose name appears in the session's location
-- string. It's a deliberate approximation — the lat/lng won't be
-- precise to the venue, but it places the session inside the correct
-- neighborhood for filtering and gives the map preview a sensible
-- starting point. Sessions whose location text matches no popular
-- neighborhood stay null (e.g. "online", "TBD", out-of-Medellín).
--
-- The matching keywords mirror the locationKeywords arrays defined in
-- lib/city-config.ts — keep them in sync if you add a neighborhood.
--
-- Idempotent: only updates rows where location_lat is currently null.
-- After migration 054's sync trigger is in place, writing to
-- location_lat will automatically populate latitude as well.

do $$
declare
  hoods text[][] := array[
    array['poblado',   '6.2087',  '-75.5659'],
    array['lleras',    '6.2087',  '-75.5659'],
    array['provenza',  '6.2087',  '-75.5659'],
    array['laureles',  '6.2467',  '-75.5907'],
    array['la 70',     '6.2467',  '-75.5907'],
    array['envigado',  '6.1714',  '-75.5825'],
    array['centro',    '6.2518',  '-75.5636'],
    array['candelaria','6.2518',  '-75.5636'],
    array['belen',     '6.2314',  '-75.6045'],
    array['belén',     '6.2314',  '-75.6045'],
    array['sabaneta',  '6.1513',  '-75.6168']
  ];
  i int;
  kw text;
  lat numeric;
  lng numeric;
begin
  for i in 1 .. array_length(hoods, 1) loop
    kw  := hoods[i][1];
    lat := hoods[i][2]::numeric;
    lng := hoods[i][3]::numeric;

    update public.sessions
       set location_lat = lat,
           location_lng = lng
     where location_lat is null
       and location_lng is null
       and location is not null
       and lower(location) like '%' || lower(kw) || '%';
  end loop;
end $$;

-- The keyword list explicitly carries both the diacritic and ascii forms
-- of "Belén" so we don't need the unaccent extension here. If you later
-- add neighborhoods, include both forms or upgrade to:
--
--   create extension if not exists unaccent;
--   ... where lower(unaccent(location)) like '%' || lower(unaccent(kw)) || '%';
