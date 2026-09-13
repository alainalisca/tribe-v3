import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fetchPublicPartner, type PublicPartner } from '@/lib/partnerPublic';
import GymShareClient from './GymShareClient';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://tribe-v3.vercel.app';

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * One fetch per request, shared by generateMetadata and the page body. Next.js
 * calls both for the same render; without cache() a scrape would run the query
 * twice.
 */
const getPartner = cache(async (param: string): Promise<PublicPartner | null> => {
  const supabase = await createClient();
  return fetchPublicPartner(supabase, param);
});

/**
 * The OG card's subtitle is written in Spanish.
 *
 * A link scraper sends no language and has no session, so there is no app
 * language to read here -- and the audience for this card is a Medellín
 * Instagram bio. A map rather than a ternary, same reasoning as lib/dateLocale.
 * The in-page type line is fully translated; only this one scraper-facing
 * string is pinned.
 */
const OG_TYPE_LABEL_ES: Record<string, string> = { gym: 'Gimnasio', studio: 'Estudio' };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const partner = await getPartner(id);

  // A dead bio link must render the 404 page, so this returns generic metadata
  // rather than throwing -- a throw here is a 500, and a 500 on a URL printed in
  // someone's bio looks like Tribe is down.
  if (!partner) {
    return {
      title: 'Not Found | Tribe',
      description: 'This page is not available on Tribe.',
    };
  }

  const typeLabel = OG_TYPE_LABEL_ES[partner.business_type ?? ''] ?? '';
  const specialties = (partner.specialties ?? []).slice(0, 3).join(' · ');
  const subtitle = [typeLabel, specialties].filter(Boolean).join(' · ');

  const description =
    partner.description_es?.slice(0, 160) ||
    partner.description?.slice(0, 160) ||
    [partner.business_name, subtitle, partner.address].filter(Boolean).join(' — ').slice(0, 160);

  const ogParams = new URLSearchParams({
    type: 'gym',
    title: partner.business_name,
    subtitle,
    // The view's COALESCE(logo_url, account avatar). Every live partner has
    // logo_url NULL, so without it this is the initials card.
    avatar: partner.logo_image_url || '',
  });

  // Trailing slash matches next.config trailingSlash:true, so scrapers fetch
  // the image directly instead of chasing a 308 redirect -- a scraper that does
  // not follow the redirect drops the card entirely.
  const ogImageUrl = `${BASE_URL}/api/og/?${ogParams.toString()}`;

  // The slug URL, always, even when the visitor arrived by UUID: otherwise the
  // two forms read as two separate pages to every crawler and to every share
  // count.
  const canonical = `${BASE_URL}/g/${partner.slug}/`;

  return {
    title: `${partner.business_name} | Tribe`,
    description,
    alternates: { canonical },
    openGraph: {
      title: `${partner.business_name} on Tribe`,
      description,
      type: 'website',
      siteName: 'Tribe - Never Train Alone',
      url: canonical,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: partner.business_name }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${partner.business_name} on Tribe`,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function PublicGymPage({ params }: PageProps) {
  const { id } = await params;
  const partner = await getPartner(id);

  // Resolved on the server so a miss is a real 404 rather than a client-side
  // "not found" panel rendered inside a 200.
  if (!partner) notFound();

  return <GymShareClient partner={partner} />;
}
