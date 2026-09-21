-- capture_cover_conflicts.sql
--
-- READ ONLY. Run in the Supabase SQL editor. Emits the five VALUES lines that
-- migration 179 needs, verbatim, so no UUID or URL is transcribed by hand.
--
-- WHY A GENERATOR RATHER THAN A HAND-WRITTEN LIST. The decision for each of
-- these five was made by a person comparing upload epochs -- that part is
-- judgement and belongs in 179's header, written out. But the IDs and the URLs
-- are DATA, and copying a UUID and two long storage URLs five times by hand is
-- exactly the kind of transcription that produces a migration which applies
-- cleanly to the wrong row.
--
-- The `chosen` column still has to be set by hand, per the decision recorded in
-- 179's header, because this query deliberately does NOT parse timestamps out
-- of the URLs. It emits both values and leaves the choice visible.
--
-- Output is one text column. Paste it under the INSERT in 179 and uncomment.

SELECT
  '  (''' || u.id::text || ''', '''
  || replace(coalesce(u.name, '(no name)'), '''', '''''') || ''', '
  || E'\n       ''<<< CHOSE legacy OR storefront -- see 179 header >>>'', '
  || E'\n       ''' || replace(u.banner_url, '''', '''''') || ''', '
  || E'\n       ''' || replace(u.storefront_banner_url, '''', '''''') || '''),'
    AS values_line
FROM public.users u
WHERE u.banner_url IS NOT NULL
  AND u.storefront_banner_url IS NOT NULL
  AND u.banner_url IS DISTINCT FROM u.storefront_banner_url
ORDER BY u.name;
