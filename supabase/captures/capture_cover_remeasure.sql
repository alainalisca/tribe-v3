-- capture_cover_remeasure.sql
--
-- READ ONLY. One statement, one result set. Nothing is written, locked or
-- created -- no temp table, because outside an explicit transaction the
-- Supabase editor autocommits each statement and ON COMMIT DROP would destroy
-- it before the next statement could read it.
--
-- WHY THIS EXISTS. 179's guard was FIRST measured on 2026-09-20 as 13 legacy-only,
-- 3 storefront-only, 5 conflicting. The rehearsal now reports legacy-only = 14,
-- so the population moved and 179 will abort. That is the guard working. This
-- says WHAT moved, which decides whether the fix is mechanical or not.
--
-- TWO OUTCOMES, AND THEY ARE NOT THE SAME SIZE:
--
--   * The five are unchanged and only the legacy-only count moved. Then a new
--     instructor uploaded a banner from /profile and needs NO decision --
--     coalesce resolves them on presence alone. The fix is to update 179's
--     three expected counts. That is RE-MEASURING, not widening the backfill:
--     the backfill rule is unchanged and no row gains a hand-made choice.
--
--   * Any of the five changed. Then that row's decision was made against
--     values that no longer exist, and it must be re-decided by comparing the
--     two uploads again. Do NOT carry the old choice forward.
--
-- ON THE EPOCH COLUMN. The upload epoch is parsed out of the URL here for
-- ORDERING AND DISPLAY ONLY, so the most recent upload is visible. No decision
-- is derived from it in this file and none is derived from it in 179 -- the
-- five are an explicit list precisely so that no judgement depends on string
-- handling nobody reviewed. Reading a parsed epoch off this report and
-- choosing a URL by hand is fine; that is a person deciding.

with expected (user_id, who, expected_legacy, expected_storefront) as (values
    ('9a16aa6b-7bb9-4701-9793-1539eca7671d'::uuid, 'Alexandra Aguirre',
     'https://twyplulysepbeypqralz.supabase.co/storage/v1/object/public/profile-images/banners/banner-9a16aa6b-7bb9-4701-9793-1539eca7671d-1779469382381.jpeg',
     'https://twyplulysepbeypqralz.supabase.co/storage/v1/object/public/profile-images/banners/banner-9a16aa6b-7bb9-4701-9793-1539eca7671d-1779744732006.jpg'),
    ('1848555a-8405-475a-94e2-6dd4b2f6d70e'::uuid, 'Caroline Vanegas',
     'https://twyplulysepbeypqralz.supabase.co/storage/v1/object/public/profile-images/banners/banner-1848555a-8405-475a-94e2-6dd4b2f6d70e-1782918797835.jpg',
     'https://twyplulysepbeypqralz.supabase.co/storage/v1/object/public/media/storefront-banners/1848555a-8405-475a-94e2-6dd4b2f6d70e/1782227634967.jpg'),
    ('eaff348f-5df3-4df5-bd80-69ec233aad0e'::uuid, 'Darian',
     'https://twyplulysepbeypqralz.supabase.co/storage/v1/object/public/profile-images/banners/banner-eaff348f-5df3-4df5-bd80-69ec233aad0e-1781962600989.png',
     'https://twyplulysepbeypqralz.supabase.co/storage/v1/object/public/media/storefront-banners/eaff348f-5df3-4df5-bd80-69ec233aad0e/banner?v=1787489844555'),
    ('2084307b-1bba-4343-b08d-47b80cc4535d'::uuid, 'Jonathan Andres Norena Bedoya',
     'https://twyplulysepbeypqralz.supabase.co/storage/v1/object/public/profile-images/banners/banner-2084307b-1bba-4343-b08d-47b80cc4535d-1782084951804.jpg',
     'https://twyplulysepbeypqralz.supabase.co/storage/v1/object/public/media/storefront-banners/2084307b-1bba-4343-b08d-47b80cc4535d/1782085457928.jpg'),
    ('32100040-3039-4f13-88ff-6d767a41422c'::uuid, 'Juan Bernardo',
     'https://twyplulysepbeypqralz.supabase.co/storage/v1/object/public/profile-images/banners/banner-32100040-3039-4f13-88ff-6d767a41422c-1781836997393.jpg',
     'https://twyplulysepbeypqralz.supabase.co/storage/v1/object/public/media/storefront-banners/32100040-3039-4f13-88ff-6d767a41422c/1781834232747.jpg')
),
live as (
  select id, name, updated_at, banner_url, storefront_banner_url
    from public.users
   where banner_url is not null or storefront_banner_url is not null
),
epoch as (
  select id, name, updated_at, banner_url,
         coalesce(
           substring(banner_url from '([0-9]{10,})\.[a-zA-Z]+$'),
           substring(banner_url from 'v=([0-9]{10,})'),
           substring(banner_url from '([0-9]{10,})')
         ) as upload_epoch
    from live
   where banner_url is not null and storefront_banner_url is null
)

-- 1. the three counts, against what 179 expects
select 1 as ord, '' as sort2,
       '=== COUNTS ===  legacy-only / storefront-only / conflicting' as section,
       (select count(*) from live where banner_url is not null and storefront_banner_url is null)::text
       || ' / ' ||
       (select count(*) from live where banner_url is null and storefront_banner_url is not null)::text
       || ' / ' ||
       (select count(*) from live where banner_url is not null and storefront_banner_url is not null
                                   and banner_url is distinct from storefront_banner_url)::text
       || '        179 expects 14 / 3 / 5' as detail

union all

-- 2. the five, each re-verified against BOTH values measured on 2026-09-20
select 2, e.who,
       '=== THE FIVE ===  ' || e.who,
       case
         when u.id is null then 'ROW GONE -- this user no longer exists'
         when u.banner_url is distinct from e.expected_legacy
          and u.storefront_banner_url is distinct from e.expected_storefront
              then 'CHANGED: both columns differ -- re-decide'
         when u.banner_url is distinct from e.expected_legacy
              then 'CHANGED: banner_url differs -- re-decide'
         when u.storefront_banner_url is distinct from e.expected_storefront
              then 'CHANGED: storefront_banner_url differs -- re-decide'
         else 'unchanged -- decision still valid'
       end
  from expected e
  left join public.users u on u.id = e.user_id

union all

-- 3. every legacy-only instructor, newest upload first. The one at the top is
--    the most likely addition since the measurement. updated_at is shown next
--    to it because the two disagree when a row was written by something that
--    does not maintain the column -- neither is trusted alone.
select 3, lpad((9999999999999 - coalesce(upload_epoch,'0')::bigint)::text, 14, '0'),
       '=== LEGACY-ONLY (blank storefront today) ===  ' || coalesce(name, '(no name)'),
       'upload_epoch ' || coalesce(upload_epoch, '(unparsed)')
       || '   updated_at ' || coalesce(updated_at::text, '(null)')
  from epoch

order by ord, sort2;
