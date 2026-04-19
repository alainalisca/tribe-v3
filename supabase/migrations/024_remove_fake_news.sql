-- Migration 024: Remove fake news seed data
--
-- The original migration 017_community_news.sql seeded 6 hardcoded articles
-- with fabricated titles ("INDER Medellín Opens New Public Fitness Parks", etc.)
-- and body_urls pointing to either generic homepages or completely fictional
-- URLs (e.g. https://tribe.fitness/blog/500-athletes which does not exist).
--
-- Clicking "Read More" on these articles produced 404s or landed on unrelated
-- pages, breaking user trust. The News tab has also been hidden in the UI
-- (see app/communities/page.tsx) until a real news integration exists.
--
-- This migration deletes the seed data. The table schema is preserved so
-- that a future real integration can repopulate it with legitimate articles.

delete from public.community_news
where source in ('INDER', 'Community', 'Tribe');

-- Defensive: catch any other seed rows we may have inserted manually
delete from public.community_news
where body_url ilike '%tribe.fitness%'
   or body_url = 'https://www.inder.gov.co/noticias'
   or body_url = 'https://www.medellin.gov.co/ciclovias';
