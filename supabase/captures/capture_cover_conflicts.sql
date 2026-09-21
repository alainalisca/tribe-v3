-- capture_cover_conflicts.sql
--
-- READ ONLY. Run in the Supabase SQL editor and paste the output back.
-- Nothing here writes, locks or changes anything.
--
-- Emits the five VALUES lines migration 179 needs, COMPLETE -- uuid, chosen
-- url, and both measured values -- so nothing is transcribed by hand.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT IS JUDGEMENT HERE AND WHAT IS DATA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The CHOICE for each of these five was made by a person comparing the upload
-- epochs in the filenames, and it split 3 to 2, so neither column wins
-- globally. That judgement is recorded twice: in 179's header in prose, and in
-- the CASE below by name. It is not re-derived here.
--
-- THIS QUERY DOES NOT PARSE TIMESTAMPS OUT OF URLS. It applies a decision
-- already made. The difference matters: parsing would mean the migration's
-- content depended on string-handling nobody reviewed, and one malformed URL
-- would turn a data decision into a silent one.
--
-- The IDs and the URLs ARE data, and copying a uuid plus two long storage URLs
-- five times by hand is exactly the transcription that produces a migration
-- which applies cleanly to the wrong row. So they come from the database.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- IF THE NAMES DO NOT MATCH, THE OUTPUT SAYS SO RATHER THAN GUESSING
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The CASE matches on first name. If the five conflicting instructors are not
-- the five the decision was made about -- someone re-uploaded, someone new
-- conflicts, a name is spelled differently -- the emitted line carries
-- `<<< NO DECISION RECORDED >>>` instead of a URL. That will not paste into a
-- valid migration, which is the intended outcome: a name that does not match
-- is a decision that was never made.
--
-- The last row of the output states the count. Expect 5. Anything else means
-- the measurement moved and 179's guard would abort anyway.

SELECT values_line FROM (

  SELECT
    0 AS ord,
    u.name AS sort_name,
    '  (''' || u.id::text || ''', ''' || replace(coalesce(u.name, '(no name)'), '''', '''''') || ''','
    || E'\n     '''
    || CASE
         -- Recency, per 179's header. Epoch is from the upload filename.
         WHEN u.name ILIKE 'Caroline%'      THEN replace(u.banner_url, '''', '''''')            -- legacy 1782918797835 > storefront 1782227634967
         WHEN u.name ILIKE 'Jonathan%'      THEN replace(u.storefront_banner_url, '''', '''''') -- legacy 1782084951804 < storefront 1782085457928
         WHEN u.name ILIKE 'Juan Bernardo%' THEN replace(u.banner_url, '''', '''''')            -- legacy 1781836997393 > storefront 1781834232747
         WHEN u.name ILIKE 'Alexandra%'     THEN replace(u.storefront_banner_url, '''', '''''') -- legacy 1779469382381 < storefront 1779744732006; BOTH on the legacy storage path
         WHEN u.name ILIKE 'Darian%'        THEN replace(u.storefront_banner_url, '''', '''''') -- stable-path form, cache-buster 1787489844555 postdates legacy 1781962600989
         ELSE '<<< NO DECISION RECORDED FOR THIS PERSON -- DO NOT PASTE >>>'
       END
    || ''','
    || E'\n     ''' || replace(u.banner_url, '''', '''''') || ''','
    || E'\n     ''' || replace(u.storefront_banner_url, '''', '''''') || '''),'
      AS values_line
  FROM public.users u
  WHERE u.banner_url IS NOT NULL
    AND u.storefront_banner_url IS NOT NULL
    AND u.banner_url IS DISTINCT FROM u.storefront_banner_url

  UNION ALL

  -- Always present, so an empty result cannot be mistaken for a query nobody
  -- ran -- and so a count other than 5 is visible without counting rows.
  SELECT 1, 'zzz',
    '-- conflicting rows found: '
    || (SELECT count(*) FROM public.users
         WHERE banner_url IS NOT NULL AND storefront_banner_url IS NOT NULL
           AND banner_url IS DISTINCT FROM storefront_banner_url)::text
    || '  (expected 5)   rows with no recorded decision: '
    || (SELECT count(*) FROM public.users u2
         WHERE u2.banner_url IS NOT NULL AND u2.storefront_banner_url IS NOT NULL
           AND u2.banner_url IS DISTINCT FROM u2.storefront_banner_url
           AND u2.name NOT ILIKE 'Caroline%' AND u2.name NOT ILIKE 'Jonathan%'
           AND u2.name NOT ILIKE 'Juan Bernardo%' AND u2.name NOT ILIKE 'Alexandra%'
           AND u2.name NOT ILIKE 'Darian%')::text

) t
ORDER BY ord, sort_name;
